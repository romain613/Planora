// V1.8.24.6 — Cron audit auto-réparation pipeline ↔ bookings
// Source d'inspiration : audit AGENDA-2026-04-26 §6.4 + Phase 4 V1.8.24.
//
// Objectif : empêcher la dérive de pipeline_stage / rdv_status / next_rdv_date par rapport
// aux bookings réels. Idempotent, safe à passer plusieurs fois par jour.
//
// Réparations effectuées :
//   1. Contacts en pipeline_stage='rdv_programme' SANS booking confirmé futur → 'contacte'
//   2. Contacts avec rdv_status='programme' SANS booking confirmé futur → NULL
//   3. Contacts avec next_rdv_date set mais sans booking matchant → recalcul depuis bookings réels
//   4. Bookings avec googleEventId orphelin (event Google supprimé) → SET googleEventId=NULL
//   5. Bookings avec contactId orphelin et status='confirmed' → cancel (préserve l'audit)
//
// Scheduling : quotidien à 03:00 UTC (créneau bas trafic, après backups 02:00).
// Logs structurés [AUDIT-PIPELINE-SYNC] pour traçabilité.
//
// IMPORTANT : ne touche PAS les stages 'client_valide', 'perdu', ou custom Pipeline Templates.

import cron from 'node-cron';
import { db } from '../db/database.js';

function repairPipelineStageDrift() {
  // Contacts en 'rdv_programme' sans booking futur confirmé → revert 'contacte'
  // (cohérent avec autoPipelineAdvance(c.id, 'booking_cancelled_last') côté code applicatif)
  const drifted = db.prepare(`
    SELECT id, companyId, name, pipeline_stage FROM contacts
    WHERE pipeline_stage = 'rdv_programme'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.contactId = contacts.id
          AND b.status = 'confirmed'
          AND b.date >= date('now')
      )
  `).all();
  if (drifted.length === 0) return { stage_repaired: 0 };
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const c of drifted) {
      db.prepare("UPDATE contacts SET pipeline_stage = 'contacte', updatedAt = ? WHERE id = ?").run(now, c.id);
      try {
        const phId = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        db.prepare(`INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(phId, c.id, c.companyId || '', 'rdv_programme', 'contacte', 'system', 'Audit', 'Auto-réparation : aucun RDV confirmé futur', now);
      } catch (e) {
        // pipeline_history log best-effort, ne bloque pas la réparation
      }
    }
  });
  tx();
  console.log(`[AUDIT-PIPELINE-SYNC] stage_repaired=${drifted.length}`);
  return { stage_repaired: drifted.length };
}

function repairRdvStatusDrift() {
  const r = db.prepare(`
    UPDATE contacts
    SET rdv_status = NULL
    WHERE rdv_status = 'programme'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.contactId = contacts.id
          AND b.status = 'confirmed'
          AND b.date >= date('now')
      )
  `).run();
  if (r.changes > 0) console.log(`[AUDIT-PIPELINE-SYNC] rdv_status_repaired=${r.changes}`);
  return { rdv_status_repaired: r.changes };
}

function repairNextRdvDateDrift() {
  // V1.8.25 — Ne UPDATE que si la valeur change réellement (sinon SQLite compte
  // les UPDATE no-op dans changes() et le log devient trompeur — on voyait
  // "next_rdv_date_repaired=6" à chaque boot run alors que la DB était clean).
  const r1 = db.prepare(`
    UPDATE contacts
    SET next_rdv_date = (
      SELECT MIN(b.date) FROM bookings b
      WHERE b.contactId = contacts.id
        AND b.status = 'confirmed'
        AND b.date >= date('now')
    )
    WHERE next_rdv_date IS NOT NULL AND next_rdv_date != ''
      AND COALESCE(next_rdv_date, '') != COALESCE((
        SELECT MIN(b.date) FROM bookings b
        WHERE b.contactId = contacts.id
          AND b.status = 'confirmed'
          AND b.date >= date('now')
      ), '')
  `).run();
  // Mise à NULL pour ceux qui n'ont vraiment plus rien
  const r2 = db.prepare(`
    UPDATE contacts SET next_rdv_date = NULL
    WHERE next_rdv_date = ''
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.contactId = contacts.id
          AND b.status = 'confirmed'
          AND b.date >= date('now')
      )
  `).run();
  const total = (r1.changes || 0) + (r2.changes || 0);
  if (total > 0) console.log(`[AUDIT-PIPELINE-SYNC] next_rdv_date_repaired=${total}`);
  return { next_rdv_date_repaired: total };
}

function repairGcalIdOrphans() {
  const r = db.prepare(`
    UPDATE bookings SET googleEventId = NULL
    WHERE googleEventId IS NOT NULL
      AND googleEventId != ''
      AND NOT EXISTS (SELECT 1 FROM google_events ge WHERE ge.id = bookings.googleEventId)
  `).run();
  if (r.changes > 0) console.log(`[AUDIT-PIPELINE-SYNC] gcalId_orphans_cleared=${r.changes}`);
  return { gcalId_orphans_cleared: r.changes };
}

function repairOrphanBookings() {
  // Cancel les bookings 'confirmed' dont le contact n'existe plus en DB
  // (préserve l'audit, n'efface pas la ligne)
  const r = db.prepare(`
    UPDATE bookings
    SET status = 'cancelled',
        internalNotes = COALESCE(internalNotes, '') || ' [AUDIT auto-cancel orphan_contact]'
    WHERE status = 'confirmed'
      AND contactId != ''
      AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = bookings.contactId)
  `).run();
  if (r.changes > 0) console.log(`[AUDIT-PIPELINE-SYNC] orphan_bookings_cancelled=${r.changes}`);
  return { orphan_bookings_cancelled: r.changes };
}

function runAuditPipelineSync() {
  const started = Date.now();
  try {
    const r1 = repairPipelineStageDrift();
    const r2 = repairRdvStatusDrift();
    const r3 = repairNextRdvDateDrift();
    const r4 = repairGcalIdOrphans();
    const r5 = repairOrphanBookings();
    const elapsed = Date.now() - started;
    const totalChanges = r1.stage_repaired + r2.rdv_status_repaired + r3.next_rdv_date_repaired + r4.gcalId_orphans_cleared + r5.orphan_bookings_cancelled;
    if (totalChanges === 0) {
      console.log(`[AUDIT-PIPELINE-SYNC] OK — 0 réparations (DB clean) — ${elapsed}ms`);
    } else {
      console.log(`[AUDIT-PIPELINE-SYNC] DONE total=${totalChanges} — ${elapsed}ms — détail: ${JSON.stringify({...r1,...r2,...r3,...r4,...r5})}`);
    }
  } catch (err) {
    console.error('[AUDIT-PIPELINE-SYNC ERROR]', err.message);
  }
}

// Schedule : quotidien 03:00 UTC (après backups 02:00, avant heures de pointe)
cron.schedule('0 3 * * *', () => {
  runAuditPipelineSync();
});

// Run au démarrage du process (post-deploy auto-clean)
// Délai 30s pour laisser le serveur initialiser ses connexions DB
setTimeout(() => {
  console.log('[AUDIT-PIPELINE-SYNC] Boot run — auto-cleanup at startup');
  runAuditPipelineSync();
}, 30000);

console.log('\x1b[35m[CRON]\x1b[0m Pipeline sync audit scheduler started (daily 03:00 UTC + boot run)');

export { runAuditPipelineSync };
