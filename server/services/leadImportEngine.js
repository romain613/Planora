import { db, insert } from '../db/database.js';

// ─── HELPERS ───
export function uid(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function logHistory(companyId, action, details, opts = {}) {
  try {
    insert('lead_history', {
      id: uid('lh'),
      companyId,
      lead_id: opts.lead_id || '',
      contact_id: opts.contact_id || '',
      action,
      details_json: JSON.stringify(details),
      user_id: opts.user_id || '',
      user_name: opts.user_name || '',
      created_at: new Date().toISOString()
    });
  } catch (e) { console.error('[lead_history] write error:', e.message); }
}

export function cleanPhoneForCompare(phone) {
  return (phone || '').replace(/[\s\-\.\(\)]/g, '');
}

// ─── INPUT VALIDATION ───
export function isValidEmail(e) {
  if (!e) return true; // empty = optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

export function isValidPhone(p) {
  if (!p) return true; // empty = optional
  const cleaned = p.replace(/[\s\-\.\(\)]/g, '');
  return /^\+?\d{6,20}$/.test(cleaned);
}

// Shared dedup check (single-lead, used outside batch imports)
export function checkDuplicate(companyId, lead, duplicateMode) {
  if (duplicateMode === 'allow') return { isDuplicate: false };
  if (lead.email) {
    const dup = db.prepare("SELECT id FROM incoming_leads WHERE companyId = ? AND LOWER(email) = LOWER(?) AND email != ''").get(companyId, lead.email);
    if (dup) return { isDuplicate: true, duplicateId: dup.id, duplicateType: 'email' };
  }
  if (lead.phone) {
    const cleanPhone = cleanPhoneForCompare(lead.phone);
    if (cleanPhone) {
      const dup = db.prepare("SELECT id FROM incoming_leads WHERE companyId = ? AND phone != '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'.',''),'(',''),')','') = ?").get(companyId, cleanPhone);
      if (dup) return { isDuplicate: true, duplicateId: dup.id, duplicateType: 'phone' };
    }
  }
  return { isDuplicate: false };
}

// ─── BULK DEDUP INDEX (O(1) lookups for batch imports) ───
export function buildDedupIndex(companyId) {
  const all = db.prepare("SELECT id, first_name, email, phone FROM incoming_leads WHERE companyId = ?").all(companyId);
  const byEmail = new Map();
  const byPhone = new Map();
  const byNameEmail = new Map();
  const byNamePhone = new Map();
  for (const l of all) {
    const em = (l.email || '').toLowerCase().trim();
    if (em) byEmail.set(em, l.id);
    const cp = cleanPhoneForCompare(l.phone);
    if (cp) byPhone.set(cp, l.id);
    const fn = (l.first_name || '').toLowerCase().trim();
    if (fn && em) byNameEmail.set(fn + '|' + em, l.id);
    if (fn && cp) byNamePhone.set(fn + '|' + cp, l.id);
  }
  return { byEmail, byPhone, byNameEmail, byNamePhone };
}

// Fast dedup check using pre-built index — O(1) per lead
export function checkDuplicateFast(lead, duplicateMode, idx) {
  if (duplicateMode === 'allow') return { isDuplicate: false };
  const em = (lead.email || '').toLowerCase().trim();
  if (em && idx.byEmail.has(em)) return { isDuplicate: true, duplicateId: idx.byEmail.get(em), duplicateType: 'email' };
  const cp = cleanPhoneForCompare(lead.phone);
  if (cp && idx.byPhone.has(cp)) return { isDuplicate: true, duplicateId: idx.byPhone.get(cp), duplicateType: 'phone' };
  const fn = (lead.first_name || '').toLowerCase().trim();
  if (fn && em && idx.byNameEmail.has(fn + '|' + em)) return { isDuplicate: true, duplicateId: idx.byNameEmail.get(fn + '|' + em), duplicateType: 'name+email' };
  if (fn && cp && idx.byNamePhone.has(fn + '|' + cp)) return { isDuplicate: true, duplicateId: idx.byNamePhone.get(fn + '|' + cp), duplicateType: 'name+phone' };
  return { isDuplicate: false };
}

// Update the dedup index after a successful insert (keeps index in sync within a batch)
function dedupIndexAdd(idx, lead, id) {
  const em = (lead.email || '').toLowerCase().trim();
  if (em) idx.byEmail.set(em, id);
  const cp = cleanPhoneForCompare(lead.phone);
  if (cp) idx.byPhone.set(cp, id);
  const fn = (lead.first_name || '').toLowerCase().trim();
  if (fn && em) idx.byNameEmail.set(fn + '|' + em, id);
  if (fn && cp) idx.byNamePhone.set(fn + '|' + cp, id);
}

// ─── IMPORT LIMITS ───
export const IMPORT_LIMITS = {
  MAX_CSV_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ROWS: 50000
};

// Shared CSV parser
export function parseCSV(text) {
  if (text.length > IMPORT_LIMITS.MAX_CSV_BYTES) {
    return { error: `Fichier trop volumineux (${(text.length / 1024 / 1024).toFixed(1)} Mo). Maximum autorisé : 10 Mo.` };
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  if (lines.length - 1 > IMPORT_LIMITS.MAX_ROWS) {
    return { error: `Trop de lignes (${lines.length - 1}). Maximum autorisé : ${IMPORT_LIMITS.MAX_ROWS}.` };
  }
  const sep = lines[0].includes('\t') ? '\t' : ',';

  // Proper CSV parsing (handle quoted fields with commas inside)
  function splitCSVLine(line, separator) {
    if (separator === '\t') return line.split('\t').map(v => v.replace(/^"|"$/g, '').trim());
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitCSVLine(lines[0], sep);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i], sep);
    if (vals.every(v => !v)) continue;
    rows.push(vals);
  }
  return { headers, rows, sep, totalRows: lines.length - 1 };
}

// Auto-detect mapping from headers
export function autoDetectMapping(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (hl.includes('prenom') || hl.includes('first') || hl === 'prenom') map[i] = 'first_name';
    else if ((hl.includes('nom') && !hl.includes('prenom')) || hl.includes('last') || hl === 'name' || hl === 'nom de famille') map[i] = 'last_name';
    else if (hl.includes('email') || hl.includes('mail') || hl.includes('courriel')) map[i] = 'email';
    else if (hl.includes('tel') || hl.includes('phone') || hl.includes('mobile') || hl.includes('portable') || hl.includes('numero')) map[i] = 'phone';
    else if (hl.includes('entreprise') || hl.includes('company') || hl.includes('societe') || hl.includes('société') || hl.includes('organisation')) map[i] = 'company';
    else if (hl.includes('note') || hl.includes('commentaire') || hl.includes('remarque')) map[i] = 'notes';
    else if (hl.includes('ville') || hl.includes('city') || hl.includes('localite')) map[i] = 'city';
    else if (hl.includes('adresse') || hl.includes('address') || hl.includes('rue')) map[i] = 'address';
    else if (hl.includes('source') || hl.includes('origine') || hl.includes('provenance')) map[i] = 'source';
    else if (hl.includes('message') || hl.includes('demande')) map[i] = 'message';
    else if (hl.includes('tag') || hl.includes('categorie') || hl.includes('label')) map[i] = 'tags';
    else if (hl.includes('situation') || hl.includes('statut') || hl.includes('status')) map[i] = 'situation';
    else if (hl.includes('accompagnement') || hl.includes('service')) map[i] = 'accompagnement';
    else if (hl.includes('qualification') || hl.includes('qualif')) map[i] = 'qualification';
    else if (hl.includes('date')) map[i] = 'date';
  });
  return map;
}

