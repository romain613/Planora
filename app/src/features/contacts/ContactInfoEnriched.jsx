// V1.11.2 — Affichage enrichi des champs custom du contact
// Source : contact.custom_fields_json (array V1.10.5 [{key, value, type, label?}])
// Sections : Profil / Qualification / Liens / Localisation / Autres
// Affichage : LABEL ✅ Oui / ❌ Non / ⚪ Neutre, liens cliquables, masque vides
// Scope strict : composant lecture seule, aucune modification backend.
import React from 'react';

const SECTION_DEFS = [
  {
    id: 'profil',
    icon: '💼',
    label: 'Profil',
    keys: ['poste','metier','fonction','competence','competences','langue','langues','experience','experience_assurance','niveau','niveau_d_etudes','etude','etudes','formation','diplome','diplomes','certification','certifications','specialite','specialites','annees_exp','anciennete'],
  },
  {
    id: 'qualification',
    icon: '🎯',
    label: 'Qualification',
    keys: ['permis','permis_b','ias','freelance','disponible','disponibilite','qualif','qualification','statut','mobilite','questionnaire','questionnaire_complete','salaire','salaire_souhaite','tjm','contrat','statut_recherche','interesse','engage'],
  },
  {
    id: 'liens',
    icon: '📎',
    label: 'Liens & documents',
    keys: ['lien_cv','lien_fiche','cv','linkedin','portfolio','site','site_web','website','documents','contrat_url','fiche_url'],
  },
  {
    id: 'localisation',
    icon: '🌍',
    label: 'Localisation',
    keys: ['departement','region','code_postal','pays','localisation','zone','secteur'],
  },
];

function categorizeKey(key) {
  const k = String(key || '').toLowerCase();
  for (const sec of SECTION_DEFS) {
    if (sec.keys.some(p => k === p || k.includes(p))) return sec.id;
  }
  return 'autres';
}

function prettyLabel(key) {
  const k = String(key || '').replace(/_/g, ' ').trim();
  if (!k) return '';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function isYesValue(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'oui' || s === 'yes' || s === 'true' || s === '1' || v === true;
}

function isNoValue(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'non' || s === 'no' || s === 'false' || s === '0' || v === false;
}

function isUrlValue(v, type) {
  if (type === 'url') return true;
  if (typeof v !== 'string') return false;
  return /^https?:\/\//i.test(v.trim());
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function renderValue(T, entry) {
  const { value, type, label } = entry;
  if (isEmptyValue(value)) return null;
  if (isUrlValue(value, type)) {
    const btnLabel = label || ('Ouvrir ' + (entry.key ? prettyLabel(entry.key).toLowerCase() : 'le lien'));
    return (
      <a href={value} target="_blank" rel="noopener noreferrer"
        style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:T.accent+'18',color:T.accent,fontSize:11,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap'}}>
        🔗 {btnLabel}
      </a>
    );
  }
  if (type === 'yesno' || isYesValue(value) || isNoValue(value)) {
    if (isYesValue(value)) return <span style={{color:'#10B981',fontWeight:700,fontSize:12}}>✅ Oui</span>;
    if (isNoValue(value)) return <span style={{color:'#EF4444',fontWeight:700,fontSize:12}}>❌ Non</span>;
  }
  if (type === 'date') {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return <span style={{fontSize:12,color:T.text,fontWeight:600}}>{d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}</span>;
    } catch {}
  }
  if (type === 'number') {
    return <span style={{fontSize:12,color:T.text,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <span style={{fontSize:12,color:T.text,fontWeight:600}}>{value.join(', ')}</span>;
  }
  return <span style={{fontSize:12,color:T.text,fontWeight:600,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{String(value)}</span>;
}

export default function ContactInfoEnriched({ T, contact }) {
  // Parse custom_fields_json (array V1.10.5)
  const cf = (() => {
    if (!contact) return [];
    if (Array.isArray(contact.custom_fields)) return contact.custom_fields;
    if (Array.isArray(contact.custom_fields_json)) return contact.custom_fields_json;
    try { return JSON.parse(contact.custom_fields_json || '[]'); } catch { return []; }
  })();
  if (!Array.isArray(cf) || cf.length === 0) return null;

  // Filter empty + group by section
  const buckets = { profil: [], qualification: [], liens: [], localisation: [], autres: [] };
  for (const raw of cf) {
    if (!raw || typeof raw !== 'object') continue;
    const key = raw.key || raw.label || '';
    if (!key) continue;
    if (isEmptyValue(raw.value)) continue;
    const entry = { key, value: raw.value, type: raw.type || '', label: raw.label || '' };
    const sec = categorizeKey(key);
    buckets[sec].push(entry);
  }
  const totalVisible = Object.values(buckets).reduce((a, b) => a + b.length, 0);
  if (totalVisible === 0) return null;

  return (
    <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:10}}>
      {SECTION_DEFS.map(sec => {
        const items = buckets[sec.id];
        if (!items || items.length === 0) return null;
        return (
          <div key={sec.id} style={{padding:'12px 14px',borderRadius:10,background:T.card,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,fontWeight:800,color:T.text2,textTransform:'uppercase',letterSpacing:0.5,marginBottom:10,display:'flex',alignItems:'center',gap:6,paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>
              <span>{sec.icon}</span> {sec.label}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {items.map((entry, i) => (
                <Row key={(entry.key || '') + i} T={T} entry={entry}/>
              ))}
            </div>
          </div>
        );
      })}
      {buckets.autres.length > 0 && (
        <div style={{padding:'12px 14px',borderRadius:10,background:T.card,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:11,fontWeight:800,color:T.text2,textTransform:'uppercase',letterSpacing:0.5,marginBottom:10,display:'flex',alignItems:'center',gap:6,paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>
            <span>📋</span> Autres
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {buckets.autres.map((entry, i) => (
              <Row key={(entry.key || '') + i} T={T} entry={entry}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ T, entry }) {
  const rendered = renderValue(T, entry);
  if (!rendered) return null;
  const labelTxt = entry.label && entry.type !== 'url' ? entry.label : prettyLabel(entry.key);
  return (
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
      <div style={{color:T.text3,textTransform:'uppercase',fontSize:10,fontWeight:700,letterSpacing:0.4,flex:'0 0 auto'}}>{labelTxt}</div>
      <div style={{textAlign:'right',display:'flex',alignItems:'center',gap:6,maxWidth:'65%',justifyContent:'flex-end'}}>{rendered}</div>
    </div>
  );
}
