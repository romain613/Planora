import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Routes
import notifyRoutes from './routes/notify.js';
import initRoutes from './routes/init.js';
import authRoutes from './routes/auth.js';
import bookingsRoutes from './routes/bookings.js';
import calendarsRoutes from './routes/calendars.js';
import collaboratorsRoutes from './routes/collaborators.js';
import companiesRoutes from './routes/companies.js';
import settingsRoutes from './routes/settings.js';
import smsRoutes from './routes/sms.js';
import dataRoutes from './routes/data.js';
import publicRoutes from './routes/public.js';
import googleRoutes from './routes/google.js';
import tasksRoutes from './routes/tasks.js';
import chatRoutes from './routes/chat.js';
import analyticsRoutes from './routes/analytics.js';
import collabSnapshotsRoutes from './routes/collabSnapshots.js';
import backupRoutes from './routes/backup.js';
import verifyRoutes from './routes/verify.js';
import ticketsRoutes from './routes/tickets.js';
import formsRoutes from './routes/forms.js';
import pagesRoutes from './routes/pages.js';
import voipRoutes from './routes/voip.js';
import marketplaceRoutes from './routes/marketplace.js';
import messagingRoutes from './routes/messaging.js';
import tablesRoutes from './routes/tables.js';
import manageRoutes from './routes/manage.js';
import clientPortalRoutes from './routes/clientPortal.js';
import notificationsRoutes from './routes/notifications.js';
import secureIaRoutes from './routes/secureIa.js';
import aiCopilotRoutes from './routes/aiCopilot.js';
import conversationsRoutes from './routes/conversations.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import callContextRoutes from './routes/callContext.js';
import leadsRoutes from './routes/leads.js';
import goalsRoutes from './routes/goals.js';
import perfCollabRoutes from './routes/perfCollab.js';
import aiAgentsRoutes from './routes/aiAgents.js';
import callFormsRoutes from './routes/callForms.js';
import { templatesRouter as interactionTemplatesRouter, responsesRouter as interactionResponsesRouter } from './routes/interactionTemplates.js';
import contactFieldsRoutes from './routes/contactFields.js';
import contactDocumentsRoutes from './routes/contactDocuments.js';
import healthRoutes from './routes/health.js';
import securityRoutes from './routes/security.js';
import fauconRoutes from './routes/faucon.js';
import rolesRoutes from './routes/roles.js';
import auditLogsRoutes from './routes/auditLogs.js';
import transferRoutes from './routes/transfer.js';
import pipelineTemplatesRoutes from './routes/pipelineTemplates.js';
import contactShareRoutes from './routes/contactShare.js';
import { renderLandingPage } from './templates/landingPage.js';
import { handleCallback as googleHandleCallback } from './services/googleCalendar.js';
import { validateWebhookContext } from './helpers/resolveContext.js';
import { authenticate, cleanExpiredSessions } from './middleware/auth.js';

// DB init (tables created on import)
import './db/database.js';
import { db } from './db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// Start cron jobs
import './cron/reminders.js';
import './cron/backups.js';
import './cron/secureIaReports.js';
import './cron/leadDispatch.js';
import './cron/nrpRelance.js';
import './cron/gsheetSync.js';
import './cron/transcriptArchive.js';
import { startSmartAutomations } from './cron/smartAutomations.js';
import './cron/collabSnapshots.js';
import './cron/collabSnapshotsRetention.js';
import './cron/auditPipelineSync.js'; // V1.8.24.6 — Audit pipeline

const app = express();
app.set('trust proxy', 1); // Behind Nginx reverse proxy
const PORT = process.env.PORT || 3001;

// CORS — restrict to allowed origins
const allowedOrigins = [
  'https://calendar360.fr',
  'https://www.calendar360.fr',
  'http://localhost:5173',   // dev
  'http://localhost:3001',   // dev API
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('[CORS] Blocked origin:', origin);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

// Gzip compression for all responses
app.use(compression());

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false })); // Twilio webhooks use form-urlencoded
app.set('etag', false);

// Rate limiting on auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/supra-login', authLimiter);

// Request logging
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    console.log(`\x1b[36m[${new Date().toLocaleTimeString()}]\x1b[0m ${req.method} ${req.url}`);
  }
  next();
});

