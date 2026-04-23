import { Router } from 'express';
import twilio from 'twilio';
import { db } from '../db/database.js';
import { requireSupra, requireAdmin, requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── SUPRA ADMIN: INVENTORY MANAGEMENT ───────────────

// GET /api/marketplace/numbers — List all numbers (full inventory)
router.get('/numbers', requireSupra, (req, res) => {
  try {
    const numbers = db.prepare('SELECT * FROM phone_numbers ORDER BY createdAt DESC').all();
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/numbers — Add a number manually
router.post('/numbers', requireSupra, (req, res) => {
  try {
    const { phoneNumber, friendlyName, country, twilioSid } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber requis' });

    // Check duplicate
    const existing = db.prepare('SELECT id FROM phone_numbers WHERE phoneNumber = ?').get(phoneNumber);
    if (existing) return res.status(409).json({ error: 'Ce numéro existe déjà dans l\'inventaire' });

    const id = 'pn' + Date.now();
    db.prepare(`INSERT INTO phone_numbers (id, phoneNumber, friendlyName, country, twilioSid, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'available', ?)`)
      .run(id, phoneNumber, friendlyName || '', country || 'FR', twilioSid || '', new Date().toISOString());

    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(id);
    console.log(`\x1b[35m[MARKETPLACE]\x1b[0m Numéro ajouté: ${phoneNumber}`);
    res.json({ success: true, number: num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketplace/numbers/:id — Update a number
router.put('/numbers/:id', requireSupra, (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;
    if (Object.keys(data).length === 0) return res.json({ success: true });
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE phone_numbers SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    res.json({ success: true, number: num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketplace/numbers/:id — Remove a number from inventory
router.delete('/numbers/:id', requireSupra, (req, res) => {
  try {
    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });
    if (num.status === 'assigned') return res.status(400).json({ error: 'Impossible de supprimer un numéro assigné. Libérez-le d\'abord.' });

    db.prepare('DELETE FROM phone_numbers WHERE id = ?').run(req.params.id);
    console.log(`\x1b[35m[MARKETPLACE]\x1b[0m Numéro supprimé: ${num.phoneNumber}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/numbers/:id/assign — Assign number to company + collaborator
router.post('/numbers/:id/assign', requireSupra, (req, res) => {
  try {
    const { companyId, collaboratorId, planId } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });
    if (num.status === 'assigned') return res.status(400).json({ error: 'Ce numéro est déjà assigné' });

    // Get plan details
    const plan = db.prepare('SELECT * FROM phone_plans WHERE id = ?').get(planId || 'starter');
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    db.prepare(`UPDATE phone_numbers SET status = 'assigned', companyId = ?, collaboratorId = ?,
      planId = ?, monthlyPrice = ?, minutesIncluded = ?, minutesUsed = 0,
      currentPeriodStart = ?, currentPeriodEnd = ?, assignedAt = ?
      WHERE id = ?`)
      .run(companyId, collaboratorId || null, plan?.id || 'starter',
        plan?.price || 8, plan?.minutes || 60,
        now.toISOString(), periodEnd.toISOString(), now.toISOString(), req.params.id);

    // Create transaction
    const txId = 'ptx' + Date.now();
    const collab = collaboratorId ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(collaboratorId) : null;
    db.prepare('INSERT INTO phone_transactions (id, companyId, phoneNumberId, type, detail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, req.params.id, 'purchase',
        `Numéro ${num.phoneNumber} assigné${collab ? ' à ' + collab.name : ''} — Forfait ${plan?.name || 'Starter'}`,
        plan?.price || 8, now.toISOString());

    // Ensure voip_settings exists with marketplace flag
    const vs = db.prepare('SELECT companyId FROM voip_settings WHERE companyId = ?').get(companyId);
    if (!vs) {
      db.prepare('INSERT INTO voip_settings (companyId, marketplace, active) VALUES (?, 1, 1)').run(companyId);
    } else {
      db.prepare('UPDATE voip_settings SET marketplace = 1, active = 1 WHERE companyId = ?').run(companyId);
    }

    const updated = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    console.log(`\x1b[32m[MARKETPLACE]\x1b[0m ${num.phoneNumber} → ${companyId}/${collaboratorId || 'no-collab'} (${plan?.name})`);
    res.json({ success: true, number: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/numbers/:id/release — Release number back to pool
router.post('/numbers/:id/release', requireSupra, (req, res) => {
  try {
    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });

    const prevCompany = num.companyId;
    db.prepare(`UPDATE phone_numbers SET status = 'available', companyId = NULL, collaboratorId = NULL,
      minutesUsed = 0, currentPeriodStart = NULL, currentPeriodEnd = NULL, assignedAt = NULL WHERE id = ?`)
      .run(req.params.id);

    // Create transaction
    if (prevCompany) {
      const txId = 'ptx' + Date.now();
      db.prepare('INSERT INTO phone_transactions (id, companyId, phoneNumberId, type, detail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(txId, prevCompany, req.params.id, 'release', `Numéro ${num.phoneNumber} libéré`, 0, new Date().toISOString());

      // Check if company still has any marketplace numbers
      const remaining = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE companyId = ? AND status = 'assigned'").get(prevCompany);
      if (remaining.c === 0) {
        db.prepare('UPDATE voip_settings SET marketplace = 0 WHERE companyId = ?').run(prevCompany);
      }
    }

    console.log(`\x1b[33m[MARKETPLACE]\x1b[0m ${num.phoneNumber} libéré`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/stats — Global stats
router.get('/stats', requireSupra, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM phone_numbers').get().c;
    const assigned = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'assigned'").get().c;
    const available = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'available'").get().c;
    const suspended = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'suspended'").get().c;
    const revenueRow = db.prepare("SELECT SUM(monthlyPrice) as total FROM phone_numbers WHERE status = 'assigned'").get();
    const monthlyRevenue = revenueRow?.total || 0;
    const totalMinutesUsed = db.prepare("SELECT SUM(minutesUsed) as total FROM phone_numbers WHERE status = 'assigned'").get()?.total || 0;
    const totalMinutesIncluded = db.prepare("SELECT SUM(minutesIncluded) as total FROM phone_numbers WHERE status = 'assigned'").get()?.total || 0;

    // Per company breakdown
    const perCompany = db.prepare(`
      SELECT pn.companyId, COUNT(*) as numberCount, SUM(pn.monthlyPrice) as revenue,
             SUM(pn.minutesUsed) as minutesUsed, SUM(pn.minutesIncluded) as minutesIncluded
      FROM phone_numbers pn WHERE pn.status = 'assigned' GROUP BY pn.companyId
    `).all();

    // Enrich with company names
    for (const row of perCompany) {
      const co = db.prepare('SELECT name FROM companies WHERE id = ?').get(row.companyId);
      row.companyName = co?.name || row.companyId;
    }

    res.json({ total, assigned, available, suspended, monthlyRevenue, totalMinutesUsed, totalMinutesIncluded, perCompany });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/plans — List plans
router.get('/plans', requireAuth, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM phone_plans ORDER BY price ASC').all();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketplace/plans/:id — Update plan
router.put('/plans/:id', requireSupra, (req, res) => {
  try {
    const { name, minutes, price, description, popular } = req.body;
    db.prepare('UPDATE phone_plans SET name = ?, minutes = ?, price = ?, description = ?, popular = ? WHERE id = ?')
      .run(name, minutes, price, description || '', popular || 0, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/transactions — All transactions
router.get('/transactions', requireSupra, (req, res) => {
  try {
    const companyId = req.query.companyId;
    let transactions;
    if (companyId) {
      transactions = db.prepare('SELECT * FROM phone_transactions WHERE companyId = ? ORDER BY createdAt DESC LIMIT 200').all(companyId);
    } else {
      transactions = db.prepare('SELECT * FROM phone_transactions ORDER BY createdAt DESC LIMIT 200').all();
    }
    // Enrich with company names
    for (const tx of transactions) {
      const co = db.prepare('SELECT name FROM companies WHERE id = ?').get(tx.companyId);
      tx.companyName = co?.name || tx.companyId;
    }
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ENTERPRISE: BUY/MANAGE NUMBERS ──────────────

// GET /api/marketplace/available — Available numbers for purchase
router.get('/available', requireAdmin, enforceCompany, (req, res) => {
  try {
    const numbers = db.prepare("SELECT id, phoneNumber, friendlyName, country FROM phone_numbers WHERE status = 'available' ORDER BY phoneNumber").all();
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/purchase — Buy a number
router.post('/purchase', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { numberId, collaboratorId, planId } = req.body;
    const companyId = req.auth.companyId;
    if (!numberId || !companyId) return res.status(400).json({ error: 'numberId et companyId requis' });

    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(numberId);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });
    if (num.status !== 'available') return res.status(400).json({ error: 'Ce numéro n\'est plus disponible' });

    // ── NOTE: Les numéros 07 Twilio (VoIP/OTT) sont autorisés pour les entreprises ──
    // La restriction ARCEP concerne les SIM mobiles classiques, pas les numéros VoIP Twilio

    const plan = db.prepare('SELECT * FROM phone_plans WHERE id = ?').get(planId || 'starter');

    // Debit telecom credits (5€ reservation + plan price)
    const reservationCost = 5;
    const totalCost = reservationCost + (plan?.price || 8);
    const creditRow = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
    const currentBalance = creditRow ? creditRow.balance : 0;
    if (currentBalance < totalCost) {
      return res.status(400).json({ error: `Crédits insuffisants. Solde: ${currentBalance.toFixed(2)}€, requis: ${totalCost.toFixed(2)}€ (réservation 5€ + forfait ${(plan?.price || 8)}€)` });
    }
    const newBalance = currentBalance - totalCost;
    db.prepare('INSERT INTO telecom_credits (companyId, balance) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET balance = ?')
      .run(companyId, newBalance, newBalance);
    const creditLogId = 'tcl' + Date.now();
    db.prepare('INSERT INTO telecom_credit_logs (id, companyId, type, amount, balanceAfter, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(creditLogId, companyId, 'debit', -totalCost, newBalance, `Réservation numéro ${num.phoneNumber} (5€) + Forfait ${plan?.name || 'Starter'} (${plan?.price || 8}€)`, new Date().toISOString());

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    db.prepare(`UPDATE phone_numbers SET status = 'assigned', companyId = ?, collaboratorId = ?,
      planId = ?, monthlyPrice = ?, minutesIncluded = ?, minutesUsed = 0,
      currentPeriodStart = ?, currentPeriodEnd = ?, assignedAt = ?
      WHERE id = ?`)
      .run(companyId, collaboratorId || null, plan?.id || 'starter',
        plan?.price || 8, plan?.minutes || 60,
        now.toISOString(), periodEnd.toISOString(), now.toISOString(), numberId);

    // Transaction
    const txId = 'ptx' + Date.now();
    db.prepare('INSERT INTO phone_transactions (id, companyId, phoneNumberId, type, detail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, numberId, 'purchase',
        `Achat numéro ${num.phoneNumber} — Forfait ${plan?.name || 'Starter'} (${totalCost}€ débités)`,
        totalCost, now.toISOString());

    // Ensure voip_settings with marketplace
    const vs = db.prepare('SELECT companyId FROM voip_settings WHERE companyId = ?').get(companyId);
    if (!vs) {
      db.prepare('INSERT INTO voip_settings (companyId, marketplace, active) VALUES (?, 1, 1)').run(companyId);
    } else {
      db.prepare('UPDATE voip_settings SET marketplace = 1, active = 1 WHERE companyId = ?').run(companyId);
    }

    const updated = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(numberId);
    console.log(`\x1b[32m[MARKETPLACE]\x1b[0m Achat: ${num.phoneNumber} par ${companyId} — solde crédits: ${newBalance.toFixed(2)}€`);
    res.json({ success: true, number: updated, telecomBalance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/my-numbers — Company's assigned numbers
router.get('/my-numbers', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const numbers = db.prepare("SELECT * FROM phone_numbers WHERE companyId = ? AND status = 'assigned' ORDER BY assignedAt DESC").all(companyId);
    // Enrich with collaborator names
    for (const n of numbers) {
      if (n.collaboratorId) {
        const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(n.collaboratorId);
        n.collaboratorName = collab?.name || '';
      }
    }
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketplace/my-numbers/:id/plan — Change plan
router.put('/my-numbers/:id/plan', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { planId } = req.body;
    const plan = db.prepare('SELECT * FROM phone_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Forfait non trouvé' });

    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });

    db.prepare('UPDATE phone_numbers SET planId = ?, monthlyPrice = ?, minutesIncluded = ? WHERE id = ?')
      .run(plan.id, plan.price, plan.minutes, req.params.id);

    // Transaction
    const txId = 'ptx' + Date.now();
    db.prepare('INSERT INTO phone_transactions (id, companyId, phoneNumberId, type, detail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, num.companyId, req.params.id, 'plan_change',
        `${num.phoneNumber}: changement vers ${plan.name} (${plan.minutes}min/${plan.price}€)`,
        plan.price, new Date().toISOString());

    console.log(`\x1b[35m[MARKETPLACE]\x1b[0m Plan changé: ${num.phoneNumber} → ${plan.name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketplace/my-numbers/:id/assign — Reassign to another collaborator
router.put('/my-numbers/:id/assign', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { collaboratorId } = req.body;
    db.prepare('UPDATE phone_numbers SET collaboratorId = ? WHERE id = ?').run(collaboratorId || null, req.params.id);
    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (num && collaboratorId) {
      const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(collaboratorId);
      num.collaboratorName = collab?.name || '';
    }
    res.json({ success: true, number: num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/my-numbers/:id/release — Release a number (enterprise)
router.post('/my-numbers/:id/release', requireAdmin, enforceCompany, (req, res) => {
  try {
    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Numéro non trouvé' });

    const prevCompany = num.companyId;
    db.prepare(`UPDATE phone_numbers SET status = 'available', companyId = NULL, collaboratorId = NULL,
      minutesUsed = 0, currentPeriodStart = NULL, currentPeriodEnd = NULL, assignedAt = NULL WHERE id = ?`)
      .run(req.params.id);

    if (prevCompany) {
      const txId = 'ptx' + Date.now();
      db.prepare('INSERT INTO phone_transactions (id, companyId, phoneNumberId, type, detail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(txId, prevCompany, req.params.id, 'release', `Résiliation numéro ${num.phoneNumber}`, 0, new Date().toISOString());

      const remaining = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE companyId = ? AND status = 'assigned'").get(prevCompany);
      if (remaining.c === 0) {
        db.prepare('UPDATE voip_settings SET marketplace = 0 WHERE companyId = ?').run(prevCompany);
      }
    }

    console.log(`\x1b[33m[MARKETPLACE]\x1b[0m Résiliation: ${num.phoneNumber}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TWILIO AUTO-PROVISION ──────────────────────────

// POST /api/marketplace/twilio-search — Search available numbers on Twilio
router.post('/twilio-search', requireSupra, async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(400).json({ error: 'Credentials Twilio non configurées dans .env' });

    const client = twilio(accountSid, authToken);
    const { country = 'FR', type = 'local', areaCode = '', contains = '', limit = 20 } = req.body;

    const opts = { limit: Math.min(limit, 30) };
    if (areaCode) opts.areaCode = areaCode;
    if (contains) opts.contains = contains;

    let results = [];
    try {
      if (type === 'local') {
        results = await client.availablePhoneNumbers(country).local.list(opts);
      } else if (type === 'national') {
        results = await client.availablePhoneNumbers(country).national.list(opts);
      } else if (type === 'tollFree') {
        results = await client.availablePhoneNumbers(country).tollFree.list(opts);
      } else if (type === 'mobile') {
        results = await client.availablePhoneNumbers(country).mobile.list(opts);
      } else {
        results = await client.availablePhoneNumbers(country).local.list(opts);
      }
    } catch (twilioErr) {
      return res.status(400).json({ error: `Twilio: ${twilioErr.message}` });
    }

    const numbers = results.map(n => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || '',
      region: n.region || '',
      isoCountry: n.isoCountry,
      capabilities: {
        voice: n.capabilities?.voice ?? false,
        sms: n.capabilities?.SMS ?? false,
        mms: n.capabilities?.MMS ?? false,
      },
    }));

    console.log(`\x1b[36m[TWILIO-SEARCH]\x1b[0m ${country}/${type} → ${numbers.length} résultats`);
    res.json({ success: true, numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/twilio-buy — Buy a number from Twilio and add to stock
router.post('/twilio-buy', requireSupra, async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(400).json({ error: 'Credentials Twilio non configurées dans .env' });

    const { phoneNumber, friendlyName, type = 'local', purchaseCost = 0, resalePrice = 8 } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber requis' });

    // Check not already in stock
    const existing = db.prepare('SELECT id FROM phone_numbers WHERE phoneNumber = ?').get(phoneNumber);
    if (existing) return res.status(409).json({ error: 'Ce numéro existe déjà dans l\'inventaire' });

    const client = twilio(accountSid, authToken);

    // ─── Auto-detect Bundle for regulatory compliance ───
    // French (+33) and EU numbers require a Regulatory Bundle (which contains the address)
    let bundleSid = null;
    const needsRegulatory = phoneNumber.startsWith('+33') || phoneNumber.startsWith('+34') ||
      phoneNumber.startsWith('+49') || phoneNumber.startsWith('+39') || phoneNumber.startsWith('+44');

    if (needsRegulatory) {
      try {
        // Find an approved regulatory bundle — it contains the verified address
        const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
          status: 'twilio-approved',
          limit: 20,
        });
        if (bundles.length > 0) {
          bundleSid = bundles[0].sid;
          console.log(`\x1b[36m[TWILIO-BUY]\x1b[0m Using bundle: ${bundles[0].friendlyName} (${bundles[0].sid})`);
        }
      } catch (bundleErr) {
        console.warn('[TWILIO-BUY] Could not fetch bundles:', bundleErr.message);
      }

      if (!bundleSid) {
        return res.status(400).json({
          error: 'Les numéros ' + phoneNumber.substring(0, 3) + ' nécessitent un Regulatory Bundle approuvé sur votre compte Twilio (contenant votre adresse et documents). Configurez-le dans la console Twilio > Phone Numbers > Manage > Regulatory Compliance.'
        });
      }
    }

    // Buy on Twilio
    const baseUrl = process.env.BASE_URL || 'https://calendar360.fr';
    let purchased;
    try {
      const createOpts = {
        phoneNumber,
        friendlyName: friendlyName || phoneNumber,
        voiceUrl: `${baseUrl}/api/voip/twiml/inbound`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/voip/status`,
        statusCallbackMethod: 'POST',
      };
      // Only pass bundleSid — it already contains the address; passing both causes conflict
      if (bundleSid) createOpts.bundleSid = bundleSid;

      purchased = await client.incomingPhoneNumbers.create(createOpts);
    } catch (twilioErr) {
      console.error('[TWILIO-BUY ERROR]', twilioErr.message);
      let errMsg = twilioErr.message;
      if (errMsg.includes('Address') || errMsg.includes('Bundle') || errMsg.includes('regulatory')) {
        errMsg += ' — Allez dans la console Twilio > Phone Numbers > Regulatory Compliance pour vérifier que votre bundle est approuvé et contient une adresse valide.';
      }
      return res.status(400).json({ error: `Twilio achat échoué: ${errMsg}` });
    }

    // Insert into stock
    const id = 'pn' + Date.now();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO phone_numbers (id, phoneNumber, friendlyName, country, twilioSid, status, type, provider, purchaseCost, monthlyPrice, createdAt)
      VALUES (?, ?, ?, ?, ?, 'available', ?, 'twilio', ?, ?, ?)`)
      .run(id, phoneNumber, friendlyName || purchased.friendlyName || '', purchased.phoneNumber?.substring(0, 3) === '+33' ? 'FR' : 'INT',
        purchased.sid, type, purchaseCost, resalePrice, now);

    const num = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(id);
    console.log(`\x1b[32m[TWILIO-BUY]\x1b[0m Numéro acheté sur Twilio: ${phoneNumber} (SID: ${purchased.sid})`);
    res.json({ success: true, number: num, twilioSid: purchased.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/enhanced-stats — Comprehensive stats with margins
router.get('/enhanced-stats', requireSupra, (req, res) => {
  try {
    // Stock counts
    const total = db.prepare('SELECT COUNT(*) as c FROM phone_numbers').get().c;
    const assigned = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'assigned'").get().c;
    const available = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'available'").get().c;
    const suspended = db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'suspended'").get().c;

    // Revenue & margin from phone numbers
    const revenueData = db.prepare("SELECT SUM(monthlyPrice) as totalResale, SUM(purchaseCost) as totalCost FROM phone_numbers WHERE status = 'assigned'").get();
    const monthlyRevenue = revenueData?.totalResale || 0;
    const monthlyCost = revenueData?.totalCost || 0;
    const numberMargin = monthlyRevenue - monthlyCost;

    // VoIP credits global
    const voipTotal = db.prepare("SELECT SUM(credits) as total FROM voip_credits").get()?.total || 0;
    const voipRechargeTotal = db.prepare("SELECT SUM(amount) as total FROM voip_transactions WHERE type = 'recharge' AND amount > 0").get()?.total || 0;
    const voipConsumed = db.prepare("SELECT SUM(ABS(count)) as total FROM voip_transactions WHERE type = 'call'").get()?.total || 0;

    // SMS credits global
    const smsTotal = db.prepare("SELECT SUM(credits) as total FROM sms_credits").get()?.total || 0;
    const smsRechargeTotal = db.prepare("SELECT SUM(amount) as total FROM sms_transactions WHERE type = 'recharge' AND amount > 0").get()?.total || 0;
    const smsConsumed = db.prepare("SELECT SUM(ABS(count)) as total FROM sms_transactions WHERE type = 'sent'").get()?.total || 0;

    // Per company breakdown
    const companies = db.prepare('SELECT id, name FROM companies').all();
    const perCompany = companies.map(co => {
      const nums = db.prepare("SELECT COUNT(*) as c, SUM(monthlyPrice) as revenue, SUM(purchaseCost) as cost FROM phone_numbers WHERE companyId = ? AND status = 'assigned'").get(co.id);
      const vc = db.prepare('SELECT credits FROM voip_credits WHERE companyId = ?').get(co.id);
      const sc = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(co.id);
      const voipUsed = db.prepare("SELECT SUM(ABS(count)) as total FROM voip_transactions WHERE companyId = ? AND type = 'call'").get(co.id)?.total || 0;
      const smsUsed = db.prepare("SELECT SUM(ABS(count)) as total FROM sms_transactions WHERE companyId = ? AND type = 'sent'").get(co.id)?.total || 0;
      const voipSpent = db.prepare("SELECT SUM(amount) as total FROM voip_transactions WHERE companyId = ? AND type = 'recharge' AND amount > 0").get(co.id)?.total || 0;
      const smsSpent = db.prepare("SELECT SUM(amount) as total FROM sms_transactions WHERE companyId = ? AND type = 'recharge' AND amount > 0").get(co.id)?.total || 0;

      return {
        companyId: co.id,
        companyName: co.name,
        numbers: nums?.c || 0,
        monthlyRevenue: nums?.revenue || 0,
        monthlyCost: nums?.cost || 0,
        margin: (nums?.revenue || 0) - (nums?.cost || 0),
        voiceCredits: vc?.credits || 0,
        smsCredits: sc?.credits || 0,
        voiceConsumed: voipUsed,
        smsConsumed: smsUsed,
        voiceSpent: voipSpent,
        smsSpent: smsSpent,
      };
    }).filter(c => c.numbers > 0 || c.voiceCredits > 0 || c.smsCredits > 0 || c.voiceConsumed > 0 || c.smsConsumed > 0);

    // Per collaborator breakdown
    const assignedNumbers = db.prepare(`
      SELECT pn.*, col.name as collaboratorName, co.name as companyName
      FROM phone_numbers pn
      LEFT JOIN collaborators col ON pn.collaboratorId = col.id
      LEFT JOIN companies co ON pn.companyId = co.id
      WHERE pn.status = 'assigned' AND pn.collaboratorId IS NOT NULL
    `).all();

    const perCollaborator = assignedNumbers.map(n => ({
      collaboratorId: n.collaboratorId,
      collaboratorName: n.collaboratorName || 'Non assigné',
      companyId: n.companyId,
      companyName: n.companyName || '',
      phoneNumber: n.phoneNumber,
      minutesUsed: n.minutesUsed || 0,
      minutesIncluded: n.minutesIncluded || 0,
      planId: n.planId,
      assignedAt: n.assignedAt,
    }));

    res.json({
      stock: { total, available, assigned, suspended },
      revenue: {
        monthly: monthlyRevenue,
        totalPurchaseCost: monthlyCost,
        margin: numberMargin,
        marginPercent: monthlyRevenue > 0 ? Math.round((numberMargin / monthlyRevenue) * 100) : 0,
      },
      voiceCredits: { totalRemaining: voipTotal, totalSold: voipRechargeTotal, totalConsumed: voipConsumed },
      smsCredits: { totalRemaining: smsTotal, totalSold: smsRechargeTotal, totalConsumed: smsConsumed },
      perCompany,
      perCollaborator,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TELECOM CREDITS (token system) ──────────────────────

// GET /api/marketplace/credits?companyId= — Get credit balance for a company
router.get('/credits', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const row = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
    res.json({ balance: row ? row.balance : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/credits/all — All companies credit balances (supra admin)
// Returns object { companyId: balance } to match init.js format used by frontend
router.get('/credits/all', requireSupra, (req, res) => {
  try {
    const rows = db.prepare('SELECT companyId, balance FROM telecom_credits').all();
    const result = {};
    for (const r of rows) result[r.companyId] = r.balance;
    // Include companies with 0 balance
    const allCompanies = db.prepare('SELECT id FROM companies').all();
    for (const co of allCompanies) {
      if (!(co.id in result)) result[co.id] = 0;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/credits/add — Supra admin adds credits to a company
router.post('/credits/add', requireSupra, (req, res) => {
  try {
    const { companyId, amount, detail } = req.body;
    if (!companyId || !amount) return res.status(400).json({ error: 'companyId et amount requis' });
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Montant invalide' });

    db.prepare('INSERT INTO telecom_credits (companyId, balance) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET balance = balance + ?')
      .run(companyId, amt, amt);
    // Sync voip_credits (le frontend lit voipCredits depuis cette table)
    db.prepare('INSERT INTO voip_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = credits + ?')
      .run(companyId, amt, amt);

    const row = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
    const newBalance = row ? row.balance : amt;

    // Log
    const logId = 'tcl' + Date.now();
    db.prepare('INSERT INTO telecom_credit_logs (id, companyId, type, amount, balanceAfter, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(logId, companyId, 'credit', amt, newBalance, detail || `Ajout de ${amt}€ de crédits par Supra Admin`, new Date().toISOString());

    const co = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
    console.log(`\x1b[32m[TELECOM-CREDITS]\x1b[0m +${amt}€ → ${co?.name || companyId} (solde: ${newBalance}€)`);
    res.json({ success: true, balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/credits/set — Supra admin sets exact credit balance
router.post('/credits/set', requireSupra, (req, res) => {
  try {
    const { companyId, balance } = req.body;
    if (!companyId || balance == null) return res.status(400).json({ error: 'companyId et balance requis' });
    const bal = parseFloat(balance);

    db.prepare('INSERT INTO telecom_credits (companyId, balance) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET balance = ?')
      .run(companyId, bal, bal);
    // Sync voip_credits (le frontend lit voipCredits depuis cette table)
    db.prepare('INSERT INTO voip_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = ?')
      .run(companyId, bal, bal);

    const logId = 'tcl' + Date.now();
    db.prepare('INSERT INTO telecom_credit_logs (id, companyId, type, amount, balanceAfter, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(logId, companyId, 'admin_set', bal, bal, `Solde défini à ${bal}€ par Supra Admin`, new Date().toISOString());

    console.log(`\x1b[35m[TELECOM-CREDITS]\x1b[0m Solde fixé à ${bal}€ pour ${companyId}`);
    res.json({ success: true, balance: bal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/credit-logs?companyId= — Transaction history
router.get('/credit-logs', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    let logs;
    if (companyId) {
      logs = db.prepare('SELECT * FROM telecom_credit_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 100').all(companyId);
    } else {
      logs = db.prepare(`
        SELECT tcl.*, c.name as companyName
        FROM telecom_credit_logs tcl
        LEFT JOIN companies c ON c.id = tcl.companyId
        ORDER BY tcl.createdAt DESC LIMIT 200
      `).all();
    }
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPER: debit telecom credits ──────────────────────
function debitTelecomCredits(companyId, amount, detail) {
  const row = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
  const currentBalance = row ? row.balance : 0;
  if (currentBalance < amount) {
    return { success: false, error: `Crédits insuffisants (solde: ${currentBalance.toFixed(2)}€, requis: ${amount.toFixed(2)}€)` };
  }
  const newBalance = currentBalance - amount;
  db.prepare('UPDATE telecom_credits SET balance = ? WHERE companyId = ?').run(newBalance, companyId);

  const logId = 'tcl' + Date.now() + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO telecom_credit_logs (id, companyId, type, amount, balanceAfter, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(logId, companyId, 'debit', -amount, newBalance, detail, new Date().toISOString());

  return { success: true, balance: newBalance };
}

export { debitTelecomCredits };
export default router;
