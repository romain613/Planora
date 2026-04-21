// ═══════════════════════════════════════════════════════════════════════════
// AssignTemplateModal — pre-flight check + confirmation migration (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §17 cas B/C + §19.
// Invariant #6 (pre-flight systématique) + #7 (aucune perte silencieuse).
//
// Flow :
//   1. Admin ouvre le modal avec un collab cible
//   2. Modal charge la liste des templates publiés + l'état actuel du collab
//   3. Admin choisit une cible (template publié OU "Mode libre")
//   4. Le modal appelle automatiquement /preflight pour analyser l'impact
//   5. Si incompatibles > 0 : dropdown "Colonne cible pour les migrer"
//   6. Admin confirme → POST /migrate → succès/erreur notifié
//
// Props :
//   - isOpen, onClose
//   - collaborator : { id, name, pipelineMode?, pipelineSnapshotId? }
//   - companyId
//   - showNotif
//   - onSuccess : callback(result) après migration réussie

import React, { useState, useEffect, useCallback } from "react";
import { T } from "../../../../theme";
import { I, Btn, Modal, Spinner } from "../../../../shared/ui";
import { api } from "../../../../shared/services/api";

export default function AssignTemplateModal({
  isOpen,
  onClose,
  collaborator,
  companyId,
  showNotif,
  onSuccess,
}) {
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null); // null = mode libre
  const [preflight, setPreflight] = useState(null);
  const [loadingPf, setLoadingPf] = useState(false);
  const [fallbackStage, setFallbackStage] = useState("");
  const [migrating, setMigrating] = useState(false);

  // Reset quand on ouvre
  useEffect(() => {
    if (isOpen && collaborator) {
      setSelectedTemplateId(null);
      setPreflight(null);
      setFallbackStage("");
      setMigrating(false);
      loadTemplates();
    }
    // eslint-disable-next-line
  }, [isOpen, collaborator?.id]);

  const loadTemplates = useCallback(async () => {
    if (!companyId) return;
    setLoadingList(true);
    try {
      const r = await api(`/api/admin/pipeline-templates?companyId=${encodeURIComponent(companyId)}`);
      const published = (Array.isArray(r) ? r : []).filter((t) => t.isPublished && !t.isArchived);
      setTemplates(published);
    } catch (e) {
      console.error("[AssignTemplateModal.loadTemplates]", e);
      if (showNotif) showNotif("Erreur chargement templates", "danger");
    } finally {
      setLoadingList(false);
    }
  }, [companyId, showNotif]);

  // Pre-flight recalcul auto à chaque changement de cible
  useEffect(() => {
    if (!isOpen || !collaborator?.id) return;
    setLoadingPf(true);
    setPreflight(null);
    setFallbackStage("");
    const ctrlId = encodeURIComponent(collaborator.id);
    const tid = selectedTemplateId ? encodeURIComponent(selectedTemplateId) : "null";
    api(`/api/admin/pipeline-templates/preflight?collaboratorId=${ctrlId}&templateId=${tid}`)
      .then((r) => {
        if (r?.error) {
          if (showNotif) showNotif("Pre-flight : " + r.error, "danger");
          setPreflight(null);
        } else {
          setPreflight(r);
          // Pré-sélectionner un fallback par défaut si incompatibles
          if (r?.incompatibleCount > 0 && r?.allTargetStages?.length > 0) {
            const nouveau = r.allTargetStages.find((s) => s.id === "nouveau" || s.id === "new" || s.id.includes("nouveau"));
            setFallbackStage((nouveau || r.allTargetStages[0]).id);
          }
        }
      })
      .catch((e) => {
        console.error("[AssignTemplateModal.preflight]", e);
        if (showNotif) showNotif("Erreur pre-flight : " + e.message, "danger");
      })
      .finally(() => setLoadingPf(false));
    // eslint-disable-next-line
  }, [isOpen, collaborator?.id, selectedTemplateId]);

  const handleMigrate = async () => {
    if (!collaborator?.id || !preflight) return;
    if (preflight.incompatibleCount > 0 && !fallbackStage) {
      if (showNotif) showNotif("Sélectionnez une colonne de destination pour les contacts incompatibles.", "danger");
      return;
    }

    // Message de confirmation explicite (invariant #6)
    const targetLabel = selectedTemplateId
      ? `template "${preflight.targetTemplateName}" (v${preflight.targetVersion})`
      : "mode libre";
    const migrateSummary = preflight.incompatibleCount > 0
      ? `\n\n${preflight.incompatibleCount} contact(s) seront migrés vers "${preflight.allTargetStages.find((s) => s.id === fallbackStage)?.label || fallbackStage}".`
      : "\n\nAucun contact à migrer.";
    if (!confirm(
      `Confirmer le changement de pipeline pour ${collaborator.name} ?\n\n→ ${targetLabel}${migrateSummary}\n\nOpération irréversible. Continuer ?`
    )) return;

    setMigrating(true);
    try {
      const r = await api(`/api/admin/pipeline-templates/collaborators/${encodeURIComponent(collaborator.id)}/migrate`, {
        method: "POST",
        body: {
          templateId: selectedTemplateId || null,
          fallbackStage: preflight.incompatibleCount > 0 ? fallbackStage : null,
        },
      });
      if (r?.error) throw new Error(r.error);
      if (showNotif) {
        showNotif(
          `Pipeline mis à jour : ${collaborator.name} → ${targetLabel} (${r.contactsMigratedCount} contacts migrés)`,
          "success"
        );
      }
      if (onSuccess) onSuccess(r);
      onClose();
    } catch (e) {
      console.error("[AssignTemplateModal.migrate]", e);
      if (showNotif) showNotif("Erreur migration : " + e.message, "danger");
    } finally {
      setMigrating(false);
    }
  };

  if (!isOpen) return null;

  const currentModeLabel =
    collaborator?.pipelineMode === "template" ? "Template imposé" : "Mode libre";

  return (
    <Modal open={true} onClose={onClose} title={`Pipeline de ${collaborator?.name || ""}`} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 320 }}>
        {/* État actuel */}
        <div style={{ padding: 10, borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12 }}>
          <span style={{ color: T.text3 }}>État actuel : </span>
          <strong style={{ color: T.text }}>{currentModeLabel}</strong>
        </div>

        {/* Sélecteur template cible */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 5 }}>
            Pipeline cible
          </label>
          {loadingList ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, color: T.text3 }}>
              <Spinner /> Chargement templates…
            </div>
          ) : (
            <select
              value={selectedTemplateId || ""}
              onChange={(e) => setSelectedTemplateId(e.target.value || null)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13,
              }}
            >
              <option value="">— Mode libre (aucun template) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.latestVersion || 1}){t.collabsCount > 0 ? ` · ${t.collabsCount} collab(s) déjà assigné(s)` : ""}
                </option>
              ))}
            </select>
          )}
          {templates.length === 0 && !loadingList && (
            <div style={{ fontSize: 11, color: T.text3, marginTop: 5, fontStyle: "italic" }}>
              Aucun template publié dans votre company. Créez-en un depuis l'onglet Templates Pipeline Live.
            </div>
          )}
        </div>

        {/* Pre-flight result */}
        {loadingPf && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 10, color: T.text3 }}>
            <Spinner /> Analyse de l'impact…
          </div>
        )}

        {preflight && !loadingPf && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: preflight.incompatibleCount > 0 ? T.warning + "12" : T.success + "10",
              border: `1.5px solid ${preflight.incompatibleCount > 0 ? T.warning + "50" : T.success + "50"}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
              <I n={preflight.incompatibleCount > 0 ? "alert-triangle" : "check-circle"} s={14} style={{ color: preflight.incompatibleCount > 0 ? T.warning : T.success }} />
              Analyse d'impact (pre-flight)
            </div>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 6 }}>
              <strong>{preflight.totalContacts}</strong> contact{preflight.totalContacts > 1 ? "s" : ""} assigné{preflight.totalContacts > 1 ? "s" : ""} à ce collab
            </div>
            <div style={{ fontSize: 12, color: T.success, marginBottom: 4 }}>
              • <strong>{preflight.compatibleCount}</strong> compatible{preflight.compatibleCount > 1 ? "s" : ""} avec la cible
            </div>
            {preflight.incompatibleCount > 0 && (
              <div style={{ fontSize: 12, color: T.warning, marginBottom: 8 }}>
                • <strong>{preflight.incompatibleCount}</strong> nécessitent une migration de colonne
              </div>
            )}

            {/* Liste des contacts incompatibles (preview max 8) */}
            {preflight.incompatibleContacts?.length > 0 && (
              <div style={{ maxHeight: 160, overflow: "auto", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: 6, marginBottom: 10 }}>
                {preflight.incompatibleContacts.slice(0, 8).map((c) => (
                  <div key={c.id} style={{ fontSize: 11, color: T.text, padding: "4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <strong>{c.name}</strong> <span style={{ color: T.text3 }}>(stage actuel : {c.pipeline_stage})</span>
                    </div>
                    {c.activeBookingsCount > 0 && (
                      <span style={{ fontSize: 10, background: T.accent + "20", color: T.accent, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                        <I n="calendar" s={9} /> {c.activeBookingsCount} RDV
                      </span>
                    )}
                    {c.hasContract && (
                      <span style={{ fontSize: 10, background: T.success + "20", color: T.success, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                        <I n="file-text" s={9} /> Contrat
                      </span>
                    )}
                  </div>
                ))}
                {preflight.incompatibleContacts.length > 8 && (
                  <div style={{ fontSize: 10, color: T.text3, textAlign: "center", fontStyle: "italic", padding: 4 }}>
                    … et {preflight.incompatibleContacts.length - 8} autres
                  </div>
                )}
              </div>
            )}

            {/* Dropdown fallback stage */}
            {preflight.incompatibleCount > 0 && preflight.allTargetStages?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>
                  Colonne de destination pour les contacts incompatibles <span style={{ color: T.danger }}>*</span>
                </label>
                <select
                  value={fallbackStage}
                  onChange={(e) => setFallbackStage(e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px", borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12,
                  }}
                >
                  <option value="">— Choisir une colonne —</option>
                  {preflight.allTargetStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 3, fontStyle: "italic" }}>
                  Les {preflight.incompatibleCount} contact{preflight.incompatibleCount > 1 ? "s" : ""} actuellement sur des colonnes absentes de la cible seront déplacé{preflight.incompatibleCount > 1 ? "s" : ""} vers cette colonne. Opération loguée dans pipeline_history + audit_logs.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <Btn onClick={onClose} disabled={migrating}>Annuler</Btn>
          <Btn
            primary
            onClick={handleMigrate}
            disabled={
              migrating ||
              loadingPf ||
              !preflight ||
              (preflight.incompatibleCount > 0 && !fallbackStage)
            }
          >
            {migrating ? <><Spinner /> Migration…</> : <><I n="check" s={12} /> Confirmer et migrer</>}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
