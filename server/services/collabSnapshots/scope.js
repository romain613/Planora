// Phase S1 — Définit le périmètre d'un snapshot collab.
//
// Règle métier (validée MH 2026-04-21) :
// - Un snapshot contient UNIQUEMENT les données portant un rattachement direct ou indirect au collab X.
// - "Direct" : tables avec colonne collaboratorId / collaborator_id / collabId / userId.
// - "Indirect" : tables contact-scoped, filtrées via l'ensemble des contacts possédés/exécutés par X.
// - Hors scope strict : données globales, historique externe immuable, paiements, logs infra, données d'autres collabs.
//
// Chaque entrée décrit une table avec :
//   - key              : nom logique dans le payload (souvent = table name)
//   - table            : nom SQL de la table
//   - collabFilterSql  : fragment WHERE ... = ? paramétré via collabId (null si filtrage indirect via contactIds)
//   - restoreMode      : 'write-safe' | 'read-only-v2'
//        * 'write-safe' : la table est restaurable (UPDATE/INSERT scopés)
//        * 'read-only-v2' : snapshot pris pour historique, MAIS restore différé à V2 (éviter de polluer
//                           un historique externe immuable, ex: call_logs, transcripts)
//
// À NE PAS modifier sans revue MH. Cette liste est la source de vérité du scope collab.

export const COLLAB_SNAPSHOT_VERSION = 1;

/**
 * Tables filtrées directement par collabId (colonne variable selon la table).
 * Ordre = ordre de lecture dans buildCollabSnapshot (ne pas réordonner sans raison).
 */
export const DIRECT_TABLES = [
  {
    key: 'collaborators',
    table: 'collaborators',
    // Le collab lui-même. 1 row attendue.
    sql: 'SELECT * FROM collaborators WHERE companyId = ? AND id = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'contacts',
    table: 'contacts',
    // V1.10.1 fix : élargi aux 5 colonnes ownership réellement utilisées en prod.
    //   - ownerCollaboratorId / executorCollaboratorId : V7 ownership (souvent vides en prod)
    //   - assignedTo : ownership legacy V5 toujours actif (95% des cas)
    //   - sharedWithId : Contact Share V1
    //   - shared_with_json : array JSON cross-collab V1.8.13 — match strict via guillemets
    // Diagnostic 2026-04-27 : ancien filtre (owner/executor only) → tous snapshots prod = 0 contacts.
    sql:
      "SELECT * FROM contacts WHERE companyId = ? AND (" +
      "ownerCollaboratorId = ? OR executorCollaboratorId = ? OR assignedTo = ? OR sharedWithId = ? " +
      "OR shared_with_json LIKE '%\"' || ? || '\"%'" +
      ")",
    args: ({ companyId, collabId }) => [companyId, collabId, collabId, collabId, collabId, collabId],
    restoreMode: 'write-safe',
  },
  {
    key: 'contact_followers',
    table: 'contact_followers',
    sql: 'SELECT * FROM contact_followers WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'bookings',
    table: 'bookings',
    // Multi-party : collab peut être owner-agenda, meeting-collab, bookedBy, ou legacy collaboratorId.
    sql: 'SELECT * FROM bookings WHERE companyId = ? AND (collaboratorId = ? OR meetingCollaboratorId = ? OR bookedByCollaboratorId = ? OR agendaOwnerId = ?)',
    args: ({ companyId, collabId }) => [companyId, collabId, collabId, collabId, collabId],
    restoreMode: 'write-safe',
  },
  {
    key: 'call_logs',
    table: 'call_logs',
    sql: 'SELECT * FROM call_logs WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'read-only-v2', // user note : restore à limiter/V2 (historique VoIP)
  },
  {
    key: 'call_transcripts',
    table: 'call_transcripts',
    sql: 'SELECT * FROM call_transcripts WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'read-only-v2',
  },
  {
    key: 'call_contexts',
    table: 'call_contexts',
    sql: 'SELECT * FROM call_contexts WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'call_transcript_archive',
    // Volume potentiellement lourd — limité aux 500 plus récentes en V1.
    table: 'call_transcript_archive',
    sql: 'SELECT * FROM call_transcript_archive WHERE companyId = ? AND collaboratorId = ? ORDER BY callDate DESC LIMIT 500',
    restoreMode: 'read-only-v2',
  },
  {
    key: 'ai_profile_history',
    table: 'ai_profile_history',
    sql: 'SELECT * FROM ai_profile_history WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'ai_profile_suggestions',
    table: 'ai_profile_suggestions',
    sql: 'SELECT * FROM ai_profile_suggestions WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'dispatch_tasks',
    table: 'dispatch_tasks',
    // Attention : colonne = collabId (pas collaboratorId ni collaborator_id).
    sql: 'SELECT * FROM dispatch_tasks WHERE companyId = ? AND collabId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'notifications',
    table: 'notifications',
    // Limite 500 plus récentes (anti-bloat).
    sql: 'SELECT * FROM notifications WHERE companyId = ? AND collaboratorId = ? ORDER BY createdAt DESC LIMIT 500',
    restoreMode: 'write-safe',
  },
  {
    key: 'recommended_actions',
    table: 'recommended_actions',
    sql: 'SELECT * FROM recommended_actions WHERE companyId = ? AND collaboratorId = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'user_goals',
    table: 'user_goals',
    // Attention : colonne snake_case = collaborator_id.
    sql: 'SELECT * FROM user_goals WHERE companyId = ? AND collaborator_id = ?',
    restoreMode: 'write-safe',
  },
  {
    key: 'user_activity_logs',
    table: 'user_activity_logs',
    // Colonne snake_case + limite temporelle implicite (2000 plus récentes) pour éviter le bloat.
    sql: 'SELECT * FROM user_activity_logs WHERE companyId = ? AND collaborator_id = ? ORDER BY created_at DESC LIMIT 2000',
    restoreMode: 'read-only-v2', // logs activité = historique, ne pas écraser à la restore
  },
  {
    key: 'lead_assignments',
    table: 'lead_assignments',
    // Colonne snake_case.
    sql: 'SELECT * FROM lead_assignments WHERE companyId = ? AND collaborator_id = ?',
    restoreMode: 'write-safe',
  },
];

