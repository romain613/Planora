// useMergeContacts — V1.13.2.b
// Custom hook centralisant l'état de la modale de fusion CRM + listener cross-tabs.
// Consommé par CrmTab.jsx (1 import + 1 hook call + 1 render). Aucune logique métier ici :
// les handlers réels sont dans handlers/contactMergeHandlers.js.
//
// API exposée :
//   { mergeTarget, openMerge, closeMerge, lastMergeResult }
//
// Q9 — Permissions de visibilité du bouton vérifiées côté CrmTab via canOpenMerge(ct, collab).
// Q10 — Listener 'crmContactMerged' permet à d'autres tabs/composants de se synchroniser.

import { useState, useEffect, useCallback } from "react";

export const canOpenMerge = (primary, collab) => {
  if (!primary?.id || !collab?.id) return false;
  // Q7 : primary archivé refusé côté backend (409). On masque le bouton aussi côté UI.
  if (primary.archivedAt && primary.archivedAt !== '') return false;
  // Q5/Q9 : admin/supra OU owner/shared sur le primary
  // (le backend revérifie sur les DEUX fiches au moment du merge)
  const isAdmin = collab?.role === 'admin' || collab?.role === 'supra';
  if (isAdmin) return true;
  const isOwner = primary.assignedTo === collab.id;
  const sharedArr = Array.isArray(primary.shared_with) ? primary.shared_with
    : Array.isArray(primary.shared_with_json) ? primary.shared_with_json
    : (() => { try { return JSON.parse(primary.shared_with || primary.shared_with_json || '[]'); } catch { return []; } })();
  const isShared = sharedArr.includes(collab.id);
  return isOwner || isShared;
};

export const useMergeContacts = ({ onMergeSuccess } = {}) => {
  const [mergeTarget, setMergeTarget] = useState(null);
  const [lastMergeResult, setLastMergeResult] = useState(null);

  const openMerge = useCallback((primaryContact) => {
    if (!primaryContact?.id) return;
    setMergeTarget(primaryContact);
  }, []);

  const closeMerge = useCallback(() => {
    setMergeTarget(null);
  }, []);

  // Q10 — Listener cross-tabs : si une autre vue émet 'crmContactMerged'
  // (par ex. depuis Pipeline Live ou Admin), on déclenche la callback de sync.
  useEffect(() => {
    const onMerged = (e) => {
      const detail = e?.detail || {};
      setLastMergeResult(detail);
      onMergeSuccess?.(detail);
    };
    window.addEventListener('crmContactMerged', onMerged);
    return () => window.removeEventListener('crmContactMerged', onMerged);
  }, [onMergeSuccess]);

  return { mergeTarget, openMerge, closeMerge, lastMergeResult };
};
