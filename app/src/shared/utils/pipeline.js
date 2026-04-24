// utils/pipeline.js — Phase 2 extraction (pure helpers/data, no scope deps)

export const PIPELINE_CARD_COLORS_DEFAULT = [
  { color: '', label: 'Aucun' },
  { color: '#3B82F6', label: 'Information' },
  { color: '#10B981', label: 'Signature' },
  { color: '#EF4444', label: 'NRP' },
  { color: '#F59E0B', label: 'Relance' },
];

export const RDV_CATEGORIES = {
  information: {
    label: 'Information', color: '#3B82F6',
    subcategories: {
      decouverte: { label: 'Découverte', color: '#3B82F6' },
      prise_contact: { label: 'Prise de contact', color: '#60A5FA' },
      rdv_information: { label: 'RDV Information', color: '#93C5FD' },
      qualification: { label: 'Qualification', color: '#2563EB' },
    }
  },
  signature: {
    label: 'Signature', color: '#10B981',
    subcategories: {
      signature_contrat: { label: 'Signature contrat', color: '#10B981' },
      closing: { label: 'Closing', color: '#059669' },
      validation: { label: 'Validation', color: '#34D399' },
    }
  },
  nrp: {
    label: 'NRP', color: '#F59E0B',
    subcategories: {
      nrp1: { label: 'NRP 1', color: '#FBBF24' },
      nrp2: { label: 'NRP 2', color: '#F59E0B' },
      nrp4: { label: 'NRP 4', color: '#EF4444' },
      relance: { label: 'Relance', color: '#F97316' },
    }
  }
};

// V1.7.6 LOT 1 — display labels pipeline stage (keys = DB stage ids)
export const PIPELINE_LABELS = {
  'nrp': 'Non répondu',
  'contacte': 'Contact établi',
  'rdv_programme': 'RDV programmé',
  'perdu': 'Perdu',
  'client_valide': 'Gagné'
};

// V1.7.6 LOT 1 — unified status colors (keys = DB stage ids)
export const STATUS_COLORS = {
  'nrp': '#9CA3AF',
  'contacte': '#3B82F6',
  'rdv_programme': '#F59E0B',
  'client_valide': '#10B981',
  'perdu': '#EF4444'
};
