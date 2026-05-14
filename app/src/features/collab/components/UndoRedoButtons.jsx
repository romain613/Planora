// UndoRedoButtons — V1.10.4-r11.0.19 Phase A bis SAFE
//
// 3 variants :
// - 'sidebar' (defaut)  : 2 boutons larges full-width, label texte "← Retour arriere" / "→ Retour avant",
//                          compteur X/5 visible, tooltip explicite, etat grise clair lisible.
//                          Shortcuts clavier (Cmd+Z, Cmd+Shift+Z, Ctrl+Z, Ctrl+Y) attaches ici.
// - 'collapsed'         : 2 icones verticales pour sidebar repliee (40x36, sans label).
// - 'compact' (legacy)  : icones 28x28 inline pour header (non utilise depuis r11.0.19).
//
// Source de verite : shared/state/undoStack.js (singleton tab-scoped, max 5 FIFO, TTL 60s).
// Couvre Phase A (contact.update via handleCollabUpdateContact) + Phase A bis (pipeline.stage drag simple).

import React, { useEffect, useState } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import {
  undo as _undo,
  redo as _redo,
  canUndo as _canUndo,
  canRedo as _canRedo,
  nextUndoLabel,
  nextRedoLabel,
  undoCount as _undoCount,
  redoCount as _redoCount,
  HISTORY_MAX,
  subscribe as _subscribe,
} from "../../../shared/state/undoStack";

