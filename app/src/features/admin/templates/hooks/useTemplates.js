// ═══════════════════════════════════════════════════════════════════════════
// useTemplates — hook React pour CRUD Pipeline Templates (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Encapsule les appels API /api/admin/pipeline-templates (Phase 1 backend).
// Renvoie : { templates, loading, refresh, create, update, publish, archive }.

import { useState, useEffect, useCallback } from "react";
import { api } from "../../../../shared/services/api";

export function useTemplates({ companyId, showNotif }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const r = await api(`/api/admin/pipeline-templates?companyId=${encodeURIComponent(companyId)}`);
      setTemplates(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error("[useTemplates.refresh]", e);
      if (showNotif) showNotif("Erreur chargement templates", "danger");
    } finally {
      setLoading(false);
    }
  }, [companyId, showNotif]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (payload) => {
    try {
      const r = await api("/api/admin/pipeline-templates", {
        method: "POST",
        body: { ...payload, companyId },
      });
      if (r?.error) throw new Error(r.error);
      await refresh();
      return r;
    } catch (e) {
      console.error("[useTemplates.create]", e);
      if (showNotif) showNotif("Erreur création template : " + e.message, "danger");
      return null;
    }
  }, [companyId, refresh, showNotif]);

  const update = useCallback(async (id, payload) => {
    try {
      const r = await api(`/api/admin/pipeline-templates/${id}`, {
        method: "PUT",
        body: payload,
      });
      if (r?.error) throw new Error(r.error);
      await refresh();
      return r;
    } catch (e) {
      console.error("[useTemplates.update]", e);
      if (showNotif) showNotif("Erreur sauvegarde : " + e.message, "danger");
      return null;
    }
  }, [refresh, showNotif]);

  const publish = useCallback(async (id) => {
    try {
      const r = await api(`/api/admin/pipeline-templates/${id}/publish`, { method: "POST" });
      if (r?.error) throw new Error(r.error);
      await refresh();
      if (showNotif) showNotif(`Template publié (v${r.snapshot?.version || "?"})`, "success");
      return r;
    } catch (e) {
      console.error("[useTemplates.publish]", e);
      if (showNotif) showNotif("Erreur publication : " + e.message, "danger");
      return null;
    }
  }, [refresh, showNotif]);

  const archive = useCallback(async (id) => {
    try {
      const r = await api(`/api/admin/pipeline-templates/${id}/archive`, { method: "POST" });
      if (r?.error) throw new Error(r.error);
      await refresh();
      if (showNotif) showNotif("Template archivé", "success");
      return r;
    } catch (e) {
      console.error("[useTemplates.archive]", e);
      if (showNotif) showNotif("Erreur archivage : " + e.message, "danger");
      return null;
    }
  }, [refresh, showNotif]);

  const getOne = useCallback(async (id) => {
    try {
      const r = await api(`/api/admin/pipeline-templates/${id}`);
      if (r?.error) throw new Error(r.error);
      return r;
    } catch (e) {
      console.error("[useTemplates.getOne]", e);
      return null;
    }
  }, []);

  return { templates, loading, refresh, create, update, publish, archive, getOne };
}
