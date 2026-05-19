// server/shared/utils/deepFreeze.js
// Récursivement Object.freeze un objet (objets imbriqués + arrays).
// Idempotent : refreeze d'un objet déjà gelé = no-op.
// Cycles : détecte via WeakSet pour éviter récursion infinie.

const FROZEN_SEEN = Symbol('deepFreezeSeen');

function _freezeRecursive(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  // Freeze own enumerable + non-enumerable property values
  for (const key of Reflect.ownKeys(value)) {
    const child = value[key];
    if (child && typeof child === 'object') {
      _freezeRecursive(child, seen);
    }
  }
  Object.freeze(value);
  return value;
}

/**
 * Récursivement gèle l'objet et tous ses descendants.
 * Sûr face aux cycles.
 * @param {any} value
 * @returns {any} l'objet d'entrée (mutate-in-place + return)
 */
export function deepFreeze(value) {
  return _freezeRecursive(value, new WeakSet());
}

/**
 * Vérifie qu'un objet ET tous ses descendants sont gelés.
 * Utile en test.
 */
export function isDeeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const child = value[key];
    if (child && typeof child === 'object') {
      if (!isDeeplyFrozen(child)) return false;
    }
  }
  return true;
}
