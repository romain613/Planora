// ═══════════════════════════════════════════════════════════════════════════
// TemplateBuilder — orchestrateur des 3 zones (bibliothèque / canvas / config)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Input, Card } from "../../../shared/ui";
import StageLibrary from "./components/StageLibrary";
import StageCanvas from "./components/StageCanvas";
import StageConfigPanel from "./components/StageConfigPanel";
import TemplatePreview from "./components/TemplatePreview";
import {
  TEMPLATE_NAME_MIN,
  TEMPLATE_NAME_MAX,
  STAGES_MIN_TO_PUBLISH,
  SYSTEM_STAGE_IDS,
  isSystemStage,
  missingSystemStagesMessage,
} from "./constants";

// Génère un id unique pour une nouvelle colonne dans le builder
function newStageId() {
  return "st_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

export default function TemplateBuilder({
  template,       // { id?, name, description, icon, color, stagesJson, isPublished }
  onSaveDraft,    // async(updated) → {}
  onPublish,      // async(updated) → void (saveDraft then publish)
  onCancel,
  onArchive,      // optional (null pour brouillon jamais publié)
  savingLabel,
}) {
  // Build working state from props
  const initStages = useMemo(() => {
    try {
      const parsed = typeof template?.stagesJson === "string" ? JSON.parse(template.stagesJson) : template?.stagesJson;
      if (!Array.isArray(parsed)) return [];
      // S'assurer que chaque stage a un id (mode création avec preset)
      return parsed.map((s, i) => ({ ...s, id: s.id || newStageId(), position: (i + 1) * 10 }));
    } catch {
      return [];
    }
  }, [template?.id]);

  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [icon, setIcon] = useState(template?.icon || "star");
  const [color, setColor] = useState(template?.color || "#7C3AED");
  const [stages, setStages] = useState(initStages);
  const [selectedId, setSelectedId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // Quand on reçoit un nouveau template (changement d'édition), re-init
  useEffect(() => {
    setName(template?.name || "");
    setDescription(template?.description || "");
    setIcon(template?.icon || "star");
    setColor(template?.color || "#7C3AED");
    setStages(initStages);
    setSelectedId(null);
  }, [template?.id]); // eslint-disable-line

  const selectedStage = stages.find((s) => s.id === selectedId);

  // ── Validation (pour publication) ──
  const nameValid = typeof name === "string" && name.trim().length >= TEMPLATE_NAME_MIN && name.trim().length <= TEMPLATE_NAME_MAX;
  const stagesValid = Array.isArray(stages) && stages.length >= STAGES_MIN_TO_PUBLISH && stages.every((s) => s.id && typeof s.label === "string" && s.label.trim().length > 0);
  const stageIdSet = new Set((stages || []).map(s => s.id));
  const hasAllSystemStages = SYSTEM_STAGE_IDS.every(id => stageIdSet.has(id));
  const canPublish = nameValid && stagesValid && hasAllSystemStages;

  // ── Helpers ──
  const rebuildPositions = (list) => list.map((s, i) => ({ ...s, position: (i + 1) * 10 }));

  const addStage = (s, insertAt = stages.length) => {
    const newS = {
      id: newStageId(),
      label: s.label || "Nouveau stage",
      color: s.color || "#7C3AED",
      icon: s.icon || "tag",
    };
    const nextList = [...stages];
    nextList.splice(insertAt, 0, newS);
    setStages(rebuildPositions(nextList));
    setSelectedId(newS.id);
  };

  const addEmptyStage = () => addStage({ label: "Nouveau stage", color: "#7C3AED", icon: "tag" });

  const reorderStage = (fromIdx, toIdx) => {
    const next = [...stages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setStages(rebuildPositions(next));
  };

  const deleteStage = (stageId) => {
    // Verrou : les colonnes système ne peuvent pas être supprimées depuis le builder
    const target = stages.find((s) => s.id === stageId);
    if (isSystemStage(target)) return;
    setStages((prev) => rebuildPositions(prev.filter((s) => s.id !== stageId)));
    if (selectedId === stageId) setSelectedId(null);
  };

  const updateStage = (stageId, patch) => {
    // Verrou : le libellé d'une colonne système n'est pas modifiable (Option A — safe)
    const target = stages.find((s) => s.id === stageId);
    if (isSystemStage(target) && patch && Object.prototype.hasOwnProperty.call(patch, 'label')) {
      // ignore silencieusement le patch label pour colonne système
      const { label, ...rest } = patch;
      if (Object.keys(rest).length === 0) return;
      setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, ...rest } : s)));
      return;
    }
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, ...patch } : s)));
  };

  // ── Actions save / publish ──
  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    icon,
    color,
    stagesJson: JSON.stringify(stages.map((s) => ({
      id: s.id, label: s.label || "", color: s.color || "#7C3AED", icon: s.icon || "tag", position: s.position || 0,
    }))),
  });

  const handleSaveDraft = async () => {
    if (!nameValid) {
      alert(`Le nom doit faire entre ${TEMPLATE_NAME_MIN} et ${TEMPLATE_NAME_MAX} caractères.`);
      return;
    }
    setSaving(true);
    try {
      await onSaveDraft(buildPayload());
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish) {
      if (!nameValid) alert(`Le nom doit faire entre ${TEMPLATE_NAME_MIN} et ${TEMPLATE_NAME_MAX} caractères.`);
      else alert(`Minimum ${STAGES_MIN_TO_PUBLISH} colonnes avec libellé requises pour publier.`);
      return;
    }
    // Validation socle système : les 5 colonnes obligatoires doivent être présentes
    const missingMsg = missingSystemStagesMessage(stages.map(s => s.id));
    if (missingMsg) { alert(missingMsg); return; }
    const confirmMsg = template?.isPublished
      ? "Publier une nouvelle version ? Les collaborateurs déjà assignés resteront sur l'ancienne version (pas d'auto-propagation)."
      : "Publier ce template ? Il deviendra assignable aux collaborateurs.";
    if (!confirm(confirmMsg)) return;
    setSaving(true);
    try {
      await onPublish(buildPayload());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Header */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 11,
              background: color + "20",
              color,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <I n={icon} s={22} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, TEMPLATE_NAME_MAX))}
              placeholder="Nom du template (ex: Closing IV)"
              style={{ fontSize: 14, fontWeight: 700 }}
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 140))}
              placeholder="Description courte (optionnel)"
              style={{ fontSize: 11 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T.text3 }}>
              {template?.isPublished
                ? <span style={{ color: T.success, fontWeight: 700 }}>Publié v{template.latestVersion || 1}</span>
                : <span style={{ color: T.warning }}>Brouillon</span>}
            </div>
            {template?.collabsCount > 0 && (
              <div style={{ fontSize: 10, color: T.text2 }}>
                {template.collabsCount} collab{template.collabsCount > 1 ? "s" : ""} assigné{template.collabsCount > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Btn small onClick={onCancel} style={{ fontSize: 11 }}>
            <I n="arrow-left" s={12} /> Retour
          </Btn>
          <Btn small onClick={() => setShowPreview(true)} style={{ fontSize: 11 }}>
            <I n="eye" s={12} /> Preview collab
          </Btn>
          {template?.id && template?.isPublished && onArchive && (
            <Btn
              small
              onClick={() => {
                if (confirm("Archiver ce template ? Il ne pourra plus être assigné (les collabs déjà assignés restent sur leur snapshot).")) onArchive();
              }}
              style={{ fontSize: 11, background: T.danger + "18", color: T.danger, border: `1px solid ${T.danger}40` }}
            >
              <I n="archive" s={12} /> Archiver
            </Btn>
          )}
          <div style={{ flex: 1 }} />
          <Btn small onClick={handleSaveDraft} disabled={saving || !nameValid} style={{ fontSize: 11 }}>
            <I n="save" s={12} /> {saving ? "Sauvegarde…" : "Sauver brouillon"}
          </Btn>
          <Btn
            primary
            small
            onClick={handlePublish}
            disabled={saving || !canPublish}
            style={{ fontSize: 11 }}
            title={!canPublish
              ? (!hasAllSystemStages
                  ? (missingSystemStagesMessage(stages.map(s => s.id)) || "Colonnes système manquantes")
                  : "Minimum 2 colonnes avec libellé + nom valide")
              : ""}
          >
            <I n="check-circle" s={12} /> {template?.isPublished ? "Publier v2" : "Publier"}
          </Btn>
        </div>
      </Card>

      {/* 3 zones */}
      <div style={{ flex: 1, display: "flex", gap: 10, minHeight: 0 }}>
        <StageLibrary onAddStage={addStage} onAddEmpty={addEmptyStage} />

        <StageCanvas
          stages={stages}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={reorderStage}
          onInsertFromLibrary={(s, at) => addStage(s, at)}
          onDeleteStage={deleteStage}
        />

        <StageConfigPanel
          stage={selectedStage}
          stagesCount={stages.length}
          onUpdate={(patch) => selectedStage && updateStage(selectedStage.id, patch)}
          onDelete={() => selectedStage && deleteStage(selectedStage.id)}
          onClose={() => setSelectedId(null)}
        />
      </div>

      {showPreview && (
        <TemplatePreview
          template={{ name, description, icon, color, stagesJson: JSON.stringify(stages) }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
