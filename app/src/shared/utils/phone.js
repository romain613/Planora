// Phone number formatting + matching helpers
// V1.10.2 — élargi pour SMS Hub → CRM conversion (normalisation E.164 unique +
// matching cross-collab : assignedTo OR sharedWithId OR shared_with_json)

// ── REGLE: Format téléphone FR — tout numéro 9 chiffres → +33 devant, PARTOUT ──
export const formatPhoneFR = (phone) => {
  if (!phone) return '';
  const p = String(phone).trim().replace(/\s/g, '');
  // 9 chiffres (sans le 0 initial) → +33XXXXXXXXX
  if (/^\d{9}$/.test(p)) return '+33' + p;
  // 0X XX XX XX XX → +33XXXXXXXXX
  if (/^0\d{9}$/.test(p)) return '+33' + p.slice(1);
  // Déjà +33 ou autre format international → garder
  return p;
};

// V1.10.2 — Normalisation E.164 robuste (alias formatPhoneFR + cleanup séparateurs).
// Convertit "06 12 34 56 78", "+33612345678", "33612345678", "(06) 12.34.56.78"
// → "+33612345678" (E.164). Source de vérité unique pour matching/dedup.
export const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  // Strip tout sauf chiffres et le +
  let clean = String(phone).replace(/[^\d+]/g, '');
  if (!clean) return '';
  // 0X XX XX XX XX → +33XXXXXXXXX
  if (/^0\d{9}$/.test(clean)) return '+33' + clean.slice(1);
  // 9 chiffres mobiles/fixes (sans le 0) → +33XXXXXXXXX
  if (/^\d{9}$/.test(clean)) return '+33' + clean;
  // 33XXXXXXXXX (sans +) → +33XXXXXXXXX
  if (/^33\d{9}$/.test(clean)) return '+' + clean;
  // Déjà E.164 ou format international étranger → garder tel quel
  return clean;
};

// V1.10.2 — Clé de matching robuste : 9 derniers chiffres normalisés.
// Utilisée pour comparer 2 numéros indépendamment du format de stockage.
export const phoneMatchKey = (phone) => {
  if (!phone) return '';
  const clean = String(phone).replace(/[^\d]/g, '');
  return clean.slice(-9);
};

// V1.10.2 — Matching contact ↔ téléphone avec scope strict cross-collab.
// Retourne le contact qui matche `phone` ET qui est accessible au `collabId` :
//   - assignedTo === collabId
//   - OR sharedWithId === collabId
//   - OR shared_with_json contient { id: collabId }
// Si admin/supra → pas de filtre scope (voit tout).
//
// `contacts` : liste des contacts en mémoire (any companyId)
// `phone` : numéro à matcher (n'importe quel format)
// `opts.collabId` : id du collab connecté (scope)
// `opts.companyId` : pour cantonner à la bonne entreprise
// `opts.isAdmin` : si true → désactive scope cross-collab
export const matchContactByPhone = (contacts, phone, opts = {}) => {
  const target = phoneMatchKey(phone);
  if (!target || target.length < 9) return null;
  const { collabId, companyId, isAdmin = false } = opts;
  const list = Array.isArray(contacts) ? contacts : [];

  for (const c of list) {
    if (companyId && c.companyId && c.companyId !== companyId) continue;
    // Match phone (champ principal `phone` + fallback `mobile`)
    const k1 = phoneMatchKey(c.phone);
    const k2 = phoneMatchKey(c.mobile);
    if (k1 !== target && k2 !== target) continue;

    // Si admin/supra ou pas de scope demandé → match direct
    if (isAdmin || !collabId) return c;

    // Scope cross-collab : owner OR executor OR shared
    if (c.assignedTo === collabId) return c;
    if (c.executorCollaboratorId === collabId) return c;
    if (c.ownerCollaboratorId === collabId) return c;
    if (c.sharedWithId === collabId) return c;
    // shared_with_json peut être array ou JSON-string
    const sw = c.shared_with_json || c.shared_with || c.sharedWith;
    if (sw) {
      try {
        const arr = typeof sw === 'string' ? JSON.parse(sw) : sw;
        if (Array.isArray(arr) && arr.some(x => x === collabId || x?.id === collabId || x?.collaboratorId === collabId)) {
          return c;
        }
      } catch { /* swallow */ }
    }
  }
  return null;
};

// Affichage lisible : +33612345678 → 06 12 34 56 78
export const displayPhone = (phone) => {
  const p = formatPhoneFR(phone);
  if (!p) return '';
  // +33 → 0 + espaces
  if (p.startsWith('+33') && p.length === 12) {
    const n = '0' + p.slice(3);
    return n.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  return p;
};
