// services/api.js — Phase 3 extraction of API wrapper + helpers

export const API_BASE = import.meta.env.VITE_API_URL || "";

export const recUrl = (callLogId) => { try { const t = JSON.parse(localStorage.getItem("calendar360-session")||"null")?.token; return `${API_BASE}/api/voip/recording/${callLogId}${t?'?token='+encodeURIComponent(t):''}`; } catch { return `${API_BASE}/api/voip/recording/${callLogId}`; } };

// _autoTicketCompanyId is mutable; ESM imports are read-only,
// so we expose getter/setter pairs for App.jsx to mutate safely.
let _autoTicketCompanyId = null; // set by AdminDash on mount
export function getAutoTicketCompanyId() { return _autoTicketCompanyId; }
export function setAutoTicketCompanyId(v) { _autoTicketCompanyId = v; }

export const collectEnv = () => ({ browser: navigator.userAgent, screen: `${screen.width}x${screen.height}`, url: window.location.href, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language, timestamp: new Date().toISOString() });

export const api = (path, opts = {}) => {
  const url = `${API_BASE}${path}`;
  const config = { headers: { "Content-Type": "application/json" }, ...opts };
  // Inject auth token from session
  try {
    const sess = JSON.parse(localStorage.getItem("calendar360-session") || "null");
    if (sess?.token) config.headers["Authorization"] = "Bearer " + sess.token;
  } catch {}
  if (config.body && typeof config.body === "object") config.body = JSON.stringify(config.body);
  return fetch(url, config).then(r => {
    // Handle 401 — session expired → redirect to login
    if (r.status === 401 && !path.includes('/api/auth/')) {
      localStorage.removeItem("calendar360-session");
      window.location.reload();
      return null;
    }
    // Handle 403 — insufficient permissions
    if (r.status === 403) {
      return r.json().then(d => ({ error: d?.error || "Accès interdit", _forbidden: true, _pending: d?._pending, _rejected: d?._rejected, reason: d?.reason })).catch(() => ({ error: "Accès interdit", _forbidden: true }));
    }
    if (!r.ok && r.status >= 500 && _autoTicketCompanyId && !path.includes('/api/tickets')) {
      const env = collectEnv(); env.failedRequest = { path, method: opts.method || 'GET', status: r.status };
      fetch(`${API_BASE}/api/tickets`, { method:'POST', headers:{"Content-Type":"application/json"}, body:JSON.stringify({ companyId:_autoTicketCompanyId, type:'auto_api_error', category:'bug', subject:`API ${r.status}: ${path.substring(0,60)}`, description:`${opts.method||'GET'} ${path} → ${r.status}`, environment_json:JSON.stringify(env) }) }).catch(()=>{});
    }
    return r.json();
  }).catch(err => { console.warn("[API]", err.message); return null; });
};
