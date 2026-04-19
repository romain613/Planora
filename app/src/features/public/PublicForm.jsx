import React, { useEffect, useState } from "react";
import { api } from "../../shared/services/api";

const PublicForm = ({ companySlug, formSlug }) => {
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/api/forms/public/${companySlug}/${formSlug}`).then(d => {
      if (d?.id) { setFormData(d); } else { setError("Formulaire introuvable"); }
      setLoading(false);
    }).catch(() => { setError("Erreur de chargement"); setLoading(false); });
  }, [companySlug, formSlug]);

  const handleSubmit = async () => {
    if (!formData) return;
    // Validate required fields
    const missing = (formData.fields||[]).filter(f => f.required && f.type !== "heading" && !values[f.id]);
    if (missing.length) { setError(`Champs obligatoires : ${missing.map(f=>f.label).join(", ")}`); return; }
    setSubmitting(true); setError(null);
    // Extract name/email/phone from values
    const fields = formData.fields || [];
    const emailField = fields.find(f => f.type === "email");
    const phoneField = fields.find(f => f.type === "phone");
    const nameField = fields.find(f => f.type === "text" && /nom/i.test(f.label));
    const res = await api(`/api/forms/${formData.id}/submit`, { method: "POST", body: {
      data: values,
      visitorName: nameField ? values[nameField.id] || "" : "",
      visitorEmail: emailField ? values[emailField.id] || "" : "",
      visitorPhone: phoneField ? values[phoneField.id] || "" : "",
      source: "link",
    }});
    setSubmitting(false);
    if (res?.ok) setDone(true);
    else setError("Erreur lors de l'envoi");
  };

  const color = formData?.color || "#2563EB";
  const bg = "#FAFBFC";

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:bg,fontFamily:"'Onest',system-ui,sans-serif"}}><div style={{fontSize:14,color:"#888"}}>Chargement...</div></div>;
  if (error && !formData) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:bg,fontFamily:"'Onest',system-ui,sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>📋</div><div style={{fontSize:16,fontWeight:700,color:"#333"}}>{error}</div></div></div>;

  if (done) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:bg,fontFamily:"'Onest',system-ui,sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:400}}>
        <div style={{width:60,height:60,borderRadius:30,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><span style={{fontSize:28}}>✅</span></div>
        <div style={{fontSize:20,fontWeight:800,color:"#111",marginBottom:8}}>Merci !</div>
        <div style={{fontSize:14,color:"#666"}}>Votre réponse a bien été enregistrée.</div>
        <div style={{fontSize:12,color:"#999",marginTop:16}}>{formData.companyName}</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:bg,fontFamily:"'Onest','Outfit',system-ui,sans-serif",display:"flex",justifyContent:"center",padding:"40px 16px"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;}`}</style>
      <div style={{width:"100%",maxWidth:560}}>
        <div style={{width:50,height:5,borderRadius:3,background:color,marginBottom:20}}/>
        <div style={{fontSize:24,fontWeight:800,color:"#111",marginBottom:4}}>{formData.name}</div>
        {formData.description && <div style={{fontSize:14,color:"#666",marginBottom:20}}>{formData.description}</div>}
        <div style={{fontSize:11,color:"#999",marginBottom:24}}>par {formData.companyName}</div>

        {error && <div style={{padding:"10px 14px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",fontSize:12,marginBottom:16}}>{error}</div>}

        {(() => {
          const fields = formData.fields || [];
          const renderPublicField = (field) => {
            if (field.conditional && field.conditional.fieldId && field.conditional.value) {
              const condVal = values[field.conditional.fieldId];
              if (condVal !== field.conditional.value) return null;
            }
            return (
            <div key={field.id} style={{marginBottom:18}}>
              {field.type === "heading" ? (
                <div style={{fontSize:16,fontWeight:800,borderBottom:`2px solid ${color}`,paddingBottom:6,marginTop:10,marginBottom:6,color:"#111"}}>{field.label}</div>
              ) : (
                <>
                  <label style={{display:"block",fontSize:13,fontWeight:600,color:"#333",marginBottom:5}}>{field.label}{field.required && <span style={{color:"#DC2626"}}> *</span>}</label>
                  {field.type === "textarea" ? (
                    <textarea value={values[field.id]||""} onChange={e=>setValues(p=>({...p,[field.id]:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,fontFamily:"inherit",color:"#111",resize:"vertical",minHeight:80,outline:"none"}} placeholder={field.label}/>
                  ) : field.type === "select" ? (
                    <select value={values[field.id]||""} onChange={e=>setValues(p=>({...p,[field.id]:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,fontFamily:"inherit",color:"#111",background:"#fff",outline:"none"}}>
                      <option value="">Sélectionner...</option>
                      {(field.options||[]).map((o,i)=><option key={i} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === "radio" ? (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {(field.options||[]).map((o,i)=>(
                        <label key={i} onClick={()=>setValues(p=>({...p,[field.id]:o}))} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"6px 10px",borderRadius:8,border:`1px solid ${values[field.id]===o?color:"#E2E8F0"}`,background:values[field.id]===o?color+"08":"#fff"}}>
                          <div style={{width:16,height:16,borderRadius:8,border:`2px solid ${values[field.id]===o?color:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>{values[field.id]===o && <div style={{width:8,height:8,borderRadius:4,background:color}}/>}</div>
                          <span style={{fontSize:13,color:"#333"}}>{o}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === "checkbox" ? (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {(field.options||[]).map((o,i)=>{
                        const checked = (values[field.id]||[]).includes(o);
                        return (
                          <label key={i} onClick={()=>setValues(p=>{const cur=p[field.id]||[];return{...p,[field.id]:checked?cur.filter(x=>x!==o):[...cur,o]};})} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"6px 10px",borderRadius:8,border:`1px solid ${checked?color:"#E2E8F0"}`,background:checked?color+"08":"#fff"}}>
                            <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${checked?color:"#CBD5E1"}`,background:checked?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{checked && <span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}</div>
                            <span style={{fontSize:13,color:"#333"}}>{o}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : field.type === "rating" ? (
                    <div style={{display:"flex",gap:4}}>
                      {[1,2,3,4,5].map(n=><span key={n} onClick={()=>setValues(p=>({...p,[field.id]:n}))} style={{fontSize:24,cursor:"pointer",color:(values[field.id]||0)>=n?'#F59E0B':'#CBD5E1',transition:'color .15s'}}>★</span>)}
                    </div>
                  ) : (
                    <input type={field.type==="email"?"email":field.type==="phone"?"tel":field.type==="number"?"number":field.type==="date"?"date":"text"} value={values[field.id]||""} onChange={e=>setValues(p=>({...p,[field.id]:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,fontFamily:"inherit",color:"#111",outline:"none"}} placeholder={field.label}/>
                  )}
                </>
              )}
            </div>
          );};
          // Flexible width grouping (25/50/75/100%)
          const rows = []; let row = []; let rowW = 0;
          for (const f of fields) {
            const fw = f.width || (f.half ? 50 : 100);
            if (rowW + fw > 100 && row.length > 0) { rows.push([...row]); row = [f]; rowW = fw; }
            else { row.push(f); rowW += fw; if (rowW >= 100) { rows.push([...row]); row = []; rowW = 0; } }
          }
          if (row.length) rows.push(row);
          return rows.map((r, ri) =>
            r.length === 1 && (r[0].width || (r[0].half ? 50 : 100)) === 100
              ? renderPublicField(r[0])
              : <div key={"prow_"+ri} style={{display:"grid",gridTemplateColumns:r.map(f=>`${f.width||(f.half?50:100)}fr`).join(" "),gap:14}}>{r.map(f=>renderPublicField(f))}</div>
          );
        })()}

        <button onClick={handleSubmit} disabled={submitting} style={{width:"100%",padding:"14px 0",borderRadius:10,background:color,color:"#fff",fontSize:14,fontWeight:700,border:"none",cursor:submitting?"wait":"pointer",opacity:submitting?0.7:1,marginTop:8,fontFamily:"inherit"}}>
          {submitting ? "Envoi en cours..." : formData.settings?.submitLabel || "Envoyer"}
        </button>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#999"}}>
          Propulsé par <a href="https://calendar360.fr" style={{color:color,textDecoration:"none",fontWeight:600}}>Calendar360</a>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────
// CLIENT PORTAL (espace client complet)
// ────────────────────────────────────────────────

export default PublicForm;