// Core import engine — shared by CSV and GSheet
export function executeImport({ companyId, lines_parsed, mapping, source_id, envelope_id, importType, filename, userId, userName }) {
  const { headers, rows } = lines_parsed;
  const map = (mapping && Object.keys(mapping).length > 0) ? mapping : autoDetectMapping(headers);
  const duplicateMode = mapping?._duplicateMode || 'skip'; // skip | merge | replace | allow

  const now = new Date().toISOString();
  const importId = uid('imp');

  // Reuse or create source — never duplicate
  let finalSourceId = source_id;
  if (!finalSourceId) {
    const existingSource = db.prepare("SELECT id FROM lead_sources WHERE companyId = ? AND type = ? ORDER BY created_at DESC LIMIT 1").get(companyId, importType || 'csv');
    if (existingSource) {
      finalSourceId = existingSource.id;
      db.prepare('UPDATE lead_sources SET last_sync = ? WHERE id = ?').run(now, finalSourceId);
    } else {
      finalSourceId = uid('ls');
      insert('lead_sources', {
        id: finalSourceId, companyId,
        name: filename || (importType === 'gsheet' ? 'Google Sheet' : 'Import CSV'),
        type: importType || 'csv', config_json: '{}',
        mapping_json: JSON.stringify(map), is_active: 1, last_sync: now, created_at: now
      });
    }
  }

  // Reuse or create envelope — never duplicate
  let finalEnvelopeId = envelope_id;
  if (!finalEnvelopeId) {
    const existingEnv = db.prepare("SELECT id FROM lead_envelopes WHERE companyId = ? AND source_id = ? ORDER BY created_at DESC LIMIT 1").get(companyId, finalSourceId);
    if (existingEnv) {
      finalEnvelopeId = existingEnv.id;
    } else {
      finalEnvelopeId = uid('env');
      insert('lead_envelopes', {
        id: finalEnvelopeId, companyId,
        name: filename || (importType === 'gsheet' ? 'Google Sheet' : 'Import CSV'),
        source_id: finalSourceId, auto_dispatch: 0, dispatch_type: 'manual',
        dispatch_time: '', dispatch_limit: 0, created_at: now
      });
    }
  } else {
    // Link envelope to source if not already linked
    const env = db.prepare('SELECT source_id FROM lead_envelopes WHERE id = ?').get(finalEnvelopeId);
    if (env && !env.source_id) {
      db.prepare('UPDATE lead_envelopes SET source_id = ? WHERE id = ?').run(finalSourceId, finalEnvelopeId);
    }
  }

  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  let skipped = 0;
  const errorDetails = [];
  const duplicateDetails = [];
  const KNOWN_FIELDS = new Set(['first_name', 'last_name', 'email', 'phone', 'company', 'notes', 'city', 'address', 'source', 'message', 'tags', 'situation', 'accompagnement', 'qualification', 'date']);

  const stmtInsert = db.prepare('INSERT INTO incoming_leads (id, companyId, source_id, first_name, last_name, email, phone, data_json, status, envelope_id, import_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const stmtUpdate = db.prepare('UPDATE incoming_leads SET first_name=?, last_name=?, email=?, phone=?, data_json=?, source_id=?, envelope_id=? WHERE id=?');

  // Build dedup index ONCE before the loop — O(1) lookups instead of O(n) per row
  const dedupIdx = buildDedupIndex(companyId);

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      try {
        const vals = rows[i];
        const lead = { first_name: '', last_name: '', email: '', phone: '', company: '', notes: '' };
        const extra = {};

        for (const [idx, field] of Object.entries(map)) {
          if (field === '_duplicateMode' || field === 'skip') continue;
          const val = vals[parseInt(idx)] || '';
          if (KNOWN_FIELDS.has(field)) {
            if (field in lead) lead[field] = val;
            else extra[field] = val;
          } else {
            extra[field] = val;
          }
        }

        // Normalize phone
        if (lead.phone) {
          lead.phone = lead.phone.replace(/^(\+33|0033)/, '0').replace(/[\s\.\-]/g, '');
          if (lead.phone.length > 0 && !lead.phone.startsWith('+') && !lead.phone.startsWith('0') && lead.phone.length === 9) {
            lead.phone = '0' + lead.phone;
          }
        }

        // Skip empty rows
        if (!lead.first_name && !lead.last_name && !lead.email && !lead.phone) {
          skipped++;
          continue;
        }

        // Validate email/phone format — skip invalid with log
        if (lead.email && !isValidEmail(lead.email)) {
          errors++;
          errorDetails.push({ row: i + 2, error: `Email invalide: ${lead.email}` });
          lead.email = ''; // clear invalid but continue import
        }
        if (lead.phone && !isValidPhone(lead.phone)) {
          errors++;
          errorDetails.push({ row: i + 2, error: `Téléphone invalide: ${lead.phone}` });
          lead.phone = ''; // clear invalid but continue import
        }

        // Check duplicates — O(1) via pre-built index
        const dupCheck = checkDuplicateFast(lead, duplicateMode, dedupIdx);
        if (dupCheck.isDuplicate) {
          if (duplicateMode === 'merge' || duplicateMode === 'replace') {
            // Merge: update the existing lead with new data
            const existingLead = db.prepare('SELECT * FROM incoming_leads WHERE id = ?').get(dupCheck.duplicateId);
            if (existingLead) {
              const mergedFirst = (duplicateMode === 'replace' ? lead.first_name : (lead.first_name || existingLead.first_name));
              const mergedLast = (duplicateMode === 'replace' ? lead.last_name : (lead.last_name || existingLead.last_name));
              const mergedEmail = (duplicateMode === 'replace' ? lead.email : (lead.email || existingLead.email));
              const mergedPhone = (duplicateMode === 'replace' ? lead.phone : (lead.phone || existingLead.phone));
              let mergedExtra = {};
              try { mergedExtra = JSON.parse(existingLead.data_json || '{}'); } catch {}
              if (duplicateMode === 'replace') { mergedExtra = extra; }
              else { Object.assign(mergedExtra, extra); } // merge

              stmtUpdate.run(mergedFirst, mergedLast, mergedEmail, mergedPhone, JSON.stringify(mergedExtra), finalSourceId, finalEnvelopeId, dupCheck.duplicateId);
              // Audit trail: log every merge/replace with before/after
              logHistory(companyId, duplicateMode === 'replace' ? 'lead_replaced' : 'lead_merged', {
                existingId: dupCheck.duplicateId,
                duplicateType: dupCheck.duplicateType,
                row: i + 2,
                before: { first_name: existingLead.first_name, last_name: existingLead.last_name, email: existingLead.email, phone: existingLead.phone },
                after: { first_name: mergedFirst, last_name: mergedLast, email: mergedEmail, phone: mergedPhone },
                extraFields: Object.keys(extra)
              }, { user_id: userId, user_name: userName, lead_id: dupCheck.duplicateId });
              duplicateDetails.push({ row: i + 2, type: dupCheck.duplicateType, action: duplicateMode, name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') });
              duplicates++;
              continue;
            }
          }
          // Default: skip
          duplicateDetails.push({ row: i + 2, type: dupCheck.duplicateType, action: 'skip', name: [lead.first_name, lead.last_name].filter(Boolean).join(' '), email: lead.email, phone: lead.phone });
          duplicates++;
          continue;
        }

        // Insert new lead
        const id = uid('il');
        const dataJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : '{}';
        stmtInsert.run(id, companyId, finalSourceId, lead.first_name, lead.last_name, lead.email, lead.phone, dataJson, 'new', finalEnvelopeId, importId, now);
        dedupIndexAdd(dedupIdx, lead, id); // Keep index in sync for intra-CSV dedup
        imported++;

      } catch (rowErr) {
        errors++;
        errorDetails.push({ row: i + 2, error: rowErr.message });
      }
    }
  });
  tx();

  // Update source last_sync
  db.prepare('UPDATE lead_sources SET last_sync = ? WHERE id = ?').run(now, finalSourceId);

  // Create import log
  insert('lead_import_logs', {
    id: importId,
    companyId,
    source_id: finalSourceId,
    envelope_id: finalEnvelopeId,
    type: importType || 'csv',
    filename: filename || '',
    total_rows: rows.length,
    imported,
    duplicates,
    errors,
    error_details_json: JSON.stringify(errorDetails.slice(0, 50)),
    duplicate_details_json: JSON.stringify(duplicateDetails.slice(0, 100)),
    mapping_json: JSON.stringify(map),
    created_by: userId || '',
    created_at: now
  });

  // Log history
  logHistory(companyId, 'import', {
    importId,
    type: importType,
    filename,
    total_rows: rows.length,
    imported,
    duplicates,
    errors,
    source_id: finalSourceId,
    envelope_id: finalEnvelopeId
  }, { user_id: userId, user_name: userName });

  return {
    success: true,
    importId,
    source_id: finalSourceId,
    envelope_id: finalEnvelopeId,
    headers,
    totalRows: rows.length,
    imported,
    duplicates,
    errors,
    skipped,
    errorDetails: errorDetails.slice(0, 20),
    duplicateDetails: duplicateDetails.slice(0, 20)
  };
}
