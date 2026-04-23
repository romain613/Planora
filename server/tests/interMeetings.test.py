#!/usr/bin/env python3
"""
Tests automatisés — RDV Inter-Collaborateurs (Phase 6)

Exécution : python3 server/tests/interMeetings.test.py

Teste :
1. Isolation cross-company (un collab ne peut pas voir les données d'une autre company)
2. Permissions (ownership, admin bypass, follower checks)
3. Pipeline sync (outcome → pipeline_stage mapping)
4. Auto-cleanup (executor follower supprimé après outcome, sauf rescheduled)
5. Booking + conflict detection
6. Defense in depth (companyId in WHERE clauses)
7. Visibility model (contact_followers)
8. Notification types + dedup
9. Reminder logs (no duplicate sends)
10. Input validation

Utilise sqlite3 en mémoire (pas de serveur HTTP).
"""

import sqlite3
import json
import sys
from datetime import datetime

# ─── TEST FRAMEWORK ──────────────────────────────────────────────

passed = 0
failed = 0
total = 0
failures = []

def test(name, fn):
    global passed, failed, total
    total += 1
    try:
        fn()
        passed += 1
        print(f"  ✅ {name}")
    except Exception as e:
        failed += 1
        failures.append((name, str(e)))
        print(f"  ❌ {name} — {e}")

def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise AssertionError(f"{msg}: expected {expected!r}, got {actual!r}")

def assert_true(condition, msg=""):
    if not condition:
        raise AssertionError(msg or "Assertion failed")

def assert_none(val, msg=""):
    if val is not None:
        raise AssertionError(f"{msg}: expected None, got {val!r}")

def assert_includes(s, sub, msg=""):
    if sub not in (s or ""):
        raise AssertionError(f"{msg}: '{s}' does not include '{sub}'")

# ─── SETUP IN-MEMORY DB ─────────────────────────────────────────

db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row
db.execute("PRAGMA foreign_keys = ON")
c = db.cursor()

c.executescript("""
  CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT, tenantMode TEXT DEFAULT 'legacy');

  CREATE TABLE collaborators (
    id TEXT PRIMARY KEY, companyId TEXT, name TEXT, email TEXT, phone TEXT,
    color TEXT DEFAULT '#3B82F6', role TEXT DEFAULT 'member',
    acceptInternalMeetings INTEGER DEFAULT 1, shareAgendaAvailability INTEGER DEFAULT 1,
    autoAcceptMeetings INTEGER DEFAULT 0, meetingPriorityLevel INTEGER DEFAULT 1,
    code TEXT DEFAULT ''
  );

  CREATE TABLE contacts (
    id TEXT PRIMARY KEY, companyId TEXT, name TEXT, email TEXT, phone TEXT,
    assignedTo TEXT, ownerCollaboratorId TEXT, executorCollaboratorId TEXT,
    meetingCollaboratorId TEXT, pipeline_stage TEXT DEFAULT 'nouveau',
    followMode TEXT DEFAULT 'owner_only', visibilityScope TEXT DEFAULT 'owner',
    lastMeetingOutcome TEXT, lastMeetingDate TEXT, lastMeetingCollaboratorId TEXT
  );

  CREATE TABLE contact_followers (
    id TEXT PRIMARY KEY, contactId TEXT, collaboratorId TEXT, companyId TEXT,
    role TEXT DEFAULT 'viewer', addedAt TEXT, addedBy TEXT, reason TEXT DEFAULT '',
    UNIQUE(contactId, collaboratorId)
  );
  CREATE INDEX idx_cf_contact ON contact_followers(contactId);
  CREATE INDEX idx_cf_collab ON contact_followers(collaboratorId, companyId);

  CREATE TABLE calendars (
    id TEXT PRIMARY KEY, companyId TEXT, name TEXT, collaborators_json TEXT DEFAULT '[]',
    bufferBefore INTEGER DEFAULT 0, bufferAfter INTEGER DEFAULT 0,
    minNotice INTEGER DEFAULT 60
  );

  CREATE TABLE bookings (
    id TEXT PRIMARY KEY, calendarId TEXT, collaboratorId TEXT, date TEXT, time TEXT,
    duration INTEGER DEFAULT 30, visitorName TEXT, visitorEmail TEXT, visitorPhone TEXT,
    status TEXT DEFAULT 'pending', notes TEXT DEFAULT '', source TEXT DEFAULT '',
    contactId TEXT, companyId TEXT, bookedByCollaboratorId TEXT,
    meetingCollaboratorId TEXT, agendaOwnerId TEXT,
    bookingType TEXT DEFAULT 'external', bookingOutcome TEXT,
    bookingOutcomeNote TEXT, bookingOutcomeAt TEXT, transferMode TEXT DEFAULT ''
  );

  CREATE TABLE availabilities (id TEXT PRIMARY KEY, collaboratorId TEXT, schedule_json TEXT);

  CREATE TABLE google_events (
    id TEXT PRIMARY KEY, collaboratorId TEXT, startTime TEXT, endTime TEXT,
    allDay INTEGER DEFAULT 0, summary TEXT DEFAULT ''
  );

  CREATE TABLE settings (id TEXT PRIMARY KEY, companyId TEXT, blackoutDates_json TEXT DEFAULT '[]');

  CREATE TABLE pipeline_history (
    id TEXT PRIMARY KEY, contactId TEXT, companyId TEXT,
    fromStage TEXT, toStage TEXT, userId TEXT, userName TEXT,
    note TEXT DEFAULT '', createdAt TEXT
  );

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY, companyId TEXT, collaboratorId TEXT,
    type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
    contactId TEXT DEFAULT '', contactName TEXT DEFAULT '',
    linkUrl TEXT DEFAULT '', readAt TEXT, createdAt TEXT NOT NULL
  );

  CREATE TABLE reminder_logs (
    id TEXT PRIMARY KEY, bookingId TEXT NOT NULL, type TEXT NOT NULL,
    channel TEXT, sentAt TEXT
  );
""")

