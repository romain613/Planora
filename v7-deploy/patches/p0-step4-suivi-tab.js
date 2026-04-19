// P0 Step 4 — Add Suivi tab definition + content
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

// ── 4A. Add suivi tab after docs tab in the tab bar ──
const tabTarget = '{id:"docs",label:"📎 Docs"}';
if (!code.includes(tabTarget)) {
  console.error("ERROR: docs tab definition not found");
  process.exit(1);
}
code = code.replace(tabTarget, tabTarget + ',{id:"suivi",label:"📋 Suivi"}');
console.log("P0.3A — Suivi tab added to tab bar");

// ── 4B. Add Suivi tab content before docs tab content ──
const docsTabPattern = 'collabFicheTab==="docs"';
const docsIdx = code.indexOf(docsTabPattern);
if (docsIdx === -1) {
  console.error("ERROR: docs tab content not found");
  process.exit(1);
}
const docsLineStart = code.lastIndexOf("\n", docsIdx);

const suiviTabContent = `

                  {/* P0.3 — Onglet Suivi — V7 Transfer Tracking */}
                  {collabFicheTab==="suivi"&&<HookIsolator>{()=>{
                    const [followers, setFollowers] = useState({executor:null,sources:[],viewers:[],followers:[]});
                    const [loaded, setLoaded] = useState(false);
                    useEffect(()=>{
                      if(!ct?.id) return;
                      api("/api/transfer/followers/"+ct.id).then(d=>{
                        if(d&&!d.error) setFollowers(d);
                        setLoaded(true);
                      }).catch(()=>setLoaded(true));
                    },[ct.id]);
                    if(!loaded) return <div style={{textAlign:"center",padding:30,color:T.text3,fontSize:13}}>Chargement...</div>;
                    const hasData = followers.executor || followers.sources.length>0 || followers.viewers.length>0 || followers.followers.length>0;
                    if(!hasData) return (
                      <div style={{textAlign:"center",padding:40}}>
                        <div style={{width:48,height:48,borderRadius:14,background:"#8B5CF612",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
                          <I n="users" s={22} style={{color:"#8B5CF6"}}/>
                        </div>
                        <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>Aucun suivi actif</div>
                        <div style={{fontSize:12,color:T.text3}}>Ce contact n'a pas encore \u00e9t\u00e9 transf\u00e9r\u00e9.<br/>Utilisez le bouton Transf\u00e9rer pour assigner ce contact \u00e0 un coll\u00e8gue.</div>
                      </div>
                    );
                    return (
                      <div>
                        {followers.executor && (
                          <div style={{padding:"12px 14px",borderRadius:10,background:"#8B5CF608",border:"1.5px solid #8B5CF625",marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#8B5CF6",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><I n="user-check" s={13}/> Executor actuel</div>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <Avatar name={followers.executor.collaboratorName||"?"} color="#8B5CF6" s={32}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{followers.executor.collaboratorName}</div>
                                <div style={{fontSize:11,color:T.text3}}>{followers.executor.collaboratorEmail||""}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                {followers.executor.lastKnownExecutorStage && <div style={{fontSize:10,fontWeight:600,color:"#8B5CF6",padding:"2px 6px",borderRadius:4,background:"#8B5CF612"}}>{followers.executor.lastKnownExecutorStage}</div>}
                                <div style={{fontSize:9,color:T.text3,marginTop:2}}>depuis {new Date(followers.executor.createdAt).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {followers.sources.length>0 && (
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#F97316",marginBottom:6,display:"flex",alignItems:"center",gap:4}}><I n="arrow-right-circle" s={13}/> Source{followers.sources.length>1?"s":""} ({followers.sources.length})</div>
                            {followers.sources.map(s=>(
                              <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:T.bg,border:"1px solid "+T.border,marginBottom:4}}>
                                <Avatar name={s.collaboratorName||"?"} color="#F97316" s={26}/>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{s.collaboratorName}</div>
                                  <div style={{fontSize:10,color:T.text3}}>Mode: {s.trackingMode||"silent"}</div>
                                </div>
                                <div style={{fontSize:9,color:T.text3}}>{new Date(s.createdAt).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(followers.viewers.length>0||followers.followers.length>0) && (
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:"flex",alignItems:"center",gap:4}}><I n="eye" s={13}/> Observateurs ({followers.viewers.length+followers.followers.length})</div>
                            {[...followers.viewers,...followers.followers].map(f=>(
                              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:T.bg,border:"1px solid "+T.border,marginBottom:3}}>
                                <Avatar name={f.collaboratorName||"?"} color={T.text3} s={22}/>
                                <div style={{fontSize:12,color:T.text}}>{f.collaboratorName}</div>
                                <div style={{fontSize:9,color:T.text3,marginLeft:"auto"}}>{f.role}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{display:"flex",gap:8,marginTop:8}}>
                          <div onClick={()=>{setV7TransferModal({contact:ct,fromFicheSuivi:true});setV7TransferTarget('');}} style={{flex:1,padding:"8px 0",borderRadius:8,textAlign:"center",fontSize:12,fontWeight:700,cursor:"pointer",background:"#8B5CF610",color:"#8B5CF6",border:"1px solid #8B5CF625"}}>
                            <I n="users" s={13}/> Transf\u00e9rer
                          </div>
                        </div>
                      </div>
                    );
                  }}</HookIsolator>}
`;

code = code.slice(0, docsLineStart) + suiviTabContent + code.slice(docsLineStart);
fs.writeFileSync(file, code);
console.log("Step 4 — P0.3 Suivi tab complete");
