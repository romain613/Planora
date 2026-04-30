/**
 * V5.2 Next Best Action Engine
 *
 * Scanne les contacts assignes a un collaborateur et identifie les actions prioritaires.
 * Max 5 urgentes (P1-P2) + 10 total.
 * Tri : priorite → lead_score DESC → date ASC
 *
 * V2 : raisons contextualisees avec dates reelles + suggestions horaires
 *
 * 7 TYPES :
 *   NOUVEAU_LEAD       (P1) — lead assigne non traite
 *   RELANCER_NRP       (P2) — relance NRP en retard
 *   QUALIFIER_POST_RDV (P2) — RDV passe sans qualification
 *   FOLLOWUP_IA        (P3) — action recommandee par IA post-appel
 *   CLOSER_QUALIFIE    (P3) — qualifie depuis > 5j sans progression
 *   RELANCER_DEVIS     (P4) — devis envoye, pas signe
 *   RAPPELER_INACTIF   (P5) — contact inactif > 7j
 */

import { db } from '../db/database.js';

// Helper : date lisible FR
function dateFR(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

// Helper : derniere interaction humaine d'un contact
function getLastHumanAction(contactId) {
  const lastCall = db.prepare('SELECT createdAt, status, duration FROM call_logs WHERE contactId = ? AND is_valid_call = 1 ORDER BY createdAt DESC LIMIT 1').get(contactId);
  const lastSms = db.prepare('SELECT createdAt, direction FROM sms_messages WHERE contactId = ? ORDER BY createdAt DESC LIMIT 1').get(contactId);
  const dates = [lastCall?.createdAt, lastSms?.createdAt].filter(Boolean);
  const latest = dates.sort().reverse()[0] || null;
  const hoursAgo = latest ? Math.max(0, (Date.now() - new Date(latest).getTime()) / 3600000) : null;
  return { lastCall, lastSms, latest, hoursAgo, dateFR: dateFR(latest) };
}

// Helper : suggestion horaire
function suggestTime() {
  const h = new Date().getHours();
  if (h < 10) return 'ce matin avant 12h';
  if (h < 14) return 'cet apres-midi';
  if (h < 17) return 'avant 18h aujourd\'hui';
  return 'demain matin';
}

export function computeNextActions(collaboratorId, companyId) {
  if (!collaboratorId || !companyId) return [];

  const actions = [];
  const now = new Date();
  const nowISO = now.toISOString();
  const timeHint = suggestTime();

  // ─── 1. NOUVEAU_LEAD (P1) ───
  try {
    const newLeads = db.prepare(
      "SELECT id, first_name, last_name, phone, email, created_at FROM incoming_leads WHERE companyId = ? AND assigned_to = ? AND status = 'assigned' ORDER BY created_at ASC LIMIT 5"
    ).all(companyId, collaboratorId);
    for (const lead of newLeads) {
      const hAgo = Math.max(0, (Date.now() - new Date(lead.created_at).getTime()) / 3600000);
      const urgency = hAgo < 1 ? 'Vient d\'arriver' : hAgo < 4 ? 'Depuis ' + Math.round(hAgo) + 'h' : 'Depuis ' + Math.round(hAgo / 24) + 'j';
      actions.push({
        type: 'NOUVEAU_LEAD', priority: 1, leadId: lead.id,
        contactName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Nouveau lead',
        phone: lead.phone || '', email: lead.email || '',
        reason: urgency + ' — premier contact a faire',
        suggestedAction: 'Appeler ' + timeHint,
        dueDate: lead.created_at, leadScore: 100
      });
    }
  } catch {}

  // ─── 2. RELANCER_NRP (P2) ───
  try {
    const nrpContacts = db.prepare(
      "SELECT id, name, phone, email, nrp_next_relance, lead_score FROM contacts WHERE companyId = ? AND assignedTo = ? AND pipeline_stage = 'nrp' AND nrp_next_relance != '' AND nrp_next_relance <= ? AND (archivedAt IS NULL OR archivedAt = '') ORDER BY nrp_next_relance ASC LIMIT 5"
    ).all(companyId, collaboratorId, nowISO);
    for (const ct of nrpContacts) {
      const lha = getLastHumanAction(ct.id);
      const context = lha.dateFR ? 'Dernier contact le ' + lha.dateFR : 'Jamais contacte';
      let nrpCount = 0;
      try { nrpCount = JSON.parse(ct.nrp_followups_json || '[]').length; } catch {}
      actions.push({
        type: 'RELANCER_NRP', priority: 2, contactId: ct.id,
        contactName: ct.name || 'Contact', phone: ct.phone || '', email: ct.email || '',
        reason: context + (nrpCount > 0 ? ' — ' + nrpCount + ' relance' + (nrpCount > 1 ? 's' : '') + ' deja faite' + (nrpCount > 1 ? 's' : '') : ''),
        suggestedAction: nrpCount >= 3 ? 'Tenter SMS si tel echoue' : 'Rappeler ' + timeHint,
        dueDate: ct.nrp_next_relance, leadScore: ct.lead_score || 0
      });
    }
  } catch {}

  // ─── 3. QUALIFIER_POST_RDV (P2) ───
  try {
    const yesterday = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10);
    const rdvContacts = db.prepare(
      "SELECT id, name, phone, email, next_rdv_date, lead_score FROM contacts WHERE companyId = ? AND assignedTo = ? AND pipeline_stage = 'rdv_programme' AND next_rdv_date != '' AND next_rdv_date < ? AND (archivedAt IS NULL OR archivedAt = '') ORDER BY next_rdv_date ASC LIMIT 5"
    ).all(companyId, collaboratorId, yesterday);
    for (const ct of rdvContacts) {
      const rdvDate = dateFR(ct.next_rdv_date);
      const daysPost = Math.max(1, Math.floor((Date.now() - new Date(ct.next_rdv_date).getTime()) / 86400000));
      actions.push({
        type: 'QUALIFIER_POST_RDV', priority: 2, contactId: ct.id,
        contactName: ct.name || 'Contact', phone: ct.phone || '', email: ct.email || '',
        reason: 'RDV du ' + rdvDate + ' passe depuis ' + daysPost + 'j — resultat a saisir',
        suggestedAction: 'Qualifier ' + timeHint,
        dueDate: ct.next_rdv_date, leadScore: ct.lead_score || 0
      });
    }
  } catch {}

  // ─── 4. FOLLOWUP_IA (P3) ───
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const analyses = db.prepare(
      "SELECT a.contactId, a.actionItems_json, a.followupType, a.followupDate, a.summary, c.name, c.phone, c.email, c.lead_score FROM ai_copilot_analyses a JOIN contacts c ON c.id = a.contactId WHERE a.companyId = ? AND a.collaboratorId = ? AND a.createdAt > ? AND a.followupType IS NOT NULL AND a.followupType != '' AND (c.archivedAt IS NULL OR c.archivedAt = '') ORDER BY a.createdAt DESC LIMIT 5"
    ).all(companyId, collaboratorId, sevenDaysAgo);
    for (const a of analyses) {
      if (actions.some(x => x.contactId === a.contactId)) continue;
      const actionLabel = a.followupType === 'call' ? 'Rappeler' : a.followupType === 'email' ? 'Envoyer email' : a.followupType === 'sms' ? 'Envoyer SMS' : 'Suivre';
      const summary = a.summary ? ' — "' + (a.summary.length > 40 ? a.summary.slice(0, 40) + '...' : a.summary) + '"' : '';
      actions.push({
        type: 'FOLLOWUP_IA', priority: 3, contactId: a.contactId,
        contactName: a.name || 'Contact', phone: a.phone || '', email: a.email || '',
        reason: 'IA recommande : ' + actionLabel.toLowerCase() + summary,
        suggestedAction: actionLabel + ' ' + timeHint,
        dueDate: a.followupDate || '', leadScore: a.lead_score || 0
      });
    }
  } catch {}

  // ─── 5. CLOSER_QUALIFIE (P3) ───
  try {
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000).toISOString();
    const qualContacts = db.prepare(
      "SELECT id, name, phone, email, updatedAt, lead_score FROM contacts WHERE companyId = ? AND assignedTo = ? AND pipeline_stage = 'qualifie' AND updatedAt < ? AND updatedAt != '' AND (archivedAt IS NULL OR archivedAt = '') ORDER BY lead_score DESC LIMIT 5"
    ).all(companyId, collaboratorId, fiveDaysAgo);
    for (const ct of qualContacts) {
      if (actions.some(x => x.contactId === ct.id)) continue;
      const lha = getLastHumanAction(ct.id);
      const dSince = Math.floor((Date.now() - new Date(ct.updatedAt).getTime()) / 86400000);
      actions.push({
        type: 'CLOSER_QUALIFIE', priority: 3, contactId: ct.id,
        contactName: ct.name || 'Contact', phone: ct.phone || '', email: ct.email || '',
        reason: 'Qualifie depuis ' + dSince + 'j sans progression' + (lha.dateFR ? ' — dernier contact ' + lha.dateFR : ''),
        suggestedAction: 'Proposer RDV ou devis ' + timeHint,
        dueDate: ct.updatedAt, leadScore: ct.lead_score || 0
      });
    }
  } catch {}

  // ─── 6. RELANCER_DEVIS (P4) ───
  try {
    const devisContacts = db.prepare(
      "SELECT id, name, phone, email, contract_amount, lead_score, updatedAt FROM contacts WHERE companyId = ? AND assignedTo = ? AND contract_amount > 0 AND contract_signed = 0 AND pipeline_stage NOT IN ('perdu', 'client_valide') AND (archivedAt IS NULL OR archivedAt = '') ORDER BY contract_amount DESC LIMIT 5"
    ).all(companyId, collaboratorId);
    for (const ct of devisContacts) {
      if (actions.some(x => x.contactId === ct.id)) continue;
      const dSince = ct.updatedAt ? Math.floor((Date.now() - new Date(ct.updatedAt).getTime()) / 86400000) : 0;
      actions.push({
        type: 'RELANCER_DEVIS', priority: 4, contactId: ct.id,
        contactName: ct.name || 'Contact', phone: ct.phone || '', email: ct.email || '',
        reason: 'Devis ' + ct.contract_amount + '€ en attente' + (dSince > 3 ? ' depuis ' + dSince + 'j' : ''),
        suggestedAction: 'Relancer pour signature ' + timeHint,
        dueDate: ct.updatedAt || '', leadScore: ct.lead_score || 0
      });
    }
  } catch {}

  // ─── 7. RAPPELER_INACTIF (P5) ───
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const inactifs = db.prepare(
      "SELECT id, name, phone, email, updatedAt, lead_score FROM contacts WHERE companyId = ? AND assignedTo = ? AND pipeline_stage IN ('contacte', 'qualifie') AND updatedAt < ? AND updatedAt != '' AND (archivedAt IS NULL OR archivedAt = '') ORDER BY lead_score DESC LIMIT 5"
    ).all(companyId, collaboratorId, sevenDaysAgo);
    for (const ct of inactifs) {
      if (actions.some(a => a.contactId === ct.id)) continue;
      const lha = getLastHumanAction(ct.id);
      const dSince = Math.floor((Date.now() - new Date(ct.updatedAt).getTime()) / 86400000);
      actions.push({
        type: 'RAPPELER_INACTIF', priority: 5, contactId: ct.id,
        contactName: ct.name || 'Contact', phone: ct.phone || '', email: ct.email || '',
        reason: 'Aucune action depuis ' + dSince + 'j' + (lha.dateFR ? ' — dernier echange ' + lha.dateFR : ''),
        suggestedAction: 'Reprendre contact ' + timeHint,
        dueDate: ct.updatedAt, leadScore: ct.lead_score || 0
      });
    }
  } catch {}

  // ─── TRI : priorite → leadScore DESC → dueDate ASC ───
  actions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if ((b.leadScore || 0) !== (a.leadScore || 0)) return (b.leadScore || 0) - (a.leadScore || 0);
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });

  // ─── LIMITES : max 5 urgentes (P1-P2), max 10 total ───
  const urgentes = actions.filter(a => a.priority <= 2).slice(0, 5);
  const normales = actions.filter(a => a.priority > 2).slice(0, 10 - urgentes.length);

  return [...urgentes, ...normales];
}
