// contactMergeHandlers — V1.13.2.b
// Handlers purs pour la fusion de 2 fiches contact existantes (CRM tab).
// Aucun state React local — tous les setters/notifs sont passés en arguments.
// Backend correspondant : POST /api/data/contacts/:primaryId/merge (V1.13.2.a, devenu actif V1.13.2.b).
//
// Garanties Q1-Q11 (validations MH 2026-05-03) :
//   - Q3 : sélection secondary par autocomplete sur contacts state local
//   - Q4 : preview cascade via GET /:id/delete-preview du secondary
//   - Q5 : confirm 'CONFIRM_MERGE' obligatoire backend (le UI exige saisie 'FUSIONNER')
//   - Q7 : primary archivé refusé backend (409 PRIMARY_ARCHIVED)
//   - Q8 : pipeline_stage primary inchangé (backend n'écrit que notes)
//   - Q10 : window event 'crmContactMerged' broadcast pour sync cross-tabs
//   - Q11 : 1 secondary -> 1 primary uniquement (pas de multi-merge V1.13.2.b)

import { api } from "../../../shared/services/api";

const stripAccents = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// Q3 — Trouve les contacts fusionables avec le primary :
//   - même company (filter implicite : on ne reçoit que contacts du collab)
//   - != primary
//   - non archivés (Q6 autorisé en backend si user choisit secondary archivé,
//     mais le sélecteur par défaut filtre les actifs ; admin peut élargir)
//   - matchScore > 0 sur (email exact / phone exact / nom partial)
// query : string saisie utilisateur dans l'autocomplete
export const filterMergeablePeers = (contacts, primary, query, opts = {}) => {
  const { includeArchived = false, limit = 8 } = opts;
  if (!primary?.id || !Array.isArray(contacts)) return [];
  const q = stripAccents(query).trim();
  const list = contacts.filter(c => {
    if (!c?.id || c.id === primary.id) return false;
    const isArchived = !!(c.archivedAt && c.archivedAt !== '');
    if (isArchived && !includeArchived) return false;
    return true;
  });
  if (!q) return list.slice(0, limit);
  return list
    .map(c => {
      const name = stripAccents(c.name || '');
      const email = stripAccents(c.email || '');
      const phone = stripAccents(c.phone || '');
      let score = 0;
      if (email && email === q) score = 100;
      else if (phone && phone === q) score = 95;
      else if (name && name.includes(q)) score = 60 - Math.min(40, name.indexOf(q));
      else if (email && email.includes(q)) score = 40;
      else if (phone && phone.includes(q)) score = 30;
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.c);
};

// Q4 — Récupère le preview cascade du secondary via /delete-preview existant V1.12.7.
// linkedCounts indique combien de bookings/calls/sms/etc seront RATTACHÉS au primary
// (pas supprimés ; le merge fait UPDATE, pas DELETE — sauf state tables Q7).
export const fetchMergePreview = async (secondaryId) => {
  if (!secondaryId) return null;
  try {
    const r = await api('/api/data/contacts/' + secondaryId + '/delete-preview');
    if (r?.error) return { error: r.error };
    return {
      linkedCounts: r?.linkedCounts || {},
      contactName: r?.contactName || '',
      archivedAt: r?.archivedAt || '',
    };
  } catch (err) {
    return { error: err?.message || 'NETWORK_ERROR' };
  }
};

// Exécute le merge backend. Côté UI, l'appelant doit avoir confirmé saisie "FUSIONNER" exact (Q5).
// Le body inclut `confirm: 'CONFIRM_MERGE'` (verrou backend distinct du UI).
// En cas de succès :
//   - emit window event 'crmContactMerged' { primaryId, secondaryId, cascadeCounts }
//   - retourne { success, action: 'merged', cascadeCounts }
// En cas d'erreur, retourne { error, message } pour que l'appelant affiche le toast adapté.
export const executeMergeRequest = async (primaryId, secondaryId) => {
  if (!primaryId || !secondaryId) return { error: 'INVALID_IDS' };
  if (primaryId === secondaryId) return { error: 'SAME_CONTACT' };
  try {
    const r = await api('/api/data/contacts/' + primaryId + '/merge', {
      method: 'POST',
      body: { secondaryId, confirm: 'CONFIRM_MERGE' },
    });
    if (r?.success && r?.action === 'merged') {
      try {
        window.dispatchEvent(new CustomEvent('crmContactMerged', {
          detail: { primaryId: r.primaryId, secondaryId: r.secondaryId, cascadeCounts: r.cascadeCounts || {} }
        }));
      } catch {}
      return { success: true, cascadeCounts: r.cascadeCounts || {} };
    }
    return {
      error: r?.error || 'UNKNOWN',
      message: r?.message || '',
    };
  } catch (err) {
    return { error: 'NETWORK_ERROR', message: err?.message || '' };
  }
};

// Helper UI : convertit un code d'erreur backend en message FR clair.
export const mapMergeError = (errCode, fallbackMsg) => {
  switch (errCode) {
    case 'SECONDARY_ID_REQUIRED': return "ID secondaire manquant";
    case 'CONFIRMATION_REQUIRED': return "Confirmation backend manquante (CONFIRM_MERGE)";
    case 'SAME_CONTACT':          return "Impossible de fusionner une fiche avec elle-même";
    case 'PRIMARY_NOT_FOUND':     return "Fiche principale introuvable";
    case 'SECONDARY_NOT_FOUND':   return "Fiche secondaire introuvable";
    case 'PRIMARY_ARCHIVED':      return "La fiche principale est archivée — restaurez-la avant de fusionner";
    case 'CROSS_COMPANY_MERGE_FORBIDDEN': return "Fusion entre companies différentes interdite";
    case 'PERMISSION_DENIED':     return "Permission insuffisante (admin OU owner/shared sur les 2 fiches requis)";
    case 'NETWORK_ERROR':         return "Erreur réseau : " + (fallbackMsg || '');
    default:                      return fallbackMsg || ("Erreur fusion : " + (errCode || 'inconnue'));
  }
};
