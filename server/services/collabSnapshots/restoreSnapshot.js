// Phase R1 (V1.10.0) — Application d'un snapshot collab : DELETE+INSERT scopé en transaction.
//
// EFFETS DE BORD : DB write + filesystem write (snapshot pre-restore).
//
// Flow :
//   1. readSnapshot() — décompresse + vérifie intégrité
//   2. computeCollabFingerprint() — état actuel (before)
//   3. buildCollabSnapshot() + writeSnapshot(kind='pre-restore', expiresAt=+7j) — point de retour
//   4. Transaction SQLite :
//        - DIRECT_TABLES write-safe : DELETE rows scopées + INSERT rows snapshot
//        - CONTACT_JOINED_TABLES write-safe : DELETE par contactIds + INSERT
//        - read-only-v2 : SKIP (call_logs, transcripts, activity_logs, etc.)
//   5. computeCollabFingerprint() — état après (after)
//   6. INSERT audit_logs (immutable via trigger) avec before/after fingerprints
//
// Sécurité :
//   - Scope STRICT au collabId (jamais de leak vers autres collabs)
//   - Tables OUT_OF_SCOPE jamais touchées
//   - Pre-restore obligatoire avant apply (reversibility 7 jours)
//   - Transaction atomique : ROLLBACK auto sur erreur

import { db } from '../../db/database.js';
import { readSnapshot } from './readSnapshot.js';
import { computeCollabFingerprint } from './fingerprint.js';
import { buildCollabSnapshot } from './buildCollabSnapshot.js';
import { writeSnapshot } from './writeSnapshot.js';
import { DIRECT_TABLES, CONTACT_JOINED_TABLES } from './scope.js';

const PRE_RESTORE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Construit un fragment WHERE + args pour DELETE scopé selon les filtres SQL du scope.
 * On reproduit la logique de scope.js (qui utilise SELECT *) pour le DELETE équivalent.
 */
