// duplicateCheck — V2.1
// Helper pur réutilisable pour pré-check anti-doublon avant création contact.
// Branche tous les chemins de création (NewContactModal, Quick Add Hub SMS,
// linkVisitorToContacts, AdminDash, etc.) sur le même endpoint
// /api/data/contacts/check-duplicate-single (V1.8.22 + V1.13.0).
//
// Architecture conforme règle code "pas d'empilage" : fonction pure exportée,
// importable depuis CollabPortal et AdminDash sans duplication.
//
// Sémantique :
//   - Pas d'email ni phone -> pas de check (early return false)
//   - Match trouvé -> appelle onMatch({ matches, conflict, pendingNewContact })
//                   + retourne true (caller doit stop)
//   - Pas de match -> retourne false (caller continue création)
//   - Erreur réseau -> retourne false (fail-open : ne jamais bloquer la création)
//
// Pattern conforme V1.13.0 handleCollabCreateContact (référence).

/**
 * Pré-check anti-doublon avant création contact.
 *
 * @param {object} nc - Le contact en cours de création (doit avoir name + email/phone)
 * @param {object} options
 * @param {function} options.api - Wrapper api(path, opts) du module shared/services/api
 * @param {function} options.onMatch - Callback({ matches, conflict, pendingNewContact }) si dup détecté
 * @param {function} [options.onClose] - Callback optionnel pour fermer la modale source (ex: setShowNewContact(false))
 * @returns {Promise<boolean>} true si dup détecté (caller stop), false sinon (caller continue)
 */
export const precheckCreate = (nc, { api, onMatch, onClose } = {}) => {
  if (!nc || (!nc.email && !nc.phone)) return Promise.resolve(false);
  if (typeof api !== 'function' || typeof onMatch !== 'function') return Promise.resolve(false);
  return api('/api/data/contacts/check-duplicate-single', {
    method: 'POST',
    body: { email: nc.email || '', phone: nc.phone || '' }
  }).then(checkRes => {
    if (checkRes && checkRes.exists) {
      if (typeof onClose === 'function') { try { onClose(); } catch {} }
      onMatch({
        matches: checkRes.matches || [],
        conflict: !!checkRes.conflict,
        pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
      });
      return true;
    }
    return false;
  }).catch(() => false);  // fail-open
};