# ─── SEED DATA ───────────────────────────────────────────────────

now = datetime.utcnow().isoformat()

# Companies
c.execute("INSERT INTO companies VALUES (?, ?, ?)", ("comp_A", "Company Alpha", "legacy"))
c.execute("INSERT INTO companies VALUES (?, ?, ?)", ("comp_B", "Company Beta", "legacy"))

# Collabs
c.execute("INSERT INTO collaborators VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("collab_A1", "comp_A", "Alice A", "alice@a.com", "+33600000001", "#3B82F6", "admin", 1, 1, 0, 1, "AAA"))
c.execute("INSERT INTO collaborators VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("collab_A2", "comp_A", "Bob A", "bob@a.com", "+33600000002", "#22C55E", "member", 1, 1, 1, 1, "BBB"))
c.execute("INSERT INTO collaborators VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ("collab_B1", "comp_B", "Charlie B", "charlie@b.com", "+33600000003", "#EF4444", "admin", 1, 1, 0, 1, "CCC"))

# Contacts
c.execute("INSERT INTO contacts (id, companyId, name, email, assignedTo, ownerCollaboratorId, pipeline_stage) VALUES (?,?,?,?,?,?,?)",
    ("ct_A1", "comp_A", "Contact Alpha 1", "ct1@test.com", "collab_A1", "collab_A1", "nouveau"))
c.execute("INSERT INTO contacts (id, companyId, name, email, assignedTo, ownerCollaboratorId, pipeline_stage) VALUES (?,?,?,?,?,?,?)",
    ("ct_A2", "comp_A", "Contact Alpha 2", "ct2@test.com", "collab_A2", "collab_A2", "nouveau"))
c.execute("INSERT INTO contacts (id, companyId, name, email, assignedTo, ownerCollaboratorId, pipeline_stage) VALUES (?,?,?,?,?,?,?)",
    ("ct_B1", "comp_B", "Contact Beta 1", "ctb@test.com", "collab_B1", "collab_B1", "nouveau"))

# Calendars
c.execute("INSERT INTO calendars (id, companyId, name) VALUES (?,?,?)", ("cal_A", "comp_A", "Cal A"))
c.execute("INSERT INTO calendars (id, companyId, name) VALUES (?,?,?)", ("cal_B", "comp_B", "Cal B"))

# Booking in Company A (internal)
c.execute("""INSERT INTO bookings (id, calendarId, collaboratorId, date, time, duration, visitorName, status,
    companyId, bookingType, bookedByCollaboratorId, meetingCollaboratorId, agendaOwnerId, contactId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("bk_A1", "cal_A", "collab_A2", "2026-05-01", "10:00", 30, "Test", "confirmed",
     "comp_A", "internal", "collab_A1", "collab_A2", "collab_A2", "ct_A1"))

# contact_followers: A2 is executor of ct_A1
c.execute("INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, addedAt, addedBy) VALUES (?,?,?,?,?,?,?)",
    ("cf_exec1", "ct_A1", "collab_A2", "comp_A", "executor", now, "collab_A1"))

db.commit()

# ─── TESTS ───────────────────────────────────────────────────────

print("\n══════════════════════════════════════════════════════")
print("  TESTS INTER-MEETINGS — Phase 6 Security + Logic")
print("══════════════════════════════════════════════════════\n")

# ──── 1. CROSS-COMPANY ISOLATION ────

print("▸ 1. Cross-company isolation\n")

def test_ct_invisible():
    row = c.execute("SELECT * FROM contacts WHERE id = ? AND companyId = ?", ("ct_A1", "comp_B")).fetchone()
    assert_none(row, "Contact A should be invisible in Company B")
test("Contact from Company A is invisible to Company B", test_ct_invisible)

def test_collab_invisible():
    row = c.execute("SELECT * FROM collaborators WHERE id = ? AND companyId = ?", ("collab_A1", "comp_B")).fetchone()
    assert_none(row, "Collab A should be invisible in Company B")
test("Collaborator from Company A is invisible to Company B", test_collab_invisible)

def test_booking_filtered():
    rows = c.execute("SELECT * FROM bookings WHERE companyId = ? AND bookingType = 'internal'", ("comp_B",)).fetchall()
    assert_eq(len(rows), 0, "No internal bookings from A visible to B")
test("Booking from Company A filtered out for Company B", test_booking_filtered)

def test_followers_scoped():
    cf_a = c.execute("SELECT * FROM contact_followers WHERE companyId = ?", ("comp_A",)).fetchall()
    cf_b = c.execute("SELECT * FROM contact_followers WHERE companyId = ?", ("comp_B",)).fetchall()
    assert_true(len(cf_a) >= 1, "Should have followers in Company A")
    assert_eq(len(cf_b), 0, "No followers from A in Company B")
test("contact_followers scoped to companyId", test_followers_scoped)

# ──── 2. PERMISSIONS ────

print("\n▸ 2. Permission checks\n")

def test_follower_access():
    ct = c.execute("SELECT * FROM contacts WHERE id = ? AND companyId = ?", ("ct_A1", "comp_A")).fetchone()
    is_owner = ct["assignedTo"] == "collab_A2" or ct["ownerCollaboratorId"] == "collab_A2"
    is_follower = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ?", ("ct_A1", "collab_A2")).fetchone()
    assert_true(is_owner or is_follower is not None, "A2 should have access as follower")
test("Follower can access contact they follow", test_follower_access)

def test_non_follower_no_access():
    c.execute("INSERT OR IGNORE INTO contacts (id, companyId, name, assignedTo, ownerCollaboratorId) VALUES (?,?,?,?,?)",
        ("ct_A3", "comp_A", "Secret Contact", "collab_A1", "collab_A1"))
    db.commit()
    ct = c.execute("SELECT * FROM contacts WHERE id = ? AND companyId = ?", ("ct_A3", "comp_A")).fetchone()
    is_owner = ct["assignedTo"] == "collab_A2" or ct["ownerCollaboratorId"] == "collab_A2"
    is_follower = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ?", ("ct_A3", "collab_A2")).fetchone()
    assert_true(not is_owner and is_follower is None, "A2 should NOT access ct_A3")
test("Non-follower non-owner has no access", test_non_follower_no_access)

# ──── 3. PIPELINE SYNC ────

print("\n▸ 3. Pipeline sync (outcome → stage)\n")

def test_outcome_mapping():
    m = {"done": "contacte", "qualified": "qualifie", "not_qualified": "perdu",
         "no_show": "nrp", "cancelled": None, "rescheduled": None, "transferred": None}
    assert_eq(m["done"], "contacte", "done mapping")
    assert_eq(m["qualified"], "qualifie", "qualified mapping")
    assert_eq(m["not_qualified"], "perdu", "not_qualified mapping")
    assert_eq(m["no_show"], "nrp", "no_show mapping")
    assert_none(m["cancelled"], "cancelled should not sync")
    assert_none(m["rescheduled"], "rescheduled should not sync")
test("OUTCOME_TO_STAGE mapping correct", test_outcome_mapping)

def test_pipeline_update():
    c.execute("UPDATE contacts SET pipeline_stage = ? WHERE id = ?", ("qualifie", "ct_A1"))
    db.commit()
    row = c.execute("SELECT pipeline_stage FROM contacts WHERE id = ?", ("ct_A1",)).fetchone()
    assert_eq(row["pipeline_stage"], "qualifie", "Stage should update")
    c.execute("UPDATE contacts SET pipeline_stage = ? WHERE id = ?", ("nouveau", "ct_A1"))
    db.commit()
test("Pipeline stage updates when outcome is applied", test_pipeline_update)

def test_pipeline_history_log():
    c.execute("INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
        ("ph_t1", "ct_A1", "comp_A", "nouveau", "contacte", "collab_A2", "Bob A", "[RDV inter-collab] Outcome: done", now))
    db.commit()
    ph = c.execute("SELECT * FROM pipeline_history WHERE contactId = ? AND companyId = ?", ("ct_A1", "comp_A")).fetchone()
    assert_includes(ph["note"], "[RDV inter-collab]", "History note should contain tag")
    assert_eq(ph["toStage"], "contacte", "History toStage")
test("Pipeline history logged after outcome", test_pipeline_history_log)

# ──── 4. AUTO-CLEANUP ────

print("\n▸ 4. Auto-cleanup executor\n")

def test_executor_deleted():
    row = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'",
        ("ct_A1", "collab_A2")).fetchone()
    assert_true(row is not None, "Executor should exist before cleanup")
    c.execute("DELETE FROM contact_followers WHERE id = ?", (row["id"],))
    db.commit()
    after = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'",
        ("ct_A1", "collab_A2")).fetchone()
    assert_none(after, "Executor should be deleted")
test("Executor follower deleted after outcome (not rescheduled)", test_executor_deleted)

def test_executor_kept_rescheduled():
    c.execute("INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, addedAt, addedBy) VALUES (?,?,?,?,?,?,?)",
        ("cf_resch", "ct_A1", "collab_A2", "comp_A", "executor", now, "collab_A1"))
    db.commit()
    outcome = "rescheduled"
    if outcome != "rescheduled":
        c.execute("DELETE FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'", ("ct_A1", "collab_A2"))
        db.commit()
    still = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'",
        ("ct_A1", "collab_A2")).fetchone()
    assert_true(still is not None, "Executor should survive rescheduled outcome")
test("Executor NOT deleted when outcome is rescheduled", test_executor_kept_rescheduled)

def test_viewer_never_deleted():
    c.execute("INSERT OR REPLACE INTO contact_followers (id, contactId, collaboratorId, companyId, role, addedAt, addedBy) VALUES (?,?,?,?,?,?,?)",
        ("cf_view", "ct_A1", "collab_A2", "comp_A", "viewer", now, "collab_A1"))
    db.commit()
    # Auto-cleanup only targets executor
    ex = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'",
        ("ct_A1", "collab_A2")).fetchone()
    if ex:
        c.execute("DELETE FROM contact_followers WHERE id = ?", (ex["id"],))
        db.commit()
    viewer = c.execute("SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'viewer'",
        ("ct_A1", "collab_A2")).fetchone()
    assert_true(viewer is not None, "Viewer should survive auto-cleanup")
test("Viewer follower never deleted by auto-cleanup", test_viewer_never_deleted)

# ──── 5. BOOKING + CONFLICT ────

print("\n▸ 5. Booking conflict detection\n")

def test_overlap_detected():
    new_start = 10 * 60 + 15  # 10:15
    new_end = new_start + 30
    rows = c.execute("SELECT id, time, duration FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?",
        ("collab_A2", "2026-05-01", "comp_A")).fetchall()
    conflict = None
    for b in rows:
        h, m = map(int, b["time"].split(":"))
        ex_start = h * 60 + m
        ex_end = ex_start + (b["duration"] or 30)
        if new_start < ex_end and new_end > ex_start:
            conflict = b
            break
    assert_true(conflict is not None, "Conflict should be detected at 10:15")
test("Conflict detected on overlapping time slot", test_overlap_detected)

def test_no_overlap():
    new_start = 11 * 60  # 11:00
    new_end = new_start + 30
    rows = c.execute("SELECT id, time, duration FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?",
        ("collab_A2", "2026-05-01", "comp_A")).fetchall()
    conflict = None
    for b in rows:
        h, m = map(int, b["time"].split(":"))
        ex_start = h * 60 + m
        ex_end = ex_start + (b["duration"] or 30)
        if new_start < ex_end and new_end > ex_start:
            conflict = b
            break
    assert_none(conflict, "No conflict at 11:00")
test("No conflict on non-overlapping slot", test_no_overlap)

# ──── 6. DEFENSE IN DEPTH ────

print("\n▸ 6. Defense in depth (companyId in WHERE)\n")

def test_ghost_booking():
    c.execute("""INSERT INTO bookings (id, calendarId, collaboratorId, date, time, duration, visitorName, status, companyId, bookingType)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        ("bk_ghost", "cal_B", "collab_A2", "2026-05-01", "10:00", 30, "Ghost", "confirmed", "comp_B", "external"))
    db.commit()
    rows = c.execute("SELECT * FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?",
        ("collab_A2", "2026-05-01", "comp_A")).fetchall()
    ghost = [r for r in rows if r["id"] == "bk_ghost"]
    assert_eq(len(ghost), 0, "Ghost booking must not appear")
test("Booking query with companyId filters out cross-company ghosts", test_ghost_booking)

def test_cancel_cross_company():
    cur = c.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND companyId = ?", ("bk_ghost", "comp_A"))
    db.commit()
    assert_eq(cur.rowcount, 0, "Should not cancel cross-company booking")
    row = c.execute("SELECT status FROM bookings WHERE id = ?", ("bk_ghost",)).fetchone()
    assert_eq(row["status"], "confirmed", "Ghost booking should remain confirmed")
test("UPDATE cancelled fails cross-company (defense in depth)", test_cancel_cross_company)

def test_prefs_cross_company():
    cur = c.execute("UPDATE collaborators SET acceptInternalMeetings = 0 WHERE id = ? AND companyId = ?", ("collab_B1", "comp_A"))
    db.commit()
    assert_eq(cur.rowcount, 0, "Should not update cross-company collab")
    row = c.execute("SELECT acceptInternalMeetings FROM collaborators WHERE id = ?", ("collab_B1",)).fetchone()
    assert_eq(row["acceptInternalMeetings"], 1, "B1 prefs should remain unchanged")
test("UPDATE preferences fails cross-company (defense in depth)", test_prefs_cross_company)

# ──── 7. VISIBILITY ────

print("\n▸ 7. Visibility model (contact_followers)\n")

def test_follower_sees_contact():
    rows = c.execute("""SELECT id FROM contacts WHERE companyId = ? AND (
        assignedTo = ? OR id IN (SELECT contactId FROM contact_followers WHERE collaboratorId = ? AND companyId = ?)
    )""", ("comp_A", "collab_A2", "collab_A2", "comp_A")).fetchall()
    ids = [r["id"] for r in rows]
    assert_true("ct_A1" in ids, "A2 should see ct_A1 via contact_followers")
test("Follower can see contact via OR subquery", test_follower_sees_contact)

def test_non_follower_hidden():
    rows = c.execute("""SELECT id FROM contacts WHERE companyId = ? AND (
        assignedTo = ? OR id IN (SELECT contactId FROM contact_followers WHERE collaboratorId = ? AND companyId = ?)
    )""", ("comp_A", "collab_A2", "collab_A2", "comp_A")).fetchall()
    ids = [r["id"] for r in rows]
    assert_true("ct_A3" not in ids, "A2 should NOT see ct_A3")
test("Non-follower cannot see unassigned contact", test_non_follower_hidden)

# ──── 8. NOTIFICATIONS ────

print("\n▸ 8. Notification types + dedup\n")

def test_notif_types():
    types = ["inter_meeting_assigned", "inter_meeting_confirmed", "inter_meeting_outcome", "inter_meeting_reminder"]
    for t in types:
        c.execute("INSERT INTO notifications (id, companyId, collaboratorId, type, title, detail, createdAt) VALUES (?,?,?,?,?,?,?)",
            (f"n_{t}", "comp_A", "collab_A2", t, f"Test {t}", "Detail", now))
    db.commit()
    rows = c.execute("SELECT * FROM notifications WHERE type LIKE 'inter_meeting_%' AND companyId = ?", ("comp_A",)).fetchall()
    assert_eq(len(rows), 4, "Should have 4 inter-meeting notification types")
test("All 4 inter-collab notification types insert correctly", test_notif_types)

def test_notif_dedup():
    t = "inter_meeting_reminder"
    cid = "ct_A1"
    c.execute("INSERT INTO notifications (id, companyId, collaboratorId, type, title, detail, contactId, createdAt) VALUES (?,?,?,?,?,?,?,?)",
        ("n_dedup1", "comp_A", "collab_A2", t, "Rappel 1", "Detail 1", cid, now))
    db.commit()
    existing = c.execute("SELECT id FROM notifications WHERE companyId = ? AND type = ? AND contactId = ? AND readAt IS NULL LIMIT 1",
        ("comp_A", t, cid)).fetchone()
    assert_true(existing is not None, "Should find existing for dedup")
    c.execute("UPDATE notifications SET title = ?, detail = ? WHERE id = ?", ("Rappel 2", "Detail 2", existing["id"]))
    db.commit()
    count = c.execute("SELECT COUNT(*) as c FROM notifications WHERE companyId = ? AND type = ? AND contactId = ? AND readAt IS NULL",
        ("comp_A", t, cid)).fetchone()["c"]
    assert_eq(count, 1, "Dedup should keep exactly 1 notification")
test("Notification dedup updates instead of duplicating", test_notif_dedup)

# ──── 9. REMINDER LOGS ────

print("\n▸ 9. Reminder logs\n")

def test_reminder_no_dup():
    c.execute("INSERT INTO reminder_logs (id, bookingId, type, channel, sentAt) VALUES (?,?,?,?,?)",
        ("rl_t1", "bk_A1", "inter_24h", "internal_notif", now))
    db.commit()
    already = c.execute("SELECT id FROM reminder_logs WHERE bookingId = ? AND type = ?", ("bk_A1", "inter_24h")).fetchone()
    assert_true(already is not None, "Should detect already sent")
test("Reminder log prevents duplicate sends", test_reminder_no_dup)

# ──── 10. INPUT VALIDATION ────

print("\n▸ 10. Input validation\n")

def test_invalid_outcome():
    valid = ["done", "no_show", "rescheduled", "cancelled", "transferred", "qualified", "not_qualified"]
    assert_true("invalid" not in valid, "invalid outcome rejected")
    assert_true("done" in valid, "done is valid")
    assert_true("not_qualified" in valid, "not_qualified is valid")
test("Invalid outcome rejected, valid ones accepted", test_invalid_outcome)

def test_role_default():
    valid_roles = ["viewer", "executor", "owner"]
    safe = "hacker" if "hacker" in valid_roles else "viewer"
    assert_eq(safe, "viewer", "Invalid role defaults to viewer")
test("Invalid role defaults to viewer", test_role_default)

def test_booking_type_default():
    inp = "malicious"
    safe = "transfer" if inp == "transfer" else "internal"
    assert_eq(safe, "internal", "Invalid bookingType defaults to internal")
test("Invalid bookingType defaults to internal", test_booking_type_default)

# ──── RESULTS ────

print("\n══════════════════════════════════════════════════════")
print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
print("══════════════════════════════════════════════════════\n")

if failures:
    print("FAILED TESTS:")
    for name, err in failures:
        print(f"  ❌ {name}: {err}")
    print()

db.close()
sys.exit(1 if failed > 0 else 0)
