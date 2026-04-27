#!/bin/bash
# V1.10.3 Phase 1 — Migration runner idempotent
# Exécute : ALTER TABLE bookings + 4 colonnes reporting + 2 indexes
# Idempotent : check PRAGMA table_info AVANT chaque ALTER (skip si déjà présente)
#
# Usage : bash 02-run-migration.sh [DB_PATH]
# Default DB : $DB_PATH env ou /var/www/planora-data/calendar360.db

set -euo pipefail

DB_PATH="${1:-${DB_PATH:-/var/www/planora-data/calendar360.db}}"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: DB not found at $DB_PATH" >&2
  exit 1
fi

echo "[MIGRATION V1.10.3] DB: $DB_PATH"

# Helper : check si une colonne existe déjà
column_exists() {
  local col="$1"
  sqlite3 "$DB_PATH" "PRAGMA table_info(bookings);" | grep -qE "^[0-9]+\|${col}\|"
}

# Idempotent ALTERs
for col in bookingReportingStatus bookingReportingNote bookingReportedAt bookingReportedBy; do
  if column_exists "$col"; then
    echo "[SKIP] Column ${col} already exists"
  else
    echo "[ADD ] Column ${col}"
    sqlite3 "$DB_PATH" "ALTER TABLE bookings ADD COLUMN ${col} TEXT DEFAULT '';"
  fi
done

# Indexes idempotents (CREATE INDEX IF NOT EXISTS)
sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_bookings_reporting_status ON bookings(bookingReportingStatus);"
sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_bookings_reported_by ON bookings(bookingReportedBy);"

echo "[VERIFY] Schema bookings (4 nouvelles colonnes attendues) :"
sqlite3 "$DB_PATH" "PRAGMA table_info(bookings);" | grep -E "bookingReporting|bookingReported"

echo "[VERIFY] Indexes :"
sqlite3 "$DB_PATH" ".indexes bookings" | grep -E "reporting_status|reported_by"

echo "[OK] Migration V1.10.3 phase 1 complete"
