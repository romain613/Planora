import React, { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { displayPhone } from "../../shared/utils/phone";

const PublicPage = ({ companySlug, pageSlug }) => {
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leadForm, setLeadForm] = useState({ name:"", email:"", phone:"", message:"" });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    api(`/api/pages/public/${companySlug}/${pageSlug}`).then(d => {
      if (d?.id) setPageData(d);
      else setError("Page introuvable");
      setLoading(false);
    }).catch(() => { setError("Erreur de chargement"); setLoading(false); });
  }, [companySlug, pageSlug]);

  // SEO meta tags
  useEffect(() => {
    if (!pageData?.seo) return;
    document.title = pageData.seo.title || pageData.name || 'Calendar360';
    const setMeta = (attr, name, content) => {
      if (!content) return;
      let tag = document.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, name); document.head.appendChild(tag); }
      tag.setAttribute('content', content);
    };
    setMeta('name','description', pageData.seo.description);
    setMeta('name','keywords', pageData.seo.keywords);
    setMeta('property','og:title', pageData.seo.title);
    setMeta('property','og:description', pageData.seo.description);
    return () => { document.title = 'Calendar360'; };
  }, [pageData]);

  const submitLead = async () => {
    if (!leadForm.name && !leadForm.email) return;
    setLeadSubmitting(true);
    const r = await api(`/api/pages/${pageData.id}/lead`, { method:"POST", body: leadForm });
    setLeadSubmitting(false);
    if (r?.ok) setLeadDone(true);
  };

  if (loading) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Onest',system-ui,sans-serif", background:"#FAFBFC" }}><div style={{ fontSize:15, color:"#888" }}>Chargement...</div></div>;
  if (error || !pageData) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Onest',system-ui,sans-serif", background:"#FAFBFC" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:48, marginBottom:16 }}>🔗</div><div style={{ fontSize:18, fontWeight:600, color:"#333" }}>{error || "Page introuvable"}</div></div></div>;

  const color = pageData.settings?.colorPrimary || pageData.color || "#2563EB";
  const bgColor = pageData.settings?.colorBg || "#FFFFFF";
  const textColor = pageData.settings?.colorText || "#1A1917";
  const bookingUrl = pageData.calendarSlug ? `/book/${companySlug}/${pageData.calendarSlug}` : null;

  const resolveCta = (link) => {
    if (link === "calendar" && bookingUrl) return bookingUrl;
    if (link === "form") return "#contact";
    if (link && link.startsWith("http")) return link;
    return "#contact";
  };

  const renderSection = (section) => {
    const c = section.content || {};
    const svcSvgs = [
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={c}/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="2"/><path d="M8 12L11 15L16 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill={c} opacity="0.15"/><path d="M12 6V12L16 14" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill={c}/><rect x="14" y="3" width="7" height="7" rx="1.5" fill={c} opacity="0.6"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill={c} opacity="0.6"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill={c} opacity="0.3"/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" fill={c} opacity="0.8"/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill={c}/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill={c} opacity="0.15" stroke={c} strokeWidth="1.5"/></svg>,
      (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill={c}/><path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
    ];
    const tColors = ["#2563EB","#059669","#D97706","#7C3AED","#EC4899","#0891B2"];
    switch (section.type) {

      case "hero": {
        const hasHeroMedia = c.videoUrl || c.imageUrl;
        const testimonialSection = visibleSections.find(s => s.type === "testimonials");
        const tCount = (testimonialSection?.content?.items || []).length;
        const avgRating = tCount ? ((testimonialSection.content.items.reduce((a,t) => a + (t.rating||5), 0) / tCount).toFixed(1)) : null;
        return (
          <div key={section.id} style={{ background:`linear-gradient(160deg, ${color} 0%, ${color}E6 50%, ${color}CC 100%)`, color:"#fff", position:"relative", overflow:"hidden" }}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",background:"radial-gradient(ellipse at 70% 20%, rgba(255,255,255,0.07) 0%, transparent 60%)"}}/>
            <div className="pp-hero-grid" style={{position:"relative",maxWidth:1140,margin:"0 auto",display:"grid",gridTemplateColumns: hasHeroMedia ? "1fr 1fr" : "1fr",gap:48,alignItems:"center",textAlign:c.titleAlign||"left",padding: hasHeroMedia ? "80px 24px 60px" : "100px 24px 80px"}}>
              <div style={{maxWidth: hasHeroMedia ? "100%" : 700, margin: hasHeroMedia ? 0 : "0 auto"}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 16px",borderRadius:24,background:"rgba(255,255,255,0.12)",marginBottom:24,fontSize:13,fontWeight:600}}>
                  <span style={{width:8,height:8,borderRadius:4,background:"#4ADE80",flexShrink:0}}/>
                  Disponible maintenant
                </div>
                <h1 style={{ fontSize:"clamp(32px, 5vw, 52px)", fontWeight:800, marginBottom:18, lineHeight:1.08, letterSpacing:"-0.02em" }}>{c.title || pageData.name}</h1>
                <p style={{ fontSize:"clamp(15px, 2vw, 19px)", opacity:.85, marginBottom:36, lineHeight:1.7, fontWeight:400, maxWidth:540 }}>{c.subtitle || ""}</p>
                {c.cta && (
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <a href={resolveCta(c.ctaLink)} target={bookingUrl && c.ctaLink === "calendar" ? "_blank" : undefined} rel="noreferrer" className="pp-btn" style={{ display:"inline-block", padding:"16px 40px", background:"#fff", color:color, borderRadius:14, fontSize:16, fontWeight:700, textDecoration:"none", boxShadow:"0 8px 30px rgba(0,0,0,.18)", transition:"all .25s" }}>{c.cta}</a>
                    {hasContact && <a href="#contact" style={{fontSize:14,color:"#fff",opacity:.8,textDecoration:"none",fontWeight:500}}>✉️ Nous contacter</a>}
                  </div>
                )}
                {avgRating && <div style={{display:"flex",alignItems:"center",gap:16,marginTop:32,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{color:"#FBBF24",fontSize:14}}>{"★".repeat(Math.round(avgRating))}</span>
                    <span style={{fontSize:12,opacity:.7}}>{avgRating}/5</span>
                  </div>
                  <span style={{width:1,height:16,background:"rgba(255,255,255,.2)"}}/>
                  <span style={{fontSize:12,opacity:.7}}>{tCount} avis client{tCount>1?"s":""}</span>
                </div>}
              </div>
              {hasHeroMedia && (
                <div className="pp-hero-visual" style={{position:"relative"}}>
                  <div style={{width:"100%",aspectRatio:"4/3",borderRadius:20,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
                    {c.videoUrl ? (() => {
                      const ytMatch = (c.videoUrl||"").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
                      return ytMatch ? <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`} style={{width:"100%",height:"100%",border:"none"}} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowFullScreen title="Vidéo"/> : <video src={c.videoUrl} autoPlay muted loop playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>;
                    })() : <img src={c.imageUrl} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                  </div>
                  {bookingUrl && <div className="pp-hero-float" style={{position:"absolute",bottom:-16,left:-16,background:"#fff",borderRadius:14,padding:"14px 20px",boxShadow:"0 8px 30px rgba(0,0,0,.12)",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${color},${color}BB)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16}}>📅</div>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#111"}}>Réservation en ligne</div>
                      <div style={{fontSize:11,color:"#888"}}>24h/24 · 7j/7</div>
                    </div>
                  </div>}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "_reassurance":
        return (
          <div key="reassurance" style={{ display:"flex", justifyContent:"center", gap:"clamp(20px,4vw,56px)", padding:"18px 24px", background:bgColor, borderBottom:"1px solid rgba(0,0,0,.05)", flexWrap:"wrap" }}>
            {[{icon:"⚡",text:"Réponse rapide"},{icon:"🛡️",text:"Données sécurisées"},{icon:"📅",text:"RDV en ligne 24h/24"},{icon:"✨",text:"Service professionnel"}].map((r,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:textColor,opacity:.5}}>
                <span style={{fontSize:14}}>{r.icon}</span>{r.text}
              </div>
            ))}
          </div>
        );

      case "about": {
        const hasAboutImg = !!c.imageUrl;
        return (
          <div key={section.id} id="about" className="pp-fade" style={{ padding:"80px 24px", background:bgColor }}>
            <div className="pp-about-grid" style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns: hasAboutImg ? "1fr 1fr" : "1fr",gap:48,alignItems:"center"}}>
              {hasAboutImg && (
                <div style={{position:"relative"}}>
                  <div style={{width:"100%",aspectRatio:"4/3",borderRadius:20,overflow:"hidden",boxShadow:"0 12px 40px rgba(0,0,0,.1)"}}>
                    <img src={c.imageUrl} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                </div>
              )}
              <div style={{textAlign:c.titleAlign||"left",maxWidth: hasAboutImg ? "100%" : 700, margin: hasAboutImg ? 0 : "0 auto"}}>
                <div style={{display:"inline-block",padding:"6px 16px",borderRadius:20,background:`${color}12`,color:color,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:16}}>À propos</div>
                <h2 style={{ fontSize:"clamp(24px,4vw,36px)", fontWeight:800, color:textColor, marginBottom:20, lineHeight:1.15 }}>{c.title || "À propos"}</h2>
                <p style={{ fontSize:16, lineHeight:1.85, color:textColor, opacity:.72 }}>{c.text || ""}</p>
              </div>
            </div>
          </div>
        );
      }

      case "services":
        return (
          <div key={section.id} id="services" className="pp-fade" style={{ padding:"80px 24px", background:bgColor === "#FFFFFF" ? "#FAFBFC" : bgColor }}>
            <div style={{ maxWidth:1140, margin:"0 auto" }}>
              <div style={{textAlign:c.titleAlign||"center",marginBottom:48}}>
                <div style={{display:"inline-block",padding:"6px 16px",borderRadius:20,background:`${color}12`,color:color,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Nos services</div>
                <h2 style={{ fontSize:"clamp(24px,4vw,36px)", fontWeight:800, color:textColor, lineHeight:1.15 }}>{c.title || "Nos services"}</h2>
              </div>
              <div className="pp-svc-grid" style={{ display:"grid", gridTemplateColumns:`repeat(auto-fill, minmax(${(c.items||[]).length<=3?"320":"270"}px, 1fr))`, gap:24 }}>
                {(c.items || []).map((item, i) => (
                  <div key={i} className="pp-svc-card" style={{ background:bgColor === "#FFFFFF" ? "#fff" : bgColor, borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.04), 0 4px 20px rgba(0,0,0,.06)", border:"1px solid rgba(0,0,0,.06)", transition:"transform .3s, box-shadow .3s", cursor:"default" }}>
                    {item.imageUrl ? (
                      <div style={{height:180,overflow:"hidden"}}>
                        <img src={item.imageUrl} alt={item.name} loading="lazy" className="pp-svc-img" style={{width:"100%",height:"100%",objectFit:"cover",transition:"transform .4s"}}/>
                      </div>
                    ) : (
                      <div style={{height:10,background:`linear-gradient(90deg,${color},${color}88)`}}/>
                    )}
                    <div style={{padding:"24px 24px 28px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                        <div style={{width:36,height:36,borderRadius:10,background:`${color}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{svcSvgs[i % svcSvgs.length](color)}</div>
                        <h3 style={{ fontSize:17, fontWeight:700, color:textColor, lineHeight:1.3 }}>{item.name}</h3>
                      </div>
                      <p style={{ fontSize:14, lineHeight:1.7, color:textColor, opacity:.6 }}>{item.description}</p>
                      {item.price && <div style={{ marginTop:14, fontSize:18, fontWeight:800, color:color }}>{item.price}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "testimonials":
        return (
          <div key={section.id} id="testimonials" className="pp-fade" style={{ padding:"80px 24px", background:bgColor }}>
            <div style={{ maxWidth:1100, margin:"0 auto" }}>
              <div style={{textAlign:"center",marginBottom:48}}>
                <div style={{display:"inline-block",padding:"6px 16px",borderRadius:20,background:`${color}12`,color:color,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Ils nous font confiance</div>
                <h2 style={{ fontSize:"clamp(24px,4vw,36px)", fontWeight:800, color:textColor }}>{c.title || "Témoignages"}</h2>
              </div>
              <div className="pp-testi-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:24 }}>
                {(c.items || []).map((t, i) => {
                  const ac = tColors[i % tColors.length];
                  return (
                    <div key={i} className="pp-testi-card" style={{ background:bgColor === "#FFFFFF" ? "#fff" : bgColor, borderRadius:16, padding:"28px 24px", border:"1px solid rgba(0,0,0,.06)", boxShadow:"0 2px 12px rgba(0,0,0,.04)", position:"relative", transition:"transform .3s, box-shadow .3s" }}>
                      <div style={{position:"absolute",top:20,right:24,fontSize:32,opacity:.06,fontWeight:800,lineHeight:1}}>"</div>
                      {t.rating && <div style={{ fontSize:13, color:"#F59E0B", marginBottom:14, letterSpacing:1 }}>{"★".repeat(Math.min(t.rating,5))}{"☆".repeat(Math.max(0,5-t.rating))}</div>}
                      <p style={{ fontSize:15, lineHeight:1.75, color:textColor, opacity:.8, marginBottom:20, fontStyle:"italic" }}>"{t.text}"</p>
                      <div style={{ display:"flex", alignItems:"center", gap:12, borderTop:"1px solid rgba(0,0,0,.05)", paddingTop:16 }}>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${ac},${ac}BB)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0 }}>{(t.name || "?")[0].toUpperCase()}</div>
                        <div style={{ fontSize:14, fontWeight:600, color:textColor }}>{t.name}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case "faq":
        return (
          <div key={section.id} id="faq" className="pp-fade" style={{ padding:"80px 24px", background:bgColor === "#FFFFFF" ? "#FAFBFC" : bgColor }}>
            <div style={{ maxWidth:720, margin:"0 auto" }}>
              <div style={{textAlign:"center",marginBottom:48}}>
                <h2 style={{ fontSize:"clamp(24px,4vw,36px)", fontWeight:800, color:textColor }}>{c.title || "Questions fréquentes"}</h2>
              </div>
              {(c.items || []).map((faq, i) => {
                const isOpen = openFaq === `${section.id}_${i}`;
                return (
                  <div key={i} style={{ marginBottom:8, background:bgColor, borderRadius:14, border:`1px solid ${isOpen ? color+"30" : "#E8E8E8"}`, overflow:"hidden", cursor:"pointer", transition:"border-color .2s" }} onClick={() => setOpenFaq(isOpen ? null : `${section.id}_${i}`)}>
                    <div style={{ padding:"18px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:15, fontWeight:600, color:textColor, flex:1, paddingRight:16 }}>{faq.q}</span>
                      <div style={{ width:28, height:28, borderRadius:14, background:isOpen ? color : `${color}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .2s" }}>
                        <span style={{ fontSize:14, fontWeight:700, color:isOpen ? "#fff" : color, transform:isOpen?"rotate(45deg)":"", transition:"transform .2s", lineHeight:1 }}>+</span>
                      </div>
                    </div>
                    {isOpen && <div style={{ padding:"0 24px 20px", fontSize:15, lineHeight:1.75, color:textColor, opacity:.72 }}>{faq.a}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "cta":
        return (
          <div key={section.id} id="booking" className="pp-fade" style={{ padding:"80px 24px", position:"relative", overflow:"hidden" }}>
            <div style={{position:"absolute",inset:0,background:`linear-gradient(135deg, ${color} 0%, ${color}DD 100%)`}}/>
            <div style={{position:"relative",maxWidth:700,margin:"0 auto",textAlign:c.titleAlign||"center",color:"#fff"}}>
              <h2 style={{ fontSize:"clamp(28px,5vw,42px)", fontWeight:800, marginBottom:16, lineHeight:1.1 }}>{c.title || "Prêt à commencer ?"}</h2>
              <p style={{ fontSize:18, opacity:.85, marginBottom:40, lineHeight:1.7 }}>{c.subtitle || "N'attendez plus, prenez rendez-vous dès maintenant."}</p>
              <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
                <a href={resolveCta(c.buttonLink)} target={bookingUrl && c.buttonLink === "calendar" ? "_blank" : undefined} rel="noreferrer" className="pp-btn" style={{ display:"inline-block", padding:"16px 48px", background:"#fff", color:color, borderRadius:14, fontSize:17, fontWeight:700, textDecoration:"none", boxShadow:"0 8px 30px rgba(0,0,0,.18)", transition:"all .25s" }}>{c.buttonText || "Réserver"}</a>
                {hasContact && <a href="#contact" style={{display:"inline-flex",alignItems:"center",gap:8,padding:"16px 32px",borderRadius:14,border:"2px solid rgba(255,255,255,.25)",color:"#fff",fontSize:15,fontWeight:600,textDecoration:"none"}}>✉️ Nous contacter</a>}
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:28,marginTop:32,flexWrap:"wrap"}}>
                {["✓ Gratuit et sans engagement","✓ Réponse rapide","✓ RDV en ligne 24h/24"].map((t,i) => (
                  <span key={i} style={{fontSize:13,opacity:.65,fontWeight:500}}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        );

      case "contact":
        return (
          <div key={section.id} id="contact" className="pp-fade" style={{ padding:"80px 24px", background:bgColor }}>
            <div style={{ maxWidth:960, margin:"0 auto" }}>
              <div style={{textAlign:"center",marginBottom:48}}>
                <h2 style={{ fontSize:"clamp(24px,4vw,36px)", fontWeight:800, color:textColor }}>{c.title || "Contactez-nous"}</h2>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:c.showForm ? "1fr 1fr" : "1fr", gap:48 }}>
                <div>
                  {c.address && <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:24 }}>
                    <div style={{width:40,height:40,borderRadius:12,background:`${color}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>📍</div>
                    <div><div style={{ fontSize:11, fontWeight:700, color:textColor, opacity:.4, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Adresse</div><div style={{ fontSize:15, color:textColor, lineHeight:1.5 }}>{c.address}</div></div>
                  </div>}
                  {c.phone && <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:24 }}>
                    <div style={{width:40,height:40,borderRadius:12,background:`${color}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>📞</div>
                    <div><div style={{ fontSize:11, fontWeight:700, color:textColor, opacity:.4, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Téléphone</div><a href={`tel:${displayPhone(c.phone)}`} style={{ fontSize:15, color:color, textDecoration:"none", fontWeight:600 }}>{displayPhone(c.phone)}</a></div>
                  </div>}
                  {c.email && <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:24 }}>
                    <div style={{width:40,height:40,borderRadius:12,background:`${color}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>✉️</div>
                    <div><div style={{ fontSize:11, fontWeight:700, color:textColor, opacity:.4, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Email</div><a href={`mailto:${c.email}`} style={{ fontSize:15, color:color, textDecoration:"none", fontWeight:600 }}>{c.email}</a></div>
                  </div>}
                  {c.hours && <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:24 }}>
                    <div style={{width:40,height:40,borderRadius:12,background:`${color}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>🕐</div>
                    <div><div style={{ fontSize:11, fontWeight:700, color:textColor, opacity:.4, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Horaires</div><div style={{ fontSize:15, color:textColor, lineHeight:1.5 }}>{c.hours}</div></div>
                  </div>}
                </div>
                {c.showForm && (
                  <div style={{ background:bgColor === "#FFFFFF" ? "#F8FAFC" : bgColor, borderRadius:18, padding:32, border:"1px solid #E8E8E8", boxShadow:"0 2px 16px rgba(0,0,0,.04)" }}>
                    {leadDone ? (
                      <div style={{ textAlign:"center", padding:"40px 0" }}>
                        <div style={{ width:56,height:56,borderRadius:28,background:"#ECFDF5",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28 }}>✅</div>
                        <div style={{ fontSize:18, fontWeight:700, color:textColor }}>Message envoyé !</div>
                        <div style={{ fontSize:14, color:textColor, opacity:.6, marginTop:8 }}>Nous vous répondrons dans les plus brefs délais.</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:16, fontWeight:700, color:textColor, marginBottom:20 }}>Envoyez-nous un message</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                          <div>
                            <label style={{fontSize:11,fontWeight:600,color:textColor,opacity:.5,display:"block",marginBottom:4}}>Nom</label>
                            <input placeholder="Votre nom" value={leadForm.name} onChange={e => setLeadForm(p=>({...p, name:e.target.value}))} style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #E2E8F0", fontSize:14, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box", transition:"border-color .2s" }} onFocus={e=>e.target.style.borderColor=color} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
                          </div>
                          <div>
                            <label style={{fontSize:11,fontWeight:600,color:textColor,opacity:.5,display:"block",marginBottom:4}}>Email</label>
                            <input placeholder="votre@email.com" type="email" value={leadForm.email} onChange={e => setLeadForm(p=>({...p, email:e.target.value}))} style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #E2E8F0", fontSize:14, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box", transition:"border-color .2s" }} onFocus={e=>e.target.style.borderColor=color} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
                          </div>
                        </div>
                        <div style={{marginBottom:12}}>
                          <label style={{fontSize:11,fontWeight:600,color:textColor,opacity:.5,display:"block",marginBottom:4}}>Téléphone</label>
                          <input placeholder="+33 6 12 34 56 78" value={leadForm.phone} onChange={e => setLeadForm(p=>({...p, phone:e.target.value}))} style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #E2E8F0", fontSize:14, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box", transition:"border-color .2s" }} onFocus={e=>e.target.style.borderColor=color} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
                        </div>
                        <div style={{marginBottom:16}}>
                          <label style={{fontSize:11,fontWeight:600,color:textColor,opacity:.5,display:"block",marginBottom:4}}>Message</label>
                          <textarea placeholder="Comment pouvons-nous vous aider ?" value={leadForm.message} onChange={e => setLeadForm(p=>({...p, message:e.target.value}))} rows={4} style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #E2E8F0", fontSize:14, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical", transition:"border-color .2s" }} onFocus={e=>e.target.style.borderColor=color} onBlur={e=>e.target.style.borderColor="#E2E8F0"}/>
                        </div>
                        <button onClick={submitLead} disabled={leadSubmitting || (!leadForm.name && !leadForm.email)} style={{ width:"100%", padding:"14px", background:color, color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:700, cursor:leadSubmitting?"wait":"pointer", opacity:leadSubmitting?.7:1, fontFamily:"inherit", boxShadow:`0 4px 16px ${color}30`, transition:"transform .2s" }} onMouseEnter={e=>e.target.style.transform="translateY(-1px)"} onMouseLeave={e=>e.target.style.transform=""}>{leadSubmitting ? "Envoi en cours..." : "Envoyer le message"}</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const visibleSections = (pageData.sections || []).filter(s => s.visible !== false).sort((a,b) => (a.order||0) - (b.order||0));
  const sectionsWithReassurance = [];
  for (const s of visibleSections) {
    sectionsWithReassurance.push(s);
    if (s.type === "hero") sectionsWithReassurance.push({ id:"_reassurance", type:"_reassurance", content:{}, order:-1 });
  }

  const hasServices = visibleSections.some(s => s.type === "services");
  const hasAbout = visibleSections.some(s => s.type === "about");
  const hasTestimonials = visibleSections.some(s => s.type === "testimonials");
  const hasFaq = visibleSections.some(s => s.type === "faq");
  const hasContact = visibleSections.some(s => s.type === "contact");
  const companyName = pageData.companyName || pageData.name || "Mon entreprise";

  return (
    <div style={{ minHeight:"100vh", background:bgColor, color:textColor, fontFamily:"'Onest','Outfit',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;}a{color:inherit;}html{scroll-behavior:smooth;}img{max-width:100%;}
.pp-nav{position:sticky;top:0;z-index:100;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transition:box-shadow .3s;}
.pp-svc-card:hover{transform:translateY(-6px)!important;box-shadow:0 20px 40px rgba(0,0,0,.1)!important;}
.pp-svc-card:hover .pp-svc-img{transform:scale(1.05);}
.pp-testi-card:hover{transform:translateY(-4px)!important;box-shadow:0 12px 30px rgba(0,0,0,.08)!important;}
.pp-btn:hover{transform:translateY(-2px)!important;box-shadow:0 12px 40px rgba(0,0,0,.22)!important;}
.pp-fade{opacity:0;transform:translateY(24px);animation:ppFadeIn .6s ease-out forwards;}
@keyframes ppFadeIn{to{opacity:1;transform:translateY(0);}}
.pp-fade:nth-child(2){animation-delay:.1s;}.pp-fade:nth-child(3){animation-delay:.15s;}.pp-fade:nth-child(4){animation-delay:.2s;}.pp-fade:nth-child(5){animation-delay:.25s;}.pp-fade:nth-child(6){animation-delay:.3s;}
@media(max-width:768px){.pp-hero-grid{grid-template-columns:1fr!important;text-align:center!important;gap:32px!important;}.pp-hero-visual{order:-1!important;}.pp-hero-float{display:none!important;}.pp-about-grid{grid-template-columns:1fr!important;}.pp-svc-grid{grid-template-columns:1fr!important;}.pp-testi-grid{grid-template-columns:1fr!important;}.pp-contact-grid{grid-template-columns:1fr!important;}.pp-nav-links{display:none!important;}.pp-footer-grid{grid-template-columns:1fr!important;text-align:center!important;}}
@media(max-width:480px){.pp-hero-grid{padding:48px 16px 40px!important;}}`}</style>

      {/* ═══ STICKY NAVIGATION ═══ */}
      <nav className="pp-nav" style={{ background:`${bgColor}E6`, borderBottom:`1px solid ${color}08`, padding:"0 24px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", height:64 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${color},${color}BB)`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:16, fontWeight:800 }}>{companyName[0]}</div>
            <span style={{ fontSize:17, fontWeight:800, color:textColor, letterSpacing:"-0.02em" }}>{companyName}</span>
          </div>
          <div className="pp-nav-links" style={{ display:"flex", alignItems:"center", gap:28 }}>
            {hasAbout && <a href="#about" style={{ fontSize:14, fontWeight:500, color:textColor, opacity:.65, textDecoration:"none", transition:"opacity .2s" }} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=.65}>À propos</a>}
            {hasServices && <a href="#services" style={{ fontSize:14, fontWeight:500, color:textColor, opacity:.65, textDecoration:"none", transition:"opacity .2s" }} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=.65}>Services</a>}
            {hasTestimonials && <a href="#testimonials" style={{ fontSize:14, fontWeight:500, color:textColor, opacity:.65, textDecoration:"none", transition:"opacity .2s" }} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=.65}>Avis</a>}
            {hasFaq && <a href="#faq" style={{ fontSize:14, fontWeight:500, color:textColor, opacity:.65, textDecoration:"none", transition:"opacity .2s" }} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=.65}>FAQ</a>}
            {hasContact && <a href="#contact" style={{ fontSize:14, fontWeight:500, color:textColor, opacity:.65, textDecoration:"none", transition:"opacity .2s" }} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=.65}>Contact</a>}
            {bookingUrl && <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ padding:"8px 20px", background:color, color:"#fff", borderRadius:10, fontSize:13, fontWeight:700, textDecoration:"none", boxShadow:`0 2px 10px ${color}30`, transition:"transform .2s" }} onMouseEnter={e=>e.target.style.transform="translateY(-1px)"} onMouseLeave={e=>e.target.style.transform=""}>Prendre RDV</a>}
          </div>
        </div>
      </nav>

      {/* ═══ SECTIONS ═══ */}
      {sectionsWithReassurance.map(s => renderSection(s))}

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background:"#111118", color:"#fff", padding:"56px 24px 28px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div className="pp-footer-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:40, marginBottom:36 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${color},${color}BB)`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:16, fontWeight:800 }}>{companyName[0]}</div>
                <span style={{ fontSize:17, fontWeight:800 }}>{companyName}</span>
              </div>
              {(() => { const contactSection = visibleSections.find(s => s.type === "contact"); const cc = contactSection?.content || {};
                return (<div style={{fontSize:13,lineHeight:2,opacity:.5}}>
                  {cc.address && <div>{cc.address}</div>}
                  {cc.phone && <div>{cc.phone}</div>}
                  {cc.email && <div>{cc.email}</div>}
                  {!cc.address && !cc.phone && !cc.email && <div>Votre partenaire de confiance</div>}
                </div>);
              })()}
            </div>
            <div>
              <h4 style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:1, opacity:.35, marginBottom:14 }}>Navigation</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {hasAbout && <a href="#about" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>À propos</a>}
                {hasServices && <a href="#services" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>Services</a>}
                {hasTestimonials && <a href="#testimonials" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>Avis clients</a>}
                {hasFaq && <a href="#faq" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>FAQ</a>}
                {hasContact && <a href="#contact" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>Contact</a>}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:1, opacity:.35, marginBottom:14 }}>Accès rapide</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {bookingUrl && <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>📅 Prendre RDV</a>}
                {hasContact && <a href="#contact" style={{ fontSize:13, opacity:.6, textDecoration:"none", color:"#fff" }}>✉️ Nous contacter</a>}
              </div>
            </div>
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,.08)", paddingTop:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
            <div style={{ fontSize:11, opacity:.35 }}>© {new Date().getFullYear()} {companyName} — Tous droits réservés</div>
            <a href="https://calendar360.fr" target="_blank" rel="noreferrer" style={{ fontSize:10, opacity:.2, textDecoration:"none", color:"#fff" }}>Propulsé par Calendar360</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PUBLIC BOOKING PAGE
// ═══════════════════════════════════════════════════
// ═══ PUBLIC FORM (standalone) ═══

export default PublicPage;
