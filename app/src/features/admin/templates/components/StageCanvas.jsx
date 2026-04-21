// ═══════════════════════════════════════════════════════════════════════════
// StageCanvas — Zone B du builder (kanban drag/drop)
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { T } from "../../../../theme";
import { I } from "../../../../shared/ui";
import StageCard from "./StageCard";

// Fictifs pour rendu visuel réaliste (preview inline)
const FAKE_CONTACTS = ["Dupont M.", "Martin S.", "Leroux J."];

export default function StageCanvas({
  stages,
  selectedId,
  onSelect,
  onReorder,
  onInsertFromLibrary,
  onDeleteStage,
  showPreviewContacts = false,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [trashHover, setTrashHover] = useState(false);

  const handleInternalDragStart = (e, stageId) => {
    e.dataTransfer.setData("internalStageId", stageId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(stageId);
  };

  const handleDropAtIndex = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIdx(null);
    setDraggingId(null);

    // Drop d'un stage depuis la bibliothèque
    const lib = e.dataTransfer.getData("stageType");
    if (lib) {
      try {
        const parsed = JSON.parse(lib);
        if (parsed && parsed.id && parsed.label) onInsertFromLibrary(parsed, idx);
      } catch {}
      return;
    }

    // Drop interne (réordonnancement)
    const internalId = e.dataTransfer.getData("internalStageId");
    if (internalId) {
      const currentIdx = stages.findIndex((s) => s.id === internalId);
      if (currentIdx < 0 || currentIdx === idx || currentIdx + 1 === idx) return;
      let newIdx = idx;
      if (currentIdx < idx) newIdx -= 1; // ajust car on retire avant insérer
      onReorder(currentIdx, newIdx);
    }
  };

  const handleTrashDrop = (e) => {
    e.preventDefault();
    setTrashHover(false);
    const internalId = e.dataTransfer.getData("internalStageId");
    if (internalId) onDeleteStage(internalId);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 12,
        gap: 10,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
          <I n="layout" s={13} />
          Pipeline ({stages.length} {stages.length > 1 ? "colonnes" : "colonne"})
        </div>
        {stages.length >= 12 && (
          <div style={{ fontSize: 10, color: T.warning, background: T.warning + "15", borderRadius: 4, padding: "2px 6px" }}>
            <I n="alert-triangle" s={10} /> Pipeline long (UX dégradée possible)
          </div>
        )}
      </div>

      {/* Canvas horizontal scrollable */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "4px 2px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, minHeight: 200 }}>
          {/* Drop zone initiale (avant la première colonne) */}
          <DropZone
            active={dragOverIdx === 0}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(0); }}
            onDragLeave={() => setDragOverIdx((p) => (p === 0 ? null : p))}
            onDrop={(e) => handleDropAtIndex(e, 0)}
          />

          {stages.map((s, i) => (
            <React.Fragment key={s.id || `s_${i}`}>
              <StageCard
                stage={s}
                index={i}
                isSelected={selectedId === s.id}
                isDragging={draggingId === s.id}
                onClick={() => onSelect(s.id)}
                onDragStart={(e) => handleInternalDragStart(e, s.id)}
                onDragEnd={() => { setDraggingId(null); setDragOverIdx(null); }}
                previewContacts={showPreviewContacts ? FAKE_CONTACTS : null}
              />
              <DropZone
                active={dragOverIdx === i + 1}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i + 1); }}
                onDragLeave={() => setDragOverIdx((p) => (p === i + 1 ? null : p))}
                onDrop={(e) => handleDropAtIndex(e, i + 1)}
              />
            </React.Fragment>
          ))}

          {/* Placeholder "ajoutez votre première colonne" si vide */}
          {stages.length === 0 && (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 40, border: `2px dashed ${T.border}`, borderRadius: 10,
                color: T.text3, fontSize: 12, fontStyle: "italic",
                minWidth: 280, minHeight: 120,
              }}
            >
              Cliquez ou glissez une colonne depuis la bibliothèque
            </div>
          )}
        </div>
      </div>

      {/* Trash zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setTrashHover(true); }}
        onDragLeave={() => setTrashHover(false)}
        onDrop={handleTrashDrop}
        style={{
          height: 40,
          borderRadius: 8,
          border: `2px dashed ${trashHover ? T.danger : T.border}`,
          background: trashHover ? T.danger + "15" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: trashHover ? T.danger : T.text3,
          fontSize: 11,
          transition: "all .15s",
        }}
      >
        <I n="trash-2" s={12} />
        <span style={{ marginLeft: 6 }}>{trashHover ? "Relâcher pour supprimer" : "Glissez ici pour supprimer une colonne"}</span>
      </div>
    </div>
  );
}

function DropZone({ active, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        width: active ? 40 : 8,
        minWidth: active ? 40 : 8,
        transition: "width .15s, background .15s",
        background: active ? "#7C3AED40" : "transparent",
        borderRadius: active ? 8 : 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#7C3AED",
        fontSize: 16, fontWeight: 900,
      }}
    >
      {active ? <I n="plus" s={14} /> : null}
    </div>
  );
}
