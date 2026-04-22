// FicheCustomFields — extraction S1.4b (6/11) depuis FicheContactModal.jsx L307-369
// Responsabilité : champs personnalisés (scope company | collab) avec CRUD
// (create via prompt, delete via prompt, edit via input/select/date/number).
// Debounce via collabNotesTimerRef inchangé.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheCustomFields = ({ ct }) => {
  const {
    collab, company,
    contactFieldDefs, setContactFieldDefs,
    setSelectedCrmContact, setContacts,
    collabNotesTimerRef,
    showNotif,
  } = useCollabContext();

  return (()=>{
                  const defs = (contactFieldDefs||[]).filter(d => d.scope === 'company' || d.createdBy === collab.id);
                  if (defs.length === 0 && !(contactFieldDefs||[]).length) {
                    // Show only the "add field" button when no defs exist
                    return <div style={{marginBottom:12}}>
                      <div onClick={()=>{
                        const label = prompt('Nom du champ :');
                        if(!label) return;
                        api('/api/contact-fields',{method:'POST',body:{companyId:company.id,label,scope:'collab'}}).then(r=>{
                          if(r?.id) setContactFieldDefs(p=>[...p,{...r,label,fieldType:'text',options:[],scope:'collab',createdBy:collab.id}]);
                        });
                      }} style={{fontSize:11,color:T.accent,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                        <I n="plus" s={11}/> Ajouter un champ perso
                      </div>
                    </div>;
                  }
                  const cfRaw = Array.isArray(ct.custom_fields) ? ct.custom_fields : (() => { try { return JSON.parse(ct.custom_fields_json || '[]'); } catch { return []; } })();
                  const cfMap = {};
                  cfRaw.forEach(f => { cfMap[f.key] = f.value; });
                  const saveCustomField = (fieldKey, value) => {
                    const updated = [...cfRaw.filter(f => f.key !== fieldKey), { key: fieldKey, value }];
                    const json = JSON.stringify(updated);
                    setSelectedCrmContact(p => ({...p, custom_fields: updated, custom_fields_json: json}));
                    setContacts(p => p.map(c => c.id === ct.id ? {...c, custom_fields: updated, custom_fields_json: json} : c));
                    _T.crmSync?.({custom_fields: updated, custom_fields_json: json});
                    clearTimeout(collabNotesTimerRef.current);
                    collabNotesTimerRef.current = setTimeout(() => api(`/api/data/contacts/${ct.id}`, {method:'PUT', body:{custom_fields_json: json, companyId: company?.id}}), 800);
                  };
                  return <div style={{marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#8B5CF6',marginBottom:8,display:'flex',alignItems:'center',gap:6}}><I n="sliders" s={14} style={{color:'#8B5CF6'}}/> Champs personnalisés</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      {defs.map(d => <div key={d.id} style={{padding:'8px 12px',borderRadius:10,background:T.bg,border:'1px solid '+T.border,position:'relative'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,color:'#8B5CF6'}}>{d.label}</span>
                          <span onClick={()=>{const msg=d.scope==='company'?`Supprimer le champ "${d.label}" de l'affichage sur TOUTES les fiches ?\n\nLes valeurs déjà saisies resteront stockées mais ne seront plus visibles, sauf restauration ou recréation du champ.`:`Supprimer le champ "${d.label}" ?`;if(!confirm(msg))return;api(`/api/contact-fields/${d.id}`,{method:'DELETE'}).then(()=>{setContactFieldDefs(p=>p.filter(x=>x.id!==d.id));showNotif('Champ supprimé','success');}).catch(()=>showNotif('Erreur','danger'));}} style={{cursor:'pointer',fontSize:10,color:'#EF4444',opacity:0.5,lineHeight:1}} title="Supprimer ce champ">×</span>
                        </div>
                        {d.fieldType === 'select' ? (
                          <select value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}>
                            <option value="">—</option>
                            {(d.options||[]).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : d.fieldType === 'date' ? (
                          <input type="date" value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        ) : d.fieldType === 'number' ? (
                          <input type="number" value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        ) : (
                          <input value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} placeholder="..." style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        )}
                      </div>)}
                    </div>
                    <div onClick={()=>{
                      const label = prompt('Nom du champ :');
                      if(!label) return;
                      const scope = confirm('Appliquer ce champ à TOUS les contacts ?\n\nOK = Oui (visible sur toutes les fiches)\nAnnuler = Non (uniquement ce contact)') ? 'company' : 'collab';
                      api('/api/contact-fields',{method:'POST',body:{companyId:company.id,label,scope}}).then(r=>{
                        if(r?.id) { setContactFieldDefs(p=>[...p,{...r,label,fieldType:'text',options:[],scope,createdBy:collab.id}]); showNotif(scope==='company'?'Champ ajouté sur toutes les fiches':'Champ ajouté','success'); }
                      });
                    }} style={{marginTop:8,fontSize:12,color:'#8B5CF6',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:600}}>
                      <I n="plus" s={12}/> Ajouter un champ perso
                    </div>
                  </div>;
                })();
};

export default FicheCustomFields;
