// S3.1 — BroadcastChannel cross-tab sync (scope fin par companyId + collabId).
// API navigateur native, 0 dépendance externe.
// Fallback silencieux si BroadcastChannel n'est pas dispo (Safari <15.4, IE11).

let channel = null;
let channelKey = '';

export function initBroadcast(companyId, collabId) {
  if (typeof BroadcastChannel === 'undefined') return false;
  const key = `planora-${companyId || 'anon'}-${collabId || 'anon'}`;
  if (channel && channelKey === key) return true;
  if (channel) { try { channel.close(); } catch (_) {} }
  try {
    channel = new BroadcastChannel(key);
    channelKey = key;
    return true;
  } catch (_) {
    channel = null;
    channelKey = '';
    return false;
  }
}

export function publishBroadcast(type, payload) {
  if (!channel) return;
  try { channel.postMessage({ type, payload, ts: Date.now() }); } catch (_) {}
}

// Retourne une fonction de cleanup à appeler au unmount.
export function subscribeBroadcast(handler) {
  if (!channel) return () => {};
  const fn = (event) => {
    try { if (event?.data) handler(event.data); } catch (_) {}
  };
  channel.addEventListener('message', fn);
  return () => { try { channel.removeEventListener('message', fn); } catch (_) {} };
}

export function closeBroadcast() {
  if (channel) { try { channel.close(); } catch (_) {} }
  channel = null;
  channelKey = '';
}
