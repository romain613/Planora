// ═══════════════════════════════════════════════════════════════════════════
// StageCard — rendu d'une colonne stage dans le canvas ou le preview
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { T } from "../../../../theme";
import { I } from "../../../../shared/ui";
import { isSystemStage } from "../constants";

export default function StageCard({
  stage,
  index,
  isSelected,
  isDragging,
  isDragOver,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  compact = false,
  readOnly = false,
  showPositionBadge = true,
  previewContacts = null, // si !null, affiche N cartes fictives
}) {
  const _isSystem = isSystemStage(stage);
  const bg = (stage?.color || T.accent) + "18";
  const border = isSelected
    ? `2.5px solid ${stage?.color || T.accent}`
    : `1.5px solid ${stage?.color || T.border}40`;

  return (
    <div
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        width: compact ? 130 : 160,
        minWidth: compact ? 130 : 160,
        borderRadius: 12,
        background: isDragOver ? (stage?.color || T.accent) + "30" : bg,
        border,
        padding: 10,
        cursor: readOnly ? "default" : "grab",
        opacity: isDragging ? 0.4 : 1,
        transition: "all .18s",
        position: "relative",
        boxShadow: isSelected ? `0 4px 16px ${(stage?.color || T.accent)}35` : "none",
      }}
    >
      {/* header : icon + position + cadenas système */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div
          style={{
            width: 24, height: 24, borderRadius: 8,
            background: (stage?.color || T.accent) + "30",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: stage?.color || T.accent, flexShrink: 0,
          }}
        >
          <I n={stage?.icon || "tag"} s={13} />
        </div>
        <div
          style={{
            flex: 1, minWidth: 0,
            fontSize: 12, fontWeight: 700, color: T.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
          title={stage?.label || ""}
        >
          {stage?.label || "—"}
        </div>
        {_isSystem && (
          <span
            title="Colonne système — non supprimable, non renommable"
            style={{
              display: "flex", alignItems: "center",
              color: (stage?.color || T.accent),
              flexShrink: 0,
            }}
          >
            <I n="lock" s={10} />
          </span>
        )}
        {showPositionBadge && typeof index === "number" && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, color: T.text3,
              background: T.surface, borderRadius: 4, padding: "1px 5px",
              flexShrink: 0,
            }}
          >
            #{index + 1}
          </span>
        )}
      </div>
      {/* Badge "Système" discret sous le header */}
      {_isSystem && (
        <div
          style={{
            fontSize: 8, fontWeight: 700, color: (stage?.color || T.accent),
            background: (stage?.color || T.accent) + "18",
            borderRadius: 4, padding: "1px 5px",
            display: "inline-block", marginBottom: 6,
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
        >
          Système
        </div>
      )}
      {/* preview contacts fictifs si demandé */}
      {Array.isArray(previewContacts) && previewContacts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {previewContacts.map((pc, i) => (
            <div
              key={i}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                background: T.surface,
                border: `1px solid ${T.border}`,
                fontSize: 10,
                color: T.text2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pc}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
