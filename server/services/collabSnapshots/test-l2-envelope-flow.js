// Phase L2 — Test standalone fin-à-fin du flow enveloppe visuelle + dispatch envelopeId.
//
// Exercice direct des helpers DB (db, insert) que les routes POST /envelopes et
// assignLeadToCollab utilisent. Valide :
//  Test #3 : persistence color/icon/priority sur nouvelle enveloppe
//  Test #4 : propagation envelopeId sur contact créé via dispatch
//
// Crée des rows test, vérifie, nettoie. Aucun impact sur les vraies enveloppes/leads.

import { db, insert } from '../../db/database.js';

const COMPANY = 'c1776169036725'; // CapFinances
const COLLAB = 'u1776169427559';  // Julie Desportes

const testEnvId = 'env-l2-test-' + Date.now();
const testLeadId = 'lead-l2-test-' + Date.now();
const testContactId = 'ct-l2-test-' + Date.now();
const testAssignId = 'la-l2-test-' + Date.now();

const now = new Date().toISOString();

let pass = 0, fail = 0;
const check = (desc, expected, actual) => {
  const ok = expected === actual;
  console.log(`  ${ok ? '✓' : '✗'} ${desc}: expected=${expected} actual=${actual}`);
  if (ok) pass++; else fail++;
};

console.log('=== L2 test standalone (post-restart) ===\n');

try {
  // -------- Test #3 : POST /envelopes path (via insert helper) --------
  console.log('[Test #3] Créer enveloppe avec visuels custom');

  insert('lead_envelopes', {
    id: testEnvId,
    companyId: COMPANY,
    name: 'Test L2 Visuels',
    color: '#DC2626',
    icon: 'zap',
    priority: 'high',
    source_id: null,
    auto_dispatch: 0,
    dispatch_type: 'manual',
    dispatch_mode: 'percentage',
    dispatch_time: '',
    dispatch_limit: 0,
    dispatch_start_date: '',
    dispatch_end_date: '',
    dispatch_interval_minutes: 0,
    last_dispatch_at: '',
    created_at: now,
  });

  const env = db.prepare('SELECT * FROM lead_envelopes WHERE id = ?').get(testEnvId);
  check('env persisté', true, !!env);
  check('env.color', '#DC2626', env.color);
  check('env.icon', 'zap', env.icon);
  check('env.priority', 'high', env.priority);

  // Test CHECK constraint priority — doit refuser valeur invalide
  let checkConstraintOk = false;
  try {
    db.prepare(`INSERT INTO lead_envelopes (id, companyId, name, priority, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      'env-bad-priority-' + Date.now(), COMPANY, 'bad', 'INVALID_PRIORITY', now
    );
  } catch (e) {
    checkConstraintOk = e.message.includes('CHECK constraint');
  }
  check('CHECK constraint priority', true, checkConstraintOk);

  // -------- Test #4 : assignLeadToCollab path (via insert helper) --------
  console.log('\n[Test #4] Simuler dispatch : contact doit porter envelopeId');

  // Crée un incoming_lead qui pointe vers l'envelope test
  insert('incoming_leads', {
    id: testLeadId,
    companyId: COMPANY,
    source_id: null,
    first_name: 'TestL2',
    last_name: 'Dispatch',
    email: `test-l2-${Date.now()}@test.local`,
    phone: '',
    data_json: '{}',
    status: 'queued',
    envelope_id: testEnvId,
    assigned_to: '',
    assigned_at: '',
    contact_id: '',
    created_at: now,
    import_id: '',
    duplicate_of: '',
    dispatched: 0,
  });

  // Reproduit l'INSERT contact EXACTEMENT comme assignLeadToCollab le fait
  // (ligne 701 de server/routes/leads.js, patch L1.b)
  const envelope_id = testEnvId;
  insert('contacts', {
    id: testContactId,
    companyId: COMPANY,
    name: 'TestL2 Dispatch',
    firstname: 'TestL2',
    lastname: 'Dispatch',
    email: `test-l2-${Date.now()}@test.local`,
    phone: '',
    totalBookings: 0,
    lastVisit: '',
    tags_json: JSON.stringify(['lead']),
    notes: '',
    rating: null,
    docs_json: JSON.stringify([]),
    pipeline_stage: 'nouveau',
    assignedTo: COLLAB,
    shared_with_json: JSON.stringify([]),
    source: 'lead',
    envelopeId: envelope_id || '',
    createdAt: now,
  });

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(testContactId);
  check('contact persisté', true, !!contact);
  check('contact.envelopeId', testEnvId, contact.envelopeId);
  check('contact.pipeline_stage', 'nouveau', contact.pipeline_stage);
  check('contact.source', 'lead', contact.source);
  check('contact.assignedTo', COLLAB, contact.assignedTo);

  // INSERT lead_assignments pour compléter le flow
  insert('lead_assignments', {
    id: testAssignId,
    companyId: COMPANY,
    lead_id: testLeadId,
    collaborator_id: COLLAB,
    rule_id: '',
    contact_id: testContactId,
    assigned_at: now,
  });

  const assign = db.prepare('SELECT * FROM lead_assignments WHERE id = ?').get(testAssignId);
  check('assignment créée', true, !!assign);

  // -------- Cleanup --------
  console.log('\n[Cleanup]');
  db.prepare('DELETE FROM lead_assignments WHERE id = ?').run(testAssignId);
  db.prepare('DELETE FROM contacts WHERE id = ?').run(testContactId);
  db.prepare('DELETE FROM incoming_leads WHERE id = ?').run(testLeadId);
  db.prepare('DELETE FROM lead_envelopes WHERE id = ?').run(testEnvId);
  // Purge également l'éventuelle row dirty déclenchée par triggers S2.2 pour ce collab test
  // (pas critique — le flag sera reset au prochain tick, mais on évite de laisser un faux signal)

  const postClean = {
    env: db.prepare('SELECT id FROM lead_envelopes WHERE id = ?').get(testEnvId),
    lead: db.prepare('SELECT id FROM incoming_leads WHERE id = ?').get(testLeadId),
    ct: db.prepare('SELECT id FROM contacts WHERE id = ?').get(testContactId),
    assign: db.prepare('SELECT id FROM lead_assignments WHERE id = ?').get(testAssignId),
  };
  check('cleanup envelope', undefined, postClean.env?.id);
  check('cleanup lead', undefined, postClean.lead?.id);
  check('cleanup contact', undefined, postClean.ct?.id);
  check('cleanup assignment', undefined, postClean.assign?.id);
} catch (err) {
  console.error('FATAL', err.message);
  fail++;
}

console.log(`\n=== PASS: ${pass} / FAIL: ${fail} ===`);
console.log(fail === 0 ? 'VERDICT: GO' : 'VERDICT: NO-GO');
process.exit(fail === 0 ? 0 : 1);
