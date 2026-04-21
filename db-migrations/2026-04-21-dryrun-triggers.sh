#!/bin/bash
# Phase S2.2 — Dry-run des triggers dirty-flag sur copie DB.
# Scénarios testés :
#  1. INSERT contact owner=Julie → Julie dirty
#  2. UPDATE contact transfert Julie→Hiba → Julie+Hiba dirty (both)
#  3. INSERT contact owner='' → personne marqué
#  4. Reset flags, INSERT booking → Julie dirty
#  5. Reset flags, UPDATE contact SANS changer owner → Julie dirty (metadata update)
#  6. Reset flags, DELETE contact → Julie dirty (elle perd le contact)
#  7. INSERT call_log → Julie dirty
#  8. Vérifier que Gauthier (autre collab CapFinances) n'a été marqué à AUCUN moment pendant les tests Julie
#
# Sortie : liste des PASS/FAIL + diff dirty flags par scénario.
# Usage : bash dryrun-triggers.sh

set -e

PROD_DB="/var/www/planora-data/calendar360.db"
TEST_DB="/tmp/test-triggers-s22.db"
TRIGGERS_SQL="/var/www/planora/db-migrations/2026-04-21-collab-snapshots-triggers.sql"

# Collabs de test (existants en prod)
JULIE="u1776169427559"     # Julie Desportes, CapFinances
HIBA="u1775723576024"      # Hiba, GENETICAT (cross-company — devrait rester intact)
GAUTHIER="u1776169282186"  # Gauthier Chaboy, CapFinances — TÉMOIN, ne doit JAMAIS être marqué
COMPANY_CAPFI="c1776169036725"
COMPANY_GENETICAT="c1775722958849"

echo "=== S2.2 dry-run triggers on DB copy ==="
echo ""

# --- 1. Clone prod DB
echo "[1/9] Cloning prod DB → $TEST_DB"
rm -f "$TEST_DB" "$TEST_DB-wal" "$TEST_DB-shm"
sqlite3 "$PROD_DB" ".backup $TEST_DB"
echo "  clone size: $(ls -l $TEST_DB | awk '{print $5}') bytes"

# --- 2. Apply triggers to copy
echo ""
echo "[2/9] Applying triggers to copy"
sqlite3 "$TEST_DB" < "$TRIGGERS_SQL"
N_TRIGGERS=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_csnap_%';")
echo "  triggers installed: $N_TRIGGERS"

# Helper: reset all dirty flags on copy
reset_flags() {
  sqlite3 "$TEST_DB" "UPDATE collaborators SET dirtySinceSnapshotAt = NULL;"
}

# Helper: check dirty status of a collab
is_dirty() {
  local cid=$1
  local r=$(sqlite3 "$TEST_DB" "SELECT CASE WHEN dirtySinceSnapshotAt IS NULL THEN 'clean' ELSE 'dirty' END FROM collaborators WHERE id='$cid';")
  echo "$r"
}

PASS=0; FAIL=0
check() {
  local desc="$1"; local expected="$2"; local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc: expected=$expected actual=$actual"
    PASS=$((PASS+1))
  else
    echo "  ✗ $desc: expected=$expected actual=$actual"
    FAIL=$((FAIL+1))
  fi
}

# --- 3. Scenario 1: INSERT contact owner=Julie
echo ""
echo "[3/9] Scenario 1: INSERT contact owner=Julie"
reset_flags
sqlite3 "$TEST_DB" "INSERT INTO contacts (id, companyId, name, ownerCollaboratorId) VALUES ('test-contact-s22-01','$COMPANY_CAPFI','TestContact S22 01','$JULIE');"
check "Julie marked dirty" "dirty" "$(is_dirty $JULIE)"
check "Gauthier NOT marked (control)" "clean" "$(is_dirty $GAUTHIER)"
check "Hiba NOT marked (cross-company control)" "clean" "$(is_dirty $HIBA)"