function buildScopedDelete(tableDef, companyId, collabId) {
  // tableDef.sql est de la forme "SELECT * FROM <table> WHERE <conditions>"
  // On extrait le WHERE pour réutiliser exactement le même filtre.
  // Cas simple : si pas de filtre custom (tableDef.args), on a 2 placeholders (companyId, collabId).
  // Cas multi : tableDef.args fournit la liste exacte d'arguments.
  const args = tableDef.args
    ? tableDef.args({ companyId, collabId })
    : [companyId, collabId];

  // Reconstitue le WHERE de la requête SELECT existante
  const selectSql = tableDef.sql;
  const whereMatch = selectSql.match(/FROM\s+(\w+)\s+WHERE\s+([\s\S]+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
  if (!whereMatch) {
    throw new Error(`buildScopedDelete: impossible de parser le WHERE pour ${tableDef.key}`);
  }
  const tableName = whereMatch[1];
  const whereClause = whereMatch[2].trim();

  return {
    sql: `DELETE FROM ${tableName} WHERE ${whereClause}`,
    args,
  };
}

/**
 * Insert une row dans une table — colonnes auto-détectées depuis l'objet.
 * Tolère les colonnes qui n'existent plus (filtrage via PRAGMA table_info).
 */
function insertRow(tableName, row, knownColumns) {
  const cols = Object.keys(row).filter((c) => knownColumns.has(c));
  if (cols.length === 0) return false;
  const placeholders = cols.map(() => '?').join(',');
  const vals = cols.map((c) => {
    const v = row[c];
    // Conversion défensive (objects → JSON, undefined → null)
    if (v === undefined) return null;
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  db.prepare(
    `INSERT OR REPLACE INTO ${tableName} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`
  ).run(...vals);
  return true;
}

function getColumns(tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map((r) => r.name));
}

/**
 * Applique un snapshot. Crée d'abord un snapshot pre-restore reversible 7 jours.
 *
 * @param {object} args
 * @param {number} args.snapshotId
 * @param {'self'|'admin'} args.actorType
 * @param {string} args.actorId       - collaboratorId (self) ou supraAdminId (admin)
 * @param {string} [args.actorName]   - pour audit_logs userName
 * @param {string} [args.reason]      - texte court "user-revert", "test-cli", etc.
 * @param {string} [args.ipAddress]   - pour audit_logs
 * @param {string} [args.userAgent]   - pour audit_logs
 *
 * @returns {{
 *   success: true,
 *   snapshotId, preRestoreSnapshotId,
 *   beforeFingerprint, afterFingerprint,
 *   restored: { [tableKey]: number },
 *   skipped: Array<{ key, reason, count }>,
 *   elapsedMs
 * }}
 */
export function restoreSnapshot({
  snapshotId,
  actorType,
  actorId,
  actorName = '',
  reason = '',
  ipAddress = '',
  userAgent = '',
}) {
  if (!snapshotId) throw new Error('restoreSnapshot: snapshotId requis');
  if (!actorType || !['self', 'admin'].includes(actorType)) {
    throw new Error(`restoreSnapshot: actorType invalide (${actorType}), attendu 'self' ou 'admin'`);
  }
  if (!actorId) throw new Error('restoreSnapshot: actorId requis');

  const t0 = Date.now();

  // 1. Lecture + vérif intégrité
  const { snap, payload } = readSnapshot(snapshotId);
  const { companyId, collabId } = snap;

  // V1.10.1 — Garde-fou anti-perte : refuser si snapshot vide alors que le collab a des contacts actuels.
  // Évite que le restore d'un ancien snapshot bugué (scope pré-V1.10.1) supprime tous les contacts.
  // Override possible via reason="force-empty-snapshot-override" (admin uniquement, à utiliser uniquement en CLI).
  const snapContactsCount = (payload?.tables?.contacts || []).length;
  const currContactsCount = db
    .prepare(
      "SELECT COUNT(*) as n FROM contacts WHERE companyId = ? AND (" +
        "ownerCollaboratorId = ? OR executorCollaboratorId = ? OR assignedTo = ? OR sharedWithId = ? " +
        "OR shared_with_json LIKE '%\"' || ? || '\"%')"
    )
    .get(companyId, collabId, collabId, collabId, collabId, collabId)?.n || 0;
  const forceOverride = arguments[0]?.reason === 'force-empty-snapshot-override' && actorType === 'admin';
  if (currContactsCount > 5 && snapContactsCount === 0 && !forceOverride) {
    throw new Error(
      `restoreSnapshot: BLOQUÉ — sauvegarde vide (0 contacts) alors que le collab a ${currContactsCount} contact(s). ` +
        `Restaurer effacerait tous les contacts. Snapshot probablement créé avant le correctif scope V1.10.1. ` +
        `Override possible via reason="force-empty-snapshot-override" (admin uniquement).`
    );
  }

  // 2. Fingerprint avant
  const beforeFingerprint = computeCollabFingerprint({ companyId, collabId });

  // 3. Snapshot pre-restore (reversibility 7j)
  const currentPayload = buildCollabSnapshot({ companyId, collabId });
  const preWrite = writeSnapshot({
    payload: currentPayload,
    fingerprint: beforeFingerprint,
    kind: 'pre-restore',
    trigger: 'restore-reversibility',
    createdBy: `${actorType}:${actorId}`,
    expiresAt: Date.now() + PRE_RESTORE_TTL_MS,
  });
  const preRestoreSnapshotId = preWrite.id;

  // 4. Application en transaction
  const restored = {};
  const skipped = [];

  // Pré-récupère les colonnes connues de chaque table (PRAGMA hors transaction)
  const directWriteSafe = DIRECT_TABLES.filter((t) => t.restoreMode === 'write-safe');
  const directReadOnly = DIRECT_TABLES.filter((t) => t.restoreMode === 'read-only-v2');
  const joinWriteSafe = CONTACT_JOINED_TABLES.filter((t) => t.restoreMode === 'write-safe');

  const columnsByTable = {};
  for (const tDef of [...directWriteSafe, ...joinWriteSafe]) {
    columnsByTable[tDef.table] = getColumns(tDef.table);
  }

  // Skipped tracking (informatif, pas dans la transaction)
  for (const tDef of directReadOnly) {
    const data = (payload.tables && payload.tables[tDef.key]) || [];
    skipped.push({ key: tDef.key, reason: 'read-only-v2', count: data.length });
  }

  const txStart = Date.now();
  const tx = db.transaction(() => {
    // PRAGMA defer_foreign_keys : FK checks différés jusqu'au COMMIT.
    // Permet DELETE+INSERT dans n'importe quel ordre tant que l'état final est cohérent.
    // Effet limité à la transaction courante (auto-reset au COMMIT/ROLLBACK).
    db.prepare('PRAGMA defer_foreign_keys = ON').run();

    // 4a. DIRECT_TABLES write-safe : DELETE scopé + INSERT
    for (const tDef of directWriteSafe) {
      const data = (payload.tables && payload.tables[tDef.key]) || [];
      const del = buildScopedDelete(tDef, companyId, collabId);
      db.prepare(del.sql).run(...del.args);
      let inserted = 0;
      for (const row of data) {
        if (insertRow(tDef.table, row, columnsByTable[tDef.table])) inserted++;
      }
      restored[tDef.key] = inserted;
    }

    // 4b. CONTACT_JOINED_TABLES write-safe : DELETE par contactIds + INSERT
    const snapshotContactIds = (payload.tables.contacts || []).map((c) => c.id).filter(Boolean);
    for (const tDef of joinWriteSafe) {
      if (snapshotContactIds.length === 0) {
        restored[tDef.key] = 0;
        continue;
      }
      // DELETE chunked (limite ~999 placeholders SQLite)
      const CHUNK = 800;
      for (let i = 0; i < snapshotContactIds.length; i += CHUNK) {
        const chunk = snapshotContactIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM ${tDef.table} WHERE companyId = ? AND ${tDef.contactIdColumn} IN (${placeholders})`
        ).run(companyId, ...chunk);
      }
      // INSERT
      const data = (payload.tables && payload.tables[tDef.key]) || [];
      let inserted = 0;
      for (const row of data) {
        if (insertRow(tDef.table, row, columnsByTable[tDef.table])) inserted++;
      }
      restored[tDef.key] = inserted;
    }
  });

  // Run transaction (throw → ROLLBACK auto)
  tx();
  const txElapsed = Date.now() - txStart;

  // 5. Fingerprint après
  const afterFingerprint = computeCollabFingerprint({ companyId, collabId });

  // 6. audit_logs (immutable trigger ABORT update/delete)
  const auditId = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  db.prepare(
    `INSERT INTO audit_logs (
      id, companyId, userId, userName, userRole,
      action, category, entityType, entityId,
      detail, metadata_json,
      ipAddress, userAgent, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    auditId,
    companyId,
    actorId,
    actorName || `${actorType}:${actorId}`,
    actorType,
    'collab_snapshot_restored',
    'data-recovery',
    'collab_snapshot',
    String(snap.id),
    `Restauration snapshot #${snap.id} (${snap.kind}) pour collab ${collabId}`,
    JSON.stringify({
      snapshotId: snap.id,
      preRestoreSnapshotId,
      beforeFingerprint,
      afterFingerprint,
      collabId,
      reason: reason || '',
      restored,
      skipped,
      txElapsedMs: txElapsed,
      snapshotKind: snap.kind,
      snapshotCreatedAt: snap.createdAt,
    }),
    ipAddress,
    userAgent,
    new Date().toISOString()
  );

  // Reset dirty flag (l'état est désormais aligné sur un snapshot connu, pas besoin de re-snapper)
  db.prepare('UPDATE collaborators SET dirtySinceSnapshotAt = NULL WHERE id = ?').run(collabId);

  return {
    success: true,
    snapshotId: snap.id,
    preRestoreSnapshotId,
    beforeFingerprint,
    afterFingerprint,
    restored,
    skipped,
    elapsedMs: Date.now() - t0,
    txElapsedMs: txElapsed,
  };
}
