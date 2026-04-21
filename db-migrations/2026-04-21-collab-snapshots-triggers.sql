-- Phase S2.2 — Triggers dirty-flag sur les 4 tables cœur du scope collab snapshot.
--
-- Règle : jamais sur-marquer. Chaque UPDATE ne touche QUE les ids explicitement
-- présents dans OLD/NEW.<colonnes-collab>, avec filtre anti-string-vide anti-NULL.
-- Les cas transfert V7 (owner OU executor change) marquent BOTH anciens ET nouveaux.
--
-- Expression unix-epoch-ms portable (pas d'unixepoch() qui demande SQLite >= 3.38) :
--   CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
--
-- Tables triggerées :
--   contacts           INSERT/UPDATE/DELETE (ownerCollaboratorId, executorCollaboratorId)
--   contact_followers  INSERT/UPDATE/DELETE (collaboratorId)
--   bookings           INSERT/UPDATE/DELETE (collaboratorId, meetingCollaboratorId,
--                                            bookedByCollaboratorId, agendaOwnerId)
--   call_logs          INSERT uniquement (append-only en pratique)
--
-- À tester OBLIGATOIREMENT sur copie DB avant application prod (dry-run S2.2).


-- ============================== contacts ==============================

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_contacts_ins
AFTER INSERT ON contacts
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (NEW.ownerCollaboratorId, NEW.executorCollaboratorId)
    AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_contacts_upd
AFTER UPDATE ON contacts
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (
    OLD.ownerCollaboratorId, NEW.ownerCollaboratorId,
    OLD.executorCollaboratorId, NEW.executorCollaboratorId
  ) AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_contacts_del
AFTER DELETE ON contacts
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (OLD.ownerCollaboratorId, OLD.executorCollaboratorId)
    AND id != '' AND id IS NOT NULL;
END;


-- ============================== contact_followers ==============================

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_followers_ins
AFTER INSERT ON contact_followers
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id = NEW.collaboratorId
    AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_followers_upd
AFTER UPDATE ON contact_followers
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (OLD.collaboratorId, NEW.collaboratorId)
    AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_followers_del
AFTER DELETE ON contact_followers
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id = OLD.collaboratorId
    AND id != '' AND id IS NOT NULL;
END;


-- ============================== bookings ==============================

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_bookings_ins
AFTER INSERT ON bookings
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (
    NEW.collaboratorId, NEW.meetingCollaboratorId,
    NEW.bookedByCollaboratorId, NEW.agendaOwnerId
  ) AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_bookings_upd
AFTER UPDATE ON bookings
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (
    OLD.collaboratorId, NEW.collaboratorId,
    OLD.meetingCollaboratorId, NEW.meetingCollaboratorId,
    OLD.bookedByCollaboratorId, NEW.bookedByCollaboratorId,
    OLD.agendaOwnerId, NEW.agendaOwnerId
  ) AND id != '' AND id IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_bookings_del
AFTER DELETE ON bookings
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id IN (
    OLD.collaboratorId, OLD.meetingCollaboratorId,
    OLD.bookedByCollaboratorId, OLD.agendaOwnerId
  ) AND id != '' AND id IS NOT NULL;
END;


-- ============================== call_logs (append-only en pratique) ==============================

CREATE TRIGGER IF NOT EXISTS trg_csnap_dirty_calllogs_ins
AFTER INSERT ON call_logs
BEGIN
  UPDATE collaborators
  SET dirtySinceSnapshotAt = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE id = NEW.collaboratorId
    AND id != '' AND id IS NOT NULL;
END;
