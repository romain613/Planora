// ═══════════════════════════════════════════════════════════════════════════
// TemplatesList — vue liste des templates (onglet principal)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Badge, Spinner, EmptyState } from "../../../shared/ui";
import { TEMPLATE_PRESETS } from "./constants";

function statusBadge(tpl) {
  if (tpl.isArchived) return { label: "Archivé", color: T.text3 };
  if (tpl.isPublished) return { label: `Publié v${tpl.latestVersion || 1}`, color: T.success };
  return { label: "Brouillon", color: T.warning };
}

export default function TemplatesList({ templates, loading, onNew, onEdit, onPreview }) {
  const [showPresetPicker, setShowPresetPicker] = useState(false);

  const active = templates.filter((t) => !t.isArchived);
  const archived = templates.filter((t) => t.isArchived);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: T.text2 }}>
            Organisez vos équipes avec des pipelines standardisés. Les templates ne s'appliquent qu'aux collaborateurs explicitement assignés.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small onClick={() => setShowPresetPicker((p) => !p)} style={{ fontSize: 11 }}>
            <I n="copy" s={12} /> Partir d'un preset
          </Btn>
          <Btn primary small onClick={() => onNew(null)} style={{ fontSize: 11 }}>
            <I n="plus" s={12} /> Nouveau template vide
          </Btn>
        </div>
      </div>

      {/* Preset picker */}
      {showPresetPicker && (
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: T.text }}>
            Choisissez un preset (il sera dupliqué en brouillon modifiable)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {TEMPLATE_PRESETS.map((p) => (
              <div
                key={p.key}
                onClick={() => {
                  setShowPresetPicker(false);
                  onNew(p);
                }}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1.5px solid ${p.color}40`,
                  background: p.color + "10",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = p.color + "22")}
                onMouseLeave={(e) => (e.currentTarget.style.background = p.color + "10")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: p.color + "30", color: p.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <I n={p.icon} s={14} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name}</div>
                </div>
                <div style={{ fontSize: 11, color: T.text2, marginBottom: 6 }}>{p.description}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{p.stages.length} colonnes</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 20, color: T.text2 }}>
          <Spinner /> Chargement…
        </div>
      )}

      {/* Empty state */}
      {!loading && active.length === 0 && archived.length === 0 && (
        <EmptyState
          icon="layout"
          title="Aucun template"
          description="Créez votre premier template pour standardiser le pipeline de vos équipes."
        />
      )}

      {/* Liste active */}
      {active.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map((t) => {
            const s = statusBadge(t);
            let stagesCount = 0;
            try {
              const parsed = JSON.parse(t.stagesJson || "[]");
              stagesCount = Array.isArray(parsed) ? parsed.length : 0;
            } catch {}
            return (
              <Card
                key={t.id}
                style={{
                  padding: 14,
                  cursor: "pointer",
                  borderLeft: `4px solid ${t.color || T.accent}`,
                  transition: "all .15s",
                }}
                onClick={() => onEdit(t.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: (t.color || T.accent) + "22",
                      color: t.color || T.accent,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <I n={t.icon || "star"} s={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.name}</div>
                      <span
                        style={{
                          fontSize: 10, fontWeight: 700, color: s.color,
                          background: s.color + "18", borderRadius: 10, padding: "2px 8px",
                        }}
                      >
                        {s.label}
                      </span>
                      {t.collabsCount > 0 && (
                        <span style={{ fontSize: 10, color: T.text3, display: "flex", alignItems: "center", gap: 4 }}>
                          <I n="users" s={10} /> {t.collabsCount} collab{t.collabsCount > 1 ? "s" : ""}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: T.text3 }}>
                        {stagesCount} colonne{stagesCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>{t.description}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Btn
                      small
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview(t);
                      }}
                      style={{ fontSize: 10 }}
                      title="Aperçu"
                    >
                      <I n="eye" s={11} />
                    </Btn>
                    <Btn
                      small
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(t.id);
                      }}
                      style={{ fontSize: 10 }}
                      title="Éditer"
                    >
                      <I n="edit-2" s={11} />
                    </Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Archived section */}
      {archived.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <I n="archive" s={11} /> Archivés ({archived.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {archived.map((t) => (
              <Card key={t.id} style={{ padding: 10, opacity: 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
                    <I n={t.icon || "star"} s={12} />
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: T.text2 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>Archivé</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
