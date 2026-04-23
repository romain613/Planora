import { Router } from 'express';
import { db, getByCompany, getById, insert, remove } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// Helper: vérifier qu'une table appartient à la company du user
function verifyTableOwnership(req, res, tableId) {
  const table = db.prepare('SELECT companyId FROM custom_tables WHERE id = ?').get(tableId);
  if (!table) { res.status(404).json({ error: 'Table not found' }); return null; }
  if (!req.auth.isSupra && table.companyId !== req.auth.companyId) { res.status(403).json({ error: 'Acces interdit' }); return null; }
  return table;
}

// ─── GET / — List all tables for company ───
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = getByCompany('custom_tables', companyId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST / — Create table ───
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const t = req.body;
    const id = t.id || 'tbl_' + Date.now();
    const now = new Date().toISOString();
    const safeCompanyId = req.auth.isSupra ? (t.companyId || req.auth.companyId) : req.auth.companyId;
    const defaultView = JSON.stringify([{ id: 'view_default', name: 'Tous', type: 'grid', filters: [], sorts: [], groupBy: null, hiddenColumns: [] }]);
    insert('custom_tables', {
      id,
      companyId: safeCompanyId,
      name: t.name || 'Sans titre',
      icon: t.icon || 'grid',
      color: t.color || '#2563EB',
      columns_json: JSON.stringify(t.columns || []),
      views_json: t.views ? JSON.stringify(t.views) : defaultView,
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    });
    const created = getById('custom_tables', id);
    res.json({ success: true, table: created });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /:id — Update table ───
router.put('/:id', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const data = { ...req.body };
    if (data.columns) { data.columns_json = JSON.stringify(data.columns); delete data.columns; }
    if (data.views) { data.views_json = JSON.stringify(data.views); delete data.views; }
    delete data.id;
    data.updatedAt = new Date().toISOString();
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE custom_tables SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /:id — Delete table + all rows ───
router.delete('/:id', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    db.prepare('DELETE FROM custom_rows WHERE tableId = ?').run(req.params.id);
    remove('custom_tables', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /:id/rows — List rows ───
router.get('/:id/rows', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const rows = db.prepare('SELECT * FROM custom_rows WHERE tableId = ?').all(req.params.id);
    // Parse JSON fields
    const parsed = rows.map(r => {
      const p = { ...r };
      if (p.data_json) { try { p.data = JSON.parse(p.data_json); } catch { p.data = {}; } }
      else p.data = {};
      delete p.data_json;
      return p;
    });
    res.json({ rows: parsed, total: parsed.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /:id/rows — Create row ───
router.post('/:id/rows', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const r = req.body;
    const safeCompanyId = req.auth.isSupra ? (r.companyId || req.auth.companyId) : req.auth.companyId;
    const id = r.id || 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const now = new Date().toISOString();
    insert('custom_rows', {
      id,
      tableId: req.params.id,
      companyId: safeCompanyId,
      data_json: JSON.stringify(r.data || {}),
      createdBy: r.createdBy || null,
      createdAt: r.createdAt || now,
      updatedAt: r.updatedAt || now,
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /:id/rows/:rowId — Update row (merge data) ───
router.put('/:id/rows/:rowId', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const existing = db.prepare('SELECT data_json FROM custom_rows WHERE id = ?').get(req.params.rowId);
    if (!existing) return res.status(404).json({ error: 'Row not found' });
    let currentData = {};
    try { currentData = JSON.parse(existing.data_json || '{}'); } catch {}
    const mergedData = { ...currentData, ...(req.body.data || {}) };
    const now = new Date().toISOString();
    db.prepare('UPDATE custom_rows SET data_json = ?, updatedAt = ? WHERE id = ?')
      .run(JSON.stringify(mergedData), now, req.params.rowId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /:id/rows/:rowId — Delete row ───
router.delete('/:id/rows/:rowId', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    remove('custom_rows', req.params.rowId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /:id/import — Import CSV ───
router.post('/:id/import', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: 'No CSV data' });

    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + at least 1 row' });

    // Detect separator
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());

    // Get existing columns
    const table = getById('custom_tables', req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });
    let columns = [];
    try { columns = JSON.parse(table.columns_json || '[]'); } catch { columns = []; }

    // Map headers to columns (by name) or create new
    const colMap = {};
    let newCols = false;
    headers.forEach((h, i) => {
      const existing = columns.find(c => c.name.toLowerCase() === h.toLowerCase());
      if (existing) {
        colMap[i] = existing.id;
      } else {
        const newCol = { id: 'col_' + Date.now() + '_' + i, name: h, type: 'text', width: 150, required: false };
        columns.push(newCol);
        colMap[i] = newCol.id;
        newCols = true;
      }
    });

    // Update columns if new ones added
    if (newCols) {
      db.prepare('UPDATE custom_tables SET columns_json = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(columns), new Date().toISOString(), req.params.id);
    }

    // Parse CSV rows (handle quoted fields)
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Create rows
    const insertStmt = db.prepare('INSERT INTO custom_rows (id, tableId, companyId, data_json, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    let imported = 0;

    const transaction = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const data = {};
        headers.forEach((_, idx) => {
          if (colMap[idx] && values[idx]) data[colMap[idx]] = values[idx];
        });
        if (Object.keys(data).length > 0) {
          const id = 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          insertStmt.run(id, req.params.id, req.auth.companyId, JSON.stringify(data), null, now, now);
          imported++;
        }
      }
    });
    transaction();

    // Parse columns for frontend
    const parsedCols = columns.map(c => ({ ...c }));
    res.json({ success: true, imported, columns: parsedCols });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /:id/export — Export CSV ───
router.get('/:id/export', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const table = getById('custom_tables', req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    let columns = [];
    try { columns = JSON.parse(table.columns_json || '[]'); } catch { columns = []; }

    const rows = db.prepare('SELECT data_json FROM custom_rows WHERE tableId = ? ORDER BY createdAt ASC').all(req.params.id);

    // BOM + header
    const bom = '\uFEFF';
    const header = columns.map(c => `"${c.name}"`).join(',');
    const csvRows = rows.map(r => {
      let data = {};
      try { data = JSON.parse(r.data_json || '{}'); } catch {}
      return columns.map(c => {
        let v = data[c.id] || '';
        if (Array.isArray(v)) v = v.join('; ');
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csv = bom + [header, ...csvRows].join('\n');
    const safeName = (table.name || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /:id/google-sync — Sync from Google Sheets ───
router.post('/:id/google-sync', requireAuth, async (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { url, mode } = req.body; // mode: 'replace' | 'merge'
    if (!url) return res.status(400).json({ error: 'No Google Sheets URL provided' });

    // Extract sheet ID from various Google Sheets URL formats
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Google Sheets URL. Share the sheet as "Anyone with the link".' });
    const sheetId = match[1];

    // Extract optional gid (tab) from URL
    const gidMatch = url.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // Fetch CSV from Google Sheets public export
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl, { redirect: 'follow', headers: { 'User-Agent': 'Calendar360/1.0' } });

    if (!response.ok) {
      if (response.status === 404) return res.status(400).json({ error: 'Google Sheet not found. Verify the URL.' });
      if (response.status === 401 || response.status === 403) return res.status(400).json({ error: 'Access denied. The sheet must be shared as "Anyone with the link".' });
      return res.status(400).json({ error: `Google returned HTTP ${response.status}` });
    }

    const csv = await response.text();
    if (!csv.trim()) return res.status(400).json({ error: 'The Google Sheet is empty' });

    // Save the URL in table metadata
    const now = new Date().toISOString();
    db.prepare('UPDATE custom_tables SET googleSheetUrl = ?, lastSyncAt = ?, updatedAt = ? WHERE id = ?')
      .run(url, now, now, req.params.id);

    // Parse CSV
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'Sheet must have header + at least 1 row' });

    const sep = lines[0].includes('\t') ? '\t' : ',';

    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);

    // Get existing columns or create new ones
    const table = getById('custom_tables', req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });
    let columns = [];
    try { columns = JSON.parse(table.columns_json || '[]'); } catch { columns = []; }

    const colMap = {};
    let newCols = false;
    headers.forEach((h, i) => {
      if (!h.trim()) return;
      const existing = columns.find(c => c.name.toLowerCase() === h.toLowerCase());
      if (existing) {
        colMap[i] = existing.id;
      } else {
        // Auto-detect type based on column name
        let type = 'text';
        const hl = h.toLowerCase();
        if (hl.includes('email') || hl.includes('mail') || hl.includes('courriel')) type = 'email';
        else if (hl.includes('phone') || hl.includes('tel') || hl.includes('téléphone') || hl.includes('mobile')) type = 'phone';
        else if (hl.includes('date') || hl.includes('créé') || hl.includes('created')) type = 'date';
        else if (hl.includes('url') || hl.includes('site') || hl.includes('lien') || hl.includes('website')) type = 'url';
        else if (hl.includes('montant') || hl.includes('prix') || hl.includes('amount') || hl.includes('price') || hl.includes('total')) type = 'number';

        const newCol = { id: 'col_' + Date.now() + '_' + i, name: h, type, width: 160, required: false };
        columns.push(newCol);
        colMap[i] = newCol.id;
        newCols = true;
      }
    });

    // Update columns if new ones added
    if (newCols) {
      db.prepare('UPDATE custom_tables SET columns_json = ? WHERE id = ?')
        .run(JSON.stringify(columns), req.params.id);
    }

    // If replace mode, delete old rows first
    if (mode === 'replace') {
      db.prepare('DELETE FROM custom_rows WHERE tableId = ?').run(req.params.id);
    }

    // Insert rows
    const insertStmt = db.prepare('INSERT INTO custom_rows (id, tableId, companyId, data_json, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let imported = 0;

    const transaction = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const data = {};
        headers.forEach((_, idx) => {
          if (colMap[idx] !== undefined && values[idx] !== undefined && values[idx] !== '') {
            data[colMap[idx]] = values[idx];
          }
        });
        if (Object.keys(data).length > 0) {
          const id = 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          insertStmt.run(id, req.params.id, req.auth.companyId, JSON.stringify(data), 'google-sync', now, now);
          imported++;
        }
      }
    });
    transaction();

    const parsedCols = columns.map(c => ({ ...c }));
    res.json({ success: true, imported, columns: parsedCols, lastSyncAt: now, sheetName: headers[0] ? `${headers.length} colonnes détectées` : '' });
  } catch (err) {
    console.error('Google sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/auto-dispatch — Smart auto-dispatch leads among collaborators ───
router.post('/:id/auto-dispatch', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { collaborators, collabColumnId, mode } = req.body;
    // mode: 'equal' | 'smart'
    // collaborators: [{ id, name, stats: { totalBookings, conversionRate, avgResponseTime } }]
    if (!collabColumnId || !collaborators || !collaborators.length) {
      return res.status(400).json({ error: 'Missing collaborators or collabColumnId' });
    }

    // Get all rows for this table
    const rows = db.prepare('SELECT * FROM custom_rows WHERE tableId = ?').all(req.params.id);
    const parsed = rows.map(r => {
      const p = { ...r };
      try { p.data = JSON.parse(p.data_json || '{}'); } catch { p.data = {}; }
      return p;
    });

    // Find unassigned rows (no collaborator set)
    const unassigned = parsed.filter(r => !r.data[collabColumnId] || r.data[collabColumnId].trim() === '');
    if (unassigned.length === 0) {
      return res.json({ success: true, dispatched: 0, message: 'Tous les leads sont déjà assignés' });
    }

    // Count current assignments per collaborator
    const currentCounts = {};
    collaborators.forEach(c => { currentCounts[c.name] = 0; });
    parsed.forEach(r => {
      const assigned = r.data[collabColumnId];
      if (assigned && currentCounts[assigned] !== undefined) {
        currentCounts[assigned]++;
      }
    });

    let assignments;
    if (mode === 'smart') {
      // Smart dispatch: weighted by collaborator performance
      // Higher weight = gets more leads
      // Weight factors: fewer current leads (capacity), higher conversion, more bookings
      const totalBookingsAll = collaborators.reduce((s, c) => s + (c.stats?.totalBookings || 0), 0) || 1;

      const weights = collaborators.map(c => {
        const stats = c.stats || {};
        const currentLoad = currentCounts[c.name] || 0;

        // Factor 1: Capacity (fewer current = higher weight)
        const maxLoad = Math.max(...Object.values(currentCounts), 1);
        const capacityScore = 1 - (currentLoad / (maxLoad + 1));

        // Factor 2: Performance (more bookings = proven performer)
        const performanceScore = (stats.totalBookings || 0) / totalBookingsAll;

        // Factor 3: Conversion rate (if available)
        const conversionScore = (stats.conversionRate || 50) / 100;

        // Combined weight
        const weight = (capacityScore * 0.5) + (performanceScore * 0.3) + (conversionScore * 0.2);
        return { name: c.name, weight: Math.max(weight, 0.05) }; // min 5% weight
      });

      // Normalize weights
      const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
      weights.forEach(w => w.weight = w.weight / totalWeight);

      // Distribute using weighted round-robin
      assignments = [];
      const quotas = weights.map(w => ({ name: w.name, target: Math.round(unassigned.length * w.weight), assigned: 0 }));

      // Make sure we assign all leads
      let totalTarget = quotas.reduce((s, q) => s + q.target, 0);
      while (totalTarget < unassigned.length) {
        quotas[0].target++;
        totalTarget++;
      }
      while (totalTarget > unassigned.length) {
        const maxQ = quotas.reduce((a, b) => a.target > b.target ? a : b);
        maxQ.target--;
        totalTarget--;
      }

      let qIdx = 0;
      for (const row of unassigned) {
        // Find next collaborator with remaining quota
        let attempts = 0;
        while (quotas[qIdx].assigned >= quotas[qIdx].target && attempts < quotas.length) {
          qIdx = (qIdx + 1) % quotas.length;
          attempts++;
        }
        assignments.push({ rowId: row.id, collabName: quotas[qIdx].name });
        quotas[qIdx].assigned++;
        qIdx = (qIdx + 1) % quotas.length;
      }
    } else {
      // Equal dispatch: simple round-robin
      assignments = unassigned.map((row, i) => ({
        rowId: row.id,
        collabName: collaborators[i % collaborators.length].name
      }));
    }

    // Apply assignments in a transaction
    const now = new Date().toISOString();
    const updateStmt = db.prepare('UPDATE custom_rows SET data_json = ?, updatedAt = ? WHERE id = ?');

    const transaction = db.transaction(() => {
      for (const { rowId, collabName } of assignments) {
        const row = parsed.find(r => r.id === rowId);
        if (row) {
          const newData = { ...row.data, [collabColumnId]: collabName };
          updateStmt.run(JSON.stringify(newData), now, rowId);
        }
      }
    });
    transaction();

    // Build summary
    const summary = {};
    assignments.forEach(a => { summary[a.collabName] = (summary[a.collabName] || 0) + 1; });

    res.json({
      success: true,
      dispatched: assignments.length,
      mode,
      summary, // { "Marie": 12, "Thomas": 15, "Julie": 13 }
    });
  } catch (err) {
    console.error('Auto-dispatch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── AI INTELLIGENT DISPATCH — Task system ───
// ═══════════════════════════════════════════════════════════

// ─── PUT /:id/ai-dispatch-config — Toggle AI dispatch per collaborator ───
router.put('/:id/ai-dispatch-config', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { config } = req.body;
    // config: { [collabId]: { enabled: bool, leadsPerTask: number } }
    const now = new Date().toISOString();
    db.prepare('UPDATE custom_tables SET aiDispatchConfig_json = ?, updatedAt = ? WHERE id = ?')
      .run(JSON.stringify(config || {}), now, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /:id/ai-dispatch-config — Get AI dispatch config ───
router.get('/:id/ai-dispatch-config', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const table = getById('custom_tables', req.params.id);
    let config = {};
    try { config = JSON.parse(table.aiDispatchConfig_json || '{}'); } catch {}
    res.json({ config });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /:id/generate-tasks — Generate AI tasks for collaborators ───
router.post('/:id/generate-tasks', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { collaborators, contacts, callLogs, bookings, collabColumnId } = req.body;
    // collaborators: [{ id, name, ... }]
    // contacts: [{ id, name, email, phone, totalBookings, lastVisit, tags, notes, ... }]
    // callLogs: [{ id, collaboratorId, toNumber, fromNumber, status, direction, duration, notes, ... }]
    // bookings: [{ id, collaboratorId, visitorName, status, date, ... }]

    const table = getById('custom_tables', req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    let aiConfig = {};
    try { aiConfig = JSON.parse(table.aiDispatchConfig_json || '{}'); } catch {}

    // Get current rows for context
    const rows = db.prepare('SELECT * FROM custom_rows WHERE tableId = ?').all(req.params.id);
    const parsedRows = rows.map(r => {
      const p = { ...r };
      try { p.data = JSON.parse(p.data_json || '{}'); } catch { p.data = {}; }
      return p;
    });

    const now = new Date().toISOString();
    const allTasks = [];

    // Delete old pending tasks for this table (regenerate fresh)
    db.prepare("DELETE FROM dispatch_tasks WHERE tableId = ? AND status = 'pending'").run(req.params.id);

    const insertTask = db.prepare(
      'INSERT INTO dispatch_tasks (id, companyId, tableId, collabId, collabName, type, title, description, targetData_json, status, points, leadsToUnlock, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      for (const collab of collaborators) {
        const collabConfig = aiConfig[collab.id] || {};
        if (!collabConfig.enabled) continue;

        const leadsPerTask = collabConfig.leadsPerTask || 2;
        const tasks = [];

        // ── TASK TYPE 1: Call back NRP (No Response/Missed calls) ──
        const missedCalls = (callLogs || []).filter(cl =>
          cl.collaboratorId === collab.id &&
          (cl.status === 'missed' || cl.status === 'no-answer' || cl.status === 'busy') &&
          cl.direction === 'inbound'
        );
        const uniqueMissed = [...new Map(missedCalls.map(c => [c.fromNumber || c.toNumber, c])).values()];
        if (uniqueMissed.length > 0) {
          // Group into batches of max 5
          for (let i = 0; i < Math.min(uniqueMissed.length, 15); i += 5) {
            const batch = uniqueMissed.slice(i, i + 5);
            const names = batch.map(c => {
              const contact = (contacts || []).find(ct => ct.phone === c.fromNumber || ct.phone === c.toNumber);
              return contact?.name || c.fromNumber || c.toNumber || 'Inconnu';
            });
            tasks.push({
              type: 'call_back',
              title: `📞 Rappeler ${batch.length} contact${batch.length>1?'s':''} non répondus`,
              description: names.join(', '),
              targetData: { numbers: batch.map(c => c.fromNumber || c.toNumber), names },
              points: batch.length,
              leadsToUnlock: leadsPerTask * batch.length,
            });
          }
        }

        // ── TASK TYPE 2: Follow up contacts with no recent activity ──
        const myContacts = (contacts || []).filter(ct => {
          // Contacts this collab interacted with (via bookings or calls)
          const hasBooking = (bookings || []).some(b => b.collaboratorId === collab.id && (b.visitorName === ct.name || b.visitorEmail === ct.email));
          const hasCall = (callLogs || []).some(cl => cl.collaboratorId === collab.id && (cl.toNumber === ct.phone || cl.fromNumber === ct.phone));
          return hasBooking || hasCall;
        });
        const staleContacts = myContacts.filter(ct => {
          if (!ct.lastVisit) return true;
          const daysSince = Math.floor((Date.now() - new Date(ct.lastVisit).getTime()) / 86400000);
          return daysSince > 14; // No activity in 14+ days
        });
        if (staleContacts.length > 0) {
          const batch = staleContacts.slice(0, 10);
          tasks.push({
            type: 'follow_up',
            title: `🔄 Relancer ${batch.length} contact${batch.length>1?'s':''} inactif${batch.length>1?'s':''}`,
            description: batch.map(c => `${c.name} (${c.phone || c.email || 'pas de contact'})`).join(', '),
            targetData: { contactIds: batch.map(c => c.id), names: batch.map(c => c.name) },
            points: batch.length,
            leadsToUnlock: leadsPerTask * Math.ceil(batch.length / 2),
          });
        }

        // ── TASK TYPE 3: Update lead statuses (stale leads in table) ──
        if (collabColumnId) {
          const myLeads = parsedRows.filter(r => (r.data || {})[collabColumnId] === collab.name);
          // Find leads with "Nouveau" or empty status
          let columns = [];
          try { columns = JSON.parse(table.columns_json || '[]'); } catch {}
          const statusCol = columns.find(c => c.type === 'select' && (c.name.toLowerCase().includes('statut') || c.name.toLowerCase().includes('status')));
          if (statusCol) {
            const staleLeads = myLeads.filter(r => !r.data[statusCol.id] || r.data[statusCol.id] === 'Nouveau');
            if (staleLeads.length > 0) {
              tasks.push({
                type: 'update_status',
                title: `📋 Mettre à jour le statut de ${staleLeads.length} lead${staleLeads.length>1?'s':''}`,
                description: `${staleLeads.length} leads encore en "Nouveau" — contactez-les et mettez à jour`,
                targetData: { rowIds: staleLeads.map(r => r.id).slice(0, 20), statusColId: statusCol.id },
                points: Math.min(staleLeads.length, 20),
                leadsToUnlock: leadsPerTask * Math.ceil(Math.min(staleLeads.length, 20) / 3),
              });
            }
          }
        }

        // ── TASK TYPE 4: Book appointments from existing contacts ──
        const contactsWithNoBooking = myContacts.filter(ct => {
          return !(bookings || []).some(b =>
            b.collaboratorId === collab.id &&
            (b.visitorName === ct.name || b.visitorEmail === ct.email) &&
            b.status === 'confirmed' &&
            new Date(b.date) > new Date(Date.now() - 30 * 86400000)
          );
        });
        if (contactsWithNoBooking.length > 0) {
          const batch = contactsWithNoBooking.slice(0, 8);
          tasks.push({
            type: 'book_appointment',
            title: `📅 Décrocher un RDV avec ${batch.length} contact${batch.length>1?'s':''}`,
            description: batch.map(c => c.name).join(', '),
            targetData: { contactIds: batch.map(c => c.id), names: batch.map(c => c.name) },
            points: batch.length * 2,
            leadsToUnlock: leadsPerTask * batch.length,
          });
        }

        // ── TASK TYPE 5: Add notes to leads without notes ──
        if (collabColumnId) {
          let columns2 = [];
          try { columns2 = JSON.parse(table.columns_json || '[]'); } catch {}
          const notesCol = columns2.find(c => c.name.toLowerCase().includes('note'));
          if (notesCol) {
            const leadsNoNotes = parsedRows.filter(r =>
              (r.data || {})[collabColumnId] === collab.name && !(r.data || {})[notesCol.id]
            );
            if (leadsNoNotes.length > 3) {
              tasks.push({
                type: 'add_notes',
                title: `📝 Ajouter des notes à ${leadsNoNotes.length} lead${leadsNoNotes.length>1?'s':''}`,
                description: `Documentez vos interactions pour un meilleur suivi`,
                targetData: { rowIds: leadsNoNotes.map(r => r.id).slice(0, 15), notesColId: notesCol.id },
                points: Math.min(leadsNoNotes.length, 15),
                leadsToUnlock: leadsPerTask * Math.ceil(Math.min(leadsNoNotes.length, 15) / 5),
              });
            }
          }
        }

        // ── TASK TYPE 6: Custom objectives (from admin config) ──
        const customTasks = collabConfig.customTasks || [];
        customTasks.forEach(ct => {
          tasks.push({
            type: 'custom',
            title: ct.title || '🎯 Objectif personnalisé',
            description: ct.description || '',
            targetData: { custom: true },
            points: ct.points || 5,
            leadsToUnlock: ct.leadsToUnlock || leadsPerTask * 5,
          });
        });

        // Insert all tasks
        for (const task of tasks) {
          const id = 'dtask_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          insertTask.run(
            id, req.auth.companyId, req.params.id, collab.id, collab.name,
            task.type, task.title, task.description,
            JSON.stringify(task.targetData || {}),
            'pending', task.points, task.leadsToUnlock || 0,
            now, now
          );
          allTasks.push({ id, ...task, collabId: collab.id, collabName: collab.name, status: 'pending' });
        }
      }
    });
    transaction();

    res.json({ success: true, tasksGenerated: allTasks.length, tasks: allTasks });
  } catch (err) {
    console.error('Generate tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/tasks — Get tasks for a table (optionally filtered by collabId) ───
router.get('/:id/tasks', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const collabId = req.query.collabId;
    let tasks;
    if (collabId) {
      tasks = db.prepare('SELECT * FROM dispatch_tasks WHERE tableId = ? AND collabId = ? ORDER BY createdAt DESC').all(req.params.id, collabId);
    } else {
      tasks = db.prepare('SELECT * FROM dispatch_tasks WHERE tableId = ? ORDER BY createdAt DESC').all(req.params.id);
    }
    // Parse JSON fields
    const parsed = tasks.map(t => {
      const p = { ...t };
      if (p.targetData_json) { try { p.targetData = JSON.parse(p.targetData_json); } catch { p.targetData = {}; } }
      delete p.targetData_json;
      return p;
    });
    res.json({ tasks: parsed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /:id/tasks/:taskId/complete — Mark task as completed ───
router.put('/:id/tasks/:taskId/complete', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const now = new Date().toISOString();
    const task = db.prepare('SELECT * FROM dispatch_tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    db.prepare("UPDATE dispatch_tasks SET status = 'completed', completedAt = ?, updatedAt = ? WHERE id = ?")
      .run(now, now, req.params.taskId);

    // If task has leadsToUnlock > 0, auto-dispatch that many leads
    if (task.leadsToUnlock > 0) {
      const table = getById('custom_tables', req.params.id);
      if (table) {
        let columns = [];
        try { columns = JSON.parse(table.columns_json || '[]'); } catch {}
        const collabCol = columns.find(c => c.type === 'collaborator');
        if (collabCol) {
          const rows = db.prepare('SELECT * FROM custom_rows WHERE tableId = ?').all(req.params.id);
          const unassigned = rows.filter(r => {
            let data = {};
            try { data = JSON.parse(r.data_json || '{}'); } catch {}
            return !data[collabCol.id] || data[collabCol.id].trim() === '';
          });

          const toAssign = unassigned.slice(0, task.leadsToUnlock);
          if (toAssign.length > 0) {
            const updateStmt = db.prepare('UPDATE custom_rows SET data_json = ?, updatedAt = ? WHERE id = ?');
            const tx = db.transaction(() => {
              for (const row of toAssign) {
                let data = {};
                try { data = JSON.parse(row.data_json || '{}'); } catch {}
                data[collabCol.id] = task.collabName;
                updateStmt.run(JSON.stringify(data), now, row.id);
              }
            });
            tx();

            return res.json({
              success: true,
              leadsUnlocked: toAssign.length,
              message: `🎉 Tâche complétée ! ${toAssign.length} nouveau${toAssign.length>1?'x':''} lead${toAssign.length>1?'s':''} débloqué${toAssign.length>1?'s':''} !`
            });
          }
        }
      }
    }

    res.json({ success: true, leadsUnlocked: 0, message: 'Tâche complétée !' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /:id/tasks/:taskId/skip — Skip/dismiss a task ───
router.put('/:id/tasks/:taskId/skip', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const now = new Date().toISOString();
    db.prepare("UPDATE dispatch_tasks SET status = 'skipped', updatedAt = ? WHERE id = ?")
      .run(now, req.params.taskId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /:id/tasks/custom — Add custom task manually ───
router.post('/:id/tasks/custom', requireAuth, (req, res) => {
  try {
    if (!verifyTableOwnership(req, res, req.params.id)) return;
    const { collabId, collabName, title, description, points, leadsToUnlock } = req.body;
    const id = 'dtask_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const now = new Date().toISOString();
    insert('dispatch_tasks', {
      id, companyId: req.auth.companyId, tableId: req.params.id,
      collabId, collabName,
      type: 'custom', title, description: description || '',
      targetData_json: JSON.stringify({ custom: true }),
      status: 'pending', points: points || 5,
      leadsToUnlock: leadsToUnlock || 5,
      createdAt: now, updatedAt: now,
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
