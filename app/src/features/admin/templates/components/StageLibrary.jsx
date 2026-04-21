// ═══════════════════════════════════════════════════════════════════════════
// StageLibrary — Zone A du builder (bibliothèque de colonnes)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from "react";
import { T } from "../../../../theme";
import { I, Btn, Input } from "../../../../shared/ui";
import { STAGE_TYPES } from "../constants";

export default function StageLibrary({ onAddStage, onAddEmpty }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return STAGE_TYPES;
    return STAGE_TYPES.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 12,
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
        <I n="book-open" s={13} />
        Bibliothèque
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher…"
        style={{ fontSize: 11 }}
      />

      <Btn
        small
        onClick={onAddEmpty}
        style={{ width: "100%", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      >
        <I n="plus" s={12} /> Colonne vide
      </Btn>

      <div style={{ fontSize: 10, color: T.text3, marginTop: 4, marginBottom: -2 }}>
        Glissez ou cliquez pour ajouter
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: T.text3, fontSize: 11, fontStyle: "italic", padding: 20 }}>
            Aucun stage
          </div>
        )}
        {filtered.map((s) => (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("stageType", JSON.stringify(s));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAddStage(s)}
            title={`Ajouter: ${s.label}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 8,
              background: T.surface,
              border: `1.5px solid ${s.color}40`,
              cursor: "grab",
              transition: "all .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = s.color + "14")}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.surface)}
          >
            <div
              style={{
                width: 22, height: 22, borderRadius: 6,
                background: s.color + "25",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: s.color, flexShrink: 0,
              }}
            >
              <I n={s.icon} s={12} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
