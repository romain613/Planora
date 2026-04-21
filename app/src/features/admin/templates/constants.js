// ═══════════════════════════════════════════════════════════════════════════
// Templates Pipeline — constantes (Phase 2 Admin UI)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §15.1 (bibliothèque).

// Palette de 8 couleurs présets pour le color picker
export const COLOR_PRESETS = [
  { name: 'Bleu',    value: '#2563EB' },
  { name: 'Orange',  value: '#F59E0B' },
  { name: 'Violet',  value: '#7C3AED' },
  { name: 'Cyan',    value: '#0EA5E9' },
  { name: 'Rouge',   value: '#EF4444' },
  { name: 'Vert',    value: '#22C55E' },
  { name: 'Gris',    value: '#64748B' },
  { name: 'Rose',    value: '#EC4899' },
];

// 20 icônes lucide business-first curées (mêmes que leads envelopes L3 UX)
export const CURATED_ICONS = [
  'star', 'flag', 'bookmark', 'tag', 'zap',
  'phone', 'phone-call', 'phone-off', 'message-circle', 'message-square',
  'calendar', 'calendar-check', 'clock', 'alarm-clock',
  'check', 'check-circle', 'x', 'x-circle',
  'user', 'users', 'user-check', 'user-x',
  'briefcase', 'target', 'trending-up', 'award',
  'plus', 'heart', 'thumbs-up', 'thumbs-down',
  'file-text', 'edit', 'send', 'eye',
];

// Stages types disponibles dans la bibliothèque (drag-to-canvas)
export const STAGE_TYPES = [
  { id: 'nouveau',       label: 'Nouveau',        color: '#2563EB', icon: 'plus' },
  { id: 'contacte',      label: 'Contacté',       color: '#F59E0B', icon: 'message-circle' },
  { id: 'qualifie',      label: 'Qualifié',       color: '#7C3AED', icon: 'star' },
  { id: 'rdv',           label: 'RDV programmé',  color: '#0EA5E9', icon: 'calendar' },
  { id: 'negociation',   label: 'Négociation',    color: '#F59E0B', icon: 'trending-up' },
  { id: 'signature',     label: 'Signature',      color: '#22C55E', icon: 'check' },
  { id: 'client',        label: 'Client validé',  color: '#22C55E', icon: 'check-circle' },
  { id: 'perdu',         label: 'Perdu',          color: '#64748B', icon: 'x-circle' },
  { id: 'nrp',           label: 'NRP',            color: '#EF4444', icon: 'phone-off' },
  { id: 'relance',       label: 'Relance',        color: '#F59E0B', icon: 'alarm-clock' },
  { id: 'onboarding',    label: 'Onboarding',     color: '#0EA5E9', icon: 'user-check' },
  { id: 'closing_hot',   label: 'Closing chaud',  color: '#EF4444', icon: 'zap' },
  { id: 'closing_cold',  label: 'Closing froid',  color: '#64748B', icon: 'clock' },
];

// Presets ship-with — 4 templates prêts à dupliquer
export const TEMPLATE_PRESETS = [
  {
    key: 'standard',
    name: 'Standard',
    description: 'Pipeline par défaut équivalent aux colonnes historiques',
    icon: 'flag',
    color: '#2563EB',
    stages: [
      { id: 'nouveau',       label: 'Nouveau',       color: '#2563EB', icon: 'plus',          position: 10 },
      { id: 'contacte',      label: 'En discussion', color: '#F59E0B', icon: 'message-circle',position: 20 },
      { id: 'qualifie',      label: 'Intéressé',     color: '#7C3AED', icon: 'star',          position: 30 },
      { id: 'rdv_programme', label: 'RDV Programmé', color: '#0EA5E9', icon: 'calendar',      position: 40 },
      { id: 'nrp',           label: 'NRP',           color: '#EF4444', icon: 'phone-off',     position: 50 },
      { id: 'client_valide', label: 'Client Validé', color: '#22C55E', icon: 'check-circle',  position: 60 },
      { id: 'perdu',         label: 'Perdu',         color: '#64748B', icon: 'x-circle',      position: 70 },
    ],
  },
  {
    key: 'closing',
    name: 'Closing',
    description: 'Pipeline commercial orienté signature de contrats',
    icon: 'target',
    color: '#7C3AED',
    stages: [
      { id: 'leads_chauds', label: 'Leads chauds', color: '#EF4444', icon: 'zap',          position: 10 },
      { id: 'qualifie',     label: 'Qualifié',     color: '#7C3AED', icon: 'star',         position: 20 },
      { id: 'rdv',          label: 'RDV',          color: '#0EA5E9', icon: 'calendar',     position: 30 },
      { id: 'negociation',  label: 'Négociation',  color: '#F59E0B', icon: 'trending-up',  position: 40 },
      { id: 'signature',    label: 'Signature',    color: '#22C55E', icon: 'check-circle', position: 50 },
      { id: 'perdu',        label: 'Perdu',        color: '#64748B', icon: 'x-circle',     position: 60 },
    ],
  },
  {
    key: 'relance',
    name: 'Relance tiède',
    description: 'Pour les cycles longs avec beaucoup de relances successives',
    icon: 'alarm-clock',
    color: '#F59E0B',
    stages: [
      { id: 'nouveau',      label: 'Nouveau',         color: '#2563EB', icon: 'plus',          position: 10 },
      { id: 'cold_call_1',  label: 'Cold call #1',    color: '#F59E0B', icon: 'phone',         position: 20 },
      { id: 'cold_call_2',  label: 'Cold call #2',    color: '#F59E0B', icon: 'phone',         position: 30 },
      { id: 'nrp',          label: 'NRP',             color: '#EF4444', icon: 'phone-off',     position: 40 },
      { id: 'warm_up',      label: 'Réchauffé',       color: '#EC4899', icon: 'heart',         position: 50 },
      { id: 'rdv',          label: 'RDV obtenu',      color: '#0EA5E9', icon: 'calendar',      position: 60 },
      { id: 'client',       label: 'Client',          color: '#22C55E', icon: 'check-circle',  position: 70 },
      { id: 'perdu',        label: 'Perdu',           color: '#64748B', icon: 'x-circle',      position: 80 },
    ],
  },
  {
    key: 'immobilier',
    name: 'Immobilier',
    description: 'Pipeline prospection + mise en vente + closing',
    icon: 'bookmark',
    color: '#0EA5E9',
    stages: [
      { id: 'prospect',     label: 'Prospect',        color: '#2563EB', icon: 'plus',          position: 10 },
      { id: 'estimation',   label: 'Estimation',      color: '#F59E0B', icon: 'file-text',     position: 20 },
      { id: 'mandat',       label: 'Mandat signé',    color: '#7C3AED', icon: 'edit',          position: 30 },
      { id: 'visites',      label: 'Visites',         color: '#0EA5E9', icon: 'users',         position: 40 },
      { id: 'offre',        label: 'Offre reçue',     color: '#EC4899', icon: 'send',          position: 50 },
      { id: 'compromis',    label: 'Compromis',       color: '#F59E0B', icon: 'check',         position: 60 },
      { id: 'acte',         label: 'Acte authentique',color: '#22C55E', icon: 'check-circle',  position: 70 },
      { id: 'perdu',        label: 'Perdu',           color: '#64748B', icon: 'x-circle',      position: 80 },
    ],
  },
];

