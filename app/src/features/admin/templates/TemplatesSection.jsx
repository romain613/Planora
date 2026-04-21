// ═══════════════════════════════════════════════════════════════════════════
// TemplatesSection — entry point de l'onglet "Templates Pipeline Live"
// ═══════════════════════════════════════════════════════════════════════════
//
// Routing interne : list → edit (builder) → list
// Preview accessible depuis liste et builder (modal).

import React, { useState } from "react";
import { T } from "../../../theme";
import { Spinner } from "../../../shared/ui";
import { useTemplates } from "./hooks/useTemplates";
import TemplatesList from "./TemplatesList";
import TemplateBuilder from "./TemplateBuilder";
import TemplatePreview from "./components/TemplatePreview";

export default function TemplatesSection({ company, showNotif }) {
  const companyId = company?.id;
  const { templates, loading, refresh, create, update, publish, archive, getOne } = useTemplates({
    companyId,
    showNotif,
  });

  const [view, setView] = useState("list"); // 'list' | 'edit'
  const [editingTemplate, setEditingTemplate] = useState(null); // template loaded
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── Start new : preset = null => template vide, sinon preset clone
  const handleNew = (preset) => {
    if (preset) {
      // Crée un brouillon en DB immédiatement avec les stages du preset
      setBusy(true);
      create({
        name: preset.name + " (copie)",
        description: preset.description,
        icon: preset.icon,
        color: preset.color,
        stagesJson: JSON.stringify(preset.stages),
      }).then((r) => {
        setBusy(false);
        if (r?.id) handleEdit(r.id);
      });
    } else {
      // Crée un brouillon vide
      setBusy(true);
      create({
        name: "Nouveau template",
        description: "",
        icon: "star",
        color: "#7C3AED",
        stagesJson: "[]",
      }).then((r) => {
        setBusy(false);
        if (r?.id) handleEdit(r.id);
      });
    }
  };

  const handleEdit = async (id) => {
    setBusy(true);
    const full = await getOne(id);
    setBusy(false);
    if (!full) return;
    setEditingTemplate(full);
    setView("edit");
  };

  const handleBackToList = () => {
    setEditingTemplate(null);
    setView("list");
    refresh();
  };

  const handleSaveDraft = async (payload) => {
    if (!editingTemplate?.id) return;
    const r = await update(editingTemplate.id, payload);
    if (r) {
      setEditingTemplate((prev) => (prev ? { ...prev, ...payload } : prev));
      if (showNotif) showNotif("Brouillon sauvegardé", "success");
    }
  };

  const handlePublish = async (payload) => {
    if (!editingTemplate?.id) return;
    // 1) save draft first
    const u = await update(editingTemplate.id, payload);
    if (!u) return;
    // 2) publish (creates snapshot)
    const p = await publish(editingTemplate.id);
    if (p) {
      setEditingTemplate((prev) => (prev ? { ...prev, ...payload, isPublished: 1, latestVersion: p.snapshot?.version } : prev));
    }
  };

  const handleArchive = async () => {
    if (!editingTemplate?.id) return;
    const r = await archive(editingTemplate.id);
    if (r) {
      handleBackToList();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 400 }}>
      {busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.text2, fontSize: 12 }}>
          <Spinner /> Chargement…
        </div>
      )}

      {view === "list" && (
        <TemplatesList
          templates={templates}
          loading={loading}
          onNew={handleNew}
          onEdit={handleEdit}
          onPreview={setPreviewTemplate}
        />
      )}

      {view === "edit" && editingTemplate && (
        <TemplateBuilder
          template={editingTemplate}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onCancel={handleBackToList}
          onArchive={editingTemplate.isPublished ? handleArchive : null}
        />
      )}

      {previewTemplate && (
        <TemplatePreview template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}
    </div>
  );
}
