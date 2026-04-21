-- Phase S1 — Table metadata pour les snapshots métier par collaborateur.
--
-- Le payload (rows JSON complètes) est stocké sur filesystem (gzippé) à :
--   /var/www/planora-data/snapshots/<companyId>/<collabId>/<ISO-timestamp>.json.gz
-- Cette table ne contient QUE la metadata (pointeur + intégrité + résumé).
--
-- NOT APPLIED YET — à revuer puis exécuter manuellement sur la prod DB via :
--   sqlite3 /var/www/planora-data/calendar360.db < 2026-04-21-collab-snapshots-schema.sql
--
-- Zero-risk : CREATE TABLE IF NOT EXISTS uniquement, pas de modification des tables existantes.

CREATE TABLE IF NOT EXISTS collab_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId TEXT NOT NULL,
  collabId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,             -- unix ms
  kind TEXT NOT NULL CHECK (kind IN ('auto', 'pre-restore', 'manual')),
  trigger TEXT DEFAULT '',                -- 'dirty-detected' / 'restore-reversibility' / 'user-manual'
  payloadPath TEXT NOT NULL,              -- relatif à SNAPSHOTS_DIR
  payloadSha256 TEXT NOT NULL,            -- intégrité gzip
  payloadSizeBytes INTEGER NOT NULL,
  rowCount INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,              -- hash état pour change-detect
  summaryJson TEXT DEFAULT '{}',          -- counts par table, pré-calculé pour preview
  createdBy TEXT DEFAULT '',              -- 'cron' / 'supra-admin:<id>' / 'self:<collabId>'
  expiresAt INTEGER                       -- unix ms, null = pas d'expiration
);

CREATE INDEX IF NOT EXISTS idx_csnap_collab
  ON collab_snapshots (companyId, collabId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_csnap_expires
  ON collab_snapshots (expiresAt)
  WHERE expiresAt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csnap_fingerprint
  ON collab_snapshots (companyId, collabId, fingerprint);
