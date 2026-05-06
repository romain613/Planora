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

/**
 * Mask V2.1 — Format compact MH "préfixe + XXXX + 4 derniers chiffres".
 * Idempotent : applique le masking sur n'importe quel input (clair ou déjà masqué backend).
 *
 *   "0601346876"            → "06XXXX6876"
 *   "+33601346876"          → "+336XXXX6876"
 *   "0621513087"            → "06XXXX3087"
 *   "+33621513087"          → "+336XXXX3087"
 *   "+33 6 XX XX 68 76"     → "+336XXXX6876" (déjà masqué backend → strip espaces)
 *   "06 XX XX 68 76"        → "06XXXX6876"
 *
 * 🔒 V2.1 — À utiliser UNIQUEMENT pour user non-autorisé sur enveloppe masked-until-claim.
 * Le caller décide (ex: ct._phoneMasked === true).
 * Pour user admin/owner → utiliser displayPhone() qui retourne format lisible standard.
 */
export const maskPhoneVisual = (phone) => {
  if (!phone || typeof phone !== 'string') return phone || '';
  // Si déjà masqué (contient X) → strip espaces uniquement → format compact
  if (/X/i.test(phone)) return phone.replace(/\s+/g, '');
  // Phone clair → applique masking compact MH
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  if (digits.startsWith('+')) {
    const m = digits.match(/^\+(\d{1,3})(\d?)/);
    if (m) {
      const countryCode = '+' + m[1];
      const firstDigit = m[2] || '';
      return countryCode + firstDigit + 'XXXX' + last4;
    }
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return digits.slice(0, 2) + 'XXXX' + last4;
  }
  return 'XXXX' + last4;
};

/**
 * Mask V2.1 Option β — Source unique pour afficher le phone d'un contact.
 * Applique automatiquement le filtre d'affichage masking selon le flag `_phoneMasked`
 * positionné par le backend (helper maskContactIfFromMaskedEnvelope).
 *
 * Usage : `{phoneFor(ct)}` au lieu de `{displayPhone(ct.phone)}` ou `{ct.phone}`.
 *
 * Comportement :
 *   - contact._phoneMasked === true  → maskPhoneVisual(phone) → "06XXXX6876"
 *   - sinon                          → displayPhone(phone)    → "06 01 34 68 76"
 */
export const phoneFor = (contact, fallback = '') => {
  if (!contact) return fallback;
  const p = contact.phone || contact.mobile || '';
  if (!p) return fallback;
  return contact._phoneMasked ? maskPhoneVisual(p) : displayPhone(p);
};

// Affichage lisible : +33612345678 → 06 12 34 56 78
export const displayPhone = (phone) => {
  if (!phone) return '';
  // 🔒 V2.1 — si phone déjà masqué (contient "X"), retourner tel quel.
  // formatPhoneFR strip les espaces et déstructure les "X" littéraux → casse l'affichage masqué.
  if (/X/i.test(String(phone))) return String(phone);
  const p = formatPhoneFR(phone);
  if (!p) return '';
  // +33 → 0 + espaces
  if (p.startsWith('+33') && p.length === 12) {
    const n = '0' + p.slice(3);
    return n.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  return p;
};

/**
 * Mask V2 — Masque un phone vers format MH `+33 6 XX XX 39 60` (4 derniers en 2 blocs).
 * Spec validée 2026-05-06. Miroir backend `server/services/leadPhoneMasking.js#maskPhone`.
 * Fallback frontend pour cas où le backend ne renvoie pas de phone déjà masqué.
 *
 *   "+33601433960"  → "+33 6 XX XX 39 60"
 *   "0601433960"    → "06 XX XX 39 60"
 *   "+447700900123" → "+44 7 XX XX 01 23"
 */
export const maskedPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return phone || '';
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  const last4Formatted = last4.slice(0, 2) + ' ' + last4.slice(2);
  if (digits.startsWith('+')) {
    const m = digits.match(/^\+(\d{1,3})(\d?)/);
    if (m) {
      const countryCode = '+' + m[1];
      const firstDigit = m[2] ? ' ' + m[2] : '';
      return countryCode + firstDigit + ' XX XX ' + last4Formatted;
    }
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return digits.slice(0, 2) + ' XX XX ' + last4Formatted;
  }
  return 'XX XX XX ' + last4Formatted;
};
