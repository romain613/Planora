-- V1.8.24.3 — Phase 1 Clean DB
-- Run idempotent dans une transaction. Backup pris avant : db-pre-v1824-20260426-145930.db
-- Source de vérité : bookings table

BEGIN TRANSACTION;

-- ─── 1. Bookings orphelins (contact supprimé) ───
-- Stratégie : passer les 'confirmed' en 'cancelled' avec note explicite (préserve l'audit).
-- Les 15 'cancelled' déjà invisibles → aucune action.
-- Les 'confirmed' deviennent invisibles aussi (filtre status≠cancelled partout).
UPDATE bookings
SET status = 'cancelled',
    internalNotes = COALESCE(internalNotes, '') || ' [V1.8.24 orphan_contact_cleanup]'
WHERE status = 'confirmed'
  AND contactId != ''
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = bookings.contactId);

-- ─── 2. pipeline_stage stale (rdv_programme sans booking futur) → contacte ───
-- Cohérent avec autoPipelineAdvance(contactId, 'booking_cancelled_last')
-- N.B. : on ne touche PAS les stages custom ni client_valide ni perdu.
UPDATE contacts
SET pipeline_stage = 'contacte'
WHERE pipeline_stage = 'rdv_programme'
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.contactId = contacts.id
      AND b.status = 'confirmed'
      AND b.date >= date('now')
  );

-- ─── 3. rdv_status stale (programme sans booking futur) → NULL ───
UPDATE contacts
SET rdv_status = NULL
WHERE rdv_status = 'programme'
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.contactId = contacts.id
      AND b.status = 'confirmed'
      AND b.date >= date('now')
  );

-- ─── 4. next_rdv_date stale → recalcul depuis bookings réels ───
-- Soit la date du prochain RDV confirmé futur (le plus proche), soit NULL
UPDATE contacts
SET next_rdv_date = (
  SELECT MIN(b.date) FROM bookings b
  WHERE b.contactId = contacts.id
    AND b.status = 'confirmed'
    AND b.date >= date('now')
)
WHERE next_rdv_date IS NOT NULL
  AND next_rdv_date != '';

-- Mise à NULL pour ceux qui restent vides après la requête ci-dessus
UPDATE contacts
SET next_rdv_date = NULL
WHERE next_rdv_date = ''
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.contactId = contacts.id
      AND b.status = 'confirmed'
      AND b.date >= date('now')
  );

-- ─── 5. googleEventId orphelins → NULL ───
-- Le cron syncEventsFromGoogle nettoie google_events des stale entries. Si un eventId
-- du booking n'est plus dans google_events, l'event a été supprimé côté Google.
UPDATE bookings
SET googleEventId = NULL
WHERE googleEventId IS NOT NULL
  AND googleEventId != ''
  AND NOT EXISTS (SELECT 1 FROM google_events ge WHERE ge.id = bookings.googleEventId);

COMMIT;

-- ─── Verification post-clean ───
SELECT 'orphan_bookings_count', COUNT(*) FROM bookings b WHERE b.status = 'confirmed' AND b.contactId != '' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = b.contactId)
UNION ALL SELECT 'pipeline_stale_rdv_programme', COUNT(*) FROM contacts c WHERE c.pipeline_stage = 'rdv_programme' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contactId = c.id AND b.status = 'confirmed' AND b.date >= date('now'))
UNION ALL SELECT 'rdv_status_stale', COUNT(*) FROM contacts c WHERE c.rdv_status = 'programme' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contactId = c.id AND b.status = 'confirmed' AND b.date >= date('now'))
UNION ALL SELECT 'next_rdv_date_stale', COUNT(*) FROM contacts c WHERE c.next_rdv_date IS NOT NULL AND c.next_rdv_date != '' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contactId = c.id AND b.date = c.next_rdv_date AND b.status = 'confirmed')
UNION ALL SELECT 'gcalId_orphans', COUNT(*) FROM bookings b WHERE b.googleEventId IS NOT NULL AND b.googleEventId != '' AND NOT EXISTS (SELECT 1 FROM google_events ge WHERE ge.id = b.googleEventId);
