-- Phase S2.1 — Ajoute la colonne dirtySinceSnapshotAt sur collaborators.
-- Utilisée par le cron snapshots (S2.3) pour ne traiter que les collabs ayant
-- eu une activité métier depuis leur dernier snapshot.
--
-- Zero-risk : ADD COLUMN nullable, pas de lock long, pas de dépendance code.
-- Les triggers (S2.2) rempliront cette colonne automatiquement sur écritures.
-- Le cron (S2.3) lit puis reset cette colonne à NULL après snapshot.

ALTER TABLE collaborators ADD COLUMN dirtySinceSnapshotAt INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_collab_dirty
  ON collaborators (dirtySinceSnapshotAt)
  WHERE dirtySinceSnapshotAt IS NOT NULL;
