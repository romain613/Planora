// V1.10.4 Phase 1 — Helper "suivi RDV transmis" (Pipeline Live).
// Source de vérité unique pour la visibilité d'un contact côté sender / receiver
// d'un booking share_transfer. Aucun appel réseau, lecture pure des données déjà
// présentes côté client (contacts + bookings).
//
// Référence : AUDIT-RDV-TRANSMIS-VISIBILITY-2026-04-28.md §D + AUDIT-PHASE0-VERDICT-2026-04-28.md
// Backend confirmé V1.10.3-FULL : GET /api/bookings élargi (collaboratorId OR
// agendaOwnerId OR bookedByCollaboratorId), POST auto-marque bookingType='share_transfer'.

function readSharedWith(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.shared_with)) return contact.shared_with;
  try { return JSON.parse(contact.shared_with_json || '[]'); } catch { return []; }
}

export function isContactSentByCollab(contact, bookings, collabId) {
  if (!contact || !collabId) return false;
  return (bookings || []).some(b =>
    b && b.contactId === contact.id
    && b.bookingType === 'share_transfer'
    && b.bookedByCollaboratorId === collabId
  );
}

export function isContactReceivedByCollab(contact, bookings, collabId) {
  if (!contact || !collabId) return false;
  return (bookings || []).some(b =>
    b && b.contactId === contact.id
    && b.bookingType === 'share_transfer'
    && b.agendaOwnerId === collabId
  );
}

export function isContactInSuiviForCollab(contact, bookings, collabId) {
  if (!contact || !collabId) return false;
  if (contact.assignedTo === collabId) return true;
  if (readSharedWith(contact).includes(collabId)) return true;
  if (isContactSentByCollab(contact, bookings, collabId)) return true;
  if (isContactReceivedByCollab(contact, bookings, collabId)) return true;
  return false;
}

// 'owner' | 'sender-owner' | 'sender' | 'receiver' | 'shared' | null
// 'sender-owner' = j'ai transmis ET je suis owner CRM (cas A) — visuel sender prime
// 'sender'       = j'ai transmis sans être owner (cas B/C)    — lecture/suivi
// 'receiver'     = je reçois un RDV transmis                  — exécution
// 'shared'       = Contact Share V1.8.13 sans share_transfer
export function getContactSuiviRole(contact, bookings, collabId) {
  if (!contact || !collabId) return null;
  const isOwner = contact.assignedTo === collabId;
  const isSender = isContactSentByCollab(contact, bookings, collabId);
  const isReceiver = isContactReceivedByCollab(contact, bookings, collabId);
  const isShared = readSharedWith(contact).includes(collabId);
  if (isOwner && isSender) return 'sender-owner';
  if (isSender) return 'sender';
  if (isOwner) return 'owner';
  if (isReceiver) return 'receiver';
  if (isShared) return 'shared';
  return null;
}

// Renvoie le receiverId du share_transfer où collab est sender (1er booking trouvé).
// Utilisé pour afficher "Transmis à [Nom]" sur la card Pipeline.
export function getReceiverIdForSentTransfer(contact, bookings, collabId) {
  if (!contact || !collabId) return null;
  const bk = (bookings || []).find(b =>
    b && b.contactId === contact.id
    && b.bookingType === 'share_transfer'
    && b.bookedByCollaboratorId === collabId
  );
  return bk ? (bk.agendaOwnerId || null) : null;
}

// Booking share_transfer "actif" pour ce couple (contact, collab as sender).
// Retourne le booking le plus récent confirmé, ou null. Utilisé pour le sous-texte
// "⏳ Reporting en attente" / "✅ Signé" / etc. sur la card.
export function getActiveSentTransferBooking(contact, bookings, collabId) {
  if (!contact || !collabId) return null;
  const list = (bookings || []).filter(b =>
    b && b.contactId === contact.id
    && b.bookingType === 'share_transfer'
    && b.bookedByCollaboratorId === collabId
    && b.status === 'confirmed'
  );
  if (list.length === 0) return null;
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.time || '').localeCompare(String(a.time || '')));
  return list[0];
}
