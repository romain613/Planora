// Phase 11b — extracted Tables tab from CollabPortal.jsx (was lines 16080-16349 IIFE).

import React from "react";
import { T } from "../../../theme";
import { I, Card, Avatar, Badge, Modal } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const TablesTab = () => {
  const {
    collabTables,
    collabSelectedTableId, setCollabSelectedTableId,
    collabTableRows, setCollabTableRows,
    collabTableSearch, setCollabTableSearch,
    collabTableLoading,
    collabEditingCell, setCollabEditingCell,
    collabEditingCellValue, setCollabEditingCellValue,
    collabSelectedRowId, setCollabSelectedRowId,
    collabDispatchTasks,
    collabTasksLoading,
    collabSelectedTable,
    collabTableColumns,
    collabFilteredRows,
    loadCollabTableRows,
    handleCollabUpdateRow,
    loadCollabDispatchTasks,
    completeCollabTask,
    skipCollabTask,
  } = useCollabContext();

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
        <div style={{ width:48, height:48, borderRadius:16, background:"linear-gradient(135deg,#2563EB,#7C3AED)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(37,99,235,0.25)" }}>
          <I n="database" s={24} style={{ color:"#fff" }}/>
        </div>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Mes Tables</h1>
          <p style={{ fontSize:12, color:T.text3, margin:0 }}>Données partagées par votre admin</p>
        </div>
      </div>

      {!(typeof collabSelectedTableId!=='undefined'?collabSelectedTableId:null) ? (
        /* Table list */
        <div>
          {(typeof collabTables!=='undefined'?collabTables:{}).length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Aucune table disponible</div>
              <div style={{ fontSize:13, color:T.text3 }}>Votre admin n'a pas encore créé de tables partagées</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
              {(typeof collabTables!=='undefined'?collabTables:{}).map(tbl => {
                const cols = tbl.columns || [];
                const collabCol = cols.find(c => c.type === 'collaborator');
                return (
                  <Card key={tbl.id} style={{ cursor:"pointer", transition:"all .15s", border:`1px solid ${T.border}` }}
                    onClick={()=>{ setCollabSelectedTableId(tbl.id); loadCollabTableRows(tbl.id); loadCollabDispatchTasks(tbl.id); }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                      <div style={{ width:40, height:40, borderRadius:12, background:(tbl.color||"#2563EB")+"14", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <I n={tbl.icon||"grid"} s={20} style={{ color:tbl.color||"#2563EB" }}/>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:700 }}>{tbl.name}</div>
                        <div style={{ fontSize:11, color:T.text3 }}>{cols.length} colonnes</div>
                      </div>
                      <I n="chevron-right" s={16} style={{ color:T.text3 }}/>
                    </div>
                    {collabCol && (
                      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:T.accentBg, fontSize:11, fontWeight:600, color:T.accent }}>
                        <I n="user" s={12}/> Assignation via "{collabCol.name}"
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Table detail view */
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <button onClick={()=>{ setCollabSelectedTableId(null); setCollabTableRows([]); setCollabTableSearch(""); setCollabSelectedRowId(null); }}
              style={{ width:32, height:32, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:T.text }}>
              <I n="arrow" s={14}/>
            </button>
            <div style={{ width:36, height:36, borderRadius:10, background:(collabSelectedTable?.color||"#2563EB")+"14", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <I n={collabSelectedTable?.icon||"grid"} s={18} style={{ color:collabSelectedTable?.color||"#2563EB" }}/>
            </div>
            <div>
              <h2 style={{ fontSize:18, fontWeight:700, margin:0 }}>{collabSelectedTable?.name}</h2>
              <div style={{ fontSize:12, color:T.text3 }}>{collabFilteredRows.length} ligne{collabFilteredRows.length>1?"s":""} assignée{collabFilteredRows.length>1?"s":""}</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <input placeholder="Rechercher..." value={collabTableSearch} onChange={e=>(typeof setCollabTableSearch==='function'?setCollabTableSearch:function(){})(e.target.value)}
                style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, color:T.text, width:200, outline:"none", fontFamily:"inherit" }}/>
            </div>
          </div>

          {/* ── AI Dispatch Tasks Widget ── */}
          {(()=>{
            const pending = (typeof collabDispatchTasks!=='undefined'?collabDispatchTasks:{}).filter(t=>t.status==='pending');
            const completed = (typeof collabDispatchTasks!=='undefined'?collabDispatchTasks:{}).filter(t=>t.status==='completed');
            const total = pending.length + completed.length;
            const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
            const totalLeadsToUnlock = pending.reduce((s,t)=>s+(t.leadsToUnlock||0),0);

            if (total === 0) return null;
            return (
              <div style={{ marginBottom:20, borderRadius:14, border:`1px solid #F59E0B40`, background:"linear-gradient(135deg,#F59E0B06,#EF444406)", overflow:"hidden" }}>
                <div style={{ padding:"16px 18px", borderBottom:`1px solid #F59E0B20` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:22 }}>🤖</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:800 }}>Missions IA — Débloquez des leads</div>
                      <div style={{ fontSize:11, color:T.text3 }}>
                        Complétez les tâches ci-dessous pour recevoir de nouveaux leads
                        {totalLeadsToUnlock > 0 && <span style={{ color:"#F59E0B", fontWeight:700 }}> · {totalLeadsToUnlock} leads à débloquer</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:20, fontWeight:800, color: pct >= 100 ? "#22C55E" : "#F59E0B" }}>{pct}%</div>
                      <div style={{ fontSize:10, color:T.text3 }}>{completed.length}/{total}</div>
                    </div>
                  </div>
                  <div style={{ width:"100%", height:10, borderRadius:5, background:T.bg, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, height:"100%", borderRadius:5, background: pct >= 100 ? "linear-gradient(90deg,#22C55E,#16A34A)" : "linear-gradient(90deg,#F59E0B,#EF4444)", transition:"width .6s ease", boxShadow: pct > 0 ? "0 0 8px rgba(245,158,11,0.4)" : "none" }}/>
                  </div>
                </div>

                <div style={{ padding:"10px 14px", maxHeight:260, overflowY:"auto" }}>
                  {pending.map(task => (
                    <div key={task.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, marginBottom:6, background:T.surface, border:`1px solid ${T.border}`, transition:"all .15s" }}>
                      <button onClick={()=>completeCollabTask((typeof collabSelectedTableId!=='undefined'?collabSelectedTableId:null), task.id)} disabled={collabTasksLoading}
                        style={{ width:26, height:26, borderRadius:7, border:`2px solid #F59E0B`, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, opacity:(typeof collabTasksLoading!=='undefined'?collabTasksLoading:null)?0.5:1 }}>
                        {(typeof collabTasksLoading!=='undefined'?collabTasksLoading:null) ? <div style={{ width:12, height:12, border:"2px solid #F59E0B44", borderTopColor:"#F59E0B", borderRadius:"50%", animation:"spin .6s linear infinite" }}/> : null}
                      </button>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{task.title}</div>
                        {task.description && <div style={{ fontSize:11, color:T.text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.description}</div>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                        <span style={{ padding:"3px 8px", borderRadius:6, background:"#F59E0B14", color:"#F59E0B", fontSize:11, fontWeight:700 }}>+{task.leadsToUnlock} leads</span>
                        <button onClick={()=>skipCollabTask((typeof collabSelectedTableId!=='undefined'?collabSelectedTableId:null), task.id)}
                          style={{ border:"none", background:"none", cursor:"pointer", color:T.text3, fontSize:10, padding:"2px 6px" }} title="Passer">✕</button>
                      </div>
                    </div>
                  ))}

                  {completed.length > 0 && (
                    <div style={{ marginTop:6, opacity:0.6 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:T.text3, marginBottom:4, paddingLeft:4 }}>✅ Terminées ({completed.length})</div>
                      {completed.slice(0, 3).map(task => (
                        <div key={task.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, marginBottom:3, fontSize:12, color:T.text3 }}>
                          <span style={{ color:"#22C55E" }}>✓</span>
                          <span style={{ textDecoration:"line-through" }}>{task.title}</span>
                          {task.leadsToUnlock > 0 && <span style={{ fontSize:10, color:"#22C55E", fontWeight:600 }}>+{task.leadsToUnlock}</span>}
                        </div>
                      ))}
                      {completed.length > 3 && <div style={{ fontSize:10, color:T.text3, paddingLeft:24 }}>...et {completed.length - 3} autre{completed.length-3>1?"s":""}</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {(typeof collabTableLoading!=='undefined'?collabTableLoading:null) ? (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:28, height:28, border:`3px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin .6s linear infinite", margin:"0 auto 12px" }}/>
              <div style={{ fontSize:13, color:T.text3 }}>Chargement...</div>
            </div>
          ) : collabFilteredRows.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Aucune donnée</div>
              <div style={{ fontSize:12, color:T.text3 }}>Aucune ligne ne vous est assignée dans cette table</div>
            </div>
          ) : (
            <div style={{ borderRadius:12, border:`1px solid ${T.border}`, overflow:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:T.surface }}>
                    {collabTableColumns.map(col => (
                      <th key={col.id} style={{ padding:"10px 14px", textAlign:"left", fontWeight:600, fontSize:11, color:T.text2, textTransform:"uppercase", letterSpacing:0.5, borderBottom:`2px solid ${T.border}`, whiteSpace:"nowrap" }}>
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {collabFilteredRows.map(row => (
                    <tr key={row.id} style={{ borderBottom:`1px solid ${T.border}`, cursor:"pointer" }}
                      onMouseEnter={e=>e.currentTarget.style.background=T.accentBg+"44"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {collabTableColumns.map(col => {
                        const val = (row.data||{})[col.id];
                        const isEditing = (typeof collabEditingCell!=='undefined'?collabEditingCell:null)?.rowId === row.id && (typeof collabEditingCell!=='undefined'?collabEditingCell:null)?.colId === col.id;
                        return (
                          <td key={col.id} style={{ padding:"8px 14px", borderBottom:`1px solid ${T.border}`, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                            onClick={()=>{
                              if (col.type === 'checkbox') { handleCollabUpdateRow(row.id, {[col.id]:!val}); return; }
                              if (col.type === 'collaborator') return;
                              setCollabEditingCell({rowId:row.id,colId:col.id}); setCollabEditingCellValue(val||"");
                            }}>
                            {isEditing ? (
                              col.type === 'select' ? (
                                <select autoFocus value={collabEditingCellValue} onChange={e=>{handleCollabUpdateRow(row.id,{[col.id]:e.target.value});(typeof setCollabEditingCell==='function'?setCollabEditingCell:function(){})(null);}}
                                  onBlur={()=>setCollabEditingCell(null)}
                                  style={{ width:"100%", padding:"4px 6px", borderRadius:6, border:`1px solid ${T.accent}`, fontSize:12, background:T.surface, color:T.text }}>
                                  <option value="">--</option>
                                  {(col.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input autoFocus type={col.type==='number'?'number':col.type==='date'?'date':col.type==='email'?'email':'text'}
                                  value={collabEditingCellValue} onChange={e=>(typeof setCollabEditingCellValue==='function'?setCollabEditingCellValue:function(){})(e.target.value)}
                                  onBlur={()=>{ handleCollabUpdateRow(row.id,{[col.id]:(typeof collabEditingCellValue!=='undefined'?collabEditingCellValue:null)}); (typeof setCollabEditingCell==='function'?setCollabEditingCell:function(){})(null); }}
                                  onKeyDown={e=>{ if(e.key==='Enter'){handleCollabUpdateRow(row.id,{[col.id]:(typeof collabEditingCellValue!=='undefined'?collabEditingCellValue:null)});(typeof setCollabEditingCell==='function'?setCollabEditingCell:function(){})(null);} if(e.key==='Escape')(typeof setCollabEditingCell==='function'?setCollabEditingCell:function(){})(null); }}
                                  style={{ width:"100%", padding:"4px 6px", borderRadius:6, border:`1px solid ${T.accent}`, fontSize:12, background:T.surface, color:T.text, outline:"none" }}/>
                              )
                            ) : (
                              col.type === 'checkbox' ? (
                                <span style={{ color:val?T.success:T.text3, fontSize:16 }}>{val?"✅":"☐"}</span>
                              ) : col.type === 'select' ? (
                                val ? <Badge color={(col.colors||{})[val]||T.accent}>{val}</Badge> : <span style={{ color:T.text3 }}>—</span>
                              ) : col.type === 'rating' ? (
                                <span style={{ color:T.warning }}>{val ? "★".repeat(Number(val)) + "☆".repeat(5-Number(val)) : "☆☆☆☆☆"}</span>
                              ) : col.type === 'collaborator' ? (
                                val ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"2px 8px", borderRadius:8, background:T.accentBg, fontSize:12, fontWeight:600, color:T.accent }}>
                                  <Avatar name={val} color={T.accent} size={18}/> {val}
                                </span> : <span style={{ color:T.text3 }}>—</span>
                              ) : col.type === 'email' && val ? (
                                <a href={`mailto:${val}`} style={{ color:T.accent, textDecoration:"none", fontSize:12 }}>{val}</a>
                              ) : col.type === 'url' && val ? (
                                <a href={val} target="_blank" rel="noopener" style={{ color:T.accent, textDecoration:"none", fontSize:12 }}>{val}</a>
                              ) : (
                                <span style={{ color:val?T.text:T.text3 }}>{val || "—"}</span>
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Modal open={!!collabSelectedRowId} onClose={()=>(typeof setCollabSelectedRowId==='function'?setCollabSelectedRowId:function(){})(null)} title="Détail" width={500}>
            {(() => {
              const row = (typeof collabTableRows!=='undefined'?collabTableRows:{}).find(r => r.id === (typeof collabSelectedRowId!=='undefined'?collabSelectedRowId:null));
              if (!row) return null;
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {collabTableColumns.map(col => {
                    const val = (row.data||{})[col.id];
                    return (
                      <div key={col.id}>
                        <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text2, marginBottom:4 }}>{col.name}</label>
                        {col.type === 'collaborator' ? (
                          <div style={{ padding:"8px 12px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
                            {val ? <><Avatar name={val} color={T.accent} size={22}/> {val}</> : <span style={{ color:T.text3 }}>Non assigné</span>}
                          </div>
                        ) : col.type === 'select' ? (
                          <select value={val||""} onChange={e=>handleCollabUpdateRow(row.id,{[col.id]:e.target.value})}
                            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13 }}>
                            <option value="">--</option>
                            {(col.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : col.type === 'checkbox' ? (
                          <button onClick={()=>handleCollabUpdateRow(row.id,{[col.id]:!val})}
                            style={{ width:28, height:28, borderRadius:6, border:`2px solid ${val?T.success:T.border2}`, background:val?T.success:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {val && <I n="check" s={14} style={{ color:"#fff" }}/>}
                          </button>
                        ) : (
                          <input type={col.type==='number'?'number':col.type==='date'?'date':col.type==='email'?'email':'text'}
                            value={val||""} onChange={e=>handleCollabUpdateRow(row.id,{[col.id]:e.target.value})}
                            style={{ width:"100%", boxSizing:"border-box", padding:"8px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:"inherit", outline:"none" }}/>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Modal>
        </div>
      )}
    </div>
  );
};

export default TablesTab;