# --- 4. Scenario 2: UPDATE transfert Julie → Hiba
echo ""
echo "[4/9] Scenario 2: UPDATE contact ownerCollab Julie → Hiba (transfert V7)"
reset_flags
sqlite3 "$TEST_DB" "UPDATE contacts SET ownerCollaboratorId='$HIBA' WHERE id='test-contact-s22-01';"
check "Julie (source) marked dirty" "dirty" "$(is_dirty $JULIE)"
check "Hiba (destination) marked dirty" "dirty" "$(is_dirty $HIBA)"
check "Gauthier NOT marked (control)" "clean" "$(is_dirty $GAUTHIER)"

# --- 5. Scenario 3: INSERT contact owner='' (empty string, legacy default)
echo ""
echo "[5/9] Scenario 3: INSERT contact with empty owner"
reset_flags
sqlite3 "$TEST_DB" "INSERT INTO contacts (id, companyId, name, ownerCollaboratorId) VALUES ('test-contact-s22-02','$COMPANY_CAPFI','Orphan Contact','');"
N_DIRTY=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM collaborators WHERE dirtySinceSnapshotAt IS NOT NULL;")
check "NO collab marked (empty owner)" "0" "$N_DIRTY"

# --- 6. Scenario 4: INSERT booking with collaboratorId=Julie
echo ""
echo "[6/9] Scenario 4: INSERT booking collaboratorId=Julie"
reset_flags
sqlite3 "$TEST_DB" "INSERT INTO bookings (id, calendarId, collaboratorId, date, time, visitorName, companyId) VALUES ('test-booking-s22-01','cal-fake','$JULIE','2026-04-22','10:00','Test Visitor','$COMPANY_CAPFI');"
check "Julie marked dirty (booking INSERT)" "dirty" "$(is_dirty $JULIE)"
check "Gauthier NOT marked" "clean" "$(is_dirty $GAUTHIER)"

# --- 7. Scenario 5: UPDATE contact sans changer owner (metadata only)
echo ""
echo "[7/9] Scenario 5: UPDATE contact metadata (owner unchanged)"
reset_flags
sqlite3 "$TEST_DB" "UPDATE contacts SET notes='touched' WHERE id='test-contact-s22-01';"
# après scenario 2, owner est Hiba
check "Hiba (owner) marked dirty on metadata update" "dirty" "$(is_dirty $HIBA)"
check "Gauthier NOT marked" "clean" "$(is_dirty $GAUTHIER)"

# --- 8. Scenario 6: DELETE contact
echo ""
echo "[8/9] Scenario 6: DELETE contact (Hiba est owner)"
reset_flags
sqlite3 "$TEST_DB" "DELETE FROM contacts WHERE id='test-contact-s22-01';"
check "Hiba marked dirty on DELETE" "dirty" "$(is_dirty $HIBA)"
check "Gauthier NOT marked" "clean" "$(is_dirty $GAUTHIER)"

# --- 9. Scenario 7: INSERT call_log
echo ""
echo "[9/9] Scenario 7: INSERT call_log collaboratorId=Julie"
reset_flags
sqlite3 "$TEST_DB" "INSERT INTO call_logs (id, companyId, collaboratorId, createdAt) VALUES ('test-call-s22-01','$COMPANY_CAPFI','$JULIE','2026-04-21T09:00:00Z');"
check "Julie marked dirty (call_log INSERT)" "dirty" "$(is_dirty $JULIE)"
check "Gauthier NOT marked" "clean" "$(is_dirty $GAUTHIER)"

# --- Final
echo ""
echo "=== Summary ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "VERDICT: GO (triggers safe to apply in prod)"
  rm -f "$TEST_DB" "$TEST_DB-wal" "$TEST_DB-shm"
  exit 0
else
  echo "VERDICT: NO-GO (keep $TEST_DB for inspection)"
  exit 1
fi
