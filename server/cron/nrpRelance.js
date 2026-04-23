import cron from 'node-cron';
import { db } from '../db/database.js';

// ─── NRP AUTO-RELANCE — every 30 minutes ───
cron.schedule('*/30 * * * *', () => {
  try { processNrpRelance(); }
  catch (err) { console.error('[CRON NRP RELANCE ERROR]', err.message); }
});

console.log('\x1b[35m[CRON]\x1b[0m NRP auto-relance scheduler started (every 30 min)');

function processNrpRelance() {
  const today = new Date().toISOString().split('T')[0];

  // Find contacts with NRP follow-up date <= today and pipeline_stage = 'nrp'
  const contacts = db.prepare(
    "SELECT id, companyId, nrp_followups_json, nrp_next_relance FROM contacts WHERE nrp_next_relance != '' AND nrp_next_relance <= ? AND pipeline_stage = 'nrp'"
  ).all(today);

  if (contacts.length === 0) return;

  let processed = 0;

  for (const ct of contacts) {
    let followups = [];
    try { followups = JSON.parse(ct.nrp_followups_json || '[]'); } catch { continue; }

    let changed = false;
    for (const fu of followups) {
      if (!fu.done && fu.date <= today) {
        fu.done = true;
        changed = true;
      }
    }

    if (!changed) continue;

    // Find next undone followup
    const nextFu = followups.find(f => !f.done);
    const nextRelance = nextFu ? nextFu.date : '';

    // Update contact
    db.prepare(
      "UPDATE contacts SET nrp_followups_json = ?, nrp_next_relance = ? WHERE id = ?"
    ).run(JSON.stringify(followups), nextRelance, ct.id);

    // Log to pipeline_history
    const hId = 'ph_nrp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      'INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(hId, ct.id, ct.companyId, 'nrp', 'nrp', 'system', 'Système', 'Relance NRP automatique — contact prêt à relancer', new Date().toISOString());

    processed++;
  }

  if (processed > 0) {
    console.log(`\x1b[35m[CRON NRP]\x1b[0m ${processed} contact(s) relancé(s)`);
  }
}
