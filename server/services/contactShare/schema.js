// ═══════════════════════════════════════════════════════════════════════════
// Contact Share V1 — schéma DDL (idempotent)
// ═══════════════════════════════════════════════════════════════════════════
//
// Règles métier V1 (partage simple 1-to-1) :
//   - ownerId (= contacts.assignedTo existant) : propriétaire actuel
//   - sharedWithId : destinataire du partage (nullable)
//   - sharedById : émetteur du partage (nullable)
//   - sharedAt : timestamp ISO du partage (nullable)
//   - shareNote : note de transmission libre (nullable)
//
// Contraintes :
//   - 1 seul partage à la fois (pas de multi-collab — V1 simple)
//   - Pas de duplication de contact : une seule ligne `contacts`
//   - shared_with_json existant (V7 followers) NON touché, co-existe
//
// Idempotence : ALTER TABLE dans try/catch.

export function ensureContactShareSchema(db) {
  try { db.exec("ALTER TABLE contacts ADD COLUMN sharedWithId TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE contacts ADD COLUMN sharedById TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE contacts ADD COLUMN sharedAt TEXT DEFAULT NULL"); } catch {}
  try { db.exec("ALTER TABLE contacts ADD COLUMN shareNote TEXT DEFAULT NULL"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_shared_with ON contacts(sharedWithId)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_shared_by ON contacts(sharedById)"); } catch {}
}
