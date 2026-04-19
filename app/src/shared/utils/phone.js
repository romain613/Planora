// Phone number formatting helpers (extracted from App.jsx Phase 1A)

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