// Disable ETags on API routes to prevent stale 304 responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('ETag', '');
  next();
});

// Global auth middleware: reads Bearer token, sets req.auth (non-blocking)
app.use(authenticate);

// Clean expired sessions every hour
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// ─── API Routes ──────────────────────────────
app.use('/api/init', initRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/calendars', calendarsRoutes);
app.use('/api/collaborators', collaboratorsRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/collab-snapshots', collabSnapshotsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api', healthRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/voip', voipRoutes);
app.use('/api/faucon', fauconRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/manage', manageRoutes);
app.use('/api/espace', clientPortalRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/secure-ia', secureIaRoutes);
app.use('/api/ai-copilot', aiCopilotRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/call-context', callContextRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/perf', perfCollabRoutes);
app.use('/api/ai-agents', aiAgentsRoutes);
app.use('/api/call-forms', callFormsRoutes);
app.use('/api/interaction-templates', interactionTemplatesRouter);
app.use('/api/interaction-responses', interactionResponsesRouter);
app.use('/api/contact-fields', contactFieldsRoutes);
app.use('/api/contact-documents', contactDocumentsRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/admin/pipeline-templates', pipelineTemplatesRoutes);
app.use('/api/contact-share', contactShareRoutes);

// Google OAuth callback (redirect URI: /auth/google/callback)
app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.redirect('/?google=error');
  try {
    await googleHandleCallback(code, state);
    res.redirect('/?google=success');
  } catch (err) {
    console.error('[GOOGLE CALLBACK ERROR]', err.message);
    res.redirect('/?google=error');
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'connected', service: 'calendar360', timestamp: new Date().toISOString() });
});

// ─── Production: serve frontend ──────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'app', 'dist');
  // Never cache index.html (force browser to always fetch fresh version with correct JS hash)
  app.get('/', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(join(distPath, 'index.html'));
  });
  // Serve uploaded files (voicemail audio, etc.)
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  // Static assets (JS/CSS) use content hashing — cache is safe
  app.use(express.static(distPath, { maxAge: '1d', setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }}));
  // Serve static pages for /privacy, /terms, /mentions-legales (before SPA catchall)
  app.get('/privacy', (req, res) => res.sendFile(join(distPath, 'privacy.html')));
  app.get('/terms', (req, res) => res.sendFile(join(distPath, 'terms.html')));

  // Mentions légales — required for Twilio Bundle verification
  const legalStyle = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #F8FAFC; color: #1E293B; line-height: 1.7; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; color: #0F172A; }
    h2 { font-size: 20px; font-weight: 700; margin: 32px 0 12px; color: #1E40AF; border-bottom: 2px solid #BFDBFE; padding-bottom: 6px; }
    p, li { font-size: 15px; margin-bottom: 8px; }
    ul { padding-left: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; margin-top: 24px; }
    .brand { color: #2563EB; font-weight: 700; }
    .back { display: inline-block; margin-top: 24px; color: #2563EB; text-decoration: none; font-weight: 600; font-size: 14px; }
    .back:hover { text-decoration: underline; }
    .info-grid { display: grid; grid-template-columns: 180px 1fr; gap: 6px 16px; font-size: 14px; }
    .info-grid dt { font-weight: 600; color: #64748B; }
    .info-grid dd { font-weight: 500; }
    .footer-legal { margin-top: 40px; padding: 20px 0; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #64748B; }
    .footer-legal a { color: #2563EB; text-decoration: none; }
    .footer-legal a:hover { text-decoration: underline; }
  `;

  app.get('/mentions-legales', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mentions L\u00e9gales - Calendar360</title>
  <meta name="description" content="Mentions l\u00e9gales du site calendar360.fr.">
  <meta name="author" content="Calendar360">
  <link rel="canonical" href="https://calendar360.fr/mentions-legales">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Calendar360",
    "url": "https://calendar360.fr",
    "email": "rc.sitbon@gmail.com"
  }
  </script>
  <style>${legalStyle}</style>
</head>
<body>
  <div class="container">
    <a href="/" class="back">&larr; Retour \u00e0 Calendar360</a>
    <h1>Mentions L\u00e9gales</h1>
    <p style="color:#64748B; font-size:14px;">Derni\u00e8re mise \u00e0 jour : Mars 2026</p>

    <div class="card">
      <h2>\u00c9diteur du site</h2>
      <p>Le site <span class="brand">calendar360.fr</span> est \u00e9dit\u00e9 et exploit\u00e9 par :</p>
      <dl class="info-grid">
        <dt>Raison sociale</dt><dd><strong>COMPETENCES FIRST</strong></dd>
        <dt>Forme juridique</dt><dd>Soci\u00e9t\u00e9 par Actions Simplifi\u00e9e (SAS)</dd>
        <dt>SIREN</dt><dd>893 531 954</dd>
        <dt>SIRET (si\u00e8ge)</dt><dd>893 531 954 00012</dd>
        <dt>Num\u00e9ro de TVA</dt><dd>FR01893531954</dd>
        <dt>Code NAF / APE</dt><dd>8559A \u2014 Formation continue d'adultes</dd>
        <dt>Date de cr\u00e9ation</dt><dd>29 janvier 2021</dd>
        <dt>Repr\u00e9sentant l\u00e9gal</dt><dd>Anthony PITKANITSOS (Pr\u00e9sident)</dd>
        <dt>Si\u00e8ge social</dt><dd>5 RUE DES SPORTS, 31620 GARGAS, France</dd>
        <dt>R\u00e9gion</dt><dd>Haute-Garonne, Occitanie</dd>
        <dt>Email</dt><dd>rc.sitbon@gmail.com</dd>
        <dt>Site web</dt><dd><a href="https://calendar360.fr" style="color:#2563EB">https://calendar360.fr</a></dd>
        <dt>Registre officiel</dt><dd><a href="https://www.societe.com/societe/competences-first-893531954.html" style="color:#2563EB" target="_blank" rel="noopener">Fiche societe.com</a></dd>
      </dl>

      <h2>Licence d'exploitation</h2>
      <p><strong>COMPETENCES FIRST</strong> est le titulaire exclusif de la licence d'exploitation commerciale de la marque <span class="brand">Calendar360</span> et de la plateforme logicielle associ\u00e9e. L'ensemble des services propos\u00e9s sur <span class="brand">calendar360.fr</span> sont exploit\u00e9s sous licence par <strong>COMPETENCES FIRST</strong>.</p>

      <h2>Activit\u00e9</h2>
      <p><strong>COMPETENCES FIRST</strong> exploite sous licence la plateforme <span class="brand">Calendar360</span>, une solution SaaS de gestion de rendez-vous, CRM, t\u00e9l\u00e9phonie VoIP et communication d'\u00e9quipe destin\u00e9e aux professionnels.</p>

      <h2>H\u00e9bergement</h2>
      <dl class="info-grid">
        <dt>H\u00e9bergeur</dt><dd>Vultr Holdings LLC / HostHatch Inc.</dd>
        <dt>Adresse serveur</dt><dd>136.144.204.115</dd>
        <dt>Localisation</dt><dd>Europe (France)</dd>
      </dl>

      <h2>Propri\u00e9t\u00e9 intellectuelle</h2>
      <p>L\u2019ensemble du contenu du site calendar360.fr (textes, images, logo, code source) est exploit\u00e9 sous licence exclusive par <strong>COMPETENCES FIRST</strong>. Toute reproduction, m\u00eame partielle, est interdite sans autorisation \u00e9crite pr\u00e9alable de <strong>COMPETENCES FIRST</strong>.</p>

      <h2>Donn\u00e9es personnelles</h2>
      <p>Conform\u00e9ment au R\u00e8glement G\u00e9n\u00e9ral sur la Protection des Donn\u00e9es (RGPD), vous disposez d\u2019un droit d\u2019acc\u00e8s, de rectification et de suppression de vos donn\u00e9es personnelles. Responsable du traitement : <strong>COMPETENCES FIRST</strong>. Pour exercer ce droit, contactez-nous \u00e0 : <strong>rc.sitbon@gmail.com</strong></p>

      <h2>T\u00e9l\u00e9communications</h2>
      <p>Les services de t\u00e9l\u00e9phonie VoIP et SMS sont fournis via <strong>Twilio Inc.</strong> pour le compte de <strong>COMPETENCES FIRST</strong> (SIRET 893 531 954 00012), conform\u00e9ment aux r\u00e9glementations fran\u00e7aises et europ\u00e9ennes en mati\u00e8re de t\u00e9l\u00e9communications.</p>
    </div>

    <div class="footer-legal">
      <p>&copy; 2026 <strong>CALENDAR360.FR</strong></p>
    </div>
  </div>
</body>
</html>`);
  });

  // Page /competencesfirst — redirige vers mentions-legales (entreprise en cours de changement)
  app.get('/competencesfirst', (req, res) => {
    res.redirect(301, '/mentions-legales');
  });

  // ─── Server-rendered landing pages (HTML + Tailwind, no React) ───
  app.get('/page/:companySlug/:pageSlug', (req, res) => {
    try {
      const company = db.prepare('SELECT id, name, slug FROM companies WHERE slug = ?').get(req.params.companySlug);
      if (!company) return res.sendFile(join(distPath, 'index.html')); // fallback to SPA
      const page = db.prepare('SELECT * FROM pages WHERE companyId = ? AND slug = ? AND published = 1').get(company.id, req.params.pageSlug);
      if (!page) return res.sendFile(join(distPath, 'index.html')); // fallback to SPA

      let sections = [], settings = {}, seo = {};
      try { sections = JSON.parse(page.sections_json || '[]'); } catch {}
      try { settings = JSON.parse(page.settings_json || '{}'); } catch {}
      try { seo = JSON.parse(page.seo_json || '{}'); } catch {}

      let calendarSlug = null;
      if (page.calendarId) {
        const cal = db.prepare('SELECT slug FROM calendars WHERE id = ?').get(page.calendarId);
        if (cal) calendarSlug = cal.slug;
      }

      const html = renderLandingPage({
        id: page.id,
        name: page.name,
        slug: page.slug,
        sections,
        settings,
        seo,
        color: page.color,
        calendarSlug,
        companyName: company.name,
        companySlug: company.slug,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error('Landing page render error:', err);
      res.sendFile(join(distPath, 'index.html')); // fallback to SPA on error
    }
  });

  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.sendFile(join(distPath, 'index.html'));
  });
}

// ─── WebSocket Server for Twilio Media Streams ───
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import { createServer } from 'http';
import { startSession, connectDeepgram, sendAudio, endSession } from './services/liveTranscription.js';
import { startPeriodicAnalysis, stopPeriodicAnalysis } from './services/liveAnalysis.js';
import { buildAgentSystemPrompt, generateAgentResponse, textToSpeech, textToSpeechElevenLabs, pcmToMulaw, generateSessionSummary, scoreTraining, saveAgentSession } from './services/aiAgent.js';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  let callSid = null;
  let streamSid = null;

  console.log('\x1b[36m[MEDIA STREAM]\x1b[0m New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      switch (msg.event) {
        case 'connected':
          console.log('\x1b[36m[MEDIA STREAM]\x1b[0m Connected:', msg.protocol);
          break;

        case 'start':
          callSid = msg.start?.callSid;
          streamSid = msg.start?.streamSid;
          const customParams = msg.start?.customParameters || {};

          console.log(`\x1b[36m[MEDIA STREAM]\x1b[0m Stream started — CallSid: ${callSid}, Track: ${msg.start?.tracks}`);

          // SECURITE: valider customParameters via DB avant de demarrer la session
          const wsCtx = validateWebhookContext({ companyId: customParams.companyId, collaboratorId: customParams.collaboratorId });
          const safeCompanyId = wsCtx.companyId || customParams.companyId || '';
          const safeCollabId = wsCtx.collaboratorId || customParams.collaboratorId || '';
          if (!wsCtx.isValid) console.warn(`\x1b[31m[MEDIA STREAM SECURITY]\x1b[0m customParameters non valides — companyId:${customParams.companyId} collaboratorId:${customParams.collaboratorId}`);

          // Init transcription session avec contexte valide
          startSession(callSid, {
            collaboratorId: safeCollabId,
            companyId: safeCompanyId,
            contactId: customParams.contactId || '',
            direction: customParams.direction || 'outbound',
          });

          // Connect Deepgram
          connectDeepgram(callSid);

          // Start periodic GPT analysis (if AI copilot enabled)
          if (customParams.aiCopilotEnabled === 'true' || customParams.aiCopilotEnabled === '1') {
            startPeriodicAnalysis(callSid);
          }
          break;

        case 'media':
          if (callSid && msg.media?.payload) {
            sendAudio(callSid, msg.media.payload, msg.media.track);
          }
          break;

        case 'stop':
          console.log(`\x1b[33m[MEDIA STREAM]\x1b[0m Stream stopped — CallSid: ${callSid}`);
          if (callSid) {
            stopPeriodicAnalysis(callSid);
            const result = endSession(callSid);
            // Save transcript to DB — resolve local callLogId from Twilio CallSid
            if (result && result.segments.length > 0) {
              try {
                const id = 'ct_' + Date.now() + Math.random().toString(36).slice(2, 5);
                // Map Twilio CallSid → local call_logs.id for consistent retrieval
                const callLog = db.prepare('SELECT id FROM call_logs WHERE twilioCallSid = ?').get(callSid);
                if (!callLog) {
                  console.warn(`\x1b[33m[MEDIA STREAM]\x1b[0m SKIP transcript save — no call_logs for CallSid=${callSid} (D7 race, see D7-bis)`);
                  break;
                }
                const localCallLogId = callLog.id;
                db.prepare('INSERT INTO call_transcripts (id, callLogId, companyId, collaboratorId, segments_json, fullText, duration, createdAt) VALUES (?,?,?,?,?,?,?,?)')
                  .run(id, localCallLogId, result.companyId, result.collaboratorId, JSON.stringify(result.segments), result.fullTranscript, result.duration, new Date().toISOString());
                console.log(`\x1b[32m[MEDIA STREAM]\x1b[0m Transcript saved: ${id} → callLog: ${localCallLogId} (${result.segments.length} segments)`);
              } catch (e) { console.error('[MEDIA STREAM] DB save error:', e.message); }
            }
          }
          break;
      }
    } catch (err) {
      // Binary audio data or parse error — ignore
    }
  });

  ws.on('close', () => {
    console.log(`\x1b[33m[MEDIA STREAM]\x1b[0m WebSocket closed — CallSid: ${callSid || 'unknown'}`);
    if (callSid) {
      stopPeriodicAnalysis(callSid);
      endSession(callSid);
    }
  });

  ws.on('error', (err) => {
    console.error('\x1b[31m[MEDIA STREAM ERR]\x1b[0m', err.message);
  });
});

