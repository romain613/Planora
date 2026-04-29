// V1.10.5 P4 — Enrich batch one-shot pour AssurCV01 (ls_1777408160108_5i5cjv)
// Équivalent à POST /api/leads/sources/:id/enrich-existing-contacts
// Aucune redistribution, aucun changement collab/pipeline/status. Idempotent.
import { db } from '../db/database.js';
import { enrichContactCustomFields } from '../services/leadImportEngine.js';

const SOURCE_ID = 'ls_1777408160108_5i5cjv';
const COMPANY_ID = 'c1776169036725';

const leads = db.prepare(
  `SELECT id, contact_id, data_json FROM incoming_leads
   WHERE source_id = ? AND companyId = ?
     AND contact_id IS NOT NULL AND contact_id != ''
     AND dispatched = 1`
).all(SOURCE_ID, COMPANY_ID);

console.log('[ENRICH BATCH] eligible leads:', leads.length);

let processed = 0, enriched = 0, skipped_no_change = 0, errors = 0;
const totals = { added: 0, updated: 0, skipped: 0 };
const errorSamples = [];

for (const lead of leads) {
  processed++;
  try {
    const result = enrichContactCustomFields(lead.contact_id, lead.data_json, null);
    if (result.error) {
      errors++;
      if (errorSamples.length < 5) errorSamples.push({ leadId: lead.id, contactId: lead.contact_id, error: result.error });
      continue;
    }
    totals.added += result.added.length;
    totals.updated += result.updated.length;
    totals.skipped += result.skipped.length;
    if (result.added.length > 0 || result.updated.length > 0) enriched++;
    else skipped_no_change++;
  } catch (e) {
    errors++;
    if (errorSamples.length < 5) errorSamples.push({ leadId: lead.id, error: e.message });
  }
}

console.log(JSON.stringify({ source: SOURCE_ID, processed, enriched, skipped_no_change, errors, totals, errorSamples }, null, 2));
process.exit(0);
