// UndoRedoButtons — V1.10.4-r11.0.18 Phase A SAFE
//
// 2 boutons ← / → discrets + shortcuts clavier cross-platform (Cmd+Z/Cmd+Shift+Z + Ctrl+Z/Ctrl+Y).
// Toast confirmation après undo/redo avec bouton "Rétablir" / "Annuler".
//
// Intégration : top bar global header CollabPortal (visible partout, pattern Notion).
// Source de vérité : shared/state/undoStack.js (singleton tab-scoped, max 5 FIFO, TTL 60s).

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
  subscribe as _subscribe,
} from "../../../shared/state/undoStack";

const UndoRedoButtons = ({ showNotif }) => {
  // Tick state pour re-render quand le stack change
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = _subscribe(() => setTick(t => t + 1));
    return unsub;
  }, []);

  const canUndo = _canUndo();
  const canRedo = _canRedo();
  const undoLabel = nextUndoLabel();
  const redoLabel = nextRedoLabel();

  const handleUndo = () => {
    const entry = _undo();
    if (!entry || typeof showNotif !== 'function') return;
    // Toast avec bouton Rétablir (déclenche redo)
    showNotif(`↶ Action annulée : ${entry.label}`, 'info');
  };

  const handleRedo = () => {
    const entry = _redo();
    if (!entry || typeof showNotif !== 'function') return;
    showNotif(`↷ Action rétablie : ${entry.label}`, 'success');
  };

  // Shortcuts clavier cross-platform
  useEffect(() => {
    const onKey = (e) => {
      // Ignore si user tape dans un input/textarea/contenteditable
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const isMac = (navigator.platform || '').toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      // Cmd+Z / Ctrl+Z = undo
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Cmd+Shift+Z (Mac) ou Ctrl+Y (Windows) = redo
      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btnStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 7,
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 0.85 : 0.3,
    color: T.text2 || T.text,
    background: 'transparent',
    border: '1px solid ' + (active ? T.border : 'transparent'),
    transition: 'all .12s',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div
        onClick={canUndo ? handleUndo : undefined}
        title={canUndo ? `Annuler : ${undoLabel} (Cmd+Z)` : 'Aucune action à annuler'}
        style={btnStyle(canUndo)}
        onMouseEnter={e => { if (canUndo) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = T.bg; } }}
        onMouseLeave={e => { if (canUndo) { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.background = 'transparent'; } }}
      >
        <I n="rotate-ccw" s={14} />
      </div>
      <div
        onClick={canRedo ? handleRedo : undefined}
        title={canRedo ? `Rétablir : ${redoLabel} (Cmd+Shift+Z)` : 'Aucune action à rétablir'}
        style={btnStyle(canRedo)}
        onMouseEnter={e => { if (canRedo) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = T.bg; } }}
        onMouseLeave={e => { if (canRedo) { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.background = 'transparent'; } }}
      >
        <I n="rotate-cw" s={14} />
      </div>
    </div>
  );
};

export default UndoRedoButtons;
