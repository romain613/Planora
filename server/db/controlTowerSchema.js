// server/db/controlTowerSchema.js
// Schema de la control tower (tables globales + routing tenant).
// Ajustements MH :
//   - companies.tenantMode : 'legacy' | 'tenant' (routing dynamique pendant migration)
//   - sessions.tenantMode : copie au moment du login pour eviter hit control tower a chaque requete
//   - tenant_databases : dbPath base sur companyId (pas slug)

import ct from './controlTower.js';

export function initControlTowerSchema() {
  ct.exec(`
    -- Tenants eux-memes
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,                       -- uniquement pour UI/storage folder, JAMAIS pour routing
      domain TEXT,
      plan TEXT DEFAULT 'free',
      contactEmail TEXT,
      active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',           -- active | suspended | migrating | archived
      tenantMode TEXT DEFAULT 'legacy',       -- legacy | tenant  (routing dynamique migration)
      createdAt TEXT,
      migratedAt TEXT,                        -- timestamp de bascule tenant
      archivedAt TEXT
    );

    -- Mapping companyId -> chemin DB tenant
    CREATE TABLE IF NOT EXISTS tenant_databases (
      companyId TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      dbPath TEXT NOT NULL,                   -- /var/www/planora-data/tenants/<companyId>.db
      storagePath TEXT NOT NULL,              -- /var/www/planora-data/storage/<slug-or-id>/
      schemaVersion INTEGER DEFAULT 1,
      provisionedAt TEXT,
      lastMigrationAt TEXT,
      lastIntegrityCheck TEXT,
      lastIntegrityStatus TEXT,               -- 'ok' ou le detail de l'erreur
      sizeBytes INTEGER DEFAULT 0
    );

    -- Sessions (tokens) globales : lookup unique pour requireAuth
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      collaboratorId TEXT NOT NULL,
      companyId TEXT NOT NULL,
      role TEXT NOT NULL,                     -- admin | member | supra
      tenantMode TEXT DEFAULT 'legacy',       -- snapshot du mode au login (evite hit CT a chaque requete)
      createdAt TEXT,
      expiresAt TEXT,
      lastUsedAt TEXT
    );

    -- Supra Admins (acces plateforme transverse)
    CREATE TABLE IF NOT EXISTS supra_admins (
      email TEXT PRIMARY KEY,
      name TEXT,
      mfaEnabled INTEGER DEFAULT 0,
      addedAt TEXT
    );

    -- Historique des changements d'etat tenant (audit migration)
    CREATE TABLE IF NOT EXISTS tenant_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      previousStatus TEXT,
      newStatus TEXT,
      previousMode TEXT,
      newMode TEXT,
      reason TEXT,
      actor TEXT,
      changedAt TEXT
    );

    -- Registre des backups (auto + manuels + pre-migration)
    CREATE TABLE IF NOT EXISTS backup_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT,                          -- NULL = backup control tower
      kind TEXT NOT NULL,                      -- auto | manual | pre-migration | pre-cutover
      filepath TEXT NOT NULL,
      sizeBytes INTEGER,
      createdAt TEXT,
      retentionUntil TEXT
    );

    -- Plans commerciaux
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      label TEXT,
      maxCollaborators INTEGER,
      maxContacts INTEGER,
      priceMonthly INTEGER,
      features_json TEXT DEFAULT '[]'
    );

    -- Snapshots analytics Supra (evite N queries live)
    CREATE TABLE IF NOT EXISTS supra_stats_snapshots (
      companyId TEXT PRIMARY KEY,
      contacts INTEGER DEFAULT 0,
      collaborators INTEGER DEFAULT 0,
      calendars INTEGER DEFAULT 0,
      bookings INTEGER DEFAULT 0,
      callSeconds INTEGER DEFAULT 0,
      smsCount INTEGER DEFAULT 0,
      snapshotAt TEXT
    );

    -- STEP 5 — Shadow mode : log des divergences de lecture entre monolithe et tenant DB.
    -- Seuls les mismatches sont enregistres. Utilise pour detecter drift avant cutover.
    CREATE TABLE IF NOT EXISTS tenant_shadow_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      route TEXT NOT NULL,                      -- ex: 'GET /api/data/contacts'
      feature TEXT NOT NULL,                    -- ex: 'contacts' (clef du tenantFeatures JSON)
      timestamp TEXT NOT NULL,                  -- ISO datetime
      monolithHash TEXT,                        -- sha256 hex du payload normalise monolithe
      tenantHash TEXT,                          -- sha256 hex du payload normalise tenant
      monolithRowCount INTEGER,                 -- nb de rows/items dans le payload monolithe
      tenantRowCount INTEGER,                   -- nb de rows/items dans le payload tenant
      payloadSample TEXT,                       -- echantillon borne (max ~2000 chars) pour diagnostic
      tenantError TEXT                          -- non-null si tenant fetch a throw (diff non calculable)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_sessions_company ON sessions(companyId);
    CREATE INDEX IF NOT EXISTS idx_sessions_collab ON sessions(collaboratorId);
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
    CREATE INDEX IF NOT EXISTS idx_companies_mode ON companies(tenantMode);
    CREATE INDEX IF NOT EXISTS idx_backup_company ON backup_registry(companyId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_history_company ON tenant_status_history(companyId, changedAt);
    CREATE INDEX IF NOT EXISTS idx_shadow_diffs_lookup
      ON tenant_shadow_diffs(companyId, feature, timestamp DESC);
  `);

  // Migration additive idempotente (STEP 5 — feature flag par route)
  // ALTER TABLE ... ADD COLUMN throw si la colonne existe deja → swallow silencieusement.
  try {
    ct.exec(`ALTER TABLE companies ADD COLUMN tenantFeatures TEXT DEFAULT '{}'`);
    console.log('[CONTROL TOWER] companies.tenantFeatures column added');
  } catch (e) {
    if (!/duplicate column/i.test(e.message)) {
      console.warn('[CONTROL TOWER] ALTER companies.tenantFeatures warning:', e.message);
    }
    // Colonne deja presente : no-op
  }

  console.log('[CONTROL TOWER] schema initialized / verified');
}

export default initControlTowerSchema;
