// Phase R1 (V1.10.0) — Preview d'une restauration : compare état actuel ↔ snapshot.
//
// PURE READ : aucun effet de bord. Retourne ce qui SERA restauré, ce qui SERA ignoré, et warnings.
// Appelé avant restoreSnapshot() pour confirmation utilisateur.

import { db } from '../../db/database.js';
import { readSnapshot } from './readSnapshot.js';
import { DIRECT_TABLES, CONTACT_JOINED_TABLES } from './scope.js';

/**
 * @param {number} snapshotId
 * @returns {{
 *   snapshot: { id, companyId, collabId, createdAt, kind, trigger, fingerprint, rowCount, createdBy },
 *   willRestore: { [tableKey]: number },
 *   willSkip: Array<{ key, reason, count }>,
 *   counts: { snapshot: object, current: object },
 *   warnings: Array<{ kind, message, detail? }>,
 * }}
 */
export function previewRestore(snapshotId) {
  const { snap, payload } = readSnapshot(snapshotId);
  const { companyId, collabId } = snap;

  const willRestore = {};
  const willSkip = [];
  const warnings = [];

  // Tables snapshot (toutes celles du scope)
  const allTableDefs = [
    ...DIRECT_TABLES.map((t) => ({ ...t, _kind: 'direct' })),
    ...CONTACT_JOINED_TABLES.map((t) => ({ ...t, _kind: 'contact_joined' })),
  ];

  // Counts du snapshot (pour preview)
  const snapshotCounts = {};
  const currentCounts = {};

  for (const tableDef of allTableDefs) {
    const data = (payload.tables && payload.tables[tableDef.key]) || [];
    snapshotCounts[tableDef.key] = data.length;

    if (tableDef.restoreMode === 'read-only-v2') {
      willSkip.push({
        key: tableDef.key,
        reason: 'read-only-v2 (historique externe préservé)',
        count: data.length,
      });
      continue;
    }
    if (tableDef.restoreMode !== 'write-safe') {
      willSkip.push({
        key: tableDef.key,
        reason: `restoreMode=${tableDef.restoreMode} (non gérée V1)`,
        count: data.length,
      });
      continue;
    }
    willRestore[tableDef.key] = data.length;
  }

  // Counts actuels (pour comparaison) — DIRECT tables uniquement (les CONTACT_JOINED demandent contactIds)
  for (const tableDef of DIRECT_TABLES) {
    try {
      const args = tableDef.args
        ? tableDef.args({ companyId, collabId })
        : [companyId, collabId];
      const cnt = db
        .prepare(
          tableDef.sql.replace(/SELECT \*/i, 'SELECT COUNT(*) as n').replace(/ORDER BY [^)]*$/i, '').replace(/LIMIT \d+(\s+OFFSET \d+)?$/i, '')
        )
        .get(...args);
      currentCounts[tableDef.key] = cnt ? cnt.n : 0;
    } catch (err) {
      currentCounts[tableDef.key] = -1;
      warnings.push({
        kind: 'count-error',
        message: `Impossible de compter les rows actuelles pour ${tableDef.key}`,
        detail: err.message,
      });
    }
  }

  // CONTACT_JOINED : count via les contactIds du snapshot
  const snapshotContactIds = (payload.tables.contacts || []).map((c) => c.id).filter(Boolean);
  for (const tableDef of CONTACT_JOINED_TABLES) {
    if (snapshotContactIds.length === 0) {
      currentCounts[tableDef.key] = 0;
      continue;
    }
    try {
      // Chunk pour éviter limite SQLite ~999 placeholders
      const CHUNK = 800;
      let total = 0;
      for (let i = 0; i < snapshotContactIds.length; i += CHUNK) {
        const chunk = snapshotContactIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        const sql = `SELECT COUNT(*) as n FROM ${tableDef.table} WHERE companyId = ? AND ${tableDef.contactIdColumn} IN (${placeholders})`;
        const r = db.prepare(sql).get(companyId, ...chunk);
        total += r ? r.n : 0;
      }
      currentCounts[tableDef.key] = total;
    } catch (err) {
      currentCounts[tableDef.key] = -1;
      warnings.push({
        kind: 'count-error',
        message: `Impossible de compter les rows actuelles pour ${tableDef.key}`,
        detail: err.message,
      });
    }
  }

  // V1.10.1 — Garde-fou anti-perte CRITIQUE : si snapshot vide pour contacts MAIS le collab a des contacts actuels,
  // refus implicite (kind='critical-empty-snapshot' pour bloquer côté restoreSnapshot.js + warning rouge UI).
  // Use-case : les anciens snapshots créés avec scope.js bugué (avant fix V1.10.1) ont contacts=0.
  // Restaurer un de ces snapshots = perte totale des contacts du collab.
  const currContacts = currentCounts.contacts || 0;
  const snapContacts = snapshotCounts.contacts || 0;
  if (currContacts > 5 && snapContacts === 0) {
    warnings.push({
      kind: 'critical-empty-snapshot',
      message: 'Cette sauvegarde semble incomplète — la restauration est bloquée',
      detail: `Aucun contact dans la sauvegarde alors que vous en avez ${currContacts} actuellement. Restaurer effacerait vos contacts. (Snapshot probablement créé avant le correctif scope V1.10.1.)`,
    });
  }

  // Warning V1 simple : grandes différences de counts (proxy "beaucoup d'écart")
  for (const [key, snapCount] of Object.entries(snapshotCounts)) {
    const curr = currentCounts[key];
    if (curr === undefined || curr < 0) continue;
    if (snapCount === 0 && curr === 0) continue;
    const delta = Math.abs(snapCount - curr);
    const ratio = curr === 0 ? Infinity : delta / curr;
    if (delta >= 50 || ratio >= 0.5) {
      warnings.push({
        kind: 'large-delta',
        message: `Écart important sur ${key}`,
        detail: `actuel=${curr} → restauré=${snapCount} (delta=${delta})`,
      });
    }
  }

  return {
    snapshot: {
      id: snap.id,
      companyId: snap.companyId,
      collabId: snap.collabId,
      createdAt: snap.createdAt,
      kind: snap.kind,
      trigger: snap.trigger,
      fingerprint: snap.fingerprint,
      rowCount: snap.rowCount,
      createdBy: snap.createdBy,
      payloadSizeBytes: snap.payloadSizeBytes,
    },
    willRestore,
    willSkip,
    counts: {
      snapshot: snapshotCounts,
      current: currentCounts,
    },
    warnings,
  };
}