/**
 * Tables contact-scoped : filtrées via contactIds possédés par le collab.
 * Lues APRÈS les DIRECT_TABLES (besoin de l'ensemble des contacts du collab).
 */
export const CONTACT_JOINED_TABLES = [
  {
    key: 'contact_ai_memory',
    table: 'contact_ai_memory',
    contactIdColumn: 'contactId',
    restoreMode: 'write-safe',
  },
  {
    key: 'pipeline_history',
    table: 'pipeline_history',
    contactIdColumn: 'contactId',
    restoreMode: 'write-safe',
  },
  {
    key: 'contact_status_history',
    table: 'contact_status_history',
    contactIdColumn: 'contactId',
    restoreMode: 'write-safe',
  },
  {
    key: 'contact_documents',
    table: 'contact_documents',
    contactIdColumn: 'contactId',
    // Metadata seule (fichiers eux-mêmes sont dans /storage/, hors scope V1).
    restoreMode: 'write-safe',
  },
];

/**
 * Tables EXPLICITEMENT hors scope (documenté pour la revue, pas consommé par le code).
 * Si quelqu'un veut ajouter une table ici, il doit justifier auprès de MH.
 */
export const OUT_OF_SCOPE = {
  audit_logs: 'tamper-evident, jamais snapshot/restore',
  sessions: 'infra auth, éphémère',
  supra_admins: 'global',
  sms_messages: 'historique externe envoyé, immuable',
  sms_transactions: 'facturation',
  sms_credits: 'facturation',
  voip_credits: 'facturation',
  voip_transactions: 'facturation',
  telecom_credits: 'facturation',
  telecom_credit_logs: 'facturation',
  phone_transactions: 'facturation',
  google_events: 'sync upstream, pas owned par nous',
  companies: 'global',
  calendars: 'partagé entreprise',
  workflows: 'partagé entreprise',
  forms: 'partagé entreprise',
  polls: 'partagé entreprise',
  pipeline_stages: 'config entreprise',
  contact_field_definitions: 'config entreprise',
  settings: 'config entreprise',
  tickets: 'hors périmètre métier collab',
  ticket_messages: 'hors périmètre métier collab',
  // Les tables non listées sont IMPLICITEMENT hors scope — seules celles dans DIRECT_TABLES
  // ou CONTACT_JOINED_TABLES sont snappées.
};
