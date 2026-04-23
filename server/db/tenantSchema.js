// server/db/tenantSchema.js
// Genere le schema d'une tenant DB en mirror de la monolithe source.
// Strategie pilote : COPIE IDENTIQUE des CREATE TABLE (y compris colonne companyId).
//   -> zero changement structurel = zero risque de cassure
//   -> rollback trivial (suppression du fichier tenant.db)
//   -> stripping companyId = migration de schema SEPAREE post-cutover si desire

// ─── GLOBAL_TABLES ──────────────────────────────────────────────────────
// Tables GEREES PAR LE CONTROL TOWER (catalogues globaux, cross-tenant par nature).
// Par defaut, elles ne sont PAS ecrites dans les tenant DB par le moteur de migration.
// EXCEPTION : celles qui sont aussi dans TENANT_STUB_TABLES (voir ci-dessous) sont
// repliquees MINIMALEMENT dans chaque tenant pour satisfaire les FK declarees.
export const GLOBAL_TABLES = new Set([
  'companies',
  'sessions',
  'supra_admins',
  'phone_plans',
  'voip_packs',
  'sms_packs',
  'wa_verifications', // OTP WhatsApp indexe sur numero, cross-tenant
]);

// ─── TENANT_STUB_TABLES ─────────────────────────────────────────────────
// Sous-ensemble de GLOBAL_TABLES dont la STRUCTURE est repliquee dans chaque
// tenant DB et dont UNE SEULE LIGNE est seedee : la ligne qui correspond au tenant.
// Pourquoi : plusieurs tables metier ont des FK declarees vers ces tables
// (ex: collaborators.companyId REFERENCES companies). Si companies n'existe pas
// dans la tenant DB, PRAGMA foreign_key_check leve des violations en masse.
// Solution : stub minimal = structure + 1 ligne, les FK sont satisfaites.
//
// Seules les GLOBAL_TABLES *referencees par une FK declaree* depuis une table
// tenant ont besoin de stub. Scan 2026-04-16 -> seule `companies` est concernee.
export const TENANT_STUB_TABLES = new Set([
  'companies',
]);

// ─── INDIRECT_TENANT_TABLES ─────────────────────────────────────────────
// Tables SANS companyId mais rattachees a un parent tenant-scoped (direct ou indirect).
// Le moteur de migration doit les copier via sous-requete recursive sur le parent.
// Format : tableName -> { fk, parent }
//   - fk     : nom de la colonne qui reference le parent
//   - parent : nom de la table parent (doit etre dans INDIRECT_TENANT_TABLES ou avoir companyId)
//
// Chaine supportee (recursion implementee dans tenantMigration.js):
//   reminder_logs -> bookings -> calendars -> companyId
export const INDIRECT_TENANT_TABLES = new Map([
  ['availabilities',   { fk: 'collaboratorId', parent: 'collaborators' }],
  ['bookings',         { fk: 'calendarId',     parent: 'calendars'     }],
  ['google_events',    { fk: 'collaboratorId', parent: 'collaborators' }],
  ['role_permissions', { fk: 'roleId',         parent: 'roles'         }],
  ['ticket_messages',  { fk: 'ticketId',       parent: 'tickets'       }],
  ['reminder_logs',    { fk: 'bookingId',      parent: 'bookings'      }], // 2-hop
]);

