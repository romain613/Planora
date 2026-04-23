// Phase S1 — Construit le payload snapshot d'un collab.
// PURE READ : aucun effet de bord DB / filesystem. Retourne un objet JSON-sérialisable.
// L'écriture est dans writeSnapshot.js (séparation read vs write).

import { db } from '../../db/database.js';
import { DIRECT_TABLES, CONTACT_JOINED_TABLES, COLLAB_SNAPSHOT_VERSION } from './scope.js';

/**
 * @param {{ companyId: string, collabId: string }} args
 * @returns {object} payload snapshot complet, avec `meta` et `tables`.
 */
export function buildCollabSnapshot({ companyId, collabId }) {
  if (!companyId || typeof companyId !== 'string') {
    throw new Error('buildCollabSnapshot: companyId required (string)');
  }
  if (!collabId || typeof collabId !== 'string') {
    throw new Error('buildCollabSnapshot: collabId required (string)');
  }

  const builtAt = Date.now();
  const payload = {
    meta: {
      version: COLLAB_SNAPSHOT_VERSION,
      companyId,
      collabId,
      builtAt,
      builtAtIso: new Date(builtAt).toISOString(),
      dbPath: process.env.DB_PATH || '(fallback)',
      // Colonnes ownership scannées pour contacts (documenté pour audit).
      contactOwnershipColumns: ['ownerCollaboratorId', 'executorCollaboratorId'],
      // Rempli plus bas.
      counts: {},
      totalRows: 0,
      contactIdsCount: 0,
      restoreModePerTable: {},
      warnings: [],
    },
    tables: {},
  };

  // --- Phase 1 : tables direct-collab
  for (const entry of DIRECT_TABLES) {
    try {
      const stmt = db.prepare(entry.sql);
      const args = entry.args
        ? entry.args({ companyId, collabId })
        : [companyId, collabId];
      const rows = stmt.all(...args);
      payload.tables[entry.key] = rows;
      payload.meta.restoreModePerTable[entry.key] = entry.restoreMode;
    } catch (err) {
      // On ne crashe pas tout le snapshot si une table manque ; on log et on continue.
      payload.meta.warnings.push({
        key: entry.key,
        error: err.message,
      });
      payload.tables[entry.key] = [];
      payload.meta.restoreModePerTable[entry.key] = 'error';
    }
  }

  // --- Phase 2 : collecte des contactIds du collab (owner OR executor)
  const contactsRows = payload.tables.contacts || [];
  const contactIds = contactsRows.map((c) => c.id).filter(Boolean);
  payload.meta.contactIdsCount = contactIds.length;

  // --- Phase 3 : tables contact-joined (IN (?, ?, ...))
  // SQLite limite le nombre de placeholders par requête (~999). Si le collab a > 900 contacts,
  // on chunke. Pour les gros portefeuilles, mieux que tomber en erreur silencieuse.
  const CHUNK_SIZE = 800;

  for (const entry of CONTACT_JOINED_TABLES) {
    if (contactIds.length === 0) {
      payload.tables[entry.key] = [];
      payload.meta.restoreModePerTable[entry.key] = entry.restoreMode;
      continue;
    }
    try {
      const aggregated = [];
      for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
        const chunk = contactIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        const sql = `SELECT * FROM ${entry.table} WHERE companyId = ? AND ${entry.contactIdColumn} IN (${placeholders})`;
        const rows = db.prepare(sql).all(companyId, ...chunk);
        aggregated.push(...rows);
      }
      payload.tables[entry.key] = aggregated;
      payload.meta.restoreModePerTable[entry.key] = entry.restoreMode;
    } catch (err) {
      payload.meta.warnings.push({
        key: entry.key,
        error: err.message,
      });
      payload.tables[entry.key] = [];
      payload.meta.restoreModePerTable[entry.key] = 'error';
    }
  }

  // --- Phase 4 : counts + totalRows
  payload.meta.counts = Object.fromEntries(
    Object.entries(payload.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );
  payload.meta.totalRows = Object.values(payload.meta.counts).reduce((a, b) => a + b, 0);

  return payload;
}
