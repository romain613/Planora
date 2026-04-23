// server/services/shadowCompare.js
// STEP 5 Phase 5A — Shadow mode : compare lectures monolithe vs tenant DB.
//
// Contrat :
//   - Monolithe = source de verite. Son resultat est TOUJOURS renvoye.
//   - Tenant fetch peut throw : on log et on swallow. Aucune erreur remonte au caller.
//   - Diff persiste UNIQUEMENT en cas de mismatch (hash != ou tenant a throw).
//   - Hash deterministe via stableStringify (tri de cles recursif) : evite les faux diffs
//     dus a un ordre de cles different entre 2 SELECT.
//   - payloadSample borne a ~2000 chars pour eviter de gonfler la table.
//
// Safe-failure : en cas d'erreur DANS la logique shadow elle-meme (hash, insert CT...),
// on catch en silence. La valeur monolithe reste renvoyee.

import crypto from 'crypto';
import ct from '../db/controlTower.js';

const PAYLOAD_SAMPLE_MAX_CHARS = 2000;
const MAX_ROWS_IN_SAMPLE = 5;

/**
 * JSON.stringify deterministe : tri lexicographique des cles a tous les niveaux.
 * Gere objets imbriques, arrays, null, undefined (undefined -> null pour stabilite).
 * Types speciaux (Date, Buffer) ramenes en string/base64 avant hash.
 */
export function stableStringify(value) {
  return JSON.stringify(_stable(value));
}

function _stable(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (v instanceof Date) return { __date: v.toISOString() };
  if (Buffer.isBuffer(v)) return { __buf: v.toString('base64') };
  if (Array.isArray(v)) return v.map(_stable);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = _stable(v[k]);
    return out;
  }
  return v;
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Compte les "rows" de maniere robuste :
 * - Array → length
 * - Objet avec .rows | .items | .data Array → length
 * - Autre → 1 (objet simple) ou 0 (falsy)
 */
function countRows(payload) {
  if (payload == null) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === 'object') {
    for (const key of ['rows', 'items', 'data']) {
      if (Array.isArray(payload[key])) return payload[key].length;
    }
    return 1;
  }
  return 0;
}

/**
 * Extrait un echantillon borne du payload pour diagnostic.
 * - Arrays : tronque aux MAX_ROWS_IN_SAMPLE premiers elements
 * - Objets : garde tel quel mais tronque la serialisation a PAYLOAD_SAMPLE_MAX_CHARS
 */
function extractSample(payload) {
  try {
    let sample = payload;
    if (Array.isArray(payload) && payload.length > MAX_ROWS_IN_SAMPLE) {
      sample = {
        __truncatedArray: true,
        totalLength: payload.length,
        first: payload.slice(0, MAX_ROWS_IN_SAMPLE),
      };
    }
    const str = stableStringify(sample);
    if (str.length <= PAYLOAD_SAMPLE_MAX_CHARS) return str;
    return str.slice(0, PAYLOAD_SAMPLE_MAX_CHARS - 15) + '...[TRUNCATED]';
  } catch {
    return '[sample-unavailable]';
  }
}

/**
 * Enregistre un diff dans la control tower.
 * Ne throw JAMAIS (toute erreur est swallowed + loggee).
 */
function persistDiff({ companyId, route, feature, monolithHash, tenantHash, monolithRowCount, tenantRowCount, payloadSample, tenantError }) {
  try {
    ct.prepare(`
      INSERT INTO tenant_shadow_diffs
        (companyId, route, feature, timestamp, monolithHash, tenantHash, monolithRowCount, tenantRowCount, payloadSample, tenantError)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `).run(companyId, route, feature, monolithHash, tenantHash, monolithRowCount, tenantRowCount, payloadSample, tenantError);
  } catch (e) {
    // On ne veut surtout pas casser la route. On log et on continue.
    console.warn('[SHADOW] persistDiff failed:', e.message);
  }
}

/**
 * Execute monolith + tenant en parallele et retourne TOUJOURS le resultat monolithe.
 * Log un diff dans tenant_shadow_diffs UNIQUEMENT en cas de mismatch ou d'erreur tenant.
 *
 * @param {object} opts
 * @param {string} opts.companyId       id de la company (doit etre en mode shadow sur la feature)
 * @param {string} opts.feature         clef du tenantFeatures JSON (ex: 'contacts')
 * @param {string} opts.route           label route pour log (ex: 'GET /api/data/contacts')
 * @param {() => any|Promise<any>} opts.fetchMonolith fonction qui renvoie le payload monolithe
 * @param {() => any|Promise<any>} opts.fetchTenant   fonction qui renvoie le payload tenant
 * @returns {Promise<any>} payload monolithe (source de verite)
 */
export async function shadowCompare({ companyId, feature, route, fetchMonolith, fetchTenant }) {
  // Le fetch monolith doit etre fiable ; si lui throw, on laisse remonter (comportement actuel).
  const [monoResult, tenResult] = await Promise.allSettled([
    Promise.resolve().then(fetchMonolith),
    Promise.resolve().then(fetchTenant),
  ]);

  // Monolithe en echec : propager l'erreur d'origine, pas de diff a logger.
  if (monoResult.status === 'rejected') {
    throw monoResult.reason;
  }
  const monolithValue = monoResult.value;

  // Logique shadow : jamais bloquante. Tout est en try/catch.
  try {
    if (tenResult.status === 'rejected') {
      // Tenant a throw : log un diff marque comme erreur tenant, monolithe reste renvoyee.
      const monoSample = extractSample(monolithValue);
      const monoHash = sha256Hex(stableStringify(monolithValue));
      persistDiff({
        companyId, route, feature,
        monolithHash: monoHash,
        tenantHash: null,
        monolithRowCount: countRows(monolithValue),
        tenantRowCount: null,
        payloadSample: monoSample,
        tenantError: (tenResult.reason && tenResult.reason.message) || String(tenResult.reason),
      });
      return monolithValue;
    }

    const tenantValue = tenResult.value;
    const monoStable = stableStringify(monolithValue);
    const tenStable = stableStringify(tenantValue);
    const monoHash = sha256Hex(monoStable);
    const tenHash = sha256Hex(tenStable);

    if (monoHash !== tenHash) {
      // Echantillon = monolith (source de verite). Le diff precis se reconstruira a la demande.
      persistDiff({
        companyId, route, feature,
        monolithHash: monoHash,
        tenantHash: tenHash,
        monolithRowCount: countRows(monolithValue),
        tenantRowCount: countRows(tenantValue),
        payloadSample: extractSample(monolithValue),
        tenantError: null,
      });
    }
    // Match : on n'ecrit RIEN (table reste compacte).
  } catch (e) {
    // La machinerie shadow elle-meme a foire : on ne casse pas la prod.
    console.warn('[SHADOW] compare internal error:', e.message);
  }

  return monolithValue;
}
