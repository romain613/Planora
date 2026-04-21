-- Phase L1.a — Identité visuelle enveloppes + propagation envelopeId sur contacts.
--
-- Scope :
--   1. lead_envelopes : 3 colonnes visuelles (color, icon, priority) avec défauts sûrs
--   2. contacts       : 1 colonne dénormalisée envelopeId (lookup rapide sans JOIN)
--   3. Index partiel  : filtre pipeline par envelope
--   4. Backfill       : rattraper les contacts historiques via incoming_leads
--
-- Zero-risk : ADD COLUMN nullable, backfill scope-strict via JOIN bien indexé.
-- Aucune route applicative ne dépend encore de ces colonnes (code patches viennent en L1.b).

-- 1. lead_envelopes — 3 colonnes identité visuelle
ALTER TABLE lead_envelopes ADD COLUMN color TEXT DEFAULT '#6366F1';
ALTER TABLE lead_envelopes ADD COLUMN icon TEXT DEFAULT 'inbox';
ALTER TABLE lead_envelopes ADD COLUMN priority TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low'));

-- 2. contacts — dénormalisation envelopeId (lookup rapide pipeline)
ALTER TABLE contacts ADD COLUMN envelopeId TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_contacts_envelope
  ON contacts(envelopeId)
  WHERE envelopeId != '';

-- 3. Backfill contacts.envelopeId depuis incoming_leads
--    Règle : un contact peut avoir été créé depuis plusieurs incoming_leads au fil du temps
--    (ré-imports, ré-assignments). On prend le PLUS RÉCENT pour refléter l'envelope courante.
--    Les contacts sans lien incoming_leads.contact_id restent envelopeId='' (créés manuellement).

UPDATE contacts
SET envelopeId = (
  SELECT il.envelope_id
  FROM incoming_leads il
  WHERE il.contact_id = contacts.id
    AND il.companyId = contacts.companyId
    AND il.envelope_id IS NOT NULL
    AND il.envelope_id != ''
  ORDER BY il.assigned_at DESC, il.created_at DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM incoming_leads il
  WHERE il.contact_id = contacts.id
    AND il.companyId = contacts.companyId
    AND il.envelope_id IS NOT NULL
    AND il.envelope_id != ''
);
