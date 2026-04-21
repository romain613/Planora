// ═══════════════════════════════════════════════════════════════════════════
// StageConfigPanel — Zone C du builder (édition d'une colonne sélectionnée)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { T } from "../../../../theme";
import { I, Btn, Input } from "../../../../shared/ui";
import { COLOR_PRESETS, CURATED_ICONS } from "../constants";

export default function StageConfigPanel({ stage, stagesCount, onUpdate, onDelete, onClose }) {
  const [iconSearch, setIconSearch] = useState("");

  if (!stage) {
    return (
      <div
        style={{
          width: 300, minWidth: 300, flexShrink: 0,
          display: "flex", flexDirection: "column",
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: 12, gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
          <I n="sliders" s={13} />
          Configuration
        </div>
        <div
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: T.text3, fontSize: 11, fontStyle: "italic", textAlign: "center", padding: 20,
          }}
        >
          Sélectionnez une colonne du canvas pour l'éditer.
        </div>
      </div>
    );
  }

  const filteredIcons = iconSearch.trim()
    ? CURATED_ICONS.filter((ic) => ic.toLowerCase().includes(iconSearch.trim().toLowerCase()))
    : CURATED_ICONS;

  return (
    <div
      style={{
        width: 300, minWidth: 300, flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: 12, gap: 12, overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
          <I n="sliders" s={13} />
          Configuration
        </div>
        <span onClick={onClose} style={{ cursor: "pointer", color: T.text3 }} title="Désélectionner">
          <I n="x" s={14} />
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Libellé */}
        <label style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>Libellé</label>
        <Input
          value={stage.label || ""}
          onChange={(e) => onUpdate({ label: e.target.value.slice(0, 30) })}
          placeholder="Nom de la colonne"
          style={{ fontSize: 12 }}
        />

        {/* Couleur */}
        <label style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>Couleur</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
          {COLOR_PRESETS.map((c) => (
            <div
              key={c.value}
              onClick={() => onUpdate({ color: c.value })}
              title={c.name}
              style={{
                width: "100%", paddingBottom: "100%", borderRadius: 6,
                background: c.value, cursor: "pointer",
                border: stage.color === c.value ? `2.5px solid ${T.text}` : `1.5px solid ${T.border}`,
                transition: "all .15s",
                position: "relative",
              }}
            />
          ))}
        </div>
        <input
          type="color"
          value={stage.color || "#7C3AED"}
          onChange={(e) => onUpdate({ color: e.target.value })}
          style={{ width: "100%", height: 26, borderRadius: 6, border: `1px solid ${T.border}`, cursor: "pointer", background: T.surface }}
          title="Couleur personnalisée"
        />

        {/* Icône */}
        <label style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>Icône</label>
        <Input
          value={iconSearch}
          onChange={(e) => setIconSearch(e.target.value)}
          placeholder="Rechercher une icône"
          style={{ fontSize: 11 }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 4,
            maxHeight: 140,
            overflowY: "auto",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 6,
          }}
        >
          {filteredIcons.map((ic) => (
            <div
              key={ic}
              onClick={() => onUpdate({ icon: ic })}
              title={ic}
              style={{
                width: 30, height: 30, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: stage.icon === ic ? (stage.color || T.accent) + "30" : "transparent",
                border: stage.icon === ic ? `2px solid ${stage.color || T.accent}` : `1px solid ${T.border}`,
                cursor: "pointer",
                color: stage.icon === ic ? stage.color || T.accent : T.text2,
                transition: "all .12s",
              }}
            >
              <I n={ic} s={14} />
            </div>
          ))}
          {filteredIcons.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", fontSize: 10, color: T.text3, padding: 10 }}>
              Aucune icône
            </div>
          )}
        </div>

        {/* Position (readonly car géré par drag) */}
        <label style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>Position</label>
        <div style={{ fontSize: 12, color: T.text3 }}>
          #{(stage.position || 0) / 10} sur {stagesCount} (modifiable par drag dans le canvas)
        </div>

        {/* Règles métier — Phase v1.1+ (disabled) */}
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "flex", alignItems: "center", gap: 4 }}>
            <I n="lock" s={10} /> Règles métier (bientôt)
          </label>
          {["Exige une note", "Exige un RDV", "Exige un contrat", "SMS auto entrée/sortie"].map((r) => (
            <label
              key={r}
              style={{
                fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 6,
                opacity: 0.5,
              }}
              title="Disponible en v1.1"
            >
              <input type="checkbox" disabled style={{ cursor: "not-allowed" }} /> {r}
            </label>
          ))}
        </div>
      </div>

      {/* Supprimer */}
      <Btn
        onClick={() => {
          if (confirm(`Supprimer la colonne "${stage.label || '(sans nom)'}" ?`)) onDelete();
        }}
        style={{
          background: T.danger + "18",
          color: T.danger,
          border: `1px solid ${T.danger}40`,
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <I n="trash-2" s={12} /> Supprimer cette colonne
      </Btn>
    </div>
  );
}
