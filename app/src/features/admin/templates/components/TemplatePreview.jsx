// ═══════════════════════════════════════════════════════════════════════════
// TemplatePreview — modal plein écran simulant le rendu collab
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { T } from "../../../../theme";
import { I, Btn, Modal } from "../../../../shared/ui";

const FICTIVE_CONTACTS = [
  { name: "Dupont Marc", temp: "🔥", days: 2 },
  { name: "Martin Sophie", temp: "⏳", days: 7 },
  { name: "Leroux Julien", temp: "❄️", days: 14 },
];

export default function TemplatePreview({ template, onClose }) {
  if (!template) return null;
  let stages = [];
  try {
    stages = typeof template.stagesJson === "string" ? JSON.parse(template.stagesJson) : template.stagesJson || [];
  } catch {
    stages = [];
  }
  if (!Array.isArray(stages)) stages = [];

  return (
    <Modal isOpen={true} onClose={onClose} size="xlarge" title={null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 480 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: (template.color || T.accent) + "15",
            borderRadius: 10,
            border: `2px solid ${(template.color || T.accent)}30`,
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: (template.color || T.accent) + "30",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: template.color || T.accent,
            }}
          >
            <I n={template.icon || "star"} s={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{template.name}</div>
            <div style={{ fontSize: 11, color: T.text2 }}>
              Aperçu tel qu'il apparaîtra au collaborateur — <strong>Pipeline Équipe</strong>
            </div>
          </div>
          <Btn small onClick={onClose}>
            <I n="x" s={12} /> Fermer
          </Btn>
        </div>

        {/* Badge "Pipeline Équipe" — copie exacte du rendu collab */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: T.surface,
            border: `2px solid ${(template.color || T.accent)}30`,
            borderRadius: 8,
            fontSize: 11,
            color: T.text2,
          }}
        >
          <I n="lock" s={12} style={{ color: template.color || T.accent }} />
          <span>
            Pipeline Équipe : <strong style={{ color: T.text }}>{template.name}</strong> — structure définie par votre administrateur.
          </span>
        </div>

        {/* Kanban rendu */}
        <div style={{ overflow: "auto", padding: "4px 0 12px" }}>
          <div style={{ display: "flex", gap: 8, minHeight: 320 }}>
            {stages.length === 0 && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 40,
                  border: `2px dashed ${T.border}`,
                  borderRadius: 10,
                  color: T.text3,
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                Ce template n'a aucune colonne. Ajoutez-en au moins 2 pour pouvoir le publier.
              </div>
            )}
            {stages.map((s) => (
              <div
                key={s.id}
                style={{
                  flex: "0 0 185px",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${T.border}`,
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    background: (s.color || "#7C3AED") + "14",
                    borderBottom: `2.5px solid ${s.color || "#7C3AED"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 18, height: 18, borderRadius: 5,
                      background: (s.color || "#7C3AED") + "30",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: s.color || "#7C3AED",
                    }}
                  >
                    <I n={s.icon || "tag"} s={10} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color || "#7C3AED", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, color: T.text,
                      background: T.surface, borderRadius: 10, padding: "1px 6px",
                    }}
                  >
                    3
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    background: T.bg,
                  }}
                >
                  {FICTIVE_CONTACTS.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        fontSize: 11,
                        color: T.text,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                      <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>
                        {c.temp} · J+{c.days}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