// ─── WebSocket Server for AI Agent Media Streams ───
// Sessions actives des agents IA : streamSid → session data
const agentSessions = new Map();

const agentWss = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades based on path
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => { wss.emit('connection', ws, request); });
  } else if (pathname === '/agent-media-stream') {
    agentWss.handleUpgrade(request, socket, head, (ws) => { agentWss.emit('connection', ws, request); });
  } else {
    socket.destroy();
  }
});

agentWss.on('connection', (ws) => {
  let callSid = null;
  let streamSid = null;
  let agentSession = null;

  console.log('\x1b[35m[AGENT STREAM]\x1b[0m Nouvelle connexion WebSocket');

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);

      switch (msg.event) {
        case 'connected':
          console.log('\x1b[35m[AGENT STREAM]\x1b[0m Connected:', msg.protocol);
          break;

        case 'start': {
          callSid = msg.start?.callSid;
          streamSid = msg.start?.streamSid;
          const params = msg.start?.customParameters || {};
          const agentId = params.agentId || '';

          console.log(`\x1b[35m[AGENT STREAM]\x1b[0m Stream demarree — CallSid: ${callSid}, AgentId: ${agentId}`);

          // Charger la config de l'agent
          const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(agentId);
          if (!agent) {
            console.error(`\x1b[31m[AGENT STREAM]\x1b[0m Agent ${agentId} introuvable`);
            break;
          }

          // Charger la base de connaissances et les produits de l'entreprise
          let knowledgeBase = '';
          let products = [];
          try {
            const kbRows = db.prepare('SELECT title, content FROM knowledge_base WHERE companyId = ? AND status = ?').all(agent.companyId, 'active');
            knowledgeBase = kbRows.map(r => `${r.title}:\n${r.content}`).join('\n\n');
          } catch { /* table peut ne pas exister */ }
          try {
            products = db.prepare('SELECT name, description, price FROM products WHERE companyId = ?').all(agent.companyId);
          } catch { /* table peut ne pas exister */ }

          // Construire le system prompt
          const systemPrompt = buildAgentSystemPrompt(agent, knowledgeBase, products);

          // Initialiser la session
          agentSession = {
            callSid,
            streamSid,
            agentId,
            agent,
            systemPrompt,
            conversationHistory: [],
            fullTranscript: '',
            startTime: Date.now(),
            deepgramConnection: null,
            _processing: false, // Verrou pour eviter les reponses simultanees
            _speaking: false, // true quand l'IA envoie de l'audio
            _interrupted: false, // true si l'utilisateur a coupe la parole
          };
          agentSessions.set(streamSid, agentSession);

          // Connecter Deepgram via WebSocket natif (plus fiable que le SDK)
          const dgKey = process.env.DEEPGRAM_API_KEY;
          if (dgKey) {
            try {
              const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${agent.language||'fr'}&smart_format=true&punctuate=true&interim_results=true&utterance_end_ms=3000&vad_events=true&encoding=mulaw&sample_rate=8000&channels=1&endpointing=800`;
              console.log(`\x1b[35m[AGENT STREAM]\x1b[0m Deepgram key length: ${dgKey?.length}, URL: ${dgUrl.substring(0,60)}...`);
              const dgWs = new WsClient(dgUrl, { headers: { 'Authorization': 'Token ' + dgKey } });

              dgWs.on('open', () => {
                console.log(`\x1b[32m[AGENT STREAM]\x1b[0m Deepgram connecte pour ${callSid}`);
              });

              // Buffer pour accumuler les segments avant de repondre
              let speechBuffer = '';
              let silenceTimer = null;
              const SILENCE_DELAY = 3500; // 3.5s de silence avant de repondre — laisser le temps de parler
              const MIN_WORDS_TO_RESPOND = 5; // Minimum 5 mots avant de considerer une reponse

              dgWs.on('message', async (rawData) => {
                try {
                  const data = JSON.parse(rawData.toString());

                  // Evenement UtteranceEnd = le locuteur a fini de parler
                  if (data.type === 'UtteranceEnd') {
                    const words = speechBuffer.trim().split(/\s+/).filter(w => w.length > 0);
                    if (speechBuffer.trim() && words.length >= MIN_WORDS_TO_RESPOND && !agentSession._processing && !agentSession._speaking) {
                      clearTimeout(silenceTimer);
                      const fullUtterance = speechBuffer.trim();
                      speechBuffer = '';
                      console.log(`\x1b[36m[AGENT]\x1b[0m UtteranceEnd — reponse avec ${words.length} mots`);
                      processUserSpeech(fullUtterance);
                    } else if (words.length < MIN_WORDS_TO_RESPOND && speechBuffer.trim()) {
                      console.log(`\x1b[33m[AGENT]\x1b[0m UtteranceEnd ignore — seulement ${words.length} mots, attente...`);
                    }
                    return;
                  }

                  const transcript = data.channel?.alternatives?.[0]?.transcript || '';
                  if (!transcript) return;

                  if (data.is_final) {
                    speechBuffer += ' ' + transcript;
                    console.log(`\x1b[36m[AGENT STT]\x1b[0m segment: "${transcript}"`);

                    // Si l'IA parlait, l'utilisateur l'interrompt — couper l'audio
                    if (agentSession._speaking) {
                      agentSession._interrupted = true;
                      agentSession._speaking = false;
                      // Envoyer un clear message pour couper l'audio en cours
                      if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ event: 'clear', streamSid }));
                      }
                      console.log(`\x1b[33m[AGENT]\x1b[0m Utilisateur interrompt — audio coupe`);
                    }

                    // Timer de silence — si pas de nouveau segment pendant SILENCE_DELAY, on repond
                    clearTimeout(silenceTimer);
                    silenceTimer = setTimeout(() => {
                      const words = speechBuffer.trim().split(/\s+/).filter(w => w.length > 0);
                      if (speechBuffer.trim() && words.length >= MIN_WORDS_TO_RESPOND && !agentSession._processing && !agentSession._speaking) {
                        const fullUtterance = speechBuffer.trim();
                        speechBuffer = '';
                        console.log(`\x1b[36m[AGENT]\x1b[0m Silence ${SILENCE_DELAY}ms — reponse avec ${words.length} mots`);
                        processUserSpeech(fullUtterance);
                      }
                    }, SILENCE_DELAY);
                  }
                } catch (e) { /* ignore non-JSON messages */ }
              });

              // Fonction pour traiter la parole complete de l'utilisateur
              async function processUserSpeech(userText) {
                if (!agentSession || agentSession._processing) return;
                agentSession._processing = true;

                console.log(`\x1b[36m[AGENT STT COMPLET]\x1b[0m "${userText}"`);

                try {
                  agentSession.conversationHistory.push({ role: 'user', content: userText });
                  agentSession.fullTranscript += `Interlocuteur: ${userText}\n`;

                  const gptResult = await generateAgentResponse(agentSession.conversationHistory, agentSession.systemPrompt);
                  if (!gptResult.success || !gptResult.text) {
                    agentSession._processing = false;
                    return;
                  }

                  const responseText = gptResult.text;
                  console.log(`\x1b[35m[AGENT GPT]\x1b[0m "${responseText.slice(0, 100)}..."`);

                  agentSession.conversationHistory.push({ role: 'assistant', content: responseText });
                  agentSession.fullTranscript += `Agent: ${responseText}\n`;

                  // Choisir le moteur TTS selon la config de l'agent
                  const ttsEngine = agent.ttsEngine || 'openai';
                  const ttsResult = ttsEngine === 'elevenlabs'
                    ? await textToSpeechElevenLabs(responseText, agent.voice || '21m00Tcm4TlvDq8ikWAM')
                    : await textToSpeech(responseText, agent.voice || 'alloy');
                  if (ttsResult.success && ttsResult.audio) {
                    agentSession._speaking = true;
                    agentSession._interrupted = false;
                    const mulawBuffer = pcmToMulaw(ttsResult.audio);
                    const chunkSize = 640;
                    for (let i = 0; i < mulawBuffer.length; i += chunkSize) {
                      // Si l'utilisateur interrompt, arreter d'envoyer l'audio
                      if (agentSession._interrupted || ws.readyState !== 1) break;
                      const chunk = mulawBuffer.slice(i, Math.min(i + chunkSize, mulawBuffer.length));
                      ws.send(JSON.stringify({
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: chunk.toString('base64') },
                      }));
                    }
                    agentSession._speaking = false;
                    console.log(`\x1b[32m[AGENT TTS]\x1b[0m Audio envoye (${mulawBuffer.length} bytes)${agentSession._interrupted ? ' [INTERROMPU]' : ''}`);
                  }
                } catch (err) {
                  console.error('\x1b[31m[AGENT STREAM]\x1b[0m Erreur traitement:', err.message);
                } finally {
                  agentSession._processing = false;
                }
              }

              dgWs.on('error', (err) => {
                console.error('\x1b[31m[AGENT DEEPGRAM ERR]\x1b[0m', err.message);
              });
              dgWs.on('unexpected-response', (req, res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => console.error(`\x1b[31m[AGENT DEEPGRAM REJECTED]\x1b[0m Status: ${res.statusCode}, Body: ${body}`));
              });

              dgWs.on('close', () => {
                console.log(`\x1b[33m[AGENT STREAM]\x1b[0m Deepgram ferme pour ${callSid}`);
              });

              agentSession.deepgramConnection = dgWs;
            } catch (dgErr) {
              console.error('\x1b[31m[AGENT DEEPGRAM INIT]\x1b[0m', dgErr.message);
            }
          }

          // Dire le greeting avec le TTS de l'agent (meme voix que les questions)
          const greeting = agent.greeting || 'Bonjour, comment puis-je vous aider ?';
          agentSession.conversationHistory.push({ role: 'assistant', content: greeting });
          agentSession.fullTranscript += `Agent: ${greeting}\n`;
          console.log(`\x1b[32m[AGENT STREAM]\x1b[0m Envoi du greeting via TTS...`);

          // Envoyer le greeting via le moteur TTS choisi
          (async () => {
            try {
              agentSession._speaking = true;
              const ttsEngine = agent.ttsEngine || 'openai';
              const ttsResult = ttsEngine === 'elevenlabs'
                ? await textToSpeechElevenLabs(greeting, agent.voice || '21m00Tcm4TlvDq8ikWAM')
                : await textToSpeech(greeting, agent.voice || 'alloy');
              if (ttsResult.success && ttsResult.audio && ws.readyState === 1) {
                // Convertir PCM → mulaw et envoyer par chunks (meme logique que les reponses)
                const mulawBuffer = pcmToMulaw(ttsResult.audio);
                const chunkSize = 640;
                for (let i = 0; i < mulawBuffer.length; i += chunkSize) {
                  if (ws.readyState !== 1) break;
                  const chunk = mulawBuffer.slice(i, i + chunkSize);
                  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: chunk.toString('base64') } }));
                }
                console.log(`\x1b[32m[AGENT STREAM]\x1b[0m Greeting envoye via ${ttsEngine} (${mulawBuffer.length} bytes mulaw)`);
                // Attendre la duree de l'audio avant de marquer fini (mulaw 8kHz = 8000 octets/sec)
                const audioDurationMs = Math.round(mulawBuffer.length / 8);
                setTimeout(() => { if (agentSession) agentSession._speaking = false; }, audioDurationMs);
              } else {
                agentSession._speaking = false;
                console.error('[AGENT GREETING]', ttsResult.error || 'No audio');
              }
            } catch (e) {
              console.error('[AGENT GREETING ERR]', e.message);
              agentSession._speaking = false;
            }
          })();

          break;
        }

        case 'media': {
          // Transmettre l'audio a Deepgram
          if (agentSession?.deepgramConnection && msg.media?.payload) {
            try {
              const audioBuffer = Buffer.from(msg.media.payload, 'base64');
              agentSession.deepgramConnection.send(audioBuffer);
            } catch { /* ignore si Deepgram pas pret */ }
          }
          break;
        }

        case 'stop': {
          console.log(`\x1b[33m[AGENT STREAM]\x1b[0m Stream arretee — CallSid: ${callSid}`);
          await finalizeAgentSession(agentSession, streamSid);
          break;
        }
      }
    } catch (err) {
      // Donnees audio binaires ou erreur de parsing — ignorer
    }
  });

  ws.on('close', async () => {
    console.log(`\x1b[33m[AGENT STREAM]\x1b[0m WebSocket ferme — CallSid: ${callSid || 'unknown'}`);
    await finalizeAgentSession(agentSession, streamSid);
  });

  ws.on('error', (err) => {
    console.error('\x1b[31m[AGENT STREAM ERR]\x1b[0m', err.message);
  });
});

/**
 * Finalise une session d'agent : ferme Deepgram, genere le resume, sauvegarde en DB
 */
async function finalizeAgentSession(session, sid) {
  if (!session || session._finalized) return;
  session._finalized = true;

  // Fermer Deepgram
  try { session.deepgramConnection?.close?.(); } catch {}

  const duration = Math.round((Date.now() - session.startTime) / 1000);

  // Generer le resume
  let summary = '';
  let score = {};
  try {
    if (session.fullTranscript.length > 20) {
      const summaryResult = await generateSessionSummary(session.agent, session.fullTranscript);
      if (summaryResult.success) summary = summaryResult.summary;

      // Score si agent de type training
      if (session.agent.category === 'training') {
        const scoreResult = await scoreTraining(session.agent, session.fullTranscript);
        if (scoreResult.success) score = scoreResult.score;
      }
    }
  } catch (err) {
    console.error('\x1b[31m[AGENT FINALIZE]\x1b[0m Erreur resume/score:', err.message);
  }

  // Sauvegarder en base
  saveAgentSession({
    agentId: session.agentId,
    companyId: session.agent.companyId,
    collaboratorId: '',
    callerPhone: '',
    callerName: '',
    callLogId: session.callSid || '',
    transcription: session.fullTranscript,
    summary,
    score,
    evaluation: '',
    duration,
    status: 'completed',
    recordingUrl: '',
  });

  // Nettoyer
  agentSessions.delete(sid);
}

server.listen(PORT, () => {
  console.log(`\n\x1b[34m╔══════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  Calendar360 Server                      \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  API + SQLite + Brevo + WebSocket        \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  http://localhost:${PORT}                   \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  ws://localhost:${PORT}/media-stream        \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  ws://localhost:${PORT}/agent-media-stream  \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m║\x1b[0m  ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}                             \x1b[34m║\x1b[0m`);
  console.log(`\x1b[34m╚══════════════════════════════════════════╝\x1b[0m\n`);
  // V5: Smart automations + scoring cron
  startSmartAutomations();
});
