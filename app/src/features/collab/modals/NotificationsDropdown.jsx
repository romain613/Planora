// NotificationsDropdown — extraction S2.3 depuis CollabPortal.jsx L3938-3980
// Responsabilité : cloche notifications dans la sidebar collab + dropdown avec liste,
// badge compteur non-lus, bouton "Tout marquer lu", clic sur un item (navigation
// contextuelle selon type + contactId), fond cliquable pour fermer.
// Consomme notifList/notifUnread/notifOpen (+ setters) + contacts/setSelectedCrmContact
// + setCollabFicheTab + setPortalTab depuis CollabContext.
// Aucun changement métier — réécriture structurelle stricte, NOTIF_STYLE mapping
// et handler onClick conservés à l'identique.

import React from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const NotificationsDropdown = () => {
  const {
    notifOpen, setNotifOpen,
    notifList, setNotifList,
    notifUnread, setNotifUnread,
    contacts,
    setSelectedCrmContact, setCollabFicheTab, setPortalTab,
  } = useCollabContext();

  return (
    <div style={{ position:'relative' }}>
      <div onClick={(e) => { e.stopPropagation(); setNotifOpen(p=>!p); }} style={{ cursor:'pointer', position:'relative', padding:4 }} title="Notifications">
        <I n="bell" s={18} color={notifUnread>0?"#2563EB":T.text3}/>
        {notifUnread > 0 && <span style={{ position:'absolute', top:-2, right:-4, background:'#2563EB', color:'#fff', fontSize:9, fontWeight:800, borderRadius:10, padding:'1px 5px', minWidth:16, textAlign:'center', border:'2px solid '+T.surface }}>{notifUnread}</span>}
      </div>
      {notifOpen && <><div onClick={()=>setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:99998 }}/><div onClick={(e)=>e.stopPropagation()} style={{ position:'fixed', top:60, left:180, width:320, maxHeight:400, overflowY:'auto', background:T.card, border:`1px solid ${T.border}`, borderRadius:12, boxShadow:'0 12px 32px rgba(0,0,0,0.15)', zIndex:99999 }}>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:700, color:T.text }}>Notifications</span>
          {notifUnread>0&&<span onClick={()=>{api('/api/notifications/read',{method:'POST',body:{all:true}}).then(()=>{setNotifUnread(0);setNotifList([]);});}} style={{ fontSize:11, color:T.accent, cursor:'pointer', fontWeight:600 }}>Tout marquer lu</span>}
        </div>
        {notifList.length===0?<div style={{ padding:24, textAlign:'center', color:T.text3, fontSize:12 }}><I n="bell-off" s={28} style={{color:T.text3+'40',display:'block',margin:'0 auto 8px'}}/> Aucune notification</div>:
        notifList.map(n=>{
          const NOTIF_STYLE = {
            leads_batch:    { icon:'flame',        color:'#22C55E', cta:'Voir mes leads' },
            lead_assigned:  { icon:'target',       color:'#22C55E', cta:'Ouvrir le contact' },
            leads_imported: { icon:'inbox',        color:'#3B82F6', cta:'Voir les flux' },
            leads_reassigned:{ icon:'refresh-cw',  color:'#F59E0B', cta:null },
            lead_priority:  { icon:'zap',          color:'#8B5CF6', cta:'Voir le contact' },
            call_answered:  { icon:'phone',        color:'#22C55E', cta:null },
            call_missed:    { icon:'phone-missed', color:'#EF4444', cta:'Rappeler' },
            sms_inbound:    { icon:'message-square',color:'#3B82F6',cta:'Repondre' },
            client_message: { icon:'message-circle',color:'#2563EB',cta:'Voir le message' },
          };
          const ns = NOTIF_STYLE[n.type] || { icon:'bell', color:'#64748B', cta:null };
          return <div key={n.id} onClick={()=>{
            if(n.contactId){const ct=contacts.find(c=>c.id===n.contactId);if(ct){setSelectedCrmContact(ct);setCollabFicheTab('client_msg');setPortalTab('crm');}}
            else if(n.type==='leads_batch'||n.type==='lead_assigned') setPortalTab('crm');
            api('/api/notifications/read',{method:'POST',body:{ids:[n.id]}}).then(()=>{setNotifList(p=>p.filter(x=>x.id!==n.id));setNotifUnread(p=>Math.max(0,p-1));});
            setNotifOpen(false);
          }} style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}08`, cursor:'pointer', display:'flex', gap:10, alignItems:'flex-start' }} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:34, height:34, borderRadius:10, background:ns.color+'14', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><I n={ns.icon} s={16} style={{color:ns.color}}/></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title||'Notification'}</div>
              <div style={{ fontSize:11, color:T.text2, marginTop:1, lineHeight:'1.3', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{n.detail}</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                <span style={{ fontSize:10, color:T.text3+'80' }}>{(()=>{try{const d=new Date(n.createdAt);const diff=Math.floor((Date.now()-d)/60000);if(diff<1)return"A l'instant";if(diff<60)return diff+" min";if(diff<1440)return Math.floor(diff/60)+"h";return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});}catch{return'';}})()}</span>
                {ns.cta && <span style={{ fontSize:10, fontWeight:700, color:ns.color }}>{ns.cta} →</span>}
              </div>
            </div>
          </div>;
        })}
      </div></>}
    </div>
  );
};

export default NotificationsDropdown;
