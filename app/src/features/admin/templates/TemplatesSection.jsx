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
import { buildInitialStages } from "./constants";

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

  // ── Start new : preset = null => template "vide" (socle système seul), sinon preset + socle
  //
  // Règle socle système : les 5 colonnes obligatoires (nouveau, contacté, rdv_programme,
  // nrp, perdu) sont toujours présentes dans la grille à la création, même pour les
  // presets custom (dé-dupliquées par ID). Ces colonnes deviennent verrouillées dans le
  // builder (cf. StageCard / StageConfigPanel / StageCanvas).
  const handleNew = (preset) => {
    if (preset) {
      // Socle système + stages preset (dé-dupliqués)
      setBusy(true);
      const stages = buildInitialStages(preset.stages);
      create({
        name: preset.name + " (copie)",
        description: preset.description,
        icon: preset.icon,
        color: preset.color,
        stagesJson: JSON.stringify(stages),
      }).then((r) => {
        setBusy(false);
        if (r?.id) handleEdit(r.id);
      });
    } else {
      // Template "vide" = socle système seul (5 colonnes)
      setBusy(true);
      const stages = buildInitialStages([]);
      create({
        name: "Nouveau template",
        description: "",
        icon: "star",
        color: "#7C3AED",
        stagesJson: JSON.stringify(stages),
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
