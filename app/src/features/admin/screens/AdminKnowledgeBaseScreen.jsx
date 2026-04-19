import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../../../theme";
import { formatPhoneFR, displayPhone } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../../shared/utils/constants";
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import {
  COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS,
  INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS,
  INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG
} from "../../../data/fixtures";
import {
  API_BASE, recUrl, collectEnv, api,
  getAutoTicketCompanyId, setAutoTicketCompanyId
} from "../../../shared/services/api";
import {
  HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card,
  Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState,
  HelpTip, ValidatedInput, ErrorBoundary
} from "../../../shared/ui";

export default function AdminKnowledgeBaseScreen({ company, showNotif }) {

          const [kbData, setKbData] = useState(null);
          const [kbLoading, setKbLoading] = useState(true);
          const [kbSection, setKbSection] = useState('company');
          const [kbSaving, setKbSaving] = useState(false);
          const [kbForm, setKbForm] = useState({});
          const [kbProducts, setKbProducts] = useState([]);
          const [kbScripts, setKbScripts] = useState([]);
          const [kbEmails, setKbEmails] = useState([]);
          const [kbSms, setKbSms] = useState([]);
          const [kbDocs, setKbDocs] = useState([]);
          // AI conversation data stored in kbForm to avoid adding hooks (React #311)
          // kbForm._aiMessages, kbForm._aiInput, kbForm._aiLoading

          useEffect(() => {
            api(`/api/knowledge-base/${company.id}`).then(d => {
              if (!d) { setKbLoading(false); return; }
              const kb = d.kb || {};
              // Pre-parse JSON fields to editable text (avoids JSON.parse/stringify on every keystroke)
              try { kb._offers_text = JSON.parse(kb.offers_json || '[]').join('\n'); } catch { kb._offers_text = ''; }
              try { kb._faq_text = JSON.parse(kb.faq_json || '[]').map(f => `Q: ${f.q}\nR: ${f.a}`).join('\n\n'); } catch { kb._faq_text = ''; }
              try { kb._preferred_words_text = JSON.parse(kb.preferred_words_json || '[]').join('\n'); } catch { kb._preferred_words_text = ''; }
              try { kb._forbidden_words_text = JSON.parse(kb.forbidden_words_json || '[]').join('\n'); } catch { kb._forbidden_words_text = ''; }
              try { kb._processes_text = JSON.parse(kb.internal_processes_json || '[]').map(p => `### ${p.title}\n${p.content}`).join('\n\n'); } catch { kb._processes_text = ''; }
              setKbForm(kb);
              setKbProducts(d.products || []);
              setKbScripts(d.scripts || []);
              setKbEmails(d.emailTemplates || []);
              setKbSms(d.smsTemplates || []);
              setKbDocs(d.documents || []);
              setKbLoading(false);
            }).catch(() => setKbLoading(false));
          }, [company.id]);

          const saveKb = () => {
            setKbSaving(true);
            // Serialize transient _text fields back to JSON before saving
            const body = { ...kbForm };
            if (body._offers_text !== undefined) { body.offers_json = JSON.stringify((body._offers_text||'').split('\n').filter(Boolean)); }
            if (body._faq_text !== undefined) {
              const pairs = (body._faq_text||'').split('\n\n').map(block => { const lines = block.split('\n'); const q = (lines.find(l=>l.startsWith('Q:'))||'').replace('Q:','').trim(); const a = (lines.find(l=>l.startsWith('R:'))||'').replace('R:','').trim(); return q?{q,a}:null; }).filter(Boolean);
              body.faq_json = JSON.stringify(pairs);
            }
            if (body._preferred_words_text !== undefined) { body.preferred_words_json = JSON.stringify((body._preferred_words_text||'').split('\n').filter(Boolean)); }
            if (body._forbidden_words_text !== undefined) { body.forbidden_words_json = JSON.stringify((body._forbidden_words_text||'').split('\n').filter(Boolean)); }
            if (body._processes_text !== undefined) {
              const blocks = (body._processes_text||'').split('\n\n').map(block => { const lines = block.split('\n'); const title = (lines[0]||'').replace(/^###?\s*/,'').trim(); const content = lines.slice(1).join('\n').trim(); return title?{title,content}:null; }).filter(Boolean);
              body.internal_processes_json = JSON.stringify(blocks);
            }
            // Remove transient keys
            delete body._offers_text; delete body._faq_text; delete body._preferred_words_text; delete body._forbidden_words_text; delete body._processes_text;
            api(`/api/knowledge-base/${company.id}`, { method:'PUT', body }).then(d => {
              setKbSaving(false);
              if (d?.success) showNotif('Base de connaissance sauvegardée');
            }).catch(() => setKbSaving(false));
          };

          const addProduct = () => {
            const id = 'prod_' + Date.now();
            const item = { id, name:'Nouveau produit', type:'product', description:'', pricing:'' };
            api(`/api/knowledge-base/${company.id}/products`, { method:'POST', body:item }).then(d => {
              if (d?.success) { setKbProducts(p => [{ ...item, id:d.id||id }, ...p]); showNotif('Produit ajouté'); }
            });
          };

          const delProduct = (id) => {
            api(`/api/knowledge-base/${company.id}/products/${id}`, { method:'DELETE' }).then(() => {
              setKbProducts(p => p.filter(x => x.id !== id)); showNotif('Produit supprimé');
            });
          };

          const saveProduct = (prod) => {
            api(`/api/knowledge-base/${company.id}/products/${prod.id}`, { method:'PUT', body:prod }).then(() => showNotif('Produit sauvegardé'));
          };

          const addScript = (type) => {
            const id = 'scr_' + Date.now();
            const item = { id, script_type:type, title:'Nouveau script', content:'', category:type };
            api(`/api/knowledge-base/${company.id}/scripts`, { method:'POST', body:item }).then(d => {
              if (d?.success) { setKbScripts(p => [{ ...item, id:d.id||id }, ...p]); showNotif('Script ajouté'); }
            });
          };

          const delScript = (id) => {
            api(`/api/knowledge-base/${company.id}/scripts/${id}`, { method:'DELETE' }).then(() => {
              setKbScripts(p => p.filter(x => x.id !== id)); showNotif('Script supprimé');
            });
          };

          const addEmail = () => {
            const id = 'eml_' + Date.now();
            const item = { id, name:'Nouveau template', template_type:'custom', subject:'', body:'' };
            api(`/api/knowledge-base/${company.id}/email-templates`, { method:'POST', body:item }).then(d => {
              if (d?.success) { setKbEmails(p => [{ ...item, id:d.id||id }, ...p]); showNotif('Template email ajouté'); }
            });
          };

          const delEmail = (id) => {
            api(`/api/knowledge-base/${company.id}/email-templates/${id}`, { method:'DELETE' }).then(() => {
              setKbEmails(p => p.filter(x => x.id !== id)); showNotif('Template supprimé');
            });
          };

          const addSms = () => {
            const id = 'sms_' + Date.now();
            const item = { id, name:'Nouveau SMS', template_type:'custom', content:'' };
            api(`/api/knowledge-base/${company.id}/sms-templates`, { method:'POST', body:item }).then(d => {
              if (d?.success) { setKbSms(p => [{ ...item, id:d.id||id }, ...p]); showNotif('Template SMS ajouté'); }
            });
          };

          const delSms = (id) => {
            api(`/api/knowledge-base/${company.id}/sms-templates/${id}`, { method:'DELETE' }).then(() => {
              setKbSms(p => p.filter(x => x.id !== id)); showNotif('Template supprimé');
            });
          };

          const addDoc = () => {
            const id = 'doc_' + Date.now();
            const item = { id, title:'Nouveau document', doc_type:'link', link_url:'', description:'' };
            api(`/api/knowledge-base/${company.id}/documents`, { method:'POST', body:item }).then(d => {
              if (d?.success) { setKbDocs(p => [{ ...item, id:d.id||id }, ...p]); showNotif('Document ajouté'); }
            });
          };

          const delDoc = (id) => {
            api(`/api/knowledge-base/${company.id}/documents/${id}`, { method:'DELETE' }).then(() => {
              setKbDocs(p => p.filter(x => x.id !== id)); showNotif('Document supprimé');
            });
          };

          const sections = [
            {id:'company',label:'Entreprise',icon:'building',c:'#2563EB'},
            {id:'products',label:'Produits & Services',icon:'package',c:'#22C55E'},
            {id:'offers',label:'Offres commerciales',icon:'tag',c:'#F59E0B'},
            {id:'scripts',label:'Scripts',icon:'file-text',c:'#7C3AED'},
            {id:'faq',label:'FAQ',icon:'help-circle',c:'#0EA5E9'},
            {id:'emails',label:'Emails types',icon:'mail',c:'#EC4899'},
            {id:'sms',label:'SMS types',icon:'message-square',c:'#14B8A6'},
            {id:'docs',label:'Documents & Liens',icon:'folder',c:'#F97316'},
            {id:'tone',label:'Ton & Style',icon:'mic',c:'#EF4444'},
            {id:'processes',label:'Procédures',icon:'list',c:'#6366F1'},
          ];

          const FieldLabel = ({children}) => <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>{children}</label>;
          const FieldInput = ({label,value,onChange,placeholder,multi}) => (
            <div style={{marginBottom:12}}>
              <FieldLabel>{label}</FieldLabel>
              {multi ? <textarea value={value||''} onChange={onChange} placeholder={placeholder} rows={4} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,resize:'vertical',lineHeight:1.5}}/> :
              <input value={value||''} onChange={onChange} placeholder={placeholder} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text}}/>}
            </div>
          );

          if (kbLoading) return <div style={{textAlign:'center',padding:60,color:T.text3}}>Chargement...</div>;

          return (
          <div>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:24}}>
              <div style={{width:48,height:48,borderRadius:14,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(124,58,237,0.3)'}}>
                <I n="book-open" s={24} style={{color:'#fff'}}/>
              </div>
              <div>
                <h1 style={{fontSize:22,fontWeight:800,margin:0}}>Base de Connaissance IA</h1>
                <div style={{fontSize:13,color:T.text3}}>Alimentez le Copilot avec les informations de votre entreprise</div>
              </div>
            </div>

            {/* Section tabs */}
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:20,padding:'4px',borderRadius:12,background:T.bg}}>
              {sections.map(s=>(
                <div key={s.id} onClick={()=>setKbSection(s.id)} style={{padding:'7px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:kbSection===s.id?700:500,color:kbSection===s.id?s.c:T.text3,background:kbSection===s.id?s.c+'12':'transparent',border:`1px solid ${kbSection===s.id?s.c+'30':'transparent'}`,display:'flex',alignItems:'center',gap:4,transition:'all .15s'}}>
                  <I n={s.icon} s={13}/> {s.label}
                </div>
              ))}
            </div>

            {/* ─── ENTREPRISE ─── */}
            {kbSection === 'company' && (
              <Card>
                <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><I n="building" s={18} style={{color:'#2563EB'}}/> Présentation entreprise</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <FieldInput label="Nom de l'entreprise" value={kbForm.company_description} onChange={e=>setKbForm(p=>({...p,company_description:e.target.value}))} placeholder={company.name}/>
                  <FieldInput label="Activité principale" value={kbForm.company_activity} onChange={e=>setKbForm(p=>({...p,company_activity:e.target.value}))} placeholder="Ex: Formation professionnelle"/>
                </div>
                <FieldInput label="Description détaillée" value={kbForm.company_description_long} onChange={e=>setKbForm(p=>({...p,company_description_long:e.target.value}))} placeholder="Décrivez votre entreprise, son histoire, ses valeurs..." multi/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <FieldInput label="Cible principale" value={kbForm.target_audience} onChange={e=>setKbForm(p=>({...p,target_audience:e.target.value}))} placeholder="Ex: Professionnels en reconversion"/>
                  <FieldInput label="Zone géographique" value={kbForm.geographic_zone} onChange={e=>setKbForm(p=>({...p,geographic_zone:e.target.value}))} placeholder="Ex: France métropolitaine"/>
                </div>
                <Btn primary onClick={saveKb} disabled={kbSaving}><I n="save" s={14}/> {kbSaving?'Sauvegarde...':'Sauvegarder'}</Btn>
              </Card>
            )}

            {/* ─── PRODUITS & SERVICES ─── */}
            {kbSection === 'products' && (
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h3 style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><I n="package" s={18} style={{color:'#22C55E'}}/> Produits & Services ({kbProducts.length})</h3>
                  <Btn primary onClick={addProduct}><I n="plus" s={14}/> Ajouter</Btn>
                </div>
                {kbProducts.length === 0 && <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun produit ou service. Cliquez "Ajouter" pour commencer.</div>}
                {kbProducts.map((prod,idx) => (
                  <div key={prod.id} style={{padding:14,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:10,background:T.bg}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'start'}}>
                      <FieldInput label="Nom" value={prod.name} onChange={e=>{const v=e.target.value;setKbProducts(p=>p.map((x,i)=>i===idx?{...x,name:v}:x));}} placeholder="Nom du produit"/>
                      <div>
                        <FieldLabel>Type</FieldLabel>
                        <div style={{display:'flex',gap:4}}>
                          {['product','service'].map(t=>(<div key={t} onClick={()=>setKbProducts(p=>p.map((x,i)=>i===idx?{...x,type:t}:x))} style={{padding:'5px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:prod.type===t?700:500,color:prod.type===t?'#22C55E':T.text3,background:prod.type===t?'#22C55E12':'transparent',border:`1px solid ${prod.type===t?'#22C55E':T.border}`}}>{t==='product'?'Produit':'Service'}</div>))}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:4,paddingTop:20}}>
                        <Btn small onClick={()=>saveProduct(prod)}><I n="save" s={12}/></Btn>
                        <Btn small onClick={()=>delProduct(prod.id)} style={{color:'#EF4444'}}><I n="trash-2" s={12}/></Btn>
                      </div>
                    </div>
                    <FieldInput label="Description" value={prod.description} onChange={e=>{const v=e.target.value;setKbProducts(p=>p.map((x,i)=>i===idx?{...x,description:v}:x));}} placeholder="Décrivez ce produit/service..." multi/>
                    <FieldInput label="Tarif" value={prod.pricing} onChange={e=>{const v=e.target.value;setKbProducts(p=>p.map((x,i)=>i===idx?{...x,pricing:v}:x));}} placeholder="Ex: 1500€ HT, 99€/mois..."/>
                  </div>
                ))}
              </Card>
            )}

            {/* ─── OFFRES COMMERCIALES ─── */}
            {kbSection === 'offers' && (
              <Card>
                <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><I n="tag" s={18} style={{color:'#F59E0B'}}/> Offres commerciales</h3>
                <FieldInput label="Offres en cours (une par ligne)" value={kbForm._offers_text||''} onChange={e=>setKbForm(p=>({...p,_offers_text:e.target.value}))} placeholder={"Formation premium - 1500€\nAbonnement mensuel - 99€/mois\nPack démarrage - 499€"} multi/>
                <Btn primary onClick={saveKb} disabled={kbSaving}><I n="save" s={14}/> {kbSaving?'Sauvegarde...':'Sauvegarder'}</Btn>
              </Card>
            )}

            {/* ─── SCRIPTS ─── */}
            {kbSection === 'scripts' && (
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h3 style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><I n="file-text" s={18} style={{color:'#7C3AED'}}/> Scripts ({kbScripts.length})</h3>
                  <div style={{display:'flex',gap:4}}>
                    {['sales','qualification','closing','support','sav','onboarding'].map(t=>(<Btn key={t} small onClick={()=>addScript(t)}><I n="plus" s={12}/> {t}</Btn>))}
                  </div>
                </div>
                {kbScripts.length === 0 && <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun script. Cliquez "+ type" pour en créer.</div>}
                {kbScripts.map((scr,idx) => (
                  <div key={scr.id} style={{padding:14,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:10,background:T.bg}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'#7C3AED12',color:'#7C3AED',textTransform:'uppercase'}}>{scr.script_type}</span>
                      <input value={scr.title} onChange={e=>{const v=e.target.value;setKbScripts(p=>p.map((x,i)=>i===idx?{...x,title:v}:x));}} style={{flex:1,padding:'6px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,fontWeight:700,fontFamily:'inherit',color:T.text,background:'transparent'}}/>
                      <Btn small onClick={()=>{api(`/api/knowledge-base/${company.id}/scripts/${scr.id}`,{method:'PUT',body:scr});showNotif('Script sauvegardé');}}><I n="save" s={12}/></Btn>
                      <Btn small onClick={()=>delScript(scr.id)} style={{color:'#EF4444'}}><I n="trash-2" s={12}/></Btn>
                    </div>
                    <textarea value={scr.content} onChange={e=>{const v=e.target.value;setKbScripts(p=>p.map((x,i)=>i===idx?{...x,content:v}:x));}} placeholder="Écrivez votre script ici..." rows={6} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,fontFamily:'inherit',color:T.text,resize:'vertical',lineHeight:1.6}}/>
                  </div>
                ))}
              </Card>
            )}

            {/* ─── FAQ ─── */}
            {kbSection === 'faq' && (
              <Card>
                <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><I n="help-circle" s={18} style={{color:'#0EA5E9'}}/> FAQ Entreprise</h3>
                <FieldInput label="Questions/Réponses (format: Q: ... R: ...)" value={kbForm._faq_text||''} onChange={e=>setKbForm(p=>({...p,_faq_text:e.target.value}))} placeholder={"Q: Quel est le délai de livraison ?\nR: 48h ouvrées pour la France\n\nQ: Quelles sont les conditions de remboursement ?\nR: 14 jours, satisfait ou remboursé"} multi/>
                <Btn primary onClick={saveKb} disabled={kbSaving}><I n="save" s={14}/> {kbSaving?'Sauvegarde...':'Sauvegarder'}</Btn>
              </Card>
            )}

            {/* ─── EMAILS TYPES ─── */}
            {kbSection === 'emails' && (
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h3 style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><I n="mail" s={18} style={{color:'#EC4899'}}/> Emails types ({kbEmails.length})</h3>
                  <Btn primary onClick={addEmail}><I n="plus" s={14}/> Ajouter</Btn>
                </div>
                {kbEmails.length === 0 && <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun template email.</div>}
                {kbEmails.map((eml,idx) => (
                  <div key={eml.id} style={{padding:14,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:10,background:T.bg}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                      <select value={eml.template_type} onChange={e=>{const v=e.target.value;setKbEmails(p=>p.map((x,i)=>i===idx?{...x,template_type:v}:x));}} style={{padding:'5px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text}}>
                        {['confirmation','compte_rendu','relance','devis','facture','sav','onboarding','admin','custom'].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={eml.name} onChange={e=>{const v=e.target.value;setKbEmails(p=>p.map((x,i)=>i===idx?{...x,name:v}:x));}} placeholder="Nom du template" style={{flex:1,padding:'6px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,fontWeight:600,fontFamily:'inherit',color:T.text,background:'transparent'}}/>
                      <Btn small onClick={()=>{api(`/api/knowledge-base/${company.id}/email-templates/${eml.id}`,{method:'PUT',body:eml});showNotif('Email sauvegardé');}}><I n="save" s={12}/></Btn>
                      <Btn small onClick={()=>delEmail(eml.id)} style={{color:'#EF4444'}}><I n="trash-2" s={12}/></Btn>
                    </div>
                    <FieldInput label="Objet" value={eml.subject} onChange={e=>{const v=e.target.value;setKbEmails(p=>p.map((x,i)=>i===idx?{...x,subject:v}:x));}} placeholder="Objet de l'email"/>
                    <FieldInput label="Contenu" value={eml.body} onChange={e=>{const v=e.target.value;setKbEmails(p=>p.map((x,i)=>i===idx?{...x,body:v}:x));}} placeholder="Bonjour {nom},\n\nSuite à notre échange..." multi/>
                    <div style={{fontSize:10,color:T.text3}}>Variables : {'{nom}'}, {'{email}'}, {'{tel}'}, {'{date}'}, {'{heure}'}, {'{produit}'}</div>
                  </div>
                ))}
              </Card>
            )}

            {/* ─── SMS TYPES ─── */}
            {kbSection === 'sms' && (
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h3 style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><I n="message-square" s={18} style={{color:'#14B8A6'}}/> SMS types ({kbSms.length})</h3>
                  <Btn primary onClick={addSms}><I n="plus" s={14}/> Ajouter</Btn>
                </div>
                {kbSms.length === 0 && <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun template SMS.</div>}
                {kbSms.map((sms,idx) => (
                  <div key={sms.id} style={{padding:12,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:8,background:T.bg,display:'flex',gap:8,alignItems:'start'}}>
                    <div style={{flex:1}}>
                      <input value={sms.name} onChange={e=>{const v=e.target.value;setKbSms(p=>p.map((x,i)=>i===idx?{...x,name:v}:x));}} placeholder="Nom" style={{width:'100%',padding:'5px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,fontWeight:600,fontFamily:'inherit',color:T.text,background:'transparent',marginBottom:6}}/>
                      <textarea value={sms.content} onChange={e=>{const v=e.target.value;setKbSms(p=>p.map((x,i)=>i===idx?{...x,content:v}:x));}} placeholder="Contenu du SMS..." rows={2} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',color:T.text,background:T.surface,resize:'vertical'}}/>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:4,paddingTop:2}}>
                      <Btn small onClick={()=>{api(`/api/knowledge-base/${company.id}/sms-templates/${sms.id}`,{method:'PUT',body:sms});showNotif('SMS sauvegardé');}}><I n="save" s={12}/></Btn>
                      <Btn small onClick={()=>delSms(sms.id)} style={{color:'#EF4444'}}><I n="trash-2" s={12}/></Btn>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* ─── DOCUMENTS & LIENS ─── */}
            {kbSection === 'docs' && (
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h3 style={{fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><I n="folder" s={18} style={{color:'#F97316'}}/> Documents & Liens ({kbDocs.length})</h3>
                  <Btn primary onClick={addDoc}><I n="plus" s={14}/> Ajouter</Btn>
                </div>
                {kbDocs.length === 0 && <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun document.</div>}
                {kbDocs.map((doc,idx) => (
                  <div key={doc.id} style={{padding:12,borderRadius:10,border:`1px solid ${T.border}`,marginBottom:8,background:T.bg}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                      <select value={doc.doc_type} onChange={e=>{const v=e.target.value;setKbDocs(p=>p.map((x,i)=>i===idx?{...x,doc_type:v}:x));}} style={{padding:'4px 6px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text}}>
                        {['link','pdf','brochure','devis','facture','contrat','plaquette','presentation','agenda','formulaire','faq','support'].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={doc.title} onChange={e=>{const v=e.target.value;setKbDocs(p=>p.map((x,i)=>i===idx?{...x,title:v}:x));}} placeholder="Titre" style={{flex:1,padding:'5px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,fontWeight:600,fontFamily:'inherit',color:T.text,background:'transparent'}}/>
                      <Btn small onClick={()=>{api(`/api/knowledge-base/${company.id}/documents/${doc.id}`,{method:'PUT',body:doc});showNotif('Document sauvegardé');}}><I n="save" s={12}/></Btn>
                      <Btn small onClick={()=>delDoc(doc.id)} style={{color:'#EF4444'}}><I n="trash-2" s={12}/></Btn>
                    </div>
                    <FieldInput label="URL / Lien" value={doc.link_url} onChange={e=>{const v=e.target.value;setKbDocs(p=>p.map((x,i)=>i===idx?{...x,link_url:v}:x));}} placeholder="https://..."/>
                    <FieldInput label="Description" value={doc.description} onChange={e=>{const v=e.target.value;setKbDocs(p=>p.map((x,i)=>i===idx?{...x,description:v}:x));}} placeholder="Brève description..."/>
                  </div>
                ))}
              </Card>
            )}

            {/* ─── TON & STYLE ─── */}
            {kbSection === 'tone' && (
              <Card>
                <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><I n="mic" s={18} style={{color:'#EF4444'}}/> Ton & Style de communication</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel>Ton de voix</FieldLabel>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {['professionnel','premium','rassurant','commercial','direct','amical','institutionnel','technique'].map(t=>(
                        <div key={t} onClick={()=>setKbForm(p=>({...p,tone_style:t}))} style={{padding:'5px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:kbForm.tone_style===t?700:500,color:kbForm.tone_style===t?'#EF4444':T.text3,background:kbForm.tone_style===t?'#EF444412':'transparent',border:`1px solid ${kbForm.tone_style===t?'#EF4444':T.border}`}}>{t}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Niveau de formalité</FieldLabel>
                    <div style={{display:'flex',gap:4}}>
                      {['informel','standard','formel','très formel'].map(f=>(
                        <div key={f} onClick={()=>setKbForm(p=>({...p,formality_level:f}))} style={{padding:'5px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:kbForm.formality_level===f?700:500,color:kbForm.formality_level===f?'#2563EB':T.text3,background:kbForm.formality_level===f?'#2563EB12':'transparent',border:`1px solid ${kbForm.formality_level===f?'#2563EB':T.border}`}}>{f}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <FieldInput label="Style commercial" value={kbForm.commercial_style} onChange={e=>setKbForm(p=>({...p,commercial_style:e.target.value}))} placeholder="Ex: Consultative selling, écoute active, solution-oriented" multi/>
                <FieldInput label="Style support" value={kbForm.support_style} onChange={e=>setKbForm(p=>({...p,support_style:e.target.value}))} placeholder="Ex: Patient, pédagogue, orienté résolution" multi/>
                <FieldInput label="Mots préférés (un par ligne)" value={kbForm._preferred_words_text||''} onChange={e=>setKbForm(p=>({...p,_preferred_words_text:e.target.value}))} placeholder={"accompagnement\nexcellence\nsur-mesure"} multi/>
                <FieldInput label="Mots interdits (un par ligne)" value={kbForm._forbidden_words_text||''} onChange={e=>setKbForm(p=>({...p,_forbidden_words_text:e.target.value}))} placeholder={"gratuit\ncheap\nproblème"} multi/>
                <Btn primary onClick={saveKb} disabled={kbSaving}><I n="save" s={14}/> {kbSaving?'Sauvegarde...':'Sauvegarder'}</Btn>
              </Card>
            )}

            {/* ─── PROCÉDURES ─── */}
            {kbSection === 'processes' && (
              <Card>
                <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><I n="list" s={18} style={{color:'#6366F1'}}/> Procédures internes</h3>
                <FieldInput label="Procédures (une par bloc, format libre)" value={kbForm._processes_text||''} onChange={e=>setKbForm(p=>({...p,_processes_text:e.target.value}))} placeholder={"### Procédure support\n1. Écouter le client\n2. Identifier le problème\n3. Proposer une solution\n4. Confirmer la résolution\n\n### Procédure envoi devis\n1. Récupérer les besoins\n2. Chiffrer l'offre\n3. Envoyer le PDF\n4. Relancer sous 48h"} multi/>
                <Btn primary onClick={saveKb} disabled={kbSaving}><I n="save" s={14}/> {kbSaving?'Sauvegarde...':'Sauvegarder'}</Btn>
              </Card>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* ─── AI SYNTHESIS CONVERSATION PANEL ─── */}
            {/* AI data stored in kbForm._aiMessages/_aiInput/_aiLoading (no extra hooks) */}
            {/* ═══════════════════════════════════════════ */}
            {(()=>{
              const aiMsgs = kbForm._aiMessages || [];
              const aiInput = kbForm._aiInput || '';
              const aiLoading = kbForm._aiLoading || false;
              const setAi = (patch) => setKbForm(p => ({...p, ...patch}));
              const sendAiMsg = (msgs) => {
                setAi({_aiMessages:msgs, _aiLoading:true, _aiInput:''});
                api('/api/ai-copilot/kb-synthesis', { method:'POST', body:{ messages:msgs, kbData:{ ...kbForm, companyId:company.id } } })
                  .then(d => setAi({_aiMessages:[...msgs, {role:'assistant',content:d?.reply||"Erreur lors de l'analyse."}], _aiLoading:false}))
                  .catch(() => setAi({_aiMessages:[...msgs, {role:'assistant',content:"Erreur de connexion."}], _aiLoading:false}));
              };
              return <Card style={{marginTop:24,border:`1px solid #7C3AED30`,background:`linear-gradient(135deg,${T.card},${T.bg})`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <I n="sparkles" s={18} style={{color:'#fff'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:T.text}}>Synthèse IA</div>
                    <div style={{fontSize:11,color:T.text3}}>L'IA analyse votre base et vous explique ce qu'elle a compris</div>
                  </div>
                </div>
                <Btn primary onClick={() => {
                  const userMsg = {role:'user',content:'Analyse ma base de connaissance et fais-moi une synthèse complète de ce que tu as compris. Explique ce que chaque information va permettre au système de faire.'};
                  sendAiMsg([...aiMsgs, userMsg]);
                }} disabled={aiLoading} style={{fontSize:12}}>
                  <I n="sparkles" s={13}/> {aiMsgs.length===0?'Lancer la synthèse':'Relancer l\'analyse'}
                </Btn>
              </div>

              {aiMsgs.length > 0 && (
                <div style={{maxHeight:400,overflowY:'auto',marginBottom:14,padding:12,borderRadius:10,background:T.bg,border:`1px solid ${T.border}`}}>
                  {aiMsgs.map((msg, i) => (
                    <div key={i} style={{marginBottom:12,display:'flex',gap:8,flexDirection:msg.role==='user'?'row-reverse':'row'}}>
                      <div style={{width:28,height:28,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:msg.role==='user'?'#2563EB':'linear-gradient(135deg,#7C3AED,#2563EB)',fontSize:12,color:'#fff',fontWeight:700}}>
                        {msg.role==='user'?<I n="user" s={14}/>:<I n="sparkles" s={14}/>}
                      </div>
                      <div style={{maxWidth:'85%',padding:'10px 14px',borderRadius:msg.role==='user'?'14px 14px 4px 14px':'14px 14px 14px 4px',background:msg.role==='user'?'#2563EB12':T.card,border:`1px solid ${msg.role==='user'?'#2563EB20':T.border}`,fontSize:13,lineHeight:1.6,color:T.text,whiteSpace:'pre-wrap'}}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div style={{display:'flex',gap:8,alignItems:'center',padding:10}}>
                      <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <I n="sparkles" s={14} style={{color:'#fff'}}/>
                      </div>
                      <div style={{fontSize:13,color:T.text3,fontStyle:'italic'}}>L'IA analyse votre base de connaissance...</div>
                    </div>
                  )}
                </div>
              )}

              {aiMsgs.length > 0 && (
                <div style={{display:'flex',gap:8}}>
                  <input
                    value={aiInput}
                    onChange={e=>setAi({_aiInput:e.target.value})}
                    onKeyDown={e => {
                      if (e.key==='Enter'&&!e.shiftKey&&aiInput.trim()&&!aiLoading) {
                        e.preventDefault();
                        sendAiMsg([...aiMsgs, {role:'user',content:aiInput.trim()}]);
                      }
                    }}
                    placeholder="Ajoutez des informations ou posez une question à l'IA..."
                    style={{flex:1,padding:'10px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text}}
                  />
                  <Btn primary disabled={!aiInput.trim()||aiLoading} onClick={() => {
                    if(!aiInput.trim()||aiLoading) return;
                    sendAiMsg([...aiMsgs, {role:'user',content:aiInput.trim()}]);
                  }}><I n="send" s={14}/></Btn>
                </div>
              )}
            </Card>;
            })()}
          </div>);
        
}
