// Phase 11 — extracted AI Profile tab from CollabPortal.jsx (was lines 16336-16679 IIFE).
// Pure cut/paste of the IIFE body, with closure refs sourced from CollabContext.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const AiProfileTab = () => {
  const {
    collab, showNotif,
    aiProfileTab, setAiProfileTab,
    aiProfileForm, setAiProfileForm,
    aiProfileSaving, setAiProfileSaving,
    aiSuggestions, setAiSuggestions,
    aiSuggestionsLoading, setAiSuggestionsLoading,
    aiHistory, setAiHistory,
    aiHistoryLoading, setAiHistoryLoading,
    aiSuggestionEdit, setAiSuggestionEdit,
    aiHistoryDetail, setAiHistoryDetail,
  } = useCollabContext();

  const loadSuggestions = () => {
    setAiSuggestionsLoading(true);
    api(`/api/ai-copilot/profile-suggestions/${collab.id}?status=all`).then(r => {
      setAiSuggestions(Array.isArray(r) ? r : []);
      setAiSuggestionsLoading(false);
    }).catch(() => setAiSuggestionsLoading(false));
  };

  const loadHistory = () => {
    setAiHistoryLoading(true);
    api(`/api/ai-copilot/profile-history/${collab.id}`).then(r => {
      setAiHistory(Array.isArray(r) ? r : []);
      setAiHistoryLoading(false);
    }).catch(() => setAiHistoryLoading(false));
  };

  const handleSaveProfile = async () => {
    setAiProfileSaving(true);
    try {
      await api(`/api/collaborators/${collab.id}`, { method: "PUT", body: { ...aiProfileForm, _modified_by: collab.id, _modified_by_type: 'collaborator', _modify_reason: 'Modification depuis espace collaborateur' } });
      Object.assign(collab, (typeof aiProfileForm!=='undefined'?aiProfileForm:null));
      showNotif("Profil IA mis à jour");
    } catch { showNotif("Erreur sauvegarde", "danger"); }
    setAiProfileSaving(false);
  };

  const handleRespondSuggestion = async (suggId, status, appliedChanges) => {
    try {
      await api(`/api/ai-copilot/profile-suggestions/${suggId}/respond`, { method: "PUT", body: { status, collab_response: '', applied_changes: appliedChanges || null } });
      if (appliedChanges) {
        Object.assign(collab, appliedChanges);
        setAiProfileForm(f => ({ ...f, ...appliedChanges }));
      }
      showNotif(status === 'accepted' ? "Suggestion acceptée" : status === 'rejected' ? "Suggestion refusée" : "Suggestion modifiée");
      loadSuggestions();
    } catch { showNotif("Erreur", "danger"); }
  };

  const handleRestoreHistory = async (histId) => {
    try {
      const res = await api(`/api/ai-copilot/profile-history/${histId}/restore`, { method: "POST", body: { modified_by: collab.id, modified_by_type: 'collaborator' } });
      if (res?.restoredProfile) {
        Object.assign(collab, res.restoredProfile);
        setAiProfileForm(f => ({ ...f, ...res.restoredProfile }));
      }
      showNotif("Profil restauré");
      loadHistory();
    } catch { showNotif("Erreur restauration", "danger"); }
  };

  const handleDeleteHistory = async (histId) => {
    try {
      await api(`/api/ai-copilot/profile-history/${histId}`, { method: "DELETE" });
      setAiHistory(h => h.filter(e => e.id !== histId));
      showNotif("Entrée supprimée");
    } catch { showNotif("Erreur suppression", "danger"); }
  };

  const roleTypes = ["Commercial","Conseiller","Support / SAV","Qualification","Closing","Account Manager","Marketing","Technique","Facturation","Direction"];
  const toneOptions = ["commercial","neutre","formel","amical","premium","technique","persuasif"];
  const callTypes = ["sales","qualification","support","sav","follow_up","closing","onboarding","information"];

  const fieldLabels = {
    ai_copilot_role: "Rôle", ai_copilot_objective: "Objectif", ai_copilot_target: "Cible",
    ai_role_type: "Type de rôle", ai_main_mission: "Mission principale",
    ai_call_type_default: "Type d'appel", ai_call_goal_default: "Objectif d'appel",
    ai_target_default: "Cible par défaut", ai_tone_style: "Ton",
    ai_script_trame: "Trame d'appel", ai_language: "Langue"
  };

  const pendingSuggestions = (typeof aiSuggestions!=='undefined'?aiSuggestions:{}).filter(s => s.status === 'pending');

  return (
    <div style={{padding:24,overflow:'auto',flex:1}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:48,height:48,borderRadius:16,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px rgba(124,58,237,0.25)'}}>
            <I n="cpu" s={24} style={{color:'#fff'}}/>
          </div>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:-0.5,background:'linear-gradient(135deg,#7C3AED,#2563EB)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Mon Profil IA</h1>
            <p style={{fontSize:12,color:T.text3,margin:0}}>Configurez et optimisez votre assistant IA commercial</p>
          </div>
        </div>
        {pendingSuggestions.length > 0 && (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:10,background:'#FEF3C7',border:'1px solid #FCD34D',cursor:'pointer'}} onClick={()=>setAiProfileTab('suggestions')}>
            <I n="zap" s={16} style={{color:'#D97706'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'#92400E'}}>{pendingSuggestions.length} suggestion{pendingSuggestions.length>1?'s':''} IA</span>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:4,marginBottom:24,background:T.surface,borderRadius:12,padding:4,border:`1px solid ${T.border}`}}>
        {[{id:'profile',label:'Mon Profil',icon:'user'},{id:'suggestions',label:'Suggestions IA',icon:'zap',badge:pendingSuggestions.length},{id:'history',label:'Historique',icon:'clock'}].map(t=>(
          <div key={t.id} onClick={()=>{(typeof setAiProfileTab==='function'?setAiProfileTab:function(){})(t.id);if(t.id==='suggestions')loadSuggestions();if(t.id==='history')loadHistory();}} style={{flex:1,padding:'10px 16px',borderRadius:10,background:aiProfileTab===t.id?'linear-gradient(135deg,#7C3AED,#2563EB)':'transparent',color:aiProfileTab===t.id?'#fff':T.text2,fontSize:13,fontWeight:700,textAlign:'center',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all .2s'}}>
            <I n={t.icon} s={15} style={{color:(typeof aiProfileTab!=='undefined'?aiProfileTab:null)===t.id?'#fff':T.text3}}/>
            {t.label}
            {t.badge > 0 && <span style={{background:(typeof aiProfileTab!=='undefined'?aiProfileTab:null)===t.id?'rgba(255,255,255,0.3)':'#EF4444',color:'#fff',fontSize:10,fontWeight:800,borderRadius:8,padding:'1px 6px',minWidth:18,textAlign:'center'}}>{t.badge}</span>}
          </div>
        ))}
      </div>

      {/* ─ PROFIL TAB ─ */}
      {aiProfileTab === 'profile' && (
        <div>
          {/* Fonction principale (chips) */}
          <Card style={{padding:20,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
              <I n="briefcase" s={16} style={{color:'#7C3AED'}}/> Fonction principale
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {roleTypes.map(r=>(
                <div key={r} onClick={()=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_copilot_role:r,ai_role_type:r.toLowerCase()}))} style={{padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',border:`2px solid ${(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_copilot_role===r?'#7C3AED':T.border}`,background:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_copilot_role===r?'#F5F3FF':'transparent',color:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_copilot_role===r?'#7C3AED':T.text2,transition:'all .15s'}}>{r}</div>
              ))}
            </div>
          </Card>

          {/* Mission */}
          <Card style={{padding:20,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
              <I n="target" s={16} style={{color:'#2563EB'}}/> Mission principale
            </div>
            <textarea value={(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_main_mission} onChange={e=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_main_mission:e.target.value}))} placeholder="Décrivez la mission du collaborateur..." style={{width:'100%',minHeight:80,padding:12,borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13,resize:'vertical',fontFamily:'inherit'}}/>
          </Card>

          {/* Objectif & Cible */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <Card style={{padding:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                <I n="crosshair" s={16} style={{color:'#22C55E'}}/> Objectif
              </div>
              <input value={(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_copilot_objective} onChange={e=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_copilot_objective:e.target.value}))} placeholder="Ex: Conclure une vente..." style={{width:'100%',padding:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13}}/>
            </Card>
            <Card style={{padding:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                <I n="users" s={16} style={{color:'#F59E0B'}}/> Cible
              </div>
              <input value={(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_copilot_target} onChange={e=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_copilot_target:e.target.value}))} placeholder="Ex: Prospects B2B..." style={{width:'100%',padding:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13}}/>
            </Card>
          </div>

          {/* Ton & Type d'appel */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <Card style={{padding:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                <I n="mic" s={16} style={{color:'#EC4899'}}/> Ton
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {toneOptions.map(t=>(
                  <div key={t} onClick={()=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_tone_style:t}))} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',border:`2px solid ${(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_tone_style===t?'#EC4899':T.border}`,background:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_tone_style===t?'#FDF2F8':'transparent',color:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_tone_style===t?'#EC4899':T.text3,textTransform:'capitalize'}}>{t}</div>
                ))}
              </div>
            </Card>
            <Card style={{padding:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                <I n="phone-call" s={16} style={{color:'#06B6D4'}}/> Type d'appel par défaut
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {callTypes.map(t=>(
                  <div key={t} onClick={()=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_call_type_default:t}))} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',border:`2px solid ${(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_call_type_default===t?'#06B6D4':T.border}`,background:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_call_type_default===t?'#ECFEFF':'transparent',color:(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_call_type_default===t?'#06B6D4':T.text3}}>{t.replace('_',' ')}</div>
                ))}
              </div>
            </Card>
          </div>

          {/* Trame d'appel */}
          <Card style={{padding:20,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
              <I n="file-text" s={16} style={{color:'#7C3AED'}}/> Trame d'appel / Script
            </div>
            <p style={{fontSize:11,color:T.text3,marginBottom:8}}>Collez votre script d'appel complet. L'IA l'utilisera pour coacher et évaluer vos appels.</p>
            <textarea value={(typeof aiProfileForm!=='undefined'?aiProfileForm:{}).ai_script_trame} onChange={e=>(typeof setAiProfileForm==='function'?setAiProfileForm:function(){})(f=>({...f,ai_script_trame:e.target.value}))} placeholder={"1. ACCROCHE\n- Se présenter...\n\n2. DÉCOUVERTE\n- Poser des questions...\n\n3. ARGUMENTATION\n- Présenter la solution...\n\n4. CLOSING\n- Conclure..."} style={{width:'100%',minHeight:200,padding:14,borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13,resize:'vertical',fontFamily:'inherit',lineHeight:1.6}}/>
          </Card>

          {/* Save button */}
          <div style={{display:'flex',justifyContent:'flex-end',gap:12}}>
            <Btn primary onClick={handleSaveProfile} disabled={aiProfileSaving} style={{background:'linear-gradient(135deg,#7C3AED,#2563EB)',border:'none',padding:'12px 32px'}}>
              {(typeof aiProfileSaving!=='undefined'?aiProfileSaving:null) ? <><I n="loader" s={14} className="spin"/> Sauvegarde...</> : <><I n="check" s={14}/> Enregistrer les modifications</>}
            </Btn>
          </div>
        </div>
      )}

      {/* ─ SUGGESTIONS IA TAB ─ */}
      {aiProfileTab === 'suggestions' && (
        <div>
          {(typeof aiSuggestionsLoading!=='undefined'?aiSuggestionsLoading:null) ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,color:T.text3,gap:10}}><I n="loader" s={20} className="spin"/> Chargement des suggestions...</div>
          ) : (typeof aiSuggestions!=='undefined'?aiSuggestions:{}).length === 0 ? (
            <Card style={{padding:40,textAlign:'center'}}>
              <I n="zap" s={40} style={{color:T.text3,marginBottom:12}}/>
              <div style={{fontSize:15,fontWeight:700,color:T.text2,marginBottom:6}}>Aucune suggestion pour le moment</div>
              <div style={{fontSize:12,color:T.text3}}>Après chaque appel analysé, l'IA proposera des améliorations à votre profil</div>
            </Card>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {(typeof aiSuggestions!=='undefined'?aiSuggestions:{}).map(sugg => {
                const suggestions = Array.isArray(sugg.suggestion) ? sugg.suggestion : [];
                const isPending = sugg.status === 'pending';
                const isEditing = (typeof aiSuggestionEdit!=='undefined'?aiSuggestionEdit:null)?.id === sugg.id;
                const statusColors = { pending:'#F59E0B', accepted:'#22C55E', partial:'#3B82F6', rejected:'#EF4444' };
                const statusLabels = { pending:'En attente', accepted:'Acceptée', partial:'Partiellement acceptée', rejected:'Refusée' };

                return (
                  <Card key={sugg.id} style={{padding:20,borderLeft:`4px solid ${statusColors[sugg.status]||T.border}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:36,height:36,borderRadius:10,background:isPending?'#FEF3C7':'#F0FDF4',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <I n={isPending?"zap":"check-circle"} s={18} style={{color:statusColors[sugg.status]}}/>
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>{sugg.summary || 'Suggestion d\'amélioration'}</div>
                          <div style={{fontSize:11,color:T.text3}}>{new Date(sugg.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:6,background:`${statusColors[sugg.status]}15`,color:statusColors[sugg.status]}}>{statusLabels[sugg.status]}</span>
                    </div>

                    {/* Suggestion details */}
                    {suggestions.map((s, idx) => (
                      <div key={idx} style={{padding:14,borderRadius:10,background:T.surface,border:`1px solid ${T.border}`,marginBottom:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:'#F5F3FF',color:'#7C3AED'}}>{fieldLabels[s.field]||s.field}</span>
                          {s.section && <span style={{fontSize:11,color:T.text3}}>— {s.section}</span>}
                          <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,background:s.action==='add'?'#D1FAE5':s.action==='modify'?'#FEF3C7':'#FEE2E2',color:s.action==='add'?'#059669':s.action==='modify'?'#92400E':'#DC2626'}}>{s.action==='add'?'Ajout':s.action==='modify'?'Modification':'Remplacement'}</span>
                        </div>
                        {s.currentValue && <div style={{fontSize:12,color:T.text3,marginBottom:6,padding:8,borderRadius:6,background:`${T.border}30`}}><strong>Actuel :</strong> {typeof s.currentValue==='string'?s.currentValue.slice(0,200):String(s.currentValue)}</div>}
                        <div style={{fontSize:12,color:'#059669',padding:8,borderRadius:6,background:'#F0FDF430',border:'1px solid #D1FAE5'}}>
                          <strong>Proposé :</strong> {isEditing ? (
                            <textarea value={(typeof aiSuggestionEdit!=='undefined'?aiSuggestionEdit:{}).editedChanges[s.field]||s.suggestedValue||''} onChange={e=>(typeof setAiSuggestionEdit==='function'?setAiSuggestionEdit:function(){})(prev=>({...prev,editedChanges:{...prev.editedChanges,[s.field]:e.target.value}}))} style={{width:'100%',minHeight:60,padding:8,borderRadius:6,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:12,marginTop:6,fontFamily:'inherit',resize:'vertical'}}/>
                          ) : (typeof s.suggestedValue==='string'?s.suggestedValue.slice(0,300):String(s.suggestedValue))}
                        </div>
                        {s.reason && <div style={{fontSize:11,color:T.text3,marginTop:6,fontStyle:'italic'}}>{s.reason}</div>}
                      </div>
                    ))}

                    {/* Action buttons for pending suggestions */}
                    {isPending && (
                      <div style={{display:'flex',gap:8,marginTop:12}}>
                        {isEditing ? (
                          <>
                            <Btn small success onClick={()=>{ handleRespondSuggestion(sugg.id,'partial',(typeof aiSuggestionEdit!=='undefined'?aiSuggestionEdit:{}).editedChanges); (typeof setAiSuggestionEdit==='function'?setAiSuggestionEdit:function(){})(null); }}><I n="check" s={13}/> Appliquer mes modifications</Btn>
                            <Btn small ghost onClick={()=>setAiSuggestionEdit(null)}>Annuler</Btn>
                          </>
                        ) : (
                          <>
                            <Btn small success onClick={()=>{
                              const changes = {};
                              suggestions.forEach(s => { if(s.field && s.suggestedValue) changes[s.field] = s.suggestedValue; });
                              handleRespondSuggestion(sugg.id, 'accepted', changes);
                            }}><I n="check" s={13}/> Valider</Btn>
                            <Btn small primary onClick={()=>{
                              const edited = {};
                              suggestions.forEach(s => { if(s.field) edited[s.field] = s.suggestedValue||''; });
                              setAiSuggestionEdit({ id: sugg.id, editedChanges: edited });
                            }}><I n="edit-3" s={13}/> Modifier</Btn>
                            <Btn small danger onClick={()=>handleRespondSuggestion(sugg.id,'rejected',null)}><I n="x" s={13}/> Refuser</Btn>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─ HISTORIQUE TAB ─ */}
      {aiProfileTab === 'history' && (
        <div>
          {(typeof aiHistoryLoading!=='undefined'?aiHistoryLoading:null) ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,color:T.text3,gap:10}}><I n="loader" s={20} className="spin"/> Chargement de l'historique...</div>
          ) : (typeof aiHistory!=='undefined'?aiHistory:{}).length === 0 ? (
            <Card style={{padding:40,textAlign:'center'}}>
              <I n="clock" s={40} style={{color:T.text3,marginBottom:12}}/>
              <div style={{fontSize:15,fontWeight:700,color:T.text2,marginBottom:6}}>Aucun historique</div>
              <div style={{fontSize:12,color:T.text3}}>L'historique des modifications de votre profil IA apparaîtra ici</div>
            </Card>
          ) : (
            <div style={{position:'relative',paddingLeft:24}}>
              {/* Timeline line */}
              <div style={{position:'absolute',left:11,top:0,bottom:0,width:2,background:T.border}}/>
              {(typeof aiHistory!=='undefined'?aiHistory:{}).map((entry, idx) => {
                const snapshot = entry.profile_snapshot || {};
                const typeColors = { admin:'#2563EB', collaborator:'#7C3AED', ai:'#F59E0B' };
                const typeLabels = { admin:'Admin', collaborator:'Collaborateur', ai:'IA' };
                const isExpanded = (typeof aiHistoryDetail!=='undefined'?aiHistoryDetail:null) === entry.id;

                return (
                  <div key={entry.id} style={{position:'relative',marginBottom:16}}>
                    {/* Timeline dot */}
                    <div style={{position:'absolute',left:-19,top:16,width:12,height:12,borderRadius:'50%',background:typeColors[entry.modified_by_type]||T.border,border:`2px solid ${T.bg}`}}/>
                    <Card style={{padding:16,marginLeft:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:`${typeColors[entry.modified_by_type]}15`,color:typeColors[entry.modified_by_type]}}>{typeLabels[entry.modified_by_type]||'?'}</span>
                            <span style={{fontSize:12,fontWeight:600,color:T.text}}>{entry.changes_summary||'Modification du profil'}</span>
                          </div>
                          <div style={{fontSize:11,color:T.text3}}>{new Date(entry.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                          {entry.reason && <div style={{fontSize:11,color:T.text3,marginTop:4,fontStyle:'italic'}}>{entry.reason}</div>}
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          <div onClick={()=>setAiHistoryDetail(isExpanded?null:entry.id)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',background:T.surface,border:`1px solid ${T.border}`,color:T.text2}}>
                            <I n={isExpanded?"chevron-up":"chevron-down"} s={12}/> {isExpanded?'Masquer':'Détails'}
                          </div>
                          <div onClick={()=>handleRestoreHistory(entry.id)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#2563EB'}}>
                            <I n="rotate-ccw" s={12}/> Restaurer
                          </div>
                          <div onClick={()=>handleDeleteHistory(entry.id)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',background:'#FEF2F2',border:'1px solid #FECACA',color:'#EF4444'}}>
                            <I n="trash-2" s={12}/>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{marginTop:12,padding:12,borderRadius:8,background:T.surface,border:`1px solid ${T.border}`}}>
                          {Object.entries(snapshot).filter(([k,v])=>v).map(([k,v])=>(
                            <div key={k} style={{marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:700,color:'#7C3AED',marginBottom:2}}>{fieldLabels[k]||k}</div>
                              <div style={{fontSize:12,color:T.text,padding:6,borderRadius:6,background:T.bg,whiteSpace:'pre-wrap',maxHeight:100,overflow:'auto'}}>{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AiProfileTab;
