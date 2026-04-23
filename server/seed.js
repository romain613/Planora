// ─── Calendar360 Database Seed ───────────────
// Run: node seed.js
// Injects demo data into SQLite

import './db/database.js';
import { db } from './db/database.js';

console.log('Seeding Calendar360 database...\n');

// Clear existing data
const tables = ['activity_logs', 'sms_transactions', 'sms_credits', 'settings', 'contacts', 'polls', 'routings', 'workflows', 'bookings', 'availabilities', 'calendars', 'collaborators', 'companies'];
for (const t of tables) {
  db.prepare(`DELETE FROM ${t}`).run();
}

// ─── COMPANIES ───
const companies = [
  { id: 'c1', name: 'Cabinet Dupont & Associés', slug: 'dupont-associes', domain: 'cabinet-dupont.fr', plan: 'pro', contactEmail: 'contact@cabinet-dupont.fr', active: 1, createdAt: '2025-11-15', collaboratorsCount: 4, calendarsCount: 4, bookingsCount: 10 },
  { id: 'c2', name: 'Clinique Saint-Louis', slug: 'clinique-saint-louis', domain: 'clinique-stlouis.fr', plan: 'pro', contactEmail: 'admin@clinique-stlouis.fr', active: 1, createdAt: '2026-01-10', collaboratorsCount: 8, calendarsCount: 6, bookingsCount: 47 },
  { id: 'c3', name: 'Studio Graphique Nantes', slug: 'studio-graphique', domain: 'studio-nantes.fr', plan: 'free', contactEmail: 'hello@studio-nantes.fr', active: 1, createdAt: '2026-02-20', collaboratorsCount: 2, calendarsCount: 1, bookingsCount: 5 },
  { id: 'c4', name: 'Agence Immobilière Provence', slug: 'immo-provence', domain: 'immo-provence.fr', plan: 'enterprise', contactEmail: 'contact@immo-provence.fr', active: 0, createdAt: '2025-09-01', collaboratorsCount: 12, calendarsCount: 10, bookingsCount: 234 },
  { id: 'c5', name: 'Coach Sportif Lyon', slug: 'coach-lyon', domain: 'coach-lyon.fr', plan: 'free', contactEmail: 'tom@coach-lyon.fr', active: 1, createdAt: '2026-03-01', collaboratorsCount: 1, calendarsCount: 2, bookingsCount: 3 },
];
const insCompany = db.prepare('INSERT INTO companies (id, name, slug, domain, plan, contactEmail, active, createdAt, collaboratorsCount, calendarsCount, bookingsCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const c of companies) insCompany.run(c.id, c.name, c.slug, c.domain, c.plan, c.contactEmail, c.active, c.createdAt, c.collaboratorsCount, c.calendarsCount, c.bookingsCount);
console.log(`  Companies: ${companies.length}`);

// ─── COLLABORATORS ───
const collabs = [
  { id: 'u1', companyId: 'c1', name: 'Marie Dupont', email: 'marie@cabinet-dupont.fr', role: 'admin', priority: 5, color: '#2563EB', code: 'MARE-5X2P', password: 'mdupont2026', phone: '+33612345678', maxWeek: 30, maxMonth: 100, slackId: '@marie' },
  { id: 'u2', companyId: 'c1', name: 'Lucas Martin', email: 'lucas@cabinet-dupont.fr', role: 'member', priority: 3, color: '#059669', code: 'LUCA-8K4R', password: 'lmartin2026', phone: '', maxWeek: 25, maxMonth: 80, slackId: '@lucas' },
  { id: 'u3', companyId: 'c1', name: 'Sophie Bernard', email: 'sophie@cabinet-dupont.fr', role: 'member', priority: 4, color: '#D97706', code: 'SOPH-3N7W', password: 'sbernard2026', phone: '+33698765432', maxWeek: 20, maxMonth: 70, slackId: '@sophie' },
  { id: 'u4', companyId: 'c1', name: 'Antoine Moreau', email: 'antoine@cabinet-dupont.fr', role: 'member', priority: 2, color: '#7C3AED', code: 'ANTO-6J9M', password: 'amoreau2026', phone: '', maxWeek: 20, maxMonth: 60, slackId: '' },
];
const insCollab = db.prepare('INSERT INTO collaborators (id, companyId, name, email, role, priority, color, code, password, phone, maxWeek, maxMonth, slackId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const c of collabs) insCollab.run(c.id, c.companyId, c.name, c.email, c.role, c.priority, c.color, c.code, c.password, c.phone, c.maxWeek, c.maxMonth, c.slackId);
console.log(`  Collaborators: ${collabs.length}`);

// ─── AVAILABILITIES ───
const defAvail = JSON.stringify({
  0: { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
  1: { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
  2: { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
  3: { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
  4: { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  5: { active: false, slots: [] },
  6: { active: false, slots: [] },
});
const insAvail = db.prepare('INSERT INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)');
for (const c of collabs) insAvail.run(c.id, defAvail);
console.log(`  Availabilities: ${collabs.length}`);

// ─── CALENDARS ───
const cals = [
  { id: 'cal1', companyId: 'c1', name: 'Consultation juridique', type: 'simple', duration: 60, durations: [60], color: '#2563EB', slug: 'consultation', location: 'Google Meet', price: 0, currency: 'EUR', bufferBefore: 0, bufferAfter: 15, minNotice: 120, maxPerDay: 8, maxAdvanceDays: 60, questions: [{id:'q1',label:'Objet de la consultation',type:'text',required:true}], requireApproval: 0, allowRecurring: 0, groupMax: 1, waitlistEnabled: 0, reconfirm: 1, reconfirmHours: 24, managed: 0, singleUse: 0, dependency: '', tags: ['juridique'], videoAuto: 1, assignMode: 'priority', collaborators: ['u1'] },
  { id: 'cal2', companyId: 'c1', name: 'Rendez-vous équipe', type: 'multi', duration: 30, durations: [30], color: '#059669', slug: 'rdv-equipe', location: 'Zoom', price: 0, currency: 'EUR', bufferBefore: 5, bufferAfter: 10, minNotice: 60, maxPerDay: 12, maxAdvanceDays: 30, questions: [], requireApproval: 0, allowRecurring: 0, groupMax: 1, waitlistEnabled: 1, reconfirm: 1, reconfirmHours: 12, managed: 1, singleUse: 0, dependency: '', tags: ['équipe'], videoAuto: 1, assignMode: 'priority', collaborators: ['u1','u2','u3','u4'] },
  { id: 'cal3', companyId: 'c1', name: 'Consultation rapide', type: 'multi', duration: 15, durations: [15, 30], color: '#D97706', slug: 'consultation-rapide', location: 'Téléphone', price: 25, currency: 'EUR', bufferBefore: 0, bufferAfter: 5, minNotice: 30, maxPerDay: 20, maxAdvanceDays: 14, questions: [{id:'q2',label:'Numéro de téléphone',type:'phone',required:true}], requireApproval: 1, allowRecurring: 1, groupMax: 1, waitlistEnabled: 0, reconfirm: 0, reconfirmHours: 0, managed: 0, singleUse: 0, dependency: '', tags: ['rapide','payant'], videoAuto: 0, assignMode: 'roundRobin', collaborators: ['u2','u3'] },
  { id: 'cal4', companyId: 'c1', name: 'Atelier groupe', type: 'multi', duration: 90, durations: [90], color: '#7C3AED', slug: 'atelier-groupe', location: '12 rue de la Paix, Paris', price: 50, currency: 'EUR', bufferBefore: 15, bufferAfter: 15, minNotice: 1440, maxPerDay: 2, maxAdvanceDays: 90, questions: [], requireApproval: 1, allowRecurring: 0, groupMax: 8, waitlistEnabled: 1, reconfirm: 1, reconfirmHours: 48, managed: 1, singleUse: 0, dependency: 'cal1', tags: ['atelier','groupe','payant'], videoAuto: 0, assignMode: 'priority', collaborators: ['u1','u3'] },
];
const insCal = db.prepare('INSERT INTO calendars (id, companyId, name, type, duration, durations_json, color, slug, location, price, currency, bufferBefore, bufferAfter, minNotice, maxPerDay, maxAdvanceDays, questions_json, requireApproval, allowRecurring, groupMax, waitlistEnabled, reconfirm, reconfirmHours, managed, singleUse, dependency, tags_json, videoAuto, assignMode, collaborators_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const c of cals) insCal.run(c.id, c.companyId, c.name, c.type, c.duration, JSON.stringify(c.durations), c.color, c.slug, c.location, c.price, c.currency, c.bufferBefore, c.bufferAfter, c.minNotice, c.maxPerDay, c.maxAdvanceDays, JSON.stringify(c.questions), c.requireApproval, c.allowRecurring, c.groupMax, c.waitlistEnabled, c.reconfirm, c.reconfirmHours, c.managed, c.singleUse, c.dependency, JSON.stringify(c.tags), c.videoAuto, c.assignMode, JSON.stringify(c.collaborators));
console.log(`  Calendars: ${cals.length}`);

// ─── BOOKINGS ───
const bookings = [
  { id: 'b1', calendarId: 'cal2', collaboratorId: 'u1', date: '2026-03-03', time: '10:00', duration: 30, visitorName: 'Paul Lefèvre', visitorEmail: 'paul@mail.com', visitorPhone: '+33612345678', status: 'confirmed', notes: '', noShow: 0, source: 'link', rating: null, tags: ['prospect'], checkedIn: 0, internalNotes: 'Client fidèle', reconfirmed: 1 },
  { id: 'b2', calendarId: 'cal2', collaboratorId: 'u3', date: '2026-03-03', time: '14:30', duration: 30, visitorName: 'Claire Roux', visitorEmail: 'claire@mail.com', visitorPhone: '', status: 'confirmed', notes: 'Rappeler le dossier', noShow: 0, source: 'embed', rating: 5, tags: ['VIP'], checkedIn: 1, internalNotes: '', reconfirmed: 1 },
  { id: 'b3', calendarId: 'cal1', collaboratorId: 'u1', date: '2026-03-04', time: '09:00', duration: 60, visitorName: 'Hugo Petit', visitorEmail: 'hugo@mail.com', visitorPhone: '+33698765432', status: 'confirmed', notes: '', noShow: 0, source: 'link', rating: 4, tags: [], checkedIn: 0, internalNotes: 'Dossier prioritaire', reconfirmed: 1 },
  { id: 'b4', calendarId: 'cal3', collaboratorId: 'u2', date: '2026-03-04', time: '15:00', duration: 15, visitorName: 'Léa Duval', visitorEmail: 'lea@mail.com', visitorPhone: '+33677889900', status: 'pending', notes: '', noShow: 0, source: 'routing', rating: null, tags: ['urgent'], checkedIn: 0, internalNotes: '', reconfirmed: 0 },
  { id: 'b5', calendarId: 'cal2', collaboratorId: 'u2', date: '2026-03-05', time: '11:00', duration: 30, visitorName: 'Marc Blanc', visitorEmail: 'marc@mail.com', visitorPhone: '+33655443322', status: 'confirmed', notes: '', noShow: 1, source: 'link', rating: null, tags: [], checkedIn: 0, internalNotes: 'Ne répond plus', reconfirmed: 1 },
  { id: 'b6', calendarId: 'cal2', collaboratorId: 'u1', date: '2026-03-05', time: '14:00', duration: 30, visitorName: 'Julie Fontaine', visitorEmail: 'julie@mail.com', visitorPhone: '', status: 'confirmed', notes: '', noShow: 0, source: 'link', rating: 3, tags: ['retour'], checkedIn: 1, internalNotes: '', reconfirmed: 1 },
  { id: 'b7', calendarId: 'cal1', collaboratorId: 'u1', date: '2026-03-05', time: '16:00', duration: 60, visitorName: 'Karim Bousaid', visitorEmail: 'karim@mail.com', visitorPhone: '+33611223344', status: 'pending', notes: 'Première consultation', noShow: 0, source: 'embed', rating: null, tags: ['prospect'], checkedIn: 0, internalNotes: '', reconfirmed: 0 },
  { id: 'b8', calendarId: 'cal4', collaboratorId: 'u1', date: '2026-03-06', time: '14:00', duration: 90, visitorName: 'Emma Laurent', visitorEmail: 'emma@mail.com', visitorPhone: '', status: 'confirmed', notes: 'Atelier créativité', noShow: 0, source: 'link', rating: 5, tags: ['VIP','groupe'], checkedIn: 0, internalNotes: 'Salle B', reconfirmed: 1 },
  { id: 'b9', calendarId: 'cal4', collaboratorId: 'u1', date: '2026-03-06', time: '14:00', duration: 90, visitorName: 'Thomas Girard', visitorEmail: 'thomas@mail.com', visitorPhone: '', status: 'confirmed', notes: '', noShow: 0, source: 'qr', rating: null, tags: ['groupe'], checkedIn: 0, internalNotes: '', reconfirmed: 1 },
  { id: 'b10', calendarId: 'cal3', collaboratorId: 'u3', date: '2026-03-06', time: '09:30', duration: 15, visitorName: 'Nadia Ferhat', visitorEmail: 'nadia@mail.com', visitorPhone: '+33699887766', status: 'confirmed', notes: '', noShow: 0, source: 'sms', rating: 4, tags: [], checkedIn: 1, internalNotes: '', reconfirmed: 1 },
];
const insBooking = db.prepare('INSERT INTO bookings (id, calendarId, collaboratorId, date, time, duration, visitorName, visitorEmail, visitorPhone, status, notes, noShow, source, rating, tags_json, checkedIn, internalNotes, reconfirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const b of bookings) insBooking.run(b.id, b.calendarId, b.collaboratorId, b.date, b.time, b.duration, b.visitorName, b.visitorEmail, b.visitorPhone, b.status, b.notes, b.noShow, b.source, b.rating, JSON.stringify(b.tags), b.checkedIn, b.internalNotes, b.reconfirmed);
console.log(`  Bookings: ${bookings.length}`);

// ─── WORKFLOWS ───
const workflows = [
  { id: 'w1', companyId: 'c1', name: 'Rappel 24h email', trigger_type: 'before', delay: -1440, action: 'email', template: 'Rappel : votre RDV demain à {{time}}', active: 1 },
  { id: 'w2', companyId: 'c1', name: 'Rappel 1h SMS', trigger_type: 'before', delay: -60, action: 'sms', template: 'RDV dans 1h — {{company}}', active: 1 },
  { id: 'w3', companyId: 'c1', name: 'Suivi post-RDV', trigger_type: 'after', delay: 60, action: 'email', template: 'Merci {{visitorName}} !', active: 1 },
  { id: 'w4', companyId: 'c1', name: 'Relance no-show', trigger_type: 'noshow', delay: 30, action: 'email', template: "Vous n'avez pas pu venir. Replanifier ?", active: 1 },
  { id: 'w5', companyId: 'c1', name: 'Enquête satisfaction', trigger_type: 'after', delay: 1440, action: 'email', template: 'Évaluez votre expérience', active: 1 },
  { id: 'w6', companyId: 'c1', name: 'Reconfirmation 24h', trigger_type: 'reconfirm', delay: -1440, action: 'email', template: 'Confirmez-vous votre RDV ? [Oui] [Non]', active: 1 },
  { id: 'w7', companyId: 'c1', name: 'Notification Slack', trigger_type: 'new_booking', delay: 0, action: 'slack', template: 'Nouveau RDV : {{visitorName}} — {{calendar}}', active: 1 },
  { id: 'w8', companyId: 'c1', name: 'Webhook Zapier', trigger_type: 'new_booking', delay: 0, action: 'webhook', template: 'POST /webhooks/booking', active: 0 },
];
const insWf = db.prepare('INSERT INTO workflows (id, companyId, name, trigger_type, delay, action, template, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const w of workflows) insWf.run(w.id, w.companyId, w.name, w.trigger_type, w.delay, w.action, w.template, w.active);
console.log(`  Workflows: ${workflows.length}`);

// ─── ROUTING ───
const routing = { id: 'rf1', companyId: 'c1', name: 'Orientation visiteur', fields: [{id:'f1',label:'Type de besoin',type:'select',options:['Consultation juridique','Question rapide','Atelier groupe']},{id:'f2',label:'Urgence',type:'select',options:['Normal','Urgent']}], rules: [{condition:{field:'f1',value:'Consultation juridique'},redirectTo:'cal1'},{condition:{field:'f1',value:'Question rapide'},redirectTo:'cal3'},{condition:{field:'f1',value:'Atelier groupe'},redirectTo:'cal4'},{condition:{field:'f2',value:'Urgent'},override:{minNotice:15}}], active: 1 };
db.prepare('INSERT INTO routings (id, companyId, name, fields_json, rules_json, active) VALUES (?, ?, ?, ?, ?, ?)').run(routing.id, routing.companyId, routing.name, JSON.stringify(routing.fields), JSON.stringify(routing.rules), routing.active);
console.log(`  Routings: 1`);

// ─── POLLS ───
db.prepare('INSERT INTO polls (id, companyId, title, creator, options_json, votes_json, status, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('p1', 'c1', 'Réunion stratégie Q2', 'u1', JSON.stringify(['2026-03-10 10:00','2026-03-10 14:00','2026-03-11 09:00']), '{}', 'open', '2026-03-08');
console.log(`  Polls: 1`);

// ─── CONTACTS ───
const contacts = [
  { id: 'ct1', companyId: 'c1', name: 'Paul Lefèvre', email: 'paul@mail.com', phone: '+33612345678', totalBookings: 3, lastVisit: '2026-03-03', tags: ['prospect'], notes: 'Intéressé droit commercial', rating: null, docs: [] },
  { id: 'ct2', companyId: 'c1', name: 'Claire Roux', email: 'claire@mail.com', phone: '', totalBookings: 7, lastVisit: '2026-03-03', tags: ['VIP'], notes: 'Cliente fidèle', rating: 5, docs: ['contrat.pdf'] },
  { id: 'ct3', companyId: 'c1', name: 'Hugo Petit', email: 'hugo@mail.com', phone: '+33698765432', totalBookings: 1, lastVisit: '2026-03-04', tags: [], notes: '', rating: 4, docs: [] },
  { id: 'ct4', companyId: 'c1', name: 'Nadia Ferhat', email: 'nadia@mail.com', phone: '+33699887766', totalBookings: 2, lastVisit: '2026-03-06', tags: [], notes: 'Consultation rapide régulière', rating: 4, docs: [] },
];
const insCt = db.prepare('INSERT INTO contacts (id, companyId, name, email, phone, totalBookings, lastVisit, tags_json, notes, rating, docs_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const c of contacts) insCt.run(c.id, c.companyId, c.name, c.email, c.phone, c.totalBookings, c.lastVisit, JSON.stringify(c.tags), c.notes, c.rating, JSON.stringify(c.docs));
console.log(`  Contacts: ${contacts.length}`);

// ─── SETTINGS ───
db.prepare('INSERT INTO settings (companyId, blackoutDates_json, vacations_json, timezone, language, cancelPolicy, customDomain, brandColor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run('c1', JSON.stringify(['2026-05-01','2026-12-25','2026-07-14']), '[]', 'Europe/Paris', 'fr', "Annulation gratuite jusqu'à 24h avant.", '', '#2563EB');
console.log(`  Settings: 1`);

// ─── SMS CREDITS ───
db.prepare('INSERT INTO sms_credits (companyId, credits) VALUES (?, ?)').run('c1', 142);
console.log(`  SMS credits: 142`);

// ─── SMS TRANSACTIONS ───
const smsTxs = [
  { id: 'stx1', companyId: 'c1', date: '2026-02-15', type: 'recharge', count: 200, detail: 'Pack 200 SMS', amount: 16 },
  { id: 'stx2', companyId: 'c1', date: '2026-02-20', type: 'sent', count: -12, detail: 'Rappels automatiques', amount: 0 },
  { id: 'stx3', companyId: 'c1', date: '2026-02-28', type: 'sent', count: -23, detail: 'Confirmations RDV', amount: 0 },
  { id: 'stx4', companyId: 'c1', date: '2026-03-01', type: 'sent', count: -15, detail: 'Rappels + confirmations', amount: 0 },
  { id: 'stx5', companyId: 'c1', date: '2026-03-03', type: 'sent', count: -8, detail: 'Rappels journaliers', amount: 0 },
];
const insSmsTx = db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)');
for (const t of smsTxs) insSmsTx.run(t.id, t.companyId, t.date, t.type, t.count, t.detail, t.amount);
console.log(`  SMS transactions: ${smsTxs.length}`);

// ─── ACTIVITY LOG ───
const logs = [
  { id: 'a1', companyId: 'c1', companyName: 'Cabinet Dupont', action: 'booking_created', detail: 'Paul Lefèvre — Consultation juridique', timestamp: '2026-03-04 09:15', user: 'Marie Dupont' },
  { id: 'a2', companyId: 'c2', companyName: 'Clinique Saint-Louis', action: 'collab_added', detail: 'Nouveau collaborateur: Dr. Vidal', timestamp: '2026-03-04 08:30', user: 'Dr. Isabelle Morel' },
  { id: 'a3', companyId: 'c1', companyName: 'Cabinet Dupont', action: 'calendar_created', detail: 'Nouveau calendrier: Médiation', timestamp: '2026-03-03 17:45', user: 'Marie Dupont' },
  { id: 'a4', companyId: 'c3', companyName: 'Studio Nantes', action: 'booking_cancelled', detail: 'Annulation: Projet branding', timestamp: '2026-03-03 14:20', user: 'Camille Fournier' },
  { id: 'a5', companyId: 'c4', companyName: 'Agence Immo', action: 'plan_changed', detail: 'Pro → Enterprise', timestamp: '2026-03-02 11:00', user: 'Système' },
  { id: 'a6', companyId: 'c2', companyName: 'Clinique Saint-Louis', action: 'booking_created', detail: 'Consultation Dr. Morel — Pierre Durand', timestamp: '2026-03-02 09:40', user: 'Dr. Isabelle Morel' },
  { id: 'a7', companyId: 'c1', companyName: 'Cabinet Dupont', action: 'no_show', detail: 'No-show: Marc Blanc', timestamp: '2026-03-01 11:30', user: 'Système' },
  { id: 'a8', companyId: 'c5', companyName: 'Coach Lyon', action: 'account_created', detail: 'Nouveau compte créé', timestamp: '2026-03-01 10:00', user: 'Super Admin' },
];
const insLog = db.prepare('INSERT INTO activity_logs (id, companyId, companyName, action, detail, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)');
for (const l of logs) insLog.run(l.id, l.companyId, l.companyName, l.action, l.detail, l.timestamp, l.user);
console.log(`  Activity logs: ${logs.length}`);

console.log('\nSeed complete! Database ready.');
