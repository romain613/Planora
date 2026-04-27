-- V1.10.3 Phase 1 — Reporting Collab RDV
-- Migration : ajoute 4 colonnes reporting sur bookings
-- Idempotent : SQLite ignore les ALTER si la colonne existe déjà via try/catch côté script.
-- À exécuter via : 02-run-migration.sh (qui gère idempotence)
--
-- Ne touche PAS bookingOutcome / bookingOutcomeNote / bookingOutcomeAt (legacy phaseA).
-- Le reporting V1.10.3 utilise EXCLUSIVEMENT les 4 colonnes ci-dessous.

ALTER TABLE bookings ADD COLUMN bookingReportingStatus TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingReportingNote TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingReportedAt TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingReportedBy TEXT DEFAULT '';

-- Index pour requêtes "RDV à rapporter par collab B" (Phase 2)
CREATE INDEX IF NOT EXISTS idx_bookings_reporting_status ON bookings(bookingReportingStatus);
CREATE INDEX IF NOT EXISTS idx_bookings_reported_by ON bookings(bookingReportedBy);
