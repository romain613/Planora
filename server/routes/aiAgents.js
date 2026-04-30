import { Router } from 'express';
import { db } from '../db/database.js';
import twilio from 'twilio';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// GET /api/ai-agents?companyId=
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const agents = db.prepare('SELECT * FROM ai_agents WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    agents.forEach(a => {
      try { a.questions = JSON.parse(a.questions_json || '[]'); } catch { a.questions = []; }
      try { a.scoring = JSON.parse(a.scoring_json || '{}'); } catch { a.scoring = {}; }
    });
    res.json(agents);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agents/:id
router.get('/:id', requireAuth, (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!req.auth.isSupra && agent.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    try { agent.questions = JSON.parse(agent.questions_json || '[]'); } catch { agent.questions = []; }
    try { agent.scoring = JSON.parse(agent.scoring_json || '{}'); } catch { agent.scoring = {}; }
    res.json(agent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai-agents
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, name, type, category, systemPrompt, greeting, questions, personality, language, voice, ttsEngine, maxDuration, calendarId, twilioNumber, scoring, scenario, difficulty } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: 'companyId and name required' });
    const id = 'agent_' + Date.now() + Math.random().toString(36).slice(2, 5);
    db.prepare(`INSERT INTO ai_agents (id, companyId, name, type, category, systemPrompt, greeting, questions_json, personality, language, voice, ttsEngine, maxDuration, calendarId, twilioNumber, scoring_json, scenario, difficulty, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, companyId, name, type || 'client', category || 'general', systemPrompt || '', greeting || '', JSON.stringify(questions || []), personality || '', language || 'fr', voice || 'alloy', ttsEngine || 'openai', maxDuration || 600, calendarId || '', twilioNumber || '', JSON.stringify(scoring || {}), scenario || '', difficulty || 'medium', new Date().toISOString(), new Date().toISOString());
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(id);
    res.json(agent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/ai-agents/:id
router.put('/:id', requireAuth, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const fields = ['name', 'type', 'category', 'status', 'systemPrompt', 'greeting', 'personality', 'language', 'voice', 'ttsEngine', 'maxDuration', 'calendarId', 'twilioNumber', 'scenario', 'difficulty'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(f + ' = ?'); values.push(req.body[f]); }
    }
    if (req.body.questions !== undefined) { updates.push('questions_json = ?'); values.push(JSON.stringify(req.body.questions)); }
    if (req.body.scoring !== undefined) { updates.push('scoring_json = ?'); values.push(JSON.stringify(req.body.scoring)); }
    if (updates.length === 0) return res.json({ success: true });
    updates.push('updatedAt = ?'); values.push(new Date().toISOString());
    values.push(req.params.id);
    db.prepare(`UPDATE ai_agents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
    try { agent.questions = JSON.parse(agent.questions_json || '[]'); } catch { agent.questions = []; }
    res.json(agent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/ai-agents/:id
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const agent = db.prepare('SELECT companyId FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!req.auth.isSupra && agent.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare('DELETE FROM ai_agent_sessions WHERE agentId = ?').run(req.params.id);
    db.prepare('DELETE FROM ai_agents WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agents/:id/sessions
router.get('/:id/sessions', requireAuth, (req, res) => {
  try {
    const agent = db.prepare('SELECT companyId FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!req.auth.isSupra && agent.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const sessions = db.prepare('SELECT * FROM ai_agent_sessions WHERE agentId = ? ORDER BY createdAt DESC LIMIT 100').all(req.params.id);
    sessions.forEach(s => {
      try { s.score = JSON.parse(s.score_json || '{}'); } catch { s.score = {}; }
      s.transcriptionPreview = (s.transcription || '').substring(0, 200);
      if (s.transcription && s.transcription.length > 200) s.transcriptionPreview += '...';
    });
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agents/:id/sessions/:sid — full session detail
router.get('/:id/sessions/:sid', requireAuth, (req, res) => {
  try {
    // SECURITY: verify agent belongs to user's company
    const agent = db.prepare('SELECT companyId FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!req.auth.isSupra && agent.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const session = db.prepare('SELECT * FROM ai_agent_sessions WHERE id = ? AND agentId = ?').get(req.params.sid, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    try { session.score = JSON.parse(session.score_json || '{}'); } catch { session.score = {}; }
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai-agents/:id/call — Lancer un appel d'entrainement vers un collaborateur
router.post('/:id/call', requireAuth, async (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });
    // SECURITY: verify agent belongs to user's company
    if (!req.auth.isSupra && agent.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    const { phoneNumber, collaboratorId } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber requis' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken || accountSid === 'your-twilio-account-sid') {
      return res.json({
        success: true,
        demo: true,
        message: 'Mode demo — pas de credentials Twilio',
        callSid: 'demo_' + Date.now(),
      });
    }

    const client = twilio(accountSid, authToken);

    // Determiner l'URL du serveur pour le TwiML et le WebSocket
    const host = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
    const publicHost = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'calendar360.fr' : host;
    const serverUrl = `https://${publicHost}`;
    const wsUrl = serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    // Lancer l'appel avec une URL TwiML qui retourne le stream
    const twimlUrl = `${serverUrl}/api/ai-agents/twiml/${agent.id}${collaboratorId ? '?collaboratorId=' + collaboratorId : ''}`;

    // Determiner le numero d'expedition
    let fromNumber = agent.twilioNumber || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      const assigned = db.prepare("SELECT phoneNumber FROM phone_numbers WHERE status = 'assigned' LIMIT 1").get();
      fromNumber = assigned?.phoneNumber;
    }
    if (!fromNumber) return res.status(400).json({ error: 'Aucun numero Twilio configure' });

    // Lancer l'appel via Twilio
    const call = await client.calls.create({
      to: phoneNumber,
      from: fromNumber,
      url: twimlUrl,
      record: false,
      statusCallback: `${serverUrl}/api/voip/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    console.log(`\x1b[35m[AI AGENT CALL]\x1b[0m Appel lance vers ${phoneNumber} — CallSid: ${call.sid}, Agent: ${agent.name}`);

    res.json({
      success: true,
      callSid: call.sid,
      agentId: agent.id,
      agentName: agent.name,
      to: phoneNumber,
    });
  } catch (err) {
    console.error('\x1b[31m[AI AGENT CALL ERR]\x1b[0m', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET/POST /api/ai-agents/twiml/:agentId — Twilio appelle cette URL pour obtenir le TwiML
router.all('/twiml/:agentId', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.agentId);
    if (!agent) {
      res.type('text/xml');
      return res.send('<Response><Say language="fr-FR">Agent introuvable.</Say></Response>');
    }

    const collaboratorId = req.query.collaboratorId || req.body?.collaboratorId || '';
    const host = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
    const publicHost = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'calendar360.fr' : host;
    const wsUrl = `wss://${publicHost}/agent-media-stream`;

    console.log(`\x1b[35m[AGENT TWIML]\x1b[0m Generating TwiML for agent ${agent.name}, wsUrl: ${wsUrl}`);

    const { VoiceResponse } = twilio.twiml;
    const twiml = new VoiceResponse();

    // Pas de <Say> ici — le greeting sera dit par le TTS de l'agent (meme voix)
    // Petite pause pour laisser le stream se connecter
    twiml.pause({ length: 1 });

    // Stream bidirectionnel
    const connect = twiml.connect();
    const stream = connect.stream({ url: wsUrl });
    stream.parameter({ name: 'agentId', value: agent.id });
    if (collaboratorId) stream.parameter({ name: 'collaboratorId', value: collaboratorId });

    // Garder l'appel ouvert
    twiml.pause({ length: agent.maxDuration || 600 });

    const twimlStr = twiml.toString();
    console.log(`\x1b[35m[AGENT TWIML]\x1b[0m ${twimlStr.substring(0, 200)}`);

    res.type('text/xml');
    res.send(twimlStr);
  } catch (err) {
    console.error('[AGENT TWIML ERR]', err.message);
    res.type('text/xml');
    res.send('<Response><Say language="fr-FR">Erreur technique.</Say></Response>');
  }
});

export default router;
