// ScheduleRdvModal — extraction S2.11 depuis CollabPortal.jsx L5196-5390
// Responsabilité : modal global "Programmer un appel / Programmer un RDV"
// accessible depuis TOUT onglet (pipeline live, phone, sticky action bar, CRM…).
//
// Ouverture : setPhoneShowScheduleModal(true) après setPhoneScheduleForm({...}).
// Deux modes pilotés par `phoneScheduleForm._bookingMode` :
//   - mode "rappel" (falsy)    : créneau simple, no calendar/duration/category/slots
//   - mode "booking" (truthy)  : booking réel, choix agenda + durée + catégorie
//     + sous-catégorie RDV + créneaux disponibles (busy-detect bookings + GCal
//     avec buffer) + création contact inline optionnelle
//
// Logique métier — ZÉRO modification, strictement préservée :
//   - detection busy : busySlots = bookings confirmés (même calendarId OU même
//     collaboratorId) + googleEvents (même collaboratorId) ± buffer, par pas
//     de 30 min sur la plage 08:00→19:30, avec slot "past" si jour=aujourd'hui
//   - catégories RDV : RDV_CATEGORIES (shared/utils/pipeline) — bord coloré si
//     category sélectionnée, sous-catégories disabled tant que category absente
//   - submit :
//       * mode booking + nouveau contact : POST /api/data/contacts → setTimeout
//         50ms (mutation directe phoneScheduleForm.contactId/contactName + appel
//         addScheduledCall()). Ce setTimeout + mutation directe est PRÉSERVÉ
//         TEL QUEL (pattern historique, permet au state React de propager avant
//         que addScheduledCall lise phoneScheduleForm)
//       * sinon : validation champs + addScheduledCall() (délègue booking/RDV
//         + pipeline stage change + notifications côté CollabPortal)
//   - fermeture : si _bookingMode + contactId présent → showNotif info
//     "Aucun RDV créé — le contact reste dans son statut actuel"
//
// OWNERSHIP (préservé côté CollabPortal, exposé via context) :
//   - addScheduledCall (closure sur bookings/contacts/calendars/googleEvents/
//     collab/company/availBuffer + setters setBookings/setContacts/
//     handlePipelineStageChange/handleCollabUpdateContact + api POST bookings)
//   - schedSearchResults (useMemo sur schedSearchQ + contacts)
//   Ces deux symboles restent déclarés dans CollabPortal. La modal les consomme
//   via useCollabContext().
//
// Shape `phoneScheduleForm` implicite (non typé) :
//   { contactId, contactName, number, date, time, duration, notes, calendarId,
//     rdv_category, rdv_subcategory, _bookingMode, _editBookingId, _error,
//     _submitting, _newFirstName, _newLastName, _newEmail, _newAddress }
//
// Rollback isolé : supprimer <ScheduleRdvModal /> du return JSX de CollabPortal
// + réinsérer le bloc IIFE d'origine. Aucune modif ailleurs à annuler.

import React from "react";
import { T } from "../../../theme";
import { I, Btn } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { useCollabContext } from "../context/CollabContext";