// Limites de validation
export const TEMPLATE_NAME_MIN = 2;
export const TEMPLATE_NAME_MAX = 40;
export const STAGES_MIN_TO_PUBLISH = 2;
export const STAGES_WARN_COUNT = 12;

// ═══════════════════════════════════════════════════════════════════════════
// Socle de colonnes système obligatoires
// ═══════════════════════════════════════════════════════════════════════════
// Garanties métier nécessaires pour les futures "Règles métier" (bientôt) :
//   - appels       → nouveau / contacté / NRP
//   - prise de RDV → rdv_programme
//   - sortie       → perdu
// Ces 5 colonnes sont :
//   - injectées par défaut à la création d'un template (vide ou preset)
//   - non supprimables depuis l'UI builder
//   - non renommables (Option A — safe)
//   - déplaçables librement (reorder autorisé)
//   - vérifiées à la publication (block si une manque)
export const SYSTEM_STAGE_IDS = [
  'nouveau',
  'contacte',
  'rdv_programme',
  'nrp',
  'perdu',
];

export const SYSTEM_STAGES_META = {
  nouveau:       { label: 'Nouveau',        color: '#2563EB', icon: 'plus' },
  contacte:      { label: 'Contacté',       color: '#F59E0B', icon: 'message-circle' },
  rdv_programme: { label: 'RDV programmé',  color: '#0EA5E9', icon: 'calendar' },
  nrp:           { label: 'NRP',            color: '#EF4444', icon: 'phone-off' },
  perdu:         { label: 'Perdu',          color: '#64748B', icon: 'x-circle' },
};

// Helper : un stage est-il système ? Dérivé de l'ID, pas d'un flag stocké
// (robustesse : un template créé avant cette règle reste cohérent).
export function isSystemStage(stage) {
  return !!(stage && typeof stage.id === 'string' && SYSTEM_STAGE_IDS.includes(stage.id));
}

// Construit la liste initiale de stages pour un nouveau template :
//   - Les 5 stages système en tête (dans l'ordre SYSTEM_STAGE_IDS)
//   - Puis les stages additionnels du preset (dé-dupliqués par ID)
// Chaque stage retourné porte son ID, label, couleur, icône, position.
export function buildInitialStages(presetStages = []) {
  const result = SYSTEM_STAGE_IDS.map((id, i) => ({
    id,
    label: SYSTEM_STAGES_META[id].label,
    color: SYSTEM_STAGES_META[id].color,
    icon: SYSTEM_STAGES_META[id].icon,
    position: (i + 1) * 10,
  }));
  const existingIds = new Set(SYSTEM_STAGE_IDS);
  let pos = (SYSTEM_STAGE_IDS.length + 1) * 10;
  for (const s of (presetStages || [])) {
    if (!s || !s.id || existingIds.has(s.id)) continue;
    result.push({
      id: s.id,
      label: s.label || s.id,
      color: s.color || '#7C3AED',
      icon: s.icon || 'tag',
      position: pos,
    });
    existingIds.add(s.id);
    pos += 10;
  }
  return result;
}

// Message explicite affiché si une colonne système manque à la publication
export function missingSystemStagesMessage(stageIds = []) {
  const present = new Set(stageIds);
  const missing = SYSTEM_STAGE_IDS
    .filter(id => !present.has(id))
    .map(id => SYSTEM_STAGES_META[id].label);
  if (missing.length === 0) return null;
  return `Le pipeline doit contenir les colonnes système obligatoires : ${SYSTEM_STAGE_IDS.map(id => SYSTEM_STAGES_META[id].label).join(', ')}. Manquante(s) : ${missing.join(', ')}.`;
}