// ─── IMPLICIT_FKS ───────────────────────────────────────────────────────
// FK presentes par convention de nommage mais NON declarees en FOREIGN KEY
// dans le schema source. PRAGMA foreign_key_check NE LES VOIT PAS.
// On les valide manuellement post-copie via validateOrphanFks() dans tenantMigration.js.
//
// Scope : SEULEMENT les FK vers des tables presentes dans la tenant DB (hors GLOBAL).
// Parents GLOBAL (companies, etc.) exclus : ils sont en control tower.
// Parents inconnus (callLogs, users, tabId, etc.) exclus par prudence.
//
// Source : scan exhaustif de server/db/database.js (2026-04-16).
export const IMPLICIT_FKS = [
  // collaborators (direct tenant)
  { child: 'ai_agent_sessions',       fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'ai_copilot_reactions',    fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'bookings',                fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_contexts',           fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_form_responses',     fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_live_flags',         fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_logs',               fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_transcript_archive', fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'call_transcripts',        fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'chat_messages',           fk: 'senderId',       parent: 'collaborators' },
  { child: 'collab_heartbeat',        fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'conversation_events',     fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'conversations',           fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'notifications',           fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'phone_numbers',           fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'pipeline_automations',    fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'recommended_actions',     fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'sms_messages',            fk: 'collaboratorId', parent: 'collaborators' },
  { child: 'tickets',                 fk: 'collaboratorId', parent: 'collaborators' },
  // contacts (direct tenant)
  { child: 'ai_copilot_analyses',     fk: 'contactId', parent: 'contacts' },
  { child: 'call_contexts',           fk: 'contactId', parent: 'contacts' },
  { child: 'call_form_responses',     fk: 'contactId', parent: 'contacts' },
  { child: 'call_logs',               fk: 'contactId', parent: 'contacts' },
  { child: 'call_transcript_archive', fk: 'contactId', parent: 'contacts' },
  { child: 'client_messages',         fk: 'contactId', parent: 'contacts' },
  { child: 'contact_ai_memory',       fk: 'contactId', parent: 'contacts' },
  { child: 'contact_status_history',  fk: 'contactId', parent: 'contacts' },
  { child: 'conversations',           fk: 'contactId', parent: 'contacts' },
  { child: 'notifications',           fk: 'contactId', parent: 'contacts' },
  { child: 'pipeline_history',        fk: 'contactId', parent: 'contacts' },
  { child: 'recommended_actions',     fk: 'contactId', parent: 'contacts' },
  { child: 'sms_messages',            fk: 'contactId', parent: 'contacts' },
  { child: 'system_anomaly_logs',     fk: 'contactId', parent: 'contacts' },
  // calendars (direct tenant)
  { child: 'ai_agents',               fk: 'calendarId', parent: 'calendars' },
  { child: 'forms',                   fk: 'calendarId', parent: 'calendars' },
  { child: 'pages',                   fk: 'calendarId', parent: 'calendars' },
  // forms (direct tenant)
  { child: 'call_form_responses', fk: 'formId', parent: 'forms' },
  { child: 'pages',               fk: 'formId', parent: 'forms' },
  // conversations (direct tenant)
  { child: 'call_contexts',       fk: 'conversationId', parent: 'conversations' },
  { child: 'conversation_events', fk: 'conversationId', parent: 'conversations' },
  { child: 'recommended_actions', fk: 'conversationId', parent: 'conversations' },
  { child: 'sms_messages',        fk: 'conversationId', parent: 'conversations' },
];

/**
 * Liste les tables d'une DB source a creer dans la tenant DB.
 * Exclut GLOBAL_TABLES SAUF celles qui sont aussi dans TENANT_STUB_TABLES
 * (structure repliquee, seed manuel 1 ligne).
 * @param {Database} sourceDb instance better-sqlite3
 * @returns {Array<{name, sql}>}
 */
export function listTenantTables(sourceDb) {
  const rows = sourceDb.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  return rows.filter(r =>
    !GLOBAL_TABLES.has(r.name) || TENANT_STUB_TABLES.has(r.name)
  );
}

/**
 * Liste les indexes non-auto d'une DB source. Meme regle : exclut global sauf stub.
 */
export function listTenantIndexes(sourceDb) {
  const rows = sourceDb.prepare(`
    SELECT name, tbl_name, sql FROM sqlite_master
    WHERE type = 'index'
      AND name NOT LIKE 'sqlite_%'
      AND sql IS NOT NULL
    ORDER BY name
  `).all();
  return rows.filter(r =>
    !GLOBAL_TABLES.has(r.tbl_name) || TENANT_STUB_TABLES.has(r.tbl_name)
  );
}

/**
 * Parse les FK declarees dans un CREATE TABLE SQL.
 * Retourne array de { column, refTable }.
 */
function parseForeignKeys(createSql) {
  const fks = [];
  const re = /FOREIGN KEY\s*\(\s*([a-zA-Z_][\w]*)\s*\)\s*REFERENCES\s+([a-zA-Z_][\w]*)/gi;
  let m;
  while ((m = re.exec(createSql)) !== null) {
    fks.push({ column: m[1], refTable: m[2] });
  }
  return fks;
}

/**
 * Calcule l'ordre topologique de creation / copie.
 * Les tables parentes (sans FK entrante) en premier.
 * En cas de cycle (ne devrait pas arriver), les tables restantes sont appendees a la fin.
 * Prend aussi en compte INDIRECT_TENANT_TABLES pour garantir que le parent est cree/copie avant.
 */
export function computeMigrationOrder(tables) {
  const nameSet = new Set(tables.map(t => t.name));
  const deps = new Map(); // table -> Set<table_parent>
  for (const t of tables) {
    const fks = parseForeignKeys(t.sql || '');
    const parents = new Set();
    for (const fk of fks) {
      // Skip FK vers tables GLOBAL NON-STUB : le parent n'est pas dans la tenant DB.
      // Les STUB tables sont PRESENTES dans la tenant DB et doivent etre ordonnees
      // avant leurs enfants (ex: companies avant collaborators).
      if (GLOBAL_TABLES.has(fk.refTable) && !TENANT_STUB_TABLES.has(fk.refTable)) continue;
      if (fk.refTable === t.name) continue;
      if (nameSet.has(fk.refTable)) parents.add(fk.refTable);
    }
    // dep implicite si table est indirecte : le parent DOIT etre copie avant
    if (INDIRECT_TENANT_TABLES.has(t.name)) {
      const { parent } = INDIRECT_TENANT_TABLES.get(t.name);
      if (nameSet.has(parent)) parents.add(parent);
    }
    deps.set(t.name, parents);
  }

  const ordered = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) return; // cycle break
    visiting.add(name);
    for (const parent of (deps.get(name) || [])) visit(parent);
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  }

  for (const t of tables) visit(t.name);

  // Append any table missed (sanity)
  for (const t of tables) if (!visited.has(t.name)) ordered.push(t.name);

  return ordered;
}

/**
 * Applique le schema tenant sur une DB cible vide.
 * @param {Database} sourceDb
 * @param {Database} tenantDb
 * @returns {{tablesCreated: number, indexesCreated: number, migrationOrder: string[]}}
 */
export function initTenantSchemaFromSource(sourceDb, tenantDb) {
  const tables = listTenantTables(sourceDb);
  const indexes = listTenantIndexes(sourceDb);
  const order = computeMigrationOrder(tables);
  const nameToSql = new Map(tables.map(t => [t.name, t.sql]));

  tenantDb.pragma('foreign_keys = OFF'); // desactive pendant creation pour eviter erreurs ordre

  let tablesCreated = 0;
  for (const name of order) {
    const sql = nameToSql.get(name);
    if (!sql) continue;
    tenantDb.exec(sql + ';');
    tablesCreated++;
  }

  let indexesCreated = 0;
  for (const idx of indexes) {
    try {
      tenantDb.exec(idx.sql + ';');
      indexesCreated++;
    } catch (e) {
      console.warn('[TENANT SCHEMA] index skip:', idx.name, e.message);
    }
  }

  tenantDb.pragma('foreign_keys = ON');
  return { tablesCreated, indexesCreated, migrationOrder: order };
}