const ScheduleRdvModal = () => {
  const {
    phoneShowScheduleModal, setPhoneShowScheduleModal,
    phoneScheduleForm, setPhoneScheduleForm,
    schedContactMode, setSchedContactMode,
    schedSearchQ, setSchedSearchQ,
    schedSearchResults,
    addScheduledCall,
    showNotif,
    calendars,
    bookings,
    googleEventsProp,
    availBuffer,
    collab, company,
    contacts, setContacts,
  } = useCollabContext();

  if (!phoneShowScheduleModal) return null;

  const closeScheduleModal = () => {
    if (phoneScheduleForm._bookingMode && phoneScheduleForm.contactId) {
      showNotif('Aucun RDV créé — le contact reste dans son statut actuel', 'info');
    }
    setPhoneShowScheduleModal(false);
    setPhoneScheduleForm({ contactId:'', number:'', date:'', time:'', notes:'' });
    setSchedSearchQ('');
    setSchedContactMode('new');
  };
  const hasPrefilledContact = !!phoneScheduleForm.contactId;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeScheduleModal}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:24,maxWidth:440,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{width:40,height:40,borderRadius:12,background:phoneScheduleForm._bookingMode?'linear-gradient(135deg,#7C3AED,#6D28D9)':'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={phoneScheduleForm._bookingMode?'calendar-check':'clock'} s={18} style={{color:'#fff'}}/></div>
          <div>
            <h3 style={{fontSize:16,fontWeight:700,margin:0}}>{phoneScheduleForm._bookingMode?'Programmer un RDV':'Programmer un appel'}</h3>
            <div style={{fontSize:12,color:T.text3}}>{phoneScheduleForm.contactName ? phoneScheduleForm.contactName+' — Choisissez date et heure' : 'Choisissez un contact puis date et heure'}</div>
          </div>
          <span onClick={closeScheduleModal} style={{marginLeft:'auto',cursor:'pointer',color:T.text3}}><I n="x" s={18}/></span>
        </div>

        {/* ── Contact Mode Switch ── */}
        {phoneScheduleForm._bookingMode && !hasPrefilledContact && <div style={{display:'flex',borderRadius:10,border:'1px solid #e5e7eb',overflow:'hidden',marginBottom:12}}>
          <div onClick={()=>setSchedContactMode('existing')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:600,cursor:'pointer',background:schedContactMode==='existing'?'#2563EB':'#f9fafb',color:schedContactMode==='existing'?'#fff':'#6b7280',transition:'all .15s'}}>Contact existant</div>
          <div onClick={()=>setSchedContactMode('new')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:600,cursor:'pointer',background:schedContactMode==='new'?'#2563EB':'#f9fafb',color:schedContactMode==='new'?'#fff':'#6b7280',transition:'all .15s'}}>Nouveau contact</div>
        </div>}

        {/* ── Contact existant : recherche ── */}
        {phoneScheduleForm._bookingMode && !hasPrefilledContact && schedContactMode==='existing' && <div style={{marginBottom:12}}>
          <label style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4,display:'block'}}>Rechercher un contact</label>
          <input value={schedSearchQ} onChange={e=>setSchedSearchQ(e.target.value)} placeholder="Nom, email ou téléphone..." style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none'}}/>
          {schedSearchResults.length>0 && <div style={{border:'1px solid #e5e7eb',borderRadius:10,marginTop:4,maxHeight:150,overflowY:'auto',background:'#fff'}}>
            {schedSearchResults.map(ct=>(
              <div key={ct.id} onClick={()=>{setPhoneScheduleForm(p=>({...p,contactId:ct.id,contactName:ct.name||ct.firstName||'',number:ct.phone||p.number}));setSchedSearchQ('');}} style={{padding:'8px 12px',cursor:'pointer',fontSize:12,display:'flex',justifyContent:'space-between',borderBottom:'1px solid #f3f4f6'}} onMouseEnter={e=>e.currentTarget.style.background='#f3f4f6'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <span style={{fontWeight:600}}>{ct.name}</span>
                <span style={{color:'#9ca3af'}}>{ct.phone||ct.email||''}</span>
              </div>
            ))}
          </div>}
          {phoneScheduleForm.contactId && <div style={{marginTop:6,padding:'6px 10px',borderRadius:8,background:'#2563EB10',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:12,fontWeight:600,color:'#2563EB'}}>✓ {phoneScheduleForm.contactName}</span>
            <span onClick={()=>setPhoneScheduleForm(p=>({...p,contactId:'',contactName:'',number:''}))} style={{fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:600}}>Changer</span>
          </div>}
        </div>}

        {/* ── Nouveau contact : formulaire ── */}
        {phoneScheduleForm._bookingMode && !hasPrefilledContact && schedContactMode==='new' && <div style={{marginBottom:12,display:'flex',flexDirection:'column',gap:8,padding:12,borderRadius:10,background:'#f9fafb',border:'1px solid #e5e7eb'}}>
          <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:0.5}}>Nouveau contact</div>
          <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}>
              <input value={phoneScheduleForm._newFirstName||''} onChange={e=>setPhoneScheduleForm(p=>({...p,_newFirstName:e.target.value}))} placeholder="Prénom *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
            </div>
            <div style={{flex:1}}>
              <input value={phoneScheduleForm._newLastName||''} onChange={e=>setPhoneScheduleForm(p=>({...p,_newLastName:e.target.value}))} placeholder="Nom *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
            </div>
          </div>
          <input value={phoneScheduleForm._newEmail||''} onChange={e=>setPhoneScheduleForm(p=>({...p,_newEmail:e.target.value}))} placeholder="Email" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
          <input value={phoneScheduleForm.number||''} onChange={e=>setPhoneScheduleForm(p=>({...p,number:e.target.value}))} placeholder="Téléphone *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
          <input value={phoneScheduleForm._newAddress||''} onChange={e=>setPhoneScheduleForm(p=>({...p,_newAddress:e.target.value}))} placeholder="Adresse (optionnel)" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
        </div>}

        {/* ── Contact pré-rempli ── */}
        {hasPrefilledContact && <div style={{marginBottom:12,padding:'8px 12px',borderRadius:10,background:'#2563EB08',border:'1px solid #2563EB20'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#2563EB'}}>📋 {phoneScheduleForm.contactName}</div>
          {phoneScheduleForm.number && <div style={{fontSize:11,color:'#6b7280'}}>📞 {phoneScheduleForm.number}</div>}
        </div>}

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Champ téléphone affiché seulement si contact existant sélectionné (sans pré-remplissage) */}
          {(hasPrefilledContact || schedContactMode==='existing') ? null : null}
          {!hasPrefilledContact && schedContactMode==='existing' && !phoneScheduleForm.contactId && <div>
            <label style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4,display:'block'}}>Numéro de téléphone</label>
            <input value={phoneScheduleForm.number} onChange={e=>setPhoneScheduleForm(p=>({...p,number:e.target.value}))} placeholder="+33 6 12 34 56 78" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none',fontFamily:'inherit'}}/>
          </div>}
          {phoneScheduleForm._bookingMode && (calendars||[]).length>0 && <div>
            <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Agenda</label>
            <select value={phoneScheduleForm.calendarId||''} onChange={e=>setPhoneScheduleForm(p=>({...p,calendarId:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
              {(calendars||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>}
          <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Date</label>
              <input type="date" value={phoneScheduleForm.date} onChange={e=>setPhoneScheduleForm(p=>({...p,date:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none'}}/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Heure</label>
              <input type="time" value={phoneScheduleForm.time} onChange={e=>setPhoneScheduleForm(p=>({...p,time:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none'}}/>
            </div>
          </div>
          {phoneScheduleForm._bookingMode && <div>
            <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Durée</label>
            <select value={phoneScheduleForm.duration||30} onChange={e=>setPhoneScheduleForm(p=>({...p,duration:parseInt(e.target.value)}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
              {[15,30,45,60,90,120].map(d=><option key={d} value={d}>{d} min</option>)}
            </select>
          </div>}
          {phoneScheduleForm._bookingMode && <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Catégorie de RDV *</label>
              <select value={phoneScheduleForm.rdv_category||''} onChange={e=>setPhoneScheduleForm(p=>({...p,rdv_category:e.target.value,rdv_subcategory:''}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1px solid ${phoneScheduleForm.rdv_category&&RDV_CATEGORIES[phoneScheduleForm.rdv_category]?RDV_CATEGORIES[phoneScheduleForm.rdv_category].color+'60':'#e5e7eb'}`,background:phoneScheduleForm.rdv_category&&RDV_CATEGORIES[phoneScheduleForm.rdv_category]?RDV_CATEGORIES[phoneScheduleForm.rdv_category].color+'08':'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
                <option value="">— Choisir —</option>
                {Object.entries(RDV_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Sous-catégorie</label>
              <select value={phoneScheduleForm.rdv_subcategory||''} onChange={e=>setPhoneScheduleForm(p=>({...p,rdv_subcategory:e.target.value}))} disabled={!phoneScheduleForm.rdv_category} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit',opacity:phoneScheduleForm.rdv_category?1:0.5}}>
                <option value="">— Aucune —</option>
                {phoneScheduleForm.rdv_category && RDV_CATEGORIES[phoneScheduleForm.rdv_category] && Object.entries(RDV_CATEGORIES[phoneScheduleForm.rdv_category].subcategories).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>}
          <div>
            <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Notes (optionnel)</label>
            <textarea value={phoneScheduleForm.notes} onChange={e=>setPhoneScheduleForm(p=>({...p,notes:e.target.value}))} placeholder="Ajouter une note..." rows={2} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,fontFamily:'inherit',color:'#111',resize:'none',outline:'none'}}/>
          </div>
          {phoneScheduleForm._bookingMode && phoneScheduleForm.date && (()=>{
            const selDate = phoneScheduleForm.date;
            const selCalId = phoneScheduleForm.calendarId || '';
            const selCollabId = selCalId ? ((calendars||[]).find(c=>c.id===selCalId)?.collaboratorId || collab.id) : collab.id;
            const dayBookings = (bookings||[]).filter(b=>(b.calendarId===selCalId || b.collaboratorId===selCollabId) && (b.date||'').startsWith(selDate) && b.status!=='cancelled');
            const dayGCal = (googleEventsProp||[]).filter(ge=>(ge.collaboratorId===selCollabId) && (ge.start||ge.startDate||'').startsWith(selDate));
            const buf = availBuffer||0;
            const busySlots = new Set();
            dayBookings.forEach(b=>{ if(b.time) { const h=parseInt(b.time.split(':')[0]); const m=parseInt(b.time.split(':')[1]||0); const startMin=h*60+m-buf; const endMin=h*60+m+(b.duration||30)+buf; for(let i=Math.max(0,startMin);i<endMin;i+=30) busySlots.add(String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')); }});
            dayGCal.forEach(ge=>{ try{ const st=new Date(ge.start||ge.startDate); const en=new Date(ge.end||ge.endDate||st.getTime()+3600000); const stBuf=st.getTime()-buf*60000; const enBuf=en.getTime()+buf*60000; for(let t=stBuf;t<enBuf;t+=1800000){const d=new Date(t);busySlots.add(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));} }catch{} });
            const slots = [];
            for(let h=8;h<=19;h++) for(let m=0;m<60;m+=30) {
              const slot = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
              const isBusy = busySlots.has(slot);
              const isPast = selDate===new Date().toISOString().split('T')[0] && (h<new Date().getHours()||(h===new Date().getHours()&&m<=new Date().getMinutes()));
              slots.push({time:slot,busy:isBusy,past:isPast});
            }
            return <div>
              <div style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6}}>Creneaux disponibles</div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap',maxHeight:120,overflow:'auto'}}>
                {slots.map(s=>(
                  <div key={s.time} onClick={()=>{if(!s.busy&&!s.past)setPhoneScheduleForm(p=>({...p,time:s.time}));}} style={{padding:'4px 10px',borderRadius:8,fontSize:11,fontWeight:600,cursor:s.busy||s.past?'not-allowed':'pointer',background:phoneScheduleForm.time===s.time?'#7C3AED':s.busy?'#EF444415':s.past?'#f9fafb80':'#22C55E08',color:phoneScheduleForm.time===s.time?'#fff':s.busy?'#EF4444':s.past?'#9ca3af':'#22C55E',border:'1px solid '+(phoneScheduleForm.time===s.time?'#7C3AED':s.busy?'#EF444430':s.past?'#e5e7eb':'#22C55E30'),opacity:s.past?0.4:1,transition:'all .12s'}}>
                    {s.time}{s.busy?' ●':''}
                  </div>
                ))}
              </div>
              {busySlots.size>0 && <div style={{fontSize:9,color:'#9ca3af',marginTop:4}}>● = creneau occupe</div>}
            </div>;
          })()}
        </div>
        {/* Erreur inline — visible dans la modal */}
        {phoneScheduleForm._error && <div style={{margin:'12px 0',padding:'10px 14px',borderRadius:10,background:'#FEE2E2',border:'1px solid #FECACA',color:'#DC2626',fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:18}}>⚠️</span> {phoneScheduleForm._error}
        </div>}
        <div style={{display:'flex',gap:8,marginTop:16}}>
          <Btn small style={{flex:1,justifyContent:'center'}} onClick={closeScheduleModal}>Annuler</Btn>
          <Btn small primary disabled={phoneScheduleForm._submitting} style={{flex:1,justifyContent:'center',opacity:phoneScheduleForm._submitting?0.6:1}} onClick={async()=>{
            setPhoneScheduleForm(p=>({...p,_error:''}));
            if(phoneScheduleForm._submitting) return;
            const f = phoneScheduleForm;
            const setErr=(msg)=>setPhoneScheduleForm(p=>({...p,_error:msg}));
            // Nouveau contact : créer d'abord
            if(f._bookingMode && !hasPrefilledContact && schedContactMode==='new') {
              if(!f._newFirstName || !f._newLastName) { setErr('Prénom et nom obligatoires'); return; }
              if(!f.number && !f._newEmail) { setErr('Téléphone ou email obligatoire'); return; }
              if(!f.date || !f.time) { setErr('Choisissez date et heure'); return; }
              setPhoneScheduleForm(p=>({...p,_submitting:true,_error:''}));
              try {
                const newContactId = 'ct'+Date.now()+Math.random().toString(36).slice(2,6);
                const newName = (f._newFirstName+' '+f._newLastName).trim();
                const newContact = {id:newContactId, name:newName, firstName:f._newFirstName, lastName:f._newLastName, email:f._newEmail||'', phone:f.number||'', address:f._newAddress||'', companyId:company.id, pipeline_stage:'nouveau', assignedTo:collab.id};
                await api('/api/data/contacts', {method:'POST', body:newContact});
                setContacts(p=>[...p, {...newContact, tags:[], notes:'', totalBookings:0, rating:0, createdAt:new Date().toISOString()}]);
                setPhoneScheduleForm(p=>({...p, contactId:newContactId, contactName:newName}));
                setTimeout(()=>{
                  phoneScheduleForm.contactId = newContactId;
                  phoneScheduleForm.contactName = newName;
                  const result = addScheduledCall();
                  if(!result) setPhoneScheduleForm(p=>({...p,_submitting:false}));
                }, 50);
              } catch(err) {
                setErr('Erreur création contact : '+(err.message||''));
                setPhoneScheduleForm(p=>({...p,_submitting:false}));
              }
              return;
            }
            // Contact existant : vérifier les champs
            if(!f.contactId && schedContactMode==='existing' && !f.number) { setErr('Sélectionnez un contact ou entrez un numéro'); return; }
            if(f.date&&f.time&&(f.number||f.contactId)){
              setPhoneScheduleForm(p=>({...p,_submitting:true,_error:''}));
              const result = addScheduledCall();
              if(!result) setPhoneScheduleForm(p=>({...p,_submitting:false}));
            } else {
              setErr('Remplissez tous les champs requis');
            }
          }}><I n="clock" s={14}/> {phoneScheduleForm._submitting?'En cours...':'Programmer'}</Btn>
        </div>
      </div>
    </div>
  );
};

export default ScheduleRdvModal;
