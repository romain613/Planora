// server/shared/utils/objectPath.js
// Get / has / set sur chemin "a.b.c" dans objet profond.
// Pas de mutations sur structures partagées : set retourne une nouvelle référence
// (immutable update, utile pour redux-style state).

function _splitPath(path) {
  if (Array.isArray(path)) return path.map(String);
  if (typeof path !== 'string') throw new TypeError('objectPath: path must be string or array');
  if (path === '') return [];
  return path.split('.');
}

/**
 * Lit une valeur à un chemin donné. Renvoie defaultValue si non trouvé.
 * @param {object} obj
 * @param {string|string[]} path - "a.b.c" ou ["a","b","c"]
 * @param {any} [defaultValue]
 */
export function get(obj, path, defaultValue = undefined) {
  if (obj === null || obj === undefined) return defaultValue;
  const keys = _splitPath(path);
  if (keys.length === 0) return obj;
  let cur = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) return defaultValue;
    if (typeof cur !== 'object') return defaultValue;
    if (!(k in cur)) return defaultValue;
    cur = cur[k];
  }
  return cur === undefined ? defaultValue : cur;
}

/**
 * Vrai si le chemin existe (même si valeur === undefined).
 */
export function has(obj, path) {
  if (obj === null || obj === undefined) return false;
  const keys = _splitPath(path);
  if (keys.length === 0) return true;
  let cur = obj;
  for (let i = 0; i < keys.length; i += 1) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    if (!(keys[i] in cur)) return false;
    cur = cur[keys[i]];
  }
  return true;
}

/**
 * Set immuable : retourne une copie profonde des chemins parents avec la nouvelle valeur.
 * Ne mutate JAMAIS l'objet original.
 * @param {object} obj
 * @param {string|string[]} path
 * @param {any} value
 * @returns {object} nouvelle racine
 */
export function set(obj, path, value) {
  const keys = _splitPath(path);
  if (keys.length === 0) return value;

  const root = (obj === null || obj === undefined) ? {} : { ...obj };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    const existing = cur[k];
    const clone =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...existing }
        : {};
    cur[k] = clone;
    cur = clone;
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}