const UndoRedoButtons = ({ showNotif, variant = "sidebar" }) => {
  // Tick state pour re-render quand le stack change
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = _subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const canUndo = _canUndo();
  const canRedo = _canRedo();
  const undoLabel = nextUndoLabel();
  const redoLabel = nextRedoLabel();
  const undoN = _undoCount();
  const redoN = _redoCount();

  const handleUndo = () => {
    const entry = _undo();
    if (!entry || typeof showNotif !== "function") return;
    showNotif(`↶ Action annulée : ${entry.label}`, "info");
  };

  const handleRedo = () => {
    const entry = _redo();
    if (!entry || typeof showNotif !== "function") return;
    showNotif(`↷ Action rétablie : ${entry.label}`, "success");
  };

  // Shortcuts clavier cross-platform — attaches une seule fois (singleton sidebar/collapsed)
  // En mode 'compact' (legacy) on ne les rebrancha pas pour eviter double-fire si plusieurs instances.
  useEffect(() => {
    if (variant === "compact") return;
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const isMac = (navigator.platform || "").toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // ── Variant : sidebar (V1.10.4-r11.0.19.b — minimaliste premium Notion/Linear) ──
  // 2 boutons ronds 32x32 icone seule horizontale, badge compteur discret en corner,
  // tooltip au hover, hover background subtil, disabled opacite 0.35. Aucun label texte.
  if (variant === "sidebar") {
    const iconBtnStyle = (active) => ({
      width: 32,
      height: 32,
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: active ? "pointer" : "not-allowed",
      opacity: active ? 1 : 0.35,
      color: active ? T.text2 : T.text3,
      background: "transparent",
      border: "none",
      padding: 0,
      position: "relative",
      transition: "background .12s, opacity .12s",
      fontFamily: "inherit",
    });
    const badgeStyle = {
      position: "absolute",
      top: -3,
      right: -3,
      background: T.accent,
      color: "#fff",
      fontSize: 9,
      fontWeight: 700,
      borderRadius: 7,
      padding: "0 4px",
      minWidth: 14,
      height: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `1.5px solid ${T.surface}`,
      lineHeight: 1,
      pointerEvents: "none",
    };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          onClick={canUndo ? handleUndo : undefined}
          disabled={!canUndo}
          title={canUndo ? `Annuler : ${undoLabel} (Cmd+Z)` : "Aucune action à annuler"}
          aria-label="Retour arrière"
          style={iconBtnStyle(canUndo)}
          onMouseEnter={(e) => {
            if (canUndo) e.currentTarget.style.background = T.accentBg;
          }}
          onMouseLeave={(e) => {
            if (canUndo) e.currentTarget.style.background = "transparent";
          }}
        >
          <I n="rotate-ccw" s={16} />
          {canUndo && undoN > 0 && <span style={badgeStyle}>{undoN}</span>}
        </button>
        <button
          type="button"
          onClick={canRedo ? handleRedo : undefined}
          disabled={!canRedo}
          title={canRedo ? `Rétablir : ${redoLabel} (Cmd+Shift+Z)` : "Aucune action à rétablir"}
          aria-label="Retour avant"
          style={iconBtnStyle(canRedo)}
          onMouseEnter={(e) => {
            if (canRedo) e.currentTarget.style.background = T.accentBg;
          }}
          onMouseLeave={(e) => {
            if (canRedo) e.currentTarget.style.background = "transparent";
          }}
        >
          <I n="rotate-cw" s={16} />
          {canRedo && redoN > 0 && <span style={badgeStyle}>{redoN}</span>}
        </button>
      </div>
    );
  }

  // ── Variant : collapsed (sidebar repliee) ──
  if (variant === "collapsed") {
    const iconBtnStyle = (active) => ({
      width: 40,
      height: 36,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: active ? "pointer" : "not-allowed",
      opacity: active ? 1 : 0.35,
      transition: "all .12s",
      position: "relative",
    });
    return (
      <>
        <div
          onClick={canUndo ? handleUndo : undefined}
          title={canUndo ? `Annuler : ${undoLabel} (${undoN}/${HISTORY_MAX})` : "Rien à annuler"}
          style={iconBtnStyle(canUndo)}
          onMouseEnter={(e) => {
            if (canUndo) e.currentTarget.style.background = T.accentBg;
          }}
          onMouseLeave={(e) => {
            if (canUndo) e.currentTarget.style.background = "transparent";
          }}
        >
          <I n="rotate-ccw" s={18} style={{ color: canUndo ? T.text2 : T.text3 }} />
          {canUndo && undoN > 0 && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                background: T.accent,
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                borderRadius: 8,
                padding: "1px 4px",
                minWidth: 12,
                textAlign: "center",
              }}
            >
              {undoN}
            </span>
          )}
        </div>
        <div
          onClick={canRedo ? handleRedo : undefined}
          title={canRedo ? `Rétablir : ${redoLabel} (${redoN}/${HISTORY_MAX})` : "Rien à rétablir"}
          style={iconBtnStyle(canRedo)}
          onMouseEnter={(e) => {
            if (canRedo) e.currentTarget.style.background = T.accentBg;
          }}
          onMouseLeave={(e) => {
            if (canRedo) e.currentTarget.style.background = "transparent";
          }}
        >
          <I n="rotate-cw" s={18} style={{ color: canRedo ? T.text2 : T.text3 }} />
          {canRedo && redoN > 0 && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                background: T.accent,
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                borderRadius: 8,
                padding: "1px 4px",
                minWidth: 12,
                textAlign: "center",
              }}
            >
              {redoN}
            </span>
          )}
        </div>
      </>
    );
  }

  // ── Variant : compact (legacy mini icons, non utilise depuis r11.0.19) ──
  const btnStyle = (active) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    cursor: active ? "pointer" : "not-allowed",
    opacity: active ? 0.85 : 0.3,
    color: T.text2 || T.text,
    background: "transparent",
    border: "1px solid " + (active ? T.border : "transparent"),
    transition: "all .12s",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div
        onClick={canUndo ? handleUndo : undefined}
        title={canUndo ? `Annuler : ${undoLabel} (Cmd+Z)` : "Aucune action à annuler"}
        style={btnStyle(canUndo)}
      >
        <I n="rotate-ccw" s={14} />
      </div>
      <div
        onClick={canRedo ? handleRedo : undefined}
        title={canRedo ? `Rétablir : ${redoLabel} (Cmd+Shift+Z)` : "Aucune action à rétablir"}
        style={btnStyle(canRedo)}
      >
        <I n="rotate-cw" s={14} />
      </div>
    </div>
  );
};

export default UndoRedoButtons;
