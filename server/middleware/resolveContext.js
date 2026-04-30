// ─── SECURITY 2026-04-16 ──────────────────────────────────────────────────
// Middleware `resolveContext` + helper `enforceTenantContext`.
//
// OBJECTIF : lier strictement chaque requete HTTP a l'identite du tenant
// exprimee par le sous-domaine hote, pour eviter qu'un user authentifie sur
// le tenant A puisse naviguer l'UI marquee du tenant B via un subdomain
// usurpe. Zero fallback implicite, echec explicite en cas d'incoherence.
//
// FLUX :
// 1) resolveContext() parse req.headers.host, deduit le subdomain, le mappe
//    a un companyId via la table `companies` (colonne slug, UNIQUE).
//    Resultat pose sur req.tenantContext = { expectedCompanyId, expectedSlug,
//    host, source } ou null (pas de contexte tenant : app/www/api, host local,
//    domaine hors plateforme, etc.).
// 2) enforceTenantContext() compare req.auth.companyId (pose par authenticate)
//    avec req.tenantContext.expectedCompanyId :
//      - match           => next()
//      - supra admin     => next() + log d'audit (cross-tenant autorise)
//      - mismatch        => 403 explicite, payload contient les deux ids
//
// CONFIG :
//   CALENDAR360_BASE_DOMAIN   : domaine de plateforme (def: "calendar360.fr")
//   CALENDAR360_STRICT_SUBDOMAIN : "1" => 404 sur subdomain inconnu
//                                 (def: STRICT si NODE_ENV=production)
//
// CACHE : les slugs sont stables (rares modifications). Un petit cache en
// memoire (TTL 5 min) evite un SELECT par requete. La fonction
// invalidateSlugCache() doit etre appelee quand un slug est
// cree/modifie/desactive (ex : POST /api/companies, PUT /api/companies/:id).

import { db } from '../db/database.js';

const BASE_DOMAIN = (process.env.CALENDAR360_BASE_DOMAIN || 'calendar360.fr').toLowerCase();
const STRICT_MODE =
  process.env.CALENDAR360_STRICT_SUBDOMAIN === '1' ||
  (process.env.NODE_ENV === 'production' && process.env.CALENDAR360_STRICT_SUBDOMAIN !== '0');

// Sous-domaines reserves : points d'entree de la plateforme elle-meme, pas
// des tenants. Toute requete sur ces hotes passe SANS tenantContext.
const RESERVED_SUBDOMAINS = new Set([
  '', 'app', 'www', 'api', 'admin', 'control', 'console',
  'static', 'cdn', 'assets', 'public', 'beta', 'preview',
]);

// Hotes locaux qu'on traverse en dev : aucune resolution tenant.
const LOCAL_HOST_RX = /^(localhost|127\.0\.0\.1|\[?::1\]?|\d{1,3}(?:\.\d{1,3}){3})$/;

// ─── Cache slug → companyId (5 min TTL) ───
const slugCache = new Map();
const SLUG_TTL_MS = 5 * 60 * 1000;

function lookupCompanyBySlug(slug) {
  const now = Date.now();
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > now) return cached.companyId;
  let companyId = null;
  try {
    const row = db
      .prepare('SELECT id FROM companies WHERE slug = ? AND active = 1')
      .get(slug);
    companyId = row ? row.id : null;
  } catch (err) {
    // Table absente / base en cours de migration : pas de cache empoisonne
    console.warn('[resolveContext] lookup failed:', err.message);
    return null;
  }
  slugCache.set(slug, { companyId, expiresAt: now + SLUG_TTL_MS });
  return companyId;
}

/**
 * A appeler apres INSERT/UPDATE/DELETE sur companies (creation d'un tenant,
 * rename de slug, desactivation). Sans argument : purge integrale.
 */
export function invalidateSlugCache(slug) {
  if (!slug) slugCache.clear();
  else slugCache.delete(String(slug).toLowerCase());
}

/**
 * Expose l'etat du middleware (diagnostic interne).
 */
export function getResolveContextConfig() {
  return {
    baseDomain: BASE_DOMAIN,
    strictMode: STRICT_MODE,
    reservedSubdomains: [...RESERVED_SUBDOMAINS],
    cacheSize: slugCache.size,
  };
}

// ─── Middleware 1/2 : resolution subdomain → expectedCompanyId ───
export function resolveContext(req, _res, next) {
  req.tenantContext = null;

  const rawHost = req.headers?.host || req.hostname || '';
  const host = rawHost.split(':')[0].trim().toLowerCase();

  if (!host || LOCAL_HOST_RX.test(host)) {
    // Dev local, pas de notion de tenant par host
    return next();
  }

  if (!host.endsWith(BASE_DOMAIN)) {
    // Domaine externe (ex : domaine personnalise d'un client) — pas de
    // resolution ici ; si un jour on gere les custom domains, on ajoute
    // une lookup par `companies.domain`.
    return next();
  }

  // Extraction stricte du prefix : "x.calendar360.fr" → "x."
  //                                "calendar360.fr"  → ""
  //                                "xcalendar360.fr" → rejet (pas un sous-domaine)
  const prefix = host.slice(0, host.length - BASE_DOMAIN.length);
  if (prefix !== '' && !prefix.endsWith('.')) return next();
  const subdomain = prefix.replace(/\.$/, '');

  if (RESERVED_SUBDOMAINS.has(subdomain)) return next();

  // Resolution slug → companyId
  const expectedCompanyId = lookupCompanyBySlug(subdomain);
  if (!expectedCompanyId) {
    if (STRICT_MODE) {
      // Pas de fallback silencieux : l'inconnu est refuse.
      return _res.status(404).json({
        error: 'Tenant inconnu',
        host,
        slug: subdomain,
        hint: 'Le sous-domaine ne correspond a aucune entreprise active.',
      });
    }
    // En mode non-strict (dev / staging) : on log et on laisse passer sans contexte
    console.warn(`[resolveContext] subdomain inconnu: "${subdomain}" (host=${host})`);
    req.tenantContext = {
      expectedCompanyId: null,
      expectedSlug: subdomain,
      host,
      source: 'subdomain-unknown',
    };
    return next();
  }

  req.tenantContext = {
    expectedCompanyId,
    expectedSlug: subdomain,
    host,
    source: 'subdomain',
  };
  next();
}

// ─── Middleware 2/2 : 403 si session != subdomain (sauf supra) ───
export function enforceTenantContext(req, res, next) {
  const ctx = req.tenantContext;
  // Pas de contexte tenant deduit (host local, reserved, ou externe) → rien a enforcer
  if (!ctx || !ctx.expectedCompanyId) return next();

  const sessionCompanyId = req.auth?.companyId;
  // Pas de session encore (login, public, preflight) → rien a enforcer ici
  if (!sessionCompanyId) return next();

  if (sessionCompanyId === ctx.expectedCompanyId) return next();

  if (req.auth?.isSupra) {
    console.warn(
      `[enforceTenantContext] SUPRA cross-tenant: session=${sessionCompanyId} ` +
      `host=${ctx.host} (slug=${ctx.expectedSlug}, expected=${ctx.expectedCompanyId})`
    );
    return next();
  }

  return res.status(403).json({
    error: 'Session incoherente avec le sous-domaine',
    sessionCompanyId,
    expectedCompanyId: ctx.expectedCompanyId,
    host: ctx.host,
    hint: 'Reconnectez-vous depuis le sous-domaine de votre entreprise.',
  });
}
