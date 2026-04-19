// Phase 11a — extracted Messages (chat) tab from CollabPortal.jsx (was lines 15744-16098 IIFE).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const MessagesTab = () => {
  const {
    collab, company, collabs, contacts,
    collabChatMessages,
    collabChatInput, setCollabChatInput,
    collabChatFiles, setCollabChatFiles,
    collabChatShowContactPicker, setCollabChatShowContactPicker,
    collabChatShowEmoji, setCollabChatShowEmoji,
    collabChatReplyTo, setCollabChatReplyTo,
    collabChatSearch, setCollabChatSearch,
    collabChatSearchOpen, setCollabChatSearchOpen,
    collabChatHoveredMsg, setCollabChatHoveredMsg,
    collabChatReactionPicker, setCollabChatReactionPicker,
    collabChatMode, setCollabChatMode,
    collabChatDmTarget, setCollabChatDmTarget,
    collabChatOnline,
    collabChatEditingMsg, setCollabChatEditingMsg,
    collabChatIsRecording,
    collabChatRecordingTime,
    setCollabChatFloating, setCollabChatMinimized,
    collabChatEndRef, collabChatFileRef, collabChatInputRef,
    CHAT_EMOJIS, REACTION_EMOJIS,
    addChatReaction, getMsgReactions,
    collabDeleteChat,
    collabStartRecording, collabStopRecording, collabCancelRecording,
    handleCollabSendChat, handleCollabChatFiles, handleCollabChatPaste,
    handleCollabShareContactCard,
  } = useCollabContext();

  const searchQ = (typeof collabChatSearch!=='undefined'?collabChatSearch:{}).toLowerCase();
  const filteredMsgs = searchQ.length >= 2 ? (typeof collabChatMessages!=='undefined'?collabChatMessages:{}).filter(m => (m.message||"").toLowerCase().includes(searchQ) || (m.senderName||"").toLowerCase().includes(searchQ)) : collabChatMessages;
  const collabIsOnline = (cId) => (typeof collabChatOnline!=='undefined'?collabChatOnline:{}).includes(cId);
  const allCollabs = collabs.length ? collabs : (company?.collaborators || []);

  return (
    <div style={{ display:"flex", height:"calc(100vh - 80px)", gap:0 }}>
      {/* ═══ LEFT SIDEBAR — Conversations ═══ */}
      <div style={{ width:260, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", background:T.surface, flexShrink:0, borderRadius:"16px 0 0 16px", overflow:"hidden" }}>
        <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <h2 style={{ fontSize:16, fontWeight:800, margin:0, display:"flex", alignItems:"center", gap:8 }}><I n="message-circle" s={18}/> Chat</h2>
            <div onClick={()=>{ setCollabChatFloating(true); setCollabChatMinimized(false); }} style={{ width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:T.text3, background:T.bg, border:`1px solid ${T.border}` }} title="Mode flottant"><I n="minimize-2" s={13}/></div>
          </div>
          <div style={{ fontSize:11, color:T.text3 }}>{company?.name} · {(typeof collabChatOnline!=='undefined'?collabChatOnline:{}).length} en ligne</div>
        </div>

        {/* Group chat */}
        <div onClick={()=>{ (typeof setCollabChatMode==='function'?setCollabChatMode:function(){})("group"); setCollabChatDmTarget(null); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", cursor:"pointer", background:collabChatMode==="group"?T.accentBg:"transparent", borderBottom:`1px solid ${T.border}`, transition:"all .15s" }}>
          <div style={{ width:38, height:38, borderRadius:12, background:"linear-gradient(135deg,#7C3AED,#2563EB)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><I n="users" s={16} style={{ color:"#fff" }}/></div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:(typeof collabChatMode!=='undefined'?collabChatMode:null)==="group"?T.accent:T.text }}>Groupe</div>
            <div style={{ fontSize:11, color:T.text3 }}>{allCollabs.length} membres</div>
          </div>
        </div>

        <div style={{ padding:"10px 16px 6px", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1 }}>Messages privés</div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {allCollabs.filter(c=>c.id!==collab.id).map(c => {
            const online = collabIsOnline(c.id);
            const isActive = (typeof collabChatMode!=='undefined'?collabChatMode:null)==="dm" && (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null)?.id===c.id;
            return (
              <div key={c.id} onClick={()=>{ setCollabChatMode("dm"); setCollabChatDmTarget(c); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", cursor:"pointer", background:isActive?T.accentBg:"transparent", transition:"all .15s" }}>
                <div style={{ position:"relative" }}>
                  <Avatar name={c.name} color={c.color||T.accent} size={34}/>
                  <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background:online?"#22C55E":"#94A3B8", border:`2px solid ${T.surface}` }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                  <div style={{ fontSize:11, color:online?"#22C55E":T.text3 }}>{online?"En ligne":"Hors ligne"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ RIGHT PANEL — Messages ═══ */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, background:T.bg, borderRadius:"0 16px 16px 0", overflow:"hidden" }}>
        {/* Chat header */}
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12, background:T.surface }}>
          {collabChatMode==="dm" && (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null) ? (<>
            <div style={{ position:"relative" }}>
              <Avatar name={(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).name} color={(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).color||T.accent} size={36}/>
              <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background:collabIsOnline((typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id)?"#22C55E":"#94A3B8", border:`2px solid ${T.surface}` }}/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>{(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).name}</div>
              <div style={{ fontSize:11, color:collabIsOnline((typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id)?"#22C55E":T.text3 }}>{collabIsOnline((typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id)?"En ligne":"Hors ligne"}</div>
            </div>
          </>) : (<>
            <div style={{ width:36, height:36, borderRadius:12, background:"linear-gradient(135deg,#7C3AED,#2563EB)", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="users" s={16} style={{ color:"#fff" }}/></div>
            <div>
              <h1 style={{ fontSize:15, fontWeight:800, margin:0 }}>Chat d'équipe</h1>
              <p style={{ fontSize:12, color:T.text3, margin:0, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:"#22C55E", display:"inline-block", animation:"pulse 2s infinite" }}/> {company?.name} · {(typeof collabChatOnline!=='undefined'?collabChatOnline:{}).length}/{allCollabs.length} en ligne
              </p>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:-4 }}>
              {allCollabs.slice(0,5).map(c=>(
                <div key={c.id} style={{ position:"relative", marginLeft:-6 }}>
                  <Avatar name={c.name} color={c.color} size={24}/>
                  {collabIsOnline(c.id) && <div style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:4, background:"#22C55E", border:`1.5px solid ${T.surface}` }}/>}
                </div>
              ))}
            </div>
          </>)}
          <div style={{ marginLeft:(typeof collabChatMode!=='undefined'?collabChatMode:null)==="dm"?"auto":8, display:"flex", alignItems:"center", gap:6 }}>
            <div onClick={()=>{ (typeof setCollabChatSearchOpen==='function'?setCollabChatSearchOpen:function(){})(!collabChatSearchOpen); if(collabChatSearchOpen) (typeof setCollabChatSearch==='function'?setCollabChatSearch:function(){})(""); }} style={{ width:32, height:32, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", background:collabChatSearchOpen?T.accentBg:T.bg, border:`1px solid ${collabChatSearchOpen?T.accentBorder:T.border}`, color:collabChatSearchOpen?T.accent:T.text3 }} title="Rechercher"><I n="search" s={14}/></div>
          </div>
        </div>

        {/* Search bar (expandable) */}
        {(typeof collabChatSearchOpen!=='undefined'?collabChatSearchOpen:null) && (
          <div style={{ marginBottom:8, position:"relative", animation:"slideDown .2s ease" }}>
            <I n="search" s={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:T.text3 }}/>
            <input value={collabChatSearch} onChange={e=>(typeof setCollabChatSearch==='function'?setCollabChatSearch:function(){})(e.target.value)} autoFocus placeholder="Rechercher dans les messages..." style={{ width:"100%", padding:"10px 14px 10px 36px", borderRadius:12, border:`1px solid ${T.accentBorder}`, background:T.surface, color:T.text, fontSize:13, fontFamily:"inherit", outline:"none", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}/>
            {(typeof collabChatSearch!=='undefined'?collabChatSearch:null) && <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:11, color:T.text3, fontWeight:600 }}>{filteredMsgs.length} résultat{filteredMsgs.length>1?"s":""}</span>}
          </div>
        )}

        {/* Chat container */}
        <Card style={{ flex:1, padding:0, display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0, borderRadius:16, boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
          {/* Messages area */}
          <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:2 }}>
            {filteredMsgs.length === 0 && !(typeof collabChatSearch!=='undefined'?collabChatSearch:null) && (
              <div style={{ textAlign:"center", padding:60, color:T.text3, margin:"auto" }}>
                <div style={{ width:80, height:80, borderRadius:24, background:"linear-gradient(135deg,#7C3AED15,#2563EB15)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", position:"relative" }}>
                  <I n="message-circle" s={36} style={{ color:T.accent, opacity:0.6 }}/>
                  <div style={{ position:"absolute", bottom:-4, right:-4, width:28, height:28, borderRadius:14, background:"linear-gradient(135deg,#22C55E,#16A34A)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <I n="plus" s={16} style={{ color:"#fff" }}/>
                  </div>
                </div>
                <h3 style={{ fontSize:18, fontWeight:700, marginBottom:8, color:T.text }}>Démarrez la conversation !</h3>
                <p style={{ fontSize:13, lineHeight:1.6, maxWidth:320, margin:"0 auto" }}>Envoyez des messages, des images 📸, des captures d'écran, des emojis et partagez des fiches clients avec votre équipe.</p>
                <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:20, flexWrap:"wrap" }}>
                  {["👋 Bonjour l'équipe !","🚀 C'est parti !","☕ Pause café ?"].map(q=>(
                    <div key={q} onClick={()=>{ (typeof setCollabChatInput==='function'?setCollabChatInput:function(){})(q); collabChatInputRef.current?.focus(); }} style={{ padding:"8px 16px", borderRadius:20, background:T.accentBg, border:`1px solid ${T.accentBorder}`, fontSize:12, fontWeight:600, color:T.accent, cursor:"pointer", transition:"all .15s" }}>{q}</div>
                  ))}
                </div>
              </div>
            )}
            {filteredMsgs.length === 0 && (typeof collabChatSearch!=='undefined'?collabChatSearch:null) && (
              <div style={{ textAlign:"center", padding:40, color:T.text3 }}>
                <I n="search" s={32} style={{ opacity:0.3, marginBottom:12 }}/>
                <p style={{ fontSize:14, fontWeight:600 }}>Aucun résultat pour "{collabChatSearch}"</p>
              </div>
            )}
            {filteredMsgs.map((msg, i) => {
              const isMe = msg.senderId === collab.id;
              const showAvatar = i === 0 || filteredMsgs[i-1].senderId !== msg.senderId;
              const color = isMe ? collab.color : T.accent;
              const msgDate = new Date(msg.createdAt).toLocaleDateString("fr-FR");
              const prevDate = i > 0 ? new Date(filteredMsgs[i-1].createdAt).toLocaleDateString("fr-FR") : null;
              const showDateSep = i === 0 || msgDate !== prevDate;
              const todayD = new Date().toLocaleDateString("fr-FR");
              const yesterdayD = new Date(Date.now()-86400000).toLocaleDateString("fr-FR");
              const dateLabel = msgDate === todayD ? "Aujourd'hui" : msgDate === yesterdayD ? "Hier" : msgDate;
              const atts = msg.attachments;
              const reactions = getMsgReactions(msg.id, msg);
              const isHovered = (typeof collabChatHoveredMsg!=='undefined'?collabChatHoveredMsg:null) === msg.id;
              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div style={{ textAlign:"center", margin:"20px 0 14px", position:"relative" }}>
                      <div style={{ position:"absolute", top:"50%", left:0, right:0, height:1, background:T.border+"60" }}/>
                      <span style={{ position:"relative", background:T.surface, padding:"5px 16px", fontSize:11, fontWeight:700, color:T.text3, borderRadius:20, border:`1px solid ${T.border}`, letterSpacing:0.5 }}>{dateLabel}</span>
                    </div>
                  )}
                  <div
                    onMouseEnter={()=>setCollabChatHoveredMsg(msg.id)}
                    onMouseLeave={()=>{ setCollabChatHoveredMsg(null); if(collabChatReactionPicker===msg.id) (typeof setCollabChatReactionPicker==='function'?setCollabChatReactionPicker:function(){})(null); }}
                    style={{ display:"flex", gap:8, marginBottom:showAvatar?12:3, flexDirection:isMe?"row-reverse":"row", alignItems:"flex-end", position:"relative", padding:"2px 0" }}>
                    {showAvatar ? <Avatar name={msg.senderName} color={color} size={32}/> : <div style={{ width:32, flexShrink:0 }}/>}
                    <div style={{ maxWidth:"70%", position:"relative" }}>
                      {showAvatar && !isMe && <div style={{ fontSize:11, fontWeight:700, color, marginBottom:3, marginLeft:6 }}>{msg.senderName}</div>}

                      {/* Reply preview */}
                      {msg.replyToMsg && (
                        <div style={{ padding:"6px 10px", marginBottom:2, borderRadius:"10px 10px 0 0", background:isMe?(collab.color||T.accent)+"18":T.bg, borderLeft:`3px solid ${isMe?collab.color||T.accent:T.accent}`, fontSize:11, color:T.text3 }}>
                          <div style={{ fontWeight:700, fontSize:10, color:T.accent, marginBottom:1 }}>{msg.replyToName}</div>
                          {msg.replyToMsg}
                        </div>
                      )}

                      {/* Contact card */}
                      {msg.type === 'contact_card' && atts ? (
                        <div style={{ padding:14, borderRadius:14, background:isMe?(collab.color||T.accent)+"10":T.bg, border:`1px solid ${isMe?(collab.color||T.accent)+"25":T.border}`, minWidth:240, backdropFilter:"blur(8px)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                            <Avatar name={atts.name} color={T.accent} size={36}/>
                            <div>
                              <div style={{ fontSize:14, fontWeight:700 }}>{atts.name}</div>
                              {atts.email && <div style={{ fontSize:11, color:T.text3 }}>{atts.email}</div>}
                            </div>
                          </div>
                          {atts.phone && <div style={{ fontSize:12, color:T.text2, marginBottom:6, display:"flex", alignItems:"center", gap:4 }}><I n="phone" s={11}/> {atts.phone}</div>}
                          <div style={{ display:"flex", gap:6, fontSize:11 }}>
                            <Badge color={T.accent}>{atts.totalBookings||0} RDV</Badge>
                            <Badge color={atts.pipeline_stage==='client_valide'?"#22C55E":atts.pipeline_stage==='nrp'?"#EF4444":"#7C3AED"}>{(atts.pipeline_stage||'nouveau').replace(/_/g,' ')}</Badge>
                          </div>
                          <div style={{ fontSize:10, color:T.text3, marginTop:8, textAlign:"center", fontStyle:"italic", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}><I n="user" s={10}/> Fiche client partagée</div>
                        </div>
                      ) : msg.type === 'voice_note' && atts ? (
                        /* Voice note */
                        <div style={{ padding:"10px 16px", borderRadius:18, background:isMe?"linear-gradient(135deg,"+(collab.color||T.accent)+","+(collab.color||T.accent)+"DD)":T.bg, border:isMe?"none":`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10, minWidth:200 }}>
                          <div style={{ width:36, height:36, borderRadius:18, background:isMe?"rgba(255,255,255,0.2)":T.accentBg, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }} onClick={()=>{ const a=new Audio(atts.dataUrl); a.play(); }}><I n="play" s={16} style={{ color:isMe?"#fff":T.accent }}/></div>
                          <div style={{ flex:1 }}>
                            <div style={{ height:3, borderRadius:2, background:isMe?"rgba(255,255,255,0.3)":T.border, position:"relative" }}><div style={{ width:"60%", height:"100%", borderRadius:2, background:isMe?"#fff":T.accent }}/></div>
                            <div style={{ fontSize:10, color:isMe?"rgba(255,255,255,0.7)":T.text3, marginTop:4 }}>{atts.duration?`0:${String(atts.duration).padStart(2,'0')}`:"0:00"}</div>
                          </div>
                          <I n="mic" s={14} style={{ color:isMe?"rgba(255,255,255,0.5)":T.text3 }}/>
                        </div>
                      ) : (
                        <div>
                          {msg.message && <div style={{ padding:"10px 16px", borderRadius:18, fontSize:13, lineHeight:1.6, background:isMe?"linear-gradient(135deg,"+(collab.color||T.accent)+","+(collab.color||T.accent)+"DD)":T.bg, color:isMe?"#fff":T.text, borderBottomRightRadius:isMe?4:18, borderBottomLeftRadius:isMe?18:4, wordBreak:"break-word", boxShadow:isMe?"0 2px 8px "+(collab.color||T.accent)+"25":"none", border:isMe?"none":`1px solid ${T.border}` }}>{msg.message}{msg.editedAt && <span style={{ fontSize:9, opacity:.6, marginLeft:6 }}>(modifié)</span>}</div>}
                          {atts && Array.isArray(atts) && atts.length > 0 && (
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:msg.message?6:0 }}>
                              {atts.map((a,ai) => a.type?.startsWith('image/') ? (
                                <img key={ai} src={a.dataUrl} alt={a.name} onClick={()=>window.open(a.dataUrl,'_blank')} style={{ maxWidth:260, maxHeight:200, borderRadius:12, cursor:"pointer", border:`1px solid ${T.border}`, objectFit:"cover", boxShadow:"0 2px 8px rgba(0,0,0,0.1)" }}/>
                              ) : a.type?.startsWith('audio/') ? (
                                <audio key={ai} controls src={a.dataUrl} style={{ maxWidth:260, borderRadius:8 }}/>
                              ) : (
                                <a key={ai} href={a.dataUrl} download={a.name} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, background:T.surface, border:`1px solid ${T.border}`, fontSize:12, color:T.accent, textDecoration:"none", maxWidth:260 }}>
                                  <I n="paperclip" s={14}/> <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</span>
                                  <span style={{ fontSize:10, color:T.text3, flexShrink:0 }}>{(a.size/1024).toFixed(0)} Ko</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reactions display */}
                      {reactions.length > 0 && (
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4, justifyContent:isMe?"flex-end":"flex-start" }}>
                          {reactions.map(r=>(
                            <div key={r.emoji} onClick={()=>addChatReaction(msg.id, r.emoji)} title={r.users.join(", ")} style={{ display:"flex", alignItems:"center", gap:3, padding:"2px 8px", borderRadius:12, background:r.isMine?T.accentBg:T.bg, border:`1px solid ${r.isMine?T.accentBorder:T.border}`, cursor:"pointer", fontSize:13, transition:"all .15s" }}>
                              {r.emoji} <span style={{ fontSize:10, fontWeight:700, color:r.isMine?T.accent:T.text3 }}>{r.users.length}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize:10, color:T.text3, marginTop:3, textAlign:isMe?"right":"left", marginLeft:6, marginRight:6, display:"flex", alignItems:"center", gap:4, justifyContent:isMe?"flex-end":"flex-start" }}>
                        {new Date(msg.createdAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
                        {isMe && <span style={{ color:"#22C55E", fontSize:10 }}>✓✓</span>}
                      </div>
                    </div>

                    {/* Hover actions toolbar */}
                    {isHovered && !msg.id.startsWith("tmp_") && (
                      <div style={{ display:"flex", gap:2, alignItems:"center", position:"absolute", [isMe?"left":"right"]:40, top:-8, background:T.surface, borderRadius:8, padding:"2px 4px", boxShadow:"0 2px 12px rgba(0,0,0,0.12)", border:`1px solid ${T.border}`, zIndex:5 }}>
                        {REACTION_EMOJIS.slice(0,4).map(em=>(
                          <div key={em} onClick={()=>addChatReaction(msg.id,em)} style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:6, fontSize:14 }} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{em}</div>
                        ))}
                        <div style={{ width:1, height:18, background:T.border, margin:"0 2px" }}/>
                        <div onClick={()=>{ setCollabChatReplyTo(msg); collabChatInputRef.current?.focus(); }} style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:6, color:T.text3 }} title="Répondre"><I n="corner-up-left" s={14}/></div>
                        {isMe && <>
                          <div onClick={()=>{ setCollabChatEditingMsg({id:msg.id, message:msg.message}); (typeof setCollabChatInput==='function'?setCollabChatInput:function(){})(msg.message||""); collabChatInputRef.current?.focus(); }} style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:6, color:T.text3 }} title="Modifier"><I n="edit-2" s={14}/></div>
                          <div onClick={()=>collabDeleteChat(msg.id)} style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:6, color:"#EF4444" }} title="Supprimer"><I n="trash-2" s={14}/></div>
                        </>}
                      </div>
                    )}

                    {/* Extended reaction picker */}
                    {collabChatReactionPicker === msg.id && (
                      <div style={{ position:"absolute", [isMe?"left":"right"]:isMe?40:undefined, top:20, background:T.surface, borderRadius:12, padding:8, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", border:`1px solid ${T.border}`, zIndex:10, display:"flex", gap:4, flexWrap:"wrap", width:200 }}>
                        {REACTION_EMOJIS.map(em=>(
                          <div key={em} onClick={()=>{ addChatReaction(msg.id,em); setCollabChatReactionPicker(null); }} style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:8, fontSize:18, transition:"all .1s" }} onMouseEnter={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.transform="scale(1.2)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}>{em}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={collabChatEndRef}/>
          </div>

          {/* Reply preview bar */}
          {(typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:null) && (
            <div style={{ padding:"8px 16px", borderTop:`1px solid ${T.border}`, background:T.accentBg, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:3, height:32, borderRadius:2, background:T.accent, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.accent }}><I n="corner-up-left" s={11}/> Réponse à {(typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:{}).senderName}</div>
                <div style={{ fontSize:12, color:T.text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:{}).message || "(fichier)"}</div>
              </div>
              <span onClick={()=>setCollabChatReplyTo(null)} style={{ cursor:"pointer", color:T.text3, flexShrink:0, padding:4 }}><I n="x" s={14}/></span>
            </div>
          )}

          {/* Edit mode indicator */}
          {(typeof collabChatEditingMsg!=='undefined'?collabChatEditingMsg:null) && (
            <div style={{ padding:"8px 16px", borderTop:`1px solid ${T.border}`, background:"#F59E0B12", display:"flex", alignItems:"center", gap:10 }}>
              <I n="edit-2" s={14} style={{ color:"#F59E0B" }}/>
              <div style={{ flex:1, fontSize:12, fontWeight:600, color:"#F59E0B" }}>Modification du message</div>
              <span onClick={()=>{ setCollabChatEditingMsg(null); setCollabChatInput(""); }} style={{ cursor:"pointer", color:T.text3, flexShrink:0, padding:4 }}><I n="x" s={14}/></span>
            </div>
          )}

          {/* File preview bar */}
          {(typeof collabChatFiles!=='undefined'?collabChatFiles:{}).length > 0 && (
            <div style={{ padding:"8px 16px", borderTop:`1px solid ${T.border}`, background:T.accentBg, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {(typeof collabChatFiles!=='undefined'?collabChatFiles:{}).map((f,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, fontSize:12 }}>
                  {f.type?.startsWith('image/') ? <img src={f.dataUrl} alt="" style={{ width:28, height:28, borderRadius:6, objectFit:"cover" }}/> : <I n="paperclip" s={12}/>}
                  <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                  <span onClick={()=>setCollabChatFiles(p=>p.filter((_,j)=>j!==i))} style={{ cursor:"pointer", color:T.text3, marginLeft:2 }}><I n="x" s={12}/></span>
                </div>
              ))}
            </div>
          )}

          {/* Emoji picker — FIXED position above input */}
          {(typeof collabChatShowEmoji!=='undefined'?collabChatShowEmoji:null) && (
            <div style={{ borderTop:`1px solid ${T.border}`, padding:"8px 16px", background:T.surface, maxHeight:200, overflowY:"auto" }}>
              {Object.entries(CHAT_EMOJIS).map(([cat, emojis])=>(
                <div key={cat}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.text3, margin:"6px 0 4px", textTransform:"uppercase", letterSpacing:1 }}>{cat}</div>
                  <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
                    {emojis.map(em=>(
                      <div key={em} onClick={()=>{ (typeof setCollabChatInput==='function'?setCollabChatInput:function(){})(p=>p+em); collabChatInputRef.current?.focus(); }} style={{ width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", borderRadius:8, fontSize:18, transition:"all .1s" }} onMouseEnter={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.transform="scale(1.15)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}>{em}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input bar with voice recording */}
          <div style={{ padding:"10px 16px", borderTop:`1px solid ${T.border}`, display:"flex", gap:6, alignItems:"center", background:T.surface }}>
            <input type="file" ref={collabChatFileRef} onChange={handleCollabChatFiles} multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" style={{ display:"none" }}/>
            <div onClick={()=>(typeof setCollabChatShowEmoji==='function'?setCollabChatShowEmoji:function(){})(!collabChatShowEmoji)} style={{ width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:collabChatShowEmoji?"#F59E0B":T.text3, background:collabChatShowEmoji?"#F59E0B12":T.bg, border:`1px solid ${collabChatShowEmoji?"#F59E0B30":T.border}`, flexShrink:0, fontSize:18 }} title="Emojis">😊</div>
            <div onClick={()=>collabChatFileRef.current?.click()} style={{ width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:T.text3, background:T.bg, border:`1px solid ${T.border}`, flexShrink:0 }} title="Joindre un fichier"><I n="paperclip" s={16}/></div>
            <div onClick={()=>setCollabChatShowContactPicker(true)} style={{ width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:T.accent, background:T.accentBg, border:`1px solid ${T.accentBorder}`, flexShrink:0 }} title="Partager une fiche client"><I n="user" s={16}/></div>

            {(typeof collabChatIsRecording!=='undefined'?collabChatIsRecording:null) ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", gap:10, padding:"8px 14px", borderRadius:14, background:"#EF444412", border:"1.5px solid #EF444440" }}>
                <div style={{ width:10, height:10, borderRadius:5, background:"#EF4444", animation:"pulse 1s infinite" }}/>
                <span style={{ fontSize:13, fontWeight:600, color:"#EF4444" }}>0:{String((typeof collabChatRecordingTime!=='undefined'?collabChatRecordingTime:null)).padStart(2,'0')}</span>
                <div style={{ flex:1 }}/>
                <div onClick={collabCancelRecording} style={{ width:32, height:32, borderRadius:16, background:"#EF444418", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }} title="Annuler"><I n="x" s={16} style={{ color:"#EF4444" }}/></div>
                <div onClick={collabStopRecording} style={{ width:32, height:32, borderRadius:16, background:"#22C55E", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", boxShadow:"0 2px 8px rgba(34,197,94,0.3)" }} title="Envoyer"><I n="send" s={16} style={{ color:"#fff" }}/></div>
              </div>
            ) : (<>
              <input ref={collabChatInputRef} value={collabChatInput} onChange={e=>(typeof setCollabChatInput==='function'?setCollabChatInput:function(){})(e.target.value)} onPaste={handleCollabChatPaste} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handleCollabSendChat(); } if(e.key==="Escape"){ (typeof setCollabChatEditingMsg==='function'?setCollabChatEditingMsg:function(){})(null); (typeof setCollabChatInput==='function'?setCollabChatInput:function(){})(""); } }} placeholder={collabChatEditingMsg?"Modifier le message...":"Écrire un message..."} style={{ flex:1, padding:"10px 16px", borderRadius:14, border:`1.5px solid ${collabChatEditingMsg?"#F59E0B":T.border}`, background:T.bg, color:T.text, fontSize:13, fontFamily:"inherit", outline:"none", transition:"border-color .2s" }} onFocus={e=>e.target.style.borderColor=collabChatEditingMsg?"#F59E0B":T.accent} onBlur={e=>e.target.style.borderColor=collabChatEditingMsg?"#F59E0B":T.border}/>
              {(typeof collabChatInput!=='undefined'?collabChatInput:{}).trim()||(typeof collabChatFiles!=='undefined'?collabChatFiles:{}).length ? (
                <Btn primary onClick={()=>handleCollabSendChat()} style={{ borderRadius:14, padding:"10px 18px", background:"linear-gradient(135deg,#7C3AED,#2563EB)", boxShadow:"0 4px 12px rgba(124,58,237,0.3)" }}><I n="send" s={16}/></Btn>
              ) : (
                <div onClick={collabStartRecording} style={{ width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#EF4444", background:"#EF444412", border:"1px solid #EF444430", flexShrink:0 }} title="Note vocale"><I n="mic" s={16}/></div>
              )}
            </>)}
          </div>
        </Card>
      </div> {/* End right panel */}

      {/* Contact picker modal */}
      {(typeof collabChatShowContactPicker!=='undefined'?collabChatShowContactPicker:null) && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setCollabChatShowContactPicker(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:T.bg, borderRadius:20, padding:24, maxWidth:440, width:"90%", maxHeight:"70vh", display:"flex", flexDirection:"column", boxShadow:"0 25px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#7C3AED,#2563EB)", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="user" s={18} style={{ color:"#fff" }}/></div>
              <h3 style={{ fontSize:16, fontWeight:700, margin:0 }}>Partager une fiche client</h3>
              <span onClick={()=>setCollabChatShowContactPicker(false)} style={{ marginLeft:"auto", cursor:"pointer", color:T.text3, width:32, height:32, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:T.bg, border:`1px solid ${T.border}` }}><I n="x" s={16}/></span>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {(contacts||[]).filter(c=>c.companyId===company.id).length === 0 && <div style={{ textAlign:"center", padding:20, color:T.text3, fontSize:13 }}>Aucun contact CRM</div>}
              {(contacts||[]).filter(c=>c.companyId===company.id).map(ct => (
                <div key={ct.id} onClick={()=>handleCollabShareContactCard(ct)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:12, cursor:"pointer", marginBottom:4, border:`1px solid ${T.border}`, background:T.surface, transition:"all .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                  <Avatar name={ct.name} color={T.accent} size={34}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div title={ct.name} style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ct.name}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{ct.email||ct.phone||'Pas d\'email'}</div>
                  </div>
                  <Badge color="#7C3AED">{(ct.pipeline_stage||'nouveau').replace(/_/g,' ')}</Badge>
                  <I n="send" s={14} style={{ color:T.accent }}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesTab;
