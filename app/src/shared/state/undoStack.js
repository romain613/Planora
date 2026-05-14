// shared/state/undoStack.js — V1.10.4-r11.0.18 Undo/Redo Phase A SAFE
//
// Singleton tab-scoped (cohérent _T.* pattern). Couvre handleCollabUpdateContact
// uniquement Phase A. Max 5 entrées FIFO, TTL 60s pour race conditions.
//
// Exclusions Phase 1 (non-undoable v1) :
// - Cascade perdu → bookings cancel (emails/sync externe)
// - updateBooking / sendNotification (emails clients)
// - SMS auto pipeline rules (envoyés client)
// - sync Google/Outlook bidirectionnelle
// - pipeline_history immuable (audit trail)
// - ResponseFiller setAnswer autosave (granularité per-keystroke flou)
//
// Format entrée :
// {
//   id: string (uuid),
//   type: 'contact.update' | 'pipeline.stage',
//   entityId: string (contact.id),
//   label: string ("Modification fiche Olivier M'BABU"),
//   apply: () => void,  // restaure le nextState (REDO)
//   revert: () => void, // restaure le previousState (UNDO)
//   timestamp: number,  // Date.now() pour TTL check
//   _prevSnapshot: object, // pour debug / inspect
//   _nextUpdates: object,  // pour debug / inspect
// }

const MAX_HISTORY = 5;
const TTL_MS = 60_000; // 60s pour race conditions multi-user

const state = {
  undoStack: [],
  redoStack: [],
  listeners: new Set(), // callbacks pour re-render UI
  _undoInProgress: false, // lock pendant revert/apply
};

let _uidCounter = 0;
const _uid = () => `undo_${Date.now()}_${++_uidCounter}`;

function _notify() {
  state.listeners.forEach(cb => { try { cb(); } catch (e) { console.warn('[undoStack] listener err', e); } });
}

function _isStale(entry) {
  return Date.now() - entry.timestamp > TTL_MS;
}

function _purgeStale(stack) {
  while (stack.length && _isStale(stack[0])) stack.shift();
}

/**
 * Push a new action onto the undoStack.
 * Clears redoStack (new action invalidates forward history).
 *
 * @param {object} entry
 * @param {string} entry.type
 * @param {string} entry.entityId
 * @param {string} entry.label
 * @param {Function} entry.apply - restores nextState (for REDO)
 * @param {Function} entry.revert - restores previousState (for UNDO)
 * @param {object} entry._prevSnapshot - debug only
 * @param {object} entry._nextUpdates - debug only
 */
export function pushAction(entry) {
  if (state._undoInProgress) return; // anti récursion : reverts/applies ne pushent pas
  if (!entry || typeof entry.apply !== 'function' || typeof entry.revert !== 'function') {
    console.warn('[undoStack] pushAction : apply/revert manquants', entry);
    return;
  }
  const full = {
    id: _uid(),
    timestamp: Date.now(),
    ...entry,
  };
  state.undoStack.push(full);
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  // Clear redo stack on new action (cohérent navigateur)
  state.redoStack = [];
  _notify();
}

/**
 * Pop dernière action undoStack, exécute revert, push to redoStack.
 * Returns the entry (pour notif "Action annulée : X") ou null si vide/stale.
 */
export function undo() {
  _purgeStale(state.undoStack);
  if (!state.undoStack.length) return null;
  const entry = state.undoStack.pop();
  state._undoInProgress = true;
  try {
    entry.revert();
  } catch (e) {
    console.error('[undoStack] revert failed', e);
    state._undoInProgress = false;
    _notify();
    return null;
  }
  state._undoInProgress = false;
  state.redoStack.push(entry);
  if (state.redoStack.length > MAX_HISTORY) state.redoStack.shift();
  _notify();
  return entry;
}

/**
 * Pop dernière action redoStack, exécute apply, push to undoStack.
 */
export function redo() {
  _purgeStale(state.redoStack);
  if (!state.redoStack.length) return null;
  const entry = state.redoStack.pop();
  state._undoInProgress = true;
  try {
    entry.apply();
  } catch (e) {
    console.error('[undoStack] apply failed', e);
    state._undoInProgress = false;
    _notify();
    return null;
  }
  state._undoInProgress = false;
  state.undoStack.push(entry);
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  _notify();
  return entry;
}

/** Returns true if undoStack has at least 1 non-stale entry */
export function canUndo() {
  _purgeStale(state.undoStack);
  return state.undoStack.length > 0;
}

/** Returns true if redoStack has at least 1 non-stale entry */
export function canRedo() {
  _purgeStale(state.redoStack);
  return state.redoStack.length > 0;
}

/** Returns label of next undo target (for tooltip) */
export function nextUndoLabel() {
  _purgeStale(state.undoStack);
  return state.undoStack.length ? state.undoStack[state.undoStack.length - 1].label : '';
}

/** Returns label of next redo target (for tooltip) */
export function nextRedoLabel() {
  _purgeStale(state.redoStack);
  return state.redoStack.length ? state.redoStack[state.redoStack.length - 1].label : '';
}

/** Subscribe to stack changes (returns unsubscribe fn) */
export function subscribe(callback) {
  state.listeners.add(callback);
  return () => state.listeners.delete(callback);
}

/** Clear all history (e.g. on logout) */
export function clear() {
  state.undoStack = [];
  state.redoStack = [];
  _notify();
}

/** Debug : expose state read-only */
export function _debug() {
  return {
    undoStack: state.undoStack.map(e => ({ type: e.type, label: e.label, ts: e.timestamp })),
    redoStack: state.redoStack.map(e => ({ type: e.type, label: e.label, ts: e.timestamp })),
    undoInProgress: state._undoInProgress,
  };
}
