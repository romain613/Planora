// ═══════════════════════════════════════════════════════════════════════════
// usePipelineResolved — Phase 4 enforcement runtime
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §5.2 + §18.
//
// Appelle GET /api/data/pipeline-stages-resolved pour déterminer :
//   - Mode actuel du collab (free | template)
//   - Liste unifiée des stages à afficher
//   - Flag readOnly pour verrouiller l'UI (§6.1 invariant #3)
//   - Métadonnées template pour afficher le badge
//
// Pattern : retourne null tant que la résolution n'est pas finie pour
// permettre le fallback legacy. Pas de flash visuel car en mode free
// (tous les collabs actuels), la liste résolue ≈ liste legacy.

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../../shared/services/api";

export function usePipelineResolved({ companyId, collaboratorId }) {
  const [resolved, setResolved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(false);

  const fetchResolved = useCallback(async () => {
    if (!companyId || !collaboratorId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api(
        `/api/data/pipeline-stages-resolved?companyId=${encodeURIComponent(companyId)}&collaboratorId=${encodeURIComponent(collaboratorId)}`
      );
      if (abortRef.current) return;
      if (r && !r.error) {
        setResolved(r);
      } else {
        setError(r?.error || 'unknown');
      }
    } catch (e) {
      if (abortRef.current) return;
      console.warn('[usePipelineResolved]', e.message);
      setError(e.message);
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, [companyId, collaboratorId]);

  useEffect(() => {
    abortRef.current = false;
    fetchResolved();
    return () => { abortRef.current = true; };
  }, [fetchResolved]);

  return { resolved, loading, error, refresh: fetchResolved };
}
