import React, { useEffect, useState } from "react";
import { T } from "../../theme";
import { _T } from "../../shared/state/tabState";
import { api } from "../../shared/services/api";
import { MONTHS_FR } from "../../shared/utils/dates";
import { Avatar, Btn, Card, I, Input, Logo } from "../../shared/ui";

const Landing = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState("login");
  const _savedEmail = (() => { try { return localStorage.getItem("calendar360-saved-email")||""; } catch { return ""; } })();
  // Security: never store passwords in localStorage — only remember email
  (() => { try { localStorage.removeItem("calendar360-creds"); } catch{} })(); // Clean up legacy
  const [email, setEmail] = useState(_savedEmail);
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!_savedEmail);
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [hoveredInteg, setHoveredInteg] = useState(null);
  const [billingAnnual, setBillingAnnual] = useState(true);
  const [hoveredPlan, setHoveredPlan] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(null);

  // Load Google Client ID and init Google Sign-In (dynamic script load)
  useEffect(() => {
    api("/api/auth/config").then(cfg => {
      if (cfg?.googleClientId) {
        setGoogleClientId(cfg.googleClientId);
        const initGSI = () => {
          if (window.google?.accounts?.id) {
            window.google.accounts.id.initialize({
              client_id: cfg.googleClientId,
              callback: handleGoogleCallback,
              auto_select: false,
            });
          } else {
            setTimeout(initGSI, 200);
          }
        };
        // Load GIS script dynamically
        if (!document.getElementById('gsi-script')) {
          const s = document.createElement('script');
          s.id = 'gsi-script';
          s.src = 'https://accounts.google.com/gsi/client';
          s.async = true;
          s.defer = true;
          s.onload = initGSI;
          document.head.appendChild(s);
        } else {
          initGSI();
        }
      }
    });
  }, []);

  const handleGoogleCallback = async (response) => {
    setAuthError(""); setAuthLoading(true);
    try {
      const res = await api("/api/auth/google", { method: "POST", body: { credential: response.credential } });
      if (res?.success) {
        const sess = { companyId: res.company?.id || null, collaboratorId: res.collaborator?.id, role: res.collaborator?.role || "admin", token: res.token };
        localStorage.setItem("calendar360-session", JSON.stringify(sess));
        onLogin(sess.companyId, false, res.collaborator);
      } else {
        setAuthError(res?.error || "Erreur Google Sign-In");
      }
    } catch (e) { setAuthError("Erreur de connexion Google"); }
    finally { setAuthLoading(false); }
  };

  const handleLogin = async () => {
    setAuthError("");
    if (authLoading) return;
    // Basic validation
    if (!email.trim()) { setAuthError("Veuillez entrer votre email"); return; }
    if (!password) { setAuthError("Veuillez entrer votre mot de passe"); return; }
    if (authMode === "register" && password.length < 6) { setAuthError("Le mot de passe doit contenir au moins 6 caractères"); return; }
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        // 1. Try regular collaborator login first (email+password)
        const res = await api("/api/auth/login", { method: "POST", body: { email: email.trim(), password } });
        // Handle pending/rejected companies
        if (res?._pending) { setAuthError('__pending__'); return; }
        if (res?._rejected) { setAuthError('__rejected__' + (res.reason ? '|' + res.reason : '')); return; }
        if (res?.success) {
          const sess = { companyId: res.company?.id || null, collaboratorId: res.collaborator?.id, role: res.collaborator?.role || "collaborator", token: res.token };
          localStorage.setItem("calendar360-session", JSON.stringify(sess));
          if (rememberMe) localStorage.setItem("calendar360-saved-email", email.trim());
          else localStorage.removeItem("calendar360-saved-email");
          onLogin(sess.companyId, false, res.collaborator); return;
        }
        // 2. Fallback: try login with code
        const res2 = await api("/api/auth/login", { method: "POST", body: { code: password } });
        if (res2?.success) {
          const sess2 = { companyId: res2.company?.id || null, collaboratorId: res2.collaborator?.id, role: res2.collaborator?.role || "collaborator", token: res2.token };
          localStorage.setItem("calendar360-session", JSON.stringify(sess2));
          if (rememberMe) localStorage.setItem("calendar360-saved-email", email.trim());
          else localStorage.removeItem("calendar360-saved-email");
          onLogin(sess2.companyId, false, res2.collaborator); return;
        }
        // 3. Fallback: try Supra Admin login (only if regular login failed)
        const supraRes = await api("/api/auth/supra-login", { method: "POST", body: { email: email.trim(), password } });
        if (supraRes?.success && supraRes?.supraAdmin) {
          localStorage.setItem("calendar360-session", JSON.stringify({ supraAdmin: true, token: supraRes.token }));
          if (rememberMe) localStorage.setItem("calendar360-saved-email", email.trim());
          else localStorage.removeItem("calendar360-saved-email");
          onLogin(null, true);
          return;
        }
        setAuthError("Email ou mot de passe incorrect");
      } else if (authMode === 'supra') {
        // Direct supra admin login
        const supraRes = await api("/api/auth/supra-login", { method: "POST", body: { email: email.trim(), password } });
        if (supraRes?.success && supraRes?.supraAdmin) {
          localStorage.setItem("calendar360-session", JSON.stringify({ supraAdmin: true, token: supraRes.token }));
          if (rememberMe) localStorage.setItem("calendar360-saved-email", email.trim());
          else localStorage.removeItem("calendar360-saved-email");
          onLogin(null, true);
          return;
        }
        setAuthError("Identifiants Supra Admin invalides");
      } else {
        // Registration
        if (!companyName.trim()) { setAuthError("Le nom de l'entreprise est requis"); return; }
        if (!email.trim() || !password) { setAuthError("Email et mot de passe requis"); return; }
        if (password.length < 6) { setAuthError("Le mot de passe doit contenir au moins 6 caractères"); return; }
        const res = await api("/api/auth/register", { method: "POST", body: { email: email.trim(), password, companyName: companyName.trim() } });
        if (res.error) { setAuthError(res.error); return; }
        if (res.success) {
          const sess = { companyId: res.company?.id || null, collaboratorId: res.collaborator?.id, role: "admin", token: res.token };
          localStorage.setItem("calendar360-session", JSON.stringify(sess));
          if (rememberMe) localStorage.setItem("calendar360-saved-email", email.trim());
          onLogin(sess.companyId, false, res.collaborator); return;
        }
        setAuthError("Erreur lors de l'inscription");
      }
    } catch (e) { setAuthError("Erreur de connexion au serveur"); }
    finally { setAuthLoading(false); }
  };

  // Mini calendar preview data
  const now = new Date();
  const mMonth = now.getMonth();
  const mYear = now.getFullYear();
  const mFirstDay = (new Date(mYear, mMonth, 1).getDay() + 6) % 7;
  const mDaysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
  const mDays = [];
  for (let i = 0; i < mFirstDay; i++) mDays.push(null);
  for (let d = 1; d <= mDaysInMonth; d++) mDays.push(d);
  const mToday = now.getDate();

  const previewBookings = [
    { time: "09:00", name: "Paul L.", color: "#2563EB", cal: "Consultation" },
    { time: "10:30", name: "Claire R.", color: "#059669", cal: "Équipe" },
    { time: "14:00", name: "Hugo P.", color: "#D97706", cal: "Rapide" },
    { time: "15:30", name: "Léa D.", color: "#7C3AED", cal: "Atelier" },
  ];

  // Real SVG logos for integrations
  const IntegLogo = ({ id, s = 24 }) => {
    const logos = {
      gcal: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#4285F4" strokeWidth="1.5"/><rect x="3" y="3" width="18" height="6" rx="2" fill="#4285F4"/><text x="12" y="16.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#4285F4">31</text><circle cx="8" cy="6" r="1" fill="#fff"/><circle cx="16" cy="6" r="1" fill="#fff"/></svg>,
      gmeet: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="2" y="5" width="13" height="14" rx="2" fill="#00897B"/><polygon points="15,8 22,4 22,20 15,16" fill="#00897B" opacity="0.7"/><rect x="5" y="9" width="3" height="2" rx="0.5" fill="#fff"/><rect x="9" y="9" width="3" height="2" rx="0.5" fill="#fff"/><rect x="5" y="12" width="3" height="2" rx="0.5" fill="#fff"/></svg>,
      outlook: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="1" y="4" width="14" height="16" rx="2" fill="#0078D4"/><rect x="9" y="2" width="14" height="20" rx="2" fill="#0078D4" opacity="0.6"/><ellipse cx="8" cy="12" rx="4" ry="5" fill="#0078D4" stroke="#fff" strokeWidth="1.5" opacity="0"/><text x="8" y="14.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">O</text></svg>,
      zoom: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="4" fill="#2D8CFF"/><rect x="5" y="8" width="9" height="7" rx="1.5" fill="#fff"/><polygon points="15,9.5 20,7 20,16 15,13.5" fill="#fff"/></svg>,
      slack: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="9" y="2" width="3" height="8" rx="1.5" fill="#E01E5A"/><rect x="2" y="7" width="8" height="3" rx="1.5" fill="#E01E5A"/><rect x="12" y="14" width="3" height="8" rx="1.5" fill="#2EB67D"/><rect x="14" y="14" width="8" height="3" rx="1.5" fill="#2EB67D"/><rect x="2" y="12" width="3" height="8" rx="1.5" fill="#36C5F0"/><rect x="2" y="14" width="8" height="3" rx="1.5" fill="#36C5F0"/><rect x="19" y="2" width="3" height="8" rx="1.5" fill="#ECB22E"/><rect x="14" y="7" width="8" height="3" rx="1.5" fill="#ECB22E"/></svg>,
      teams: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="2" y="4" width="16" height="16" rx="2" fill="#6264A7"/><circle cx="19" cy="7" r="3" fill="#6264A7" opacity="0.7"/><text x="10" y="14.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">T</text></svg>,
      zapier: <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF4A00"/><path d="M12 5v14M5 12h14M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
      stripe: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3" fill="#635BFF"/><path d="M10.5 10c0-1.5 2.5-1.8 4-0.8l0.8-2.2c-1.5-0.8-5.5-1-5.5 2.5 0 3.5 5 2.5 5 4.5 0 1.8-3 2-4.8 0.5l-0.8 2.2c1.8 1.2 6.3 1.2 6.3-2.2 0-3.5-5-2.8-5-4.5z" fill="#fff"/></svg>,
      paypal: <svg width={s} height={s} viewBox="0 0 24 24"><path d="M7 21l1.5-9h5c3 0 5-2 5.5-4.5S18 3 15 3H8L4 21h3z" fill="#003087"/><path d="M9 18l1-6h4c2.5 0 4-1.5 4.3-3.5S17.5 5 15 5H10L7.5 18H9z" fill="#0070E0"/></svg>,
      salesforce: <svg width={s} height={s} viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="10" ry="8" fill="#00A1E0"/><circle cx="7" cy="9" r="4" fill="#00A1E0"/><circle cx="17" cy="9" r="4" fill="#00A1E0"/><circle cx="12" cy="7" r="3.5" fill="#00A1E0"/><text x="12" y="15.5" textAnchor="middle" fontSize="5" fontWeight="800" fill="#fff">cloud</text></svg>,
      hubspot: <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="10" r="3" fill="none" stroke="#FF7A59" strokeWidth="2"/><circle cx="12" cy="10" r="1" fill="#FF7A59"/><line x1="12" y1="13" x2="12" y2="18" stroke="#FF7A59" strokeWidth="2"/><circle cx="18" cy="7" r="2" fill="#FF7A59"/><circle cx="6" cy="7" r="2" fill="#FF7A59"/><circle cx="18" cy="15" r="2" fill="#FF7A59"/><line x1="14.5" y1="8.5" x2="16.5" y2="7.5" stroke="#FF7A59" strokeWidth="1.5"/><line x1="9.5" y1="8.5" x2="7.5" y2="7.5" stroke="#FF7A59" strokeWidth="1.5"/><line x1="14" y1="12" x2="16.5" y2="14" stroke="#FF7A59" strokeWidth="1.5"/></svg>,
      gmail: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" fill="#fff" stroke="#D5D5D5" strokeWidth="0.5"/><path d="M2 6l10 7 10-7" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/><rect x="2" y="4" width="4" height="16" fill="#4285F4" rx="0"/><rect x="18" y="4" width="4" height="16" fill="#4285F4" rx="0"/><path d="M2 4l10 8 10-8" fill="none" stroke="#EA4335" strokeWidth="0" /><polygon points="2,4 12,12 2,20" fill="#34A853" opacity="0.9"/><polygon points="22,4 12,12 22,20" fill="#FBBC05" opacity="0.9"/><path d="M2 6l10 7 10-7" fill="none" stroke="#EA4335" strokeWidth="1.8"/></svg>,
      notion: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="#fff" stroke="#000" strokeWidth="1.5"/><path d="M8 6h8M8 9.5h8M8 13h5" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/><rect x="15" y="15" width="3" height="3" rx="0.5" fill="#000"/></svg>,
      webhooks: <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="6" r="3" fill="none" stroke="#6366F1" strokeWidth="2"/><circle cx="6" cy="18" r="3" fill="none" stroke="#6366F1" strokeWidth="2"/><circle cx="18" cy="18" r="3" fill="none" stroke="#6366F1" strokeWidth="2"/><line x1="12" y1="9" x2="7" y2="16" stroke="#6366F1" strokeWidth="2"/><line x1="12" y1="9" x2="17" y2="16" stroke="#6366F1" strokeWidth="2"/><line x1="8.5" y1="18" x2="15.5" y2="18" stroke="#6366F1" strokeWidth="2"/></svg>,
      drive: <svg width={s} height={s} viewBox="0 0 24 24"><polygon points="12,3 2,19 7,19 12,10" fill="#0066DA"/><polygon points="12,3 22,19 17,19 12,10" fill="#00AC47"/><polygon points="2,19 7,19 12,10 7,10" fill="#0066DA" opacity="0.7"/><rect x="5" y="16" width="14" height="4" rx="0.5" fill="#FFBA00"/><polygon points="7,19 12,10 17,19" fill="#00AC47" opacity="0.6"/></svg>,
      ical: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#FF3B30"/><rect x="3" y="3" width="18" height="6" fill="#FF3B30" rx="3"/><rect x="4" y="8" width="16" height="12" fill="#fff" rx="1"/><text x="12" y="17.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#FF3B30">CAL</text><circle cx="8" cy="5.5" r="1" fill="#fff"/><circle cx="16" cy="5.5" r="1" fill="#fff"/></svg>,
      google: <svg width={s} height={s} viewBox="0 0 24 24"><path d="M21.35 11.1h-9.18v2.84h5.28c-.23 1.21-.93 2.24-1.98 2.93l3.02 2.35c1.76-1.63 2.78-4.02 2.78-6.87 0-.57-.05-1.12-.14-1.64z" fill="#4285F4"/><path d="M12.17 21.5c2.57 0 4.72-.85 6.3-2.3l-3.03-2.35c-.84.56-1.92.9-3.27.9-2.52 0-4.65-1.7-5.42-3.99l-3.13 2.42c1.6 3.18 4.88 5.32 8.55 5.32z" fill="#34A853"/><path d="M6.75 13.76a5.6 5.6 0 010-3.52L3.62 7.82a9.5 9.5 0 000 8.36l3.13-2.42z" fill="#FBBC05"/><path d="M12.17 6.25c1.42 0 2.7.49 3.7 1.45l2.78-2.78C16.88 3.27 14.74 2.5 12.17 2.5c-3.67 0-6.95 2.14-8.55 5.32l3.13 2.42c.77-2.3 2.9-3.99 5.42-3.99z" fill="#EA4335"/></svg>,
      microsoft: <svg width={s} height={s} viewBox="0 0 24 24"><rect x="3" y="3" width="8.5" height="8.5" fill="#F25022"/><rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00"/><rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900"/></svg>,
    };
    return logos[id] || null;
  };

  // Integrations data
  const integrations = [
    { name:"Google Calendar", logo:"gcal", color:"#4285F4", bg:"#E8F0FE" },
    { name:"Google Meet", logo:"gmeet", color:"#00897B", bg:"#E0F2F1" },
    { name:"Outlook", logo:"outlook", color:"#0078D4", bg:"#E1F0FF" },
    { name:"Zoom", logo:"zoom", color:"#2D8CFF", bg:"#E3F2FD" },
    { name:"Slack", logo:"slack", color:"#4A154B", bg:"#F3E5F5" },
    { name:"Teams", logo:"teams", color:"#6264A7", bg:"#EDE7F6" },
    { name:"Zapier", logo:"zapier", color:"#FF4A00", bg:"#FBE9E7" },
    { name:"Stripe", logo:"stripe", color:"#635BFF", bg:"#EDE7F6" },
    { name:"PayPal", logo:"paypal", color:"#003087", bg:"#E3F2FD" },
    { name:"Salesforce", logo:"salesforce", color:"#00A1E0", bg:"#E0F7FA" },
    { name:"HubSpot", logo:"hubspot", color:"#FF7A59", bg:"#FBE9E7" },
    { name:"Gmail", logo:"gmail", color:"#EA4335", bg:"#FFEBEE" },
    { name:"Notion", logo:"notion", color:"#000000", bg:"#F5F5F5" },
    { name:"Webhooks", logo:"webhooks", color:"#6366F1", bg:"#EDE7F6" },
    { name:"Drive", logo:"drive", color:"#FBBC04", bg:"#FFF8E1" },
    { name:"iCalendar", logo:"ical", color:"#FF3B30", bg:"#FFEBEE" },
  ];

  // Testimonials
  const testimonials = [
    { name:"Marie L.", role:"Avocate associée", text:"Calendar360 a transformé la gestion de notre cabinet. Les clients prennent RDV en autonomie et l'équipe gagne 2h par jour.", stars:5, avatar:"#2563EB" },
    { name:"Thomas B.", role:"Directeur commercial", text:"L'intégration Google Calendar + Slack est un game changer. On ne rate plus aucun RDV.", stars:5, avatar:"#059669" },
    { name:"Sophie R.", role:"Consultante RH", text:"Interface magnifique, les visiteurs adorent. Le taux de no-show a baissé de 40% grâce aux rappels automatiques.", stars:5, avatar:"#D97706" },
  ];

  return (
  <div style={{ minHeight:"100vh", background:"#FAFAF8", fontFamily:"'Onest',system-ui,sans-serif", color:T.text }}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap'); *{margin:0;padding:0;box-sizing:border-box;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}
    @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.6;}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-20px);}to{opacity:1;transform:translateY(0);}}
    @keyframes slideIn{from{opacity:0;transform:translateX(-20px);}to{opacity:1;transform:translateX(0);}}
    @keyframes marquee{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}
    @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(37,99,235,0.15);}50%{box-shadow:0 0 40px rgba(37,99,235,0.3);}}
    @keyframes scaleIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}
    .fu{animation:fadeUp .7s ease both;} .fu2{animation:fadeUp .7s ease .12s both;} .fu3{animation:fadeUp .7s ease .24s both;} .fu4{animation:fadeUp .7s ease .36s both;}
    .float{animation:float 4s ease-in-out infinite;}
    .glow-card{transition:all .3s ease;} .glow-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.08)!important;}
    .integ-icon{transition:all .25s ease;} .integ-icon:hover{transform:scale(1.12) translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.12)!important;}
    .feat-card{transition:all .3s cubic-bezier(.4,0,.2,1);} .feat-card:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(0,0,0,0.1)!important;border-color:transparent!important;}
    .nav-links{display:flex;align-items:center;gap:24px;}
    .nav-hamburger{display:none;cursor:pointer;padding:8px;}
    .mobile-menu{display:none;}
    .hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;}
    .hero-mockup{display:block;}
    .stats-row{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;}
    .feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
    .feat-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:16px;}
    .integ-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:12px;}
    .integ-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
    .steps-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;}
    .testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
    .pricing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start;}
    .pricing-badges{display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;}
    .footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;}
    .section-pad{padding:80px 40px;}
    .section-inner{max-width:1200px;margin:0 auto;}

    @media(max-width:1024px){
      .hero-grid{grid-template-columns:1fr;text-align:center;}
      .hero-mockup{display:none;}
      .feat-grid{grid-template-columns:repeat(2,1fr);}
      .integ-grid{grid-template-columns:repeat(4,1fr);}
      .integ-cards{grid-template-columns:repeat(2,1fr);}
      .steps-grid{grid-template-columns:repeat(2,1fr);}
      .pricing-grid{grid-template-columns:repeat(2,1fr);}
      .footer-grid{grid-template-columns:1fr 1fr;}
    }

    @media(max-width:768px){
      .nav-links{display:none!important;}
      .nav-hamburger{display:flex!important;}
      .mobile-menu.open{display:flex!important;flex-direction:column;position:fixed;top:70px;left:0;right:0;bottom:0;background:#FAF8F5;backdrop-filter:blur(20px);padding:24px;gap:4px;z-index:999;overflow-y:auto;}
      .mobile-menu.open a,.mobile-menu.open span,.mobile-menu.open div{display:block;padding:12px 16px;font-size:15px;border-radius:10px;}
      .mobile-menu.open div:hover{background:#EFF6FF;}
      .section-pad{padding:48px 20px!important;}
      .hero-grid{grid-template-columns:1fr;text-align:center;gap:24px;}
      .hero-mockup{display:none!important;}
      .stats-row{gap:16px;}
      .stats-row>div{min-width:70px;}
      .feat-grid{grid-template-columns:1fr!important;}
      .feat-grid-2{grid-template-columns:1fr!important;}
      .integ-grid{grid-template-columns:repeat(4,1fr)!important;gap:10px;}
      .integ-cards{grid-template-columns:1fr!important;}
      .steps-grid{grid-template-columns:1fr!important;}
      .testi-grid{grid-template-columns:1fr!important;}
      .pricing-grid{grid-template-columns:1fr!important;}
      .pricing-badges{flex-direction:column;gap:12px!important;}
      .footer-grid{grid-template-columns:1fr!important;gap:24px!important;}
      .steps-line{display:none!important;}
      h1,h2{word-break:break-word;}
    }
    `}</style>

    {/* ── NAVBAR ── */}
    <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 24px", maxWidth:1200, margin:"0 auto", position:"sticky", top:0, zIndex:100, background:"rgba(250,250,248,0.85)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(228,226,221,0.5)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <Logo s={36} rounded={10} />
        <span style={{ fontSize:20, fontWeight:800, letterSpacing:-0.5 }}>Calendar360</span>
      </div>
      <div className="nav-links">
        {[{l:"Fonctionnalités",id:"features-section"},{l:"Intégrations",id:"integrations-section"},{l:"Témoignages",id:"testimonials-section"},{l:"Tarifs",id:"pricing-section"}].map(n=>(
          <span key={n.id} onClick={() => document.getElementById(n.id)?.scrollIntoView({behavior:"smooth"})} style={{ fontSize:13, color:n.l==="Tarifs"?T.text:T.text2, cursor:"pointer", fontWeight:n.l==="Tarifs"?600:400 }}>{n.l}</span>
        ))}
        <span onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ fontSize:13, color:T.accent, fontWeight:600, cursor:"pointer" }}>Connexion</span>
        <Btn primary onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ padding:"9px 20px", fontSize:13, borderRadius:10 }}>Essai gratuit</Btn>
      </div>
      {/* Hamburger */}
      <div className="nav-hamburger" onClick={() => setMobileMenu(p=>!p)} style={{ display:"none", flexDirection:"column", gap:5, cursor:"pointer", padding:8 }}>
        <div style={{ width:22, height:2, background:T.text, borderRadius:2, transition:"all .3s", transform:mobileMenu?"rotate(45deg) translateY(7px)":"none" }}/>
        <div style={{ width:22, height:2, background:T.text, borderRadius:2, transition:"all .3s", opacity:mobileMenu?0:1 }}/>
        <div style={{ width:22, height:2, background:T.text, borderRadius:2, transition:"all .3s", transform:mobileMenu?"rotate(-45deg) translateY(-7px)":"none" }}/>
      </div>
    </nav>
    {/* Mobile menu dropdown */}
    <div className={`mobile-menu ${mobileMenu?"open":""}`}>
      {[{l:"Fonctionnalités",id:"features-section"},{l:"Intégrations",id:"integrations-section"},{l:"Témoignages",id:"testimonials-section"},{l:"Tarifs",id:"pricing-section"},{l:"Connexion",id:"auth-section"}].map(n=>(
        <div key={n.id} onClick={() => { document.getElementById(n.id)?.scrollIntoView({behavior:"smooth"}); setMobileMenu(false); }} style={{ cursor:"pointer", fontSize:14, fontWeight:n.l==="Tarifs"||n.l==="Connexion"?600:400, color:n.l==="Connexion"?T.accent:T.text }}>{n.l}</div>
      ))}
      <Btn primary onClick={() => { document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"}); setMobileMenu(false); }} style={{ padding:"12px 20px", fontSize:14, borderRadius:10, justifyContent:"center", marginTop:4 }}>Essai gratuit</Btn>
    </div>

    {/* ── HERO ── */}
    <section style={{ position:"relative", overflow:"hidden" }}>
      {/* Decorative bg elements */}
      <div style={{ position:"absolute", top:-60, right:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(37,99,235,0.04) 0%,transparent 70%)", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", bottom:-100, left:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,58,237,0.04) 0%,transparent 70%)", pointerEvents:"none" }}/>

      <div className="hero-grid section-pad" style={{ maxWidth:1200, margin:"0 auto" }}>
        {/* Left: Text */}
        <div>
          <div className="fu" style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:T.accentBg, border:`1px solid ${T.accentBorder}`, fontSize:12, fontWeight:600, color:T.accent, marginBottom:20 }}>
            <I n="zap" s={13}/> La solution de prise de RDV nouvelle génération
          </div>
          <h1 className="fu" style={{ fontSize:"clamp(32px,6vw,50px)", fontWeight:800, lineHeight:1.06, letterSpacing:-1.5, marginBottom:20 }}>
            Gérez vos rendez-vous<br/>comme un <span style={{ background:"linear-gradient(135deg,#2563EB,#7C3AED)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>pro</span>
          </h1>
          <p className="fu2" style={{ fontSize:17, color:T.text2, lineHeight:1.7, marginBottom:32, maxWidth:460 }}>
            Calendar360 centralise la gestion multi-collaborateurs, la prise de RDV visiteurs, les workflows automatisés et les analytics — dans une interface élégante.
          </p>
          <div className="fu3" style={{ display:"flex", gap:14, alignItems:"center", marginBottom:36 }}>
            <Btn primary onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ padding:"15px 30px", fontSize:15, borderRadius:12, boxShadow:"0 4px 20px rgba(37,99,235,0.3)", background:"linear-gradient(135deg,#2563EB,#3B82F6)" }}>Accéder au dashboard <I n="arrow" s={15}/></Btn>
            <span onClick={() => document.getElementById("features-section")?.scrollIntoView({behavior:"smooth"})} style={{ fontSize:14, color:T.text2, cursor:"pointer", fontWeight:500 }}>En savoir plus ↓</span>
          </div>
          {/* Stats with animated counter feel */}
          <div className="fu4 stats-row" style={{ justifyContent:"flex-start" }}>
            {[{v:"10+",l:"Calendriers",ic:"calendar"},{v:"100+",l:"Intégrations",ic:"link"},{v:"30+",l:"Fonctionnalités",ic:"zap"},{v:"99.9%",l:"Uptime",ic:"shield"}].map((s,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:T.accentBg, display:"flex", alignItems:"center", justifyContent:"center", color:T.accent }}><I n={s.ic} s={14}/></div>
                <div><div style={{fontSize:18,fontWeight:800,color:T.text, letterSpacing:-0.5}}>{s.v}</div><div style={{fontSize:10,color:T.text3,fontWeight:500}}>{s.l}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Calendar Visual Mockup */}
        <div className="fu2 float hero-mockup" style={{ perspective:1000 }}>
          <div style={{ background:T.surface, borderRadius:20, border:`1px solid ${T.border}`, boxShadow:"0 20px 60px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden", transform:"rotateY(-2deg) rotateX(1deg)", animation:"glow 4s ease-in-out infinite" }}>
            {/* Browser bar */}
            <div style={{ padding:"10px 16px", background:T.bg, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:5, background:"#EF4444" }}/>
              <div style={{ width:10, height:10, borderRadius:5, background:"#F59E0B" }}/>
              <div style={{ width:10, height:10, borderRadius:5, background:"#22C55E" }}/>
              <div style={{ flex:1, marginLeft:12, padding:"4px 12px", borderRadius:6, background:T.surface, border:`1px solid ${T.border}`, fontSize:10, color:T.text3 }}>dupont-associes.calendar360.fr</div>
            </div>
            <div style={{ display:"flex" }}>
              <div style={{ width:160, padding:14, borderRight:`1px solid ${T.border}`, background:T.surface }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:16 }}>
                  <Logo s={24} rounded={6} />
                  <span style={{ fontSize:11, fontWeight:700 }}>Calendar360</span>
                </div>
                {["Dashboard","Calendriers","Équipe","Agenda"].map((l,i)=>(
                  <div key={i} style={{ padding:"6px 10px", borderRadius:6, fontSize:10, color:i===0?T.accent:T.text3, background:i===0?T.accentBg:"transparent", fontWeight:i===0?600:400, marginBottom:3 }}>{l}</div>
                ))}
                <div style={{ marginTop:12, padding:8, borderRadius:8, background:T.bg, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:9, fontWeight:700, textAlign:"center", marginBottom:6, color:T.text }}>{MONTHS_FR[mMonth]}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
                    {["L","M","M","J","V","S","D"].map((d,i)=>(<div key={i} style={{ textAlign:"center", fontSize:7, color:T.text3, fontWeight:600 }}>{d}</div>))}
                    {mDays.map((day,idx)=>{
                      if(!day) return <div key={`e${idx}`}/>;
                      const isT = day===mToday;
                      return <div key={idx} style={{ width:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:7, fontSize:7, fontWeight:isT?700:400, background:isT?T.accent:"transparent", color:isT?"#fff":T.text, margin:"0 auto" }}>{day}</div>;
                    })}
                  </div>
                </div>
              </div>
              <div style={{ flex:1, padding:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>Aujourd'hui</div>
                  <div style={{ display:"flex", gap:4 }}>
                    {["Semaine","Mois"].map((v,i)=>(<div key={i} style={{ padding:"3px 10px", borderRadius:5, fontSize:9, fontWeight:600, background:i===0?T.accentBg:"transparent", color:i===0?T.accent:T.text3 }}>{v}</div>))}
                  </div>
                </div>
                {previewBookings.map((b,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", marginBottom:6, borderRadius:8, background:b.color+"08", borderLeft:`3px solid ${b.color}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:b.color, width:36 }}>{b.time}</div>
                    <div style={{ flex:1 }}><div style={{ fontSize:10, fontWeight:600 }}>{b.name}</div><div style={{ fontSize:8, color:T.text3 }}>{b.cal}</div></div>
                    <div style={{ width:18, height:18, borderRadius:9, background:b.color+"20", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ width:6, height:6, borderRadius:3, background:b.color }}/></div>
                  </div>
                ))}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginTop:10 }}>
                  {[{v:"10",l:"RDV",c:T.accent},{v:"80%",l:"Conv.",c:T.success},{v:"4.2",l:"Sat.",c:T.warning}].map((s,i)=>(
                    <div key={i} style={{ textAlign:"center", padding:"6px 4px", borderRadius:6, background:s.c+"08", border:`1px solid ${s.c}18` }}>
                      <div style={{ fontSize:12, fontWeight:800, color:s.c }}>{s.v}</div><div style={{ fontSize:7, color:T.text3 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ── TRUSTED BY / LOGOS MARQUEE ── */}
    <section style={{ padding:"40px 0", borderTop:`1px solid ${T.border}40`, borderBottom:`1px solid ${T.border}40`, background:"linear-gradient(180deg,#FAFAF8,#F5F4F0)", overflow:"hidden" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <p style={{ fontSize:12, fontWeight:600, color:T.text3, textTransform:"uppercase", letterSpacing:2 }}>Ils nous font confiance</p>
      </div>
      <div style={{ display:"flex", animation:"marquee 25s linear infinite", width:"200%" }}>
        {[...Array(2)].map((_,rep) => (
          <div key={rep} style={{ display:"flex", gap:48, alignItems:"center", flex:"0 0 50%", justifyContent:"center" }}>
            {["Cabinet Dupont & Associés","StartupFlow","MedConsult Paris","Groupe Immobilier NEXUS","EduTech France","FinServ Conseil","ArchiDesign Studio","BioLab Sciences"].map((c,i)=>(
              <div key={i} style={{ fontSize:14, fontWeight:700, color:T.text3+"88", whiteSpace:"nowrap", letterSpacing:-0.3 }}>{c}</div>
            ))}
          </div>
        ))}
      </div>
    </section>

    {/* ── FEATURES ── */}
    <section id="features-section" className="section-pad" style={{ maxWidth:1200, margin:"0 auto" }}>
      <div style={{ textAlign:"center", marginBottom:56 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:T.purpleBg, border:`1px solid ${T.purple}20`, fontSize:11, fontWeight:600, color:T.purple, marginBottom:16 }}>
          <I n="zap" s={12}/> Fonctionnalités
        </div>
        <h2 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:800, letterSpacing:-1, marginBottom:14 }}>Tout ce qu'il vous faut, <span style={{ background:"linear-gradient(135deg,#2563EB,#7C3AED)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>rien de superflu</span></h2>
        <p style={{ fontSize:15, color:T.text2, maxWidth:520, margin:"0 auto", lineHeight:1.6 }}>Une solution complète de gestion de rendez-vous pour les équipes modernes.</p>
      </div>
      <div className="feat-grid" style={{ marginBottom:40 }}>
        {[
          { icon:"calendar", title:"Calendriers multi-types", desc:"Simple, multi-collab, atelier groupe, séries récurrentes. Chaque calendrier a sa propre page de booking.", color:T.accent, gradient:"linear-gradient(135deg,#2563EB08,#2563EB14)" },
          { icon:"users", title:"Gestion d'équipe", desc:"Chaque collaborateur a son espace, ses dispos, son agenda privé. Attribution par priorité ou round-robin.", color:T.success, gradient:"linear-gradient(135deg,#05966908,#05966914)" },
          { icon:"zap", title:"Workflows automatisés", desc:"Rappels email/SMS, reconfirmation, relance no-show, Slack, Zapier webhooks. Tout est automatisé.", color:T.warning, gradient:"linear-gradient(135deg,#D9770608,#D9770614)" },
          { icon:"bar", title:"Analytics & Export", desc:"Courbes d'évolution, camembert, distribution horaire. Export CSV et PDF en un clic.", color:T.purple, gradient:"linear-gradient(135deg,#7C3AED08,#7C3AED14)" },
          { icon:"shield", title:"Sécurité & RGPD", desc:"Chiffrement AES-256, conformité RGPD, audit logs, SSO/SAML. Données protégées.", color:T.danger, gradient:"linear-gradient(135deg,#DC262608,#DC262614)" },
          { icon:"globe", title:"Booking visiteurs", desc:"Page publique élégante, sélection de créneau, formulaire personnalisé, confirmation instantanée.", color:T.teal, gradient:"linear-gradient(135deg,#0D948808,#0D948814)" },
        ].map((f,i) => (
          <div key={i} className="feat-card" onMouseEnter={() => setHoveredFeature(i)} onMouseLeave={() => setHoveredFeature(null)} style={{ padding:28, borderRadius:18, background: hoveredFeature===i ? f.gradient : T.surface, border:`1px solid ${hoveredFeature===i ? f.color+"30" : T.border}`, cursor:"default", boxShadow:"0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ width:48, height:48, borderRadius:14, background: hoveredFeature===i ? f.color : f.color+"12", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18, color: hoveredFeature===i ? "#fff" : f.color, transition:"all .3s" }}><I n={f.icon} s={22}/></div>
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>{f.title}</h3>
            <p style={{ fontSize:13, color:T.text3, lineHeight:1.7 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Feature highlight row */}
      <div className="feat-grid-2">
        <div className="glow-card" style={{ padding:32, borderRadius:18, background:"linear-gradient(135deg,#2563EB06,#3B82F612)", border:`1px solid ${T.accentBorder}`, boxShadow:"0 2px 8px rgba(0,0,0,0.03)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#2563EB,#3B82F6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 12px rgba(37,99,235,0.25)" }}><I n="search" s={20}/></div>
            <div><h3 style={{ fontSize:16, fontWeight:700 }}>Recherche globale</h3><p style={{ fontSize:12, color:T.text3 }}>Ctrl+K pour tout retrouver</p></div>
          </div>
          <p style={{ fontSize:13, color:T.text2, lineHeight:1.7 }}>Cherchez instantanément dans vos rendez-vous, contacts, collaborateurs et calendriers depuis n'importe quel écran.</p>
        </div>
        <div className="glow-card" style={{ padding:32, borderRadius:18, background:"linear-gradient(135deg,#05966906,#05966912)", border:`1px solid ${T.success}30`, boxShadow:"0 2px 8px rgba(0,0,0,0.03)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#059669,#10B981)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", boxShadow:"0 4px 12px rgba(5,150,105,0.25)" }}><I n="flag" s={20}/></div>
            <div><h3 style={{ fontSize:16, fontWeight:700 }}>Congés & jours fériés</h3><p style={{ fontSize:12, color:T.text3 }}>Blackout dates intelligentes</p></div>
          </div>
          <p style={{ fontSize:13, color:T.text2, lineHeight:1.7 }}>Jours fériés globaux et congés par collaborateur. Les créneaux sont automatiquement bloqués dans la page de booking.</p>
        </div>
      </div>
    </section>

    {/* ── INTEGRATIONS ── */}
    <section id="integrations-section" className="section-pad" style={{ background:"linear-gradient(180deg,#F5F4F0,#FAFAF8)" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:56 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:T.successBg, border:`1px solid ${T.success}20`, fontSize:11, fontWeight:600, color:T.success, marginBottom:16 }}>
            <I n="link" s={12}/> Intégrations
          </div>
          <h2 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:800, letterSpacing:-1, marginBottom:14 }}>Connectez Calendar360 à <span style={{ background:"linear-gradient(135deg,#059669,#0D9488)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>vos outils</span></h2>
          <p style={{ fontSize:15, color:T.text2, maxWidth:540, margin:"0 auto", lineHeight:1.6 }}>Plus de 100 intégrations disponibles. Synchronisez vos calendriers, visioconférences, CRM, paiements et outils de productivité.</p>
        </div>

        {/* Integration icons grid */}
        <div style={{ display:"flex", justifyContent:"center", flexWrap:"wrap", gap:16, marginBottom:48, maxWidth:720, margin:"0 auto 48px" }}>
          {integrations.map((ig,i)=>(
            <div key={i} className="integ-icon" onMouseEnter={() => setHoveredInteg(i)} onMouseLeave={() => setHoveredInteg(null)} style={{ width:80, height:80, borderRadius:18, background:T.surface, border:`1.5px solid ${hoveredInteg===i ? ig.color+"40" : T.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.04)", position:"relative", gap:4 }}>
              <IntegLogo id={ig.logo} s={28} />
              <div style={{ fontSize:8, fontWeight:600, color:T.text3, textAlign:"center", lineHeight:1.1 }}>{ig.name}</div>
              {hoveredInteg===i && <div style={{ position:"absolute", top:-6, right:-6, width:16, height:16, borderRadius:8, background:T.success, display:"flex", alignItems:"center", justifyContent:"center", animation:"scaleIn .2s ease" }}><I n="check" s={10} /></div>}
            </div>
          ))}
        </div>

        {/* Integration category cards */}
        <div className="integ-cards" style={{ maxWidth:900, margin:"0 auto" }}>
          {[
            { title:"Google Suite", desc:"Calendar, Meet, Gmail, Drive. Synchronisation bidirectionnelle de vos événements.", color:"#4285F4", logo:"google", apps:["Calendar","Meet","Gmail","Drive"] },
            { title:"Microsoft Suite", desc:"Outlook, Teams, OneDrive. Intégration native avec votre écosystème Microsoft.", color:"#0078D4", logo:"microsoft", apps:["Outlook","Teams","OneDrive","Azure"] },
            { title:"Automatisation", desc:"Zapier, Webhooks, API REST. Connectez Calendar360 à n'importe quel outil.", color:"#FF4A00", logo:"zapier", apps:["Zapier","Webhooks","Make","API"] },
          ].map((c,i)=>(
            <div key={i} className="glow-card" style={{ padding:24, borderRadius:16, background:T.surface, border:`1px solid ${T.border}`, boxShadow:"0 2px 8px rgba(0,0,0,0.03)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:c.color+"08", display:"flex", alignItems:"center", justifyContent:"center" }}><IntegLogo id={c.logo} s={26} /></div>
                <h3 style={{ fontSize:15, fontWeight:700 }}>{c.title}</h3>
              </div>
              <p style={{ fontSize:12, color:T.text3, lineHeight:1.6, marginBottom:14 }}>{c.desc}</p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {c.apps.map((a,j)=>(<span key={j} style={{ padding:"3px 10px", borderRadius:6, background:c.color+"08", border:`1px solid ${c.color}18`, fontSize:10, fontWeight:600, color:c.color }}>{a}</span>))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── HOW IT WORKS ── */}
    <section className="section-pad" style={{ maxWidth:1200, margin:"0 auto" }}>
      <div style={{ textAlign:"center", marginBottom:56 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:T.warningBg, border:`1px solid ${T.warning}20`, fontSize:11, fontWeight:600, color:T.warning, marginBottom:16 }}>
          <I n="clock" s={12}/> Comment ça marche
        </div>
        <h2 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:800, letterSpacing:-1, marginBottom:14 }}>Prêt en <span style={{ background:"linear-gradient(135deg,#D97706,#F59E0B)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>3 minutes</span></h2>
        <p style={{ fontSize:15, color:T.text2, maxWidth:480, margin:"0 auto", lineHeight:1.6 }}>Configurez votre espace, invitez votre équipe et commencez à recevoir des rendez-vous.</p>
      </div>
      <div className="steps-grid" style={{ position:"relative" }}>
        {/* Connecting line */}
        <div className="steps-line" style={{ position:"absolute", top:44, left:"12.5%", right:"12.5%", height:2, background:`linear-gradient(90deg,${T.accent},${T.success},${T.warning},${T.purple})`, borderRadius:1, zIndex:0 }}/>
        {[
          { step:"1", title:"Créez votre espace", desc:"Inscrivez-vous et configurez votre entreprise en quelques clics.", color:T.accent, icon:"plus" },
          { step:"2", title:"Ajoutez vos calendriers", desc:"Définissez vos types de RDV, durées, lieux et questions personnalisées.", color:T.success, icon:"calendar" },
          { step:"3", title:"Invitez votre équipe", desc:"Chaque collaborateur reçoit son portail avec agenda et disponibilités.", color:T.warning, icon:"users" },
          { step:"4", title:"Recevez des RDV", desc:"Partagez votre lien de booking. Les visiteurs réservent en autonomie.", color:T.purple, icon:"check" },
        ].map((s,i)=>(
          <div key={i} style={{ textAlign:"center", position:"relative", zIndex:1, padding:"0 16px" }}>
            <div style={{ width:88, height:88, borderRadius:44, background:`linear-gradient(135deg,${s.color}14,${s.color}08)`, border:`2px solid ${s.color}30`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", position:"relative" }}>
              <div style={{ width:56, height:56, borderRadius:28, background:T.surface, border:`2px solid ${s.color}40`, display:"flex", alignItems:"center", justifyContent:"center", color:s.color, boxShadow:`0 4px 16px ${s.color}20` }}><I n={s.icon} s={24}/></div>
              <div style={{ position:"absolute", top:-4, right:-4, width:24, height:24, borderRadius:12, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:800, boxShadow:`0 2px 8px ${s.color}40` }}>{s.step}</div>
            </div>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>{s.title}</h3>
            <p style={{ fontSize:12, color:T.text3, lineHeight:1.6 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ── TESTIMONIALS ── */}
    <section id="testimonials-section" className="section-pad" style={{ background:"linear-gradient(180deg,#FAFAF8,#F5F4F0)" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:56 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:"#FEF2F2", border:"1px solid #DC262620", fontSize:11, fontWeight:600, color:T.danger, marginBottom:16 }}>
            <I n="star" s={12}/> Témoignages
          </div>
          <h2 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:800, letterSpacing:-1, marginBottom:14 }}>Ils adorent <span style={{ background:"linear-gradient(135deg,#DC2626,#EC4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Calendar360</span></h2>
          <p style={{ fontSize:15, color:T.text2, maxWidth:480, margin:"0 auto", lineHeight:1.6 }}>Découvrez ce que nos utilisateurs pensent de notre solution.</p>
        </div>
        <div className="testi-grid">
          {testimonials.map((t,i)=>(
            <div key={i} className="glow-card" style={{ padding:28, borderRadius:18, background:T.surface, border:`1px solid ${T.border}`, boxShadow:"0 2px 8px rgba(0,0,0,0.03)" }}>
              <div style={{ display:"flex", gap:2, marginBottom:16 }}>
                {Array.from({length:t.stars}).map((_,j)=>(<div key={j} style={{ color:"#F59E0B" }}><I n="star" s={16}/></div>))}
              </div>
              <p style={{ fontSize:13, color:T.text2, lineHeight:1.7, marginBottom:20, fontStyle:"italic" }}>"{t.text}"</p>
              <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                <Avatar name={t.name} color={t.avatar} size={36}/>
                <div><div style={{ fontSize:13, fontWeight:700 }}>{t.name}</div><div style={{ fontSize:11, color:T.text3 }}>{t.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── PRICING ── */}
    <section id="pricing-section" className="section-pad" style={{ background:"#fff" }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:T.accentBg, border:`1px solid ${T.accentBorder}`, fontSize:11, fontWeight:600, color:T.accent, marginBottom:16 }}>
            <I n="star" s={12}/> Tarifs simples & transparents
          </div>
          <h2 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:800, letterSpacing:-1, marginBottom:14 }}>
            <span style={{ background:"linear-gradient(135deg,#2563EB,#7C3AED)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>50% moins cher</span> que la concurrence
          </h2>
          <p style={{ fontSize:15, color:T.text2, maxWidth:520, margin:"0 auto", lineHeight:1.6 }}>Les mêmes fonctionnalités premium, deux fois moins cher. Made in France 🇫🇷</p>

          {/* Billing Toggle */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:12, marginTop:28, padding:"4px", borderRadius:12, background:T.bg, border:`1px solid ${T.border}` }}>
            <div onClick={() => setBillingAnnual(true)} style={{ padding:"8px 20px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, background:billingAnnual?T.surface:"transparent", color:billingAnnual?T.accent:T.text3, boxShadow:billingAnnual?"0 1px 4px rgba(0,0,0,0.06)":"none", transition:"all .2s", display:"flex", alignItems:"center", gap:6 }}>
              Annuel {billingAnnual && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"#ECFDF5", color:"#059669", fontWeight:700 }}>-20%</span>}
            </div>
            <div onClick={() => setBillingAnnual(false)} style={{ padding:"8px 20px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, background:!billingAnnual?T.surface:"transparent", color:!billingAnnual?T.accent:T.text3, boxShadow:!billingAnnual?"0 1px 4px rgba(0,0,0,0.06)":"none", transition:"all .2s" }}>
              Mensuel
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="pricing-grid">
          {/* ── FREE ── */}
          <div onMouseEnter={() => setHoveredPlan("free")} onMouseLeave={() => setHoveredPlan(null)} style={{ borderRadius:20, border:`1.5px solid ${hoveredPlan==="free"?T.accent:T.border}`, background:T.surface, padding:"28px 24px", transition:"all .3s", transform:hoveredPlan==="free"?"translateY(-6px)":"none", boxShadow:hoveredPlan==="free"?"0 16px 48px rgba(0,0,0,0.1)":"0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Free</div>
            <div style={{ fontSize:13, color:T.text2, marginBottom:20 }}>Pour les indépendants</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
              <span style={{ fontSize:42, fontWeight:800, letterSpacing:-2 }}>0€</span>
            </div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:24 }}>Gratuit pour toujours</div>
            <div onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ width:"100%", padding:"12px 0", borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, textAlign:"center", fontSize:13, fontWeight:700, color:T.text, cursor:"pointer", transition:"all .2s", marginBottom:24 }}>
              Commencer
            </div>
            <div style={{ fontSize:12, color:T.text3, fontWeight:600, marginBottom:12 }}>Inclus :</div>
            <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:8 }}>Planification</div>
            {["1 type de calendrier","1 collaborateur","Page de réservation publique","Personnaliser la disponibilité","Notifications email","Rappels automatiques"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#059669"/></div>
                <span style={{ fontSize:12, color:T.text2, lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* ── STANDARD ── */}
          <div onMouseEnter={() => setHoveredPlan("standard")} onMouseLeave={() => setHoveredPlan(null)} style={{ borderRadius:20, border:`1.5px solid ${hoveredPlan==="standard"?T.accent:T.border}`, background:T.surface, padding:"28px 24px", transition:"all .3s", transform:hoveredPlan==="standard"?"translateY(-6px)":"none", boxShadow:hoveredPlan==="standard"?"0 16px 48px rgba(0,0,0,0.1)":"0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.accent, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Standard</div>
            <div style={{ fontSize:13, color:T.text2, marginBottom:20 }}>Pour les pros & petites équipes</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
              <span style={{ fontSize:42, fontWeight:800, letterSpacing:-2 }}>{billingAnnual ? "5" : "6"}€</span>
              <span style={{ fontSize:13, color:T.text3 }}>/place/mois</span>
              {billingAnnual && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background:"#ECFDF5", color:"#059669", fontWeight:700, marginLeft:6 }}>-17%</span>}
            </div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:24 }}>{billingAnnual ? "Facturé 60€/an" : "Sans engagement"}</div>
            <div onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ width:"100%", padding:"12px 0", borderRadius:10, background:"linear-gradient(135deg,#2563EB,#3B82F6)", textAlign:"center", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", transition:"all .2s", marginBottom:24 }}>
              Commencer
            </div>
            <div style={{ fontSize:12, color:T.text3, fontWeight:600, marginBottom:12 }}>Tout de Free, plus :</div>
            <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:8 }}>Planification</div>
            {["Calendriers illimités","Jusqu'à 5 collaborateurs","Notifications email + SMS","Multi-durées par calendrier","Questions personnalisées","Buffers avant/après RDV","Notes internes","Workflows d'automatisation"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#059669"/></div>
                <span style={{ fontSize:12, color:T.text2, lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* ── TEAMS (Recommended) ── */}
          <div onMouseEnter={() => setHoveredPlan("teams")} onMouseLeave={() => setHoveredPlan(null)} style={{ borderRadius:20, border:"2px solid #2563EB", background:T.surface, padding:"28px 24px", transition:"all .3s", transform:hoveredPlan==="teams"?"translateY(-6px)":"translateY(-4px)", boxShadow:"0 16px 48px rgba(37,99,235,0.13)", position:"relative" }}>
            <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", padding:"4px 14px", borderRadius:8, background:"linear-gradient(135deg,#2563EB,#3B82F6)", fontSize:11, fontWeight:700, color:"#fff", whiteSpace:"nowrap" }}>⭐ Recommandé</div>
            <div style={{ fontSize:11, fontWeight:700, color:T.purple, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Teams</div>
            <div style={{ fontSize:13, color:T.text2, marginBottom:20 }}>Pour les entreprises en croissance</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
              <span style={{ fontSize:42, fontWeight:800, letterSpacing:-2 }}>{billingAnnual ? "8" : "10"}€</span>
              <span style={{ fontSize:13, color:T.text3 }}>/place/mois</span>
              {billingAnnual && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background:"#ECFDF5", color:"#059669", fontWeight:700, marginLeft:6 }}>-20%</span>}
            </div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:24 }}>{billingAnnual ? "Facturé 96€/an" : "Sans engagement"}</div>
            <div onClick={() => document.getElementById("auth-section")?.scrollIntoView({behavior:"smooth"})} style={{ width:"100%", padding:"12px 0", borderRadius:10, background:"linear-gradient(135deg,#2563EB,#7C3AED)", textAlign:"center", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", transition:"all .2s", marginBottom:24, boxShadow:"0 4px 16px rgba(37,99,235,0.25)" }}>
              Essai gratuit 14 jours
            </div>
            <div style={{ fontSize:12, color:T.text3, fontWeight:600, marginBottom:12 }}>Tout de Standard, plus :</div>
            <div style={{ fontSize:11, fontWeight:700, color:T.purple, marginBottom:8 }}>Planification</div>
            {["Collaborateurs illimités","Round Robin & routing intelligent","Sondages & enquêtes intégrés","Analytics avancés","Contacts CRM intégrés","Gestion des no-shows"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#7C3AED"/></div>
                <span style={{ fontSize:12, color:T.text2, lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:T.purple, marginTop:12, marginBottom:8 }}>Avancé</div>
            {["Réservation de groupe & liste d'attente","Reconfirmation automatique","Check-in & QR codes","Tags & catégorisation","Export CSV & ICS"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#7C3AED"/></div>
                <span style={{ fontSize:12, color:T.text2, lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* ── ENTERPRISE ── */}
          <div onMouseEnter={() => setHoveredPlan("enterprise")} onMouseLeave={() => setHoveredPlan(null)} style={{ borderRadius:20, border:`1.5px solid ${hoveredPlan==="enterprise"?T.text:T.border}`, background:"linear-gradient(180deg,#1A1917 0%,#2D2B26 100%)", padding:"28px 24px", transition:"all .3s", transform:hoveredPlan==="enterprise"?"translateY(-6px)":"none", boxShadow:hoveredPlan==="enterprise"?"0 16px 48px rgba(0,0,0,0.25)":"0 2px 8px rgba(0,0,0,0.1)", color:"#fff" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#F59E0B", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Enterprise</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", marginBottom:20 }}>Pour les grandes organisations</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
              <span style={{ fontSize:16, color:"rgba(255,255,255,0.5)" }}>À partir de</span>
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
              <span style={{ fontSize:42, fontWeight:800, letterSpacing:-2, color:"#fff" }}>7 000€</span>
              <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>/an</span>
            </div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:24 }}>Tarif sur mesure</div>
            <div onClick={() => window.location.href="mailto:contact@calendar360.fr?subject=Demande Enterprise"} style={{ width:"100%", padding:"12px 0", borderRadius:10, background:"linear-gradient(135deg,#F59E0B,#EAB308)", textAlign:"center", fontSize:13, fontWeight:700, color:"#1A1917", cursor:"pointer", transition:"all .2s", marginBottom:24 }}>
              Contacter les ventes
            </div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600, marginBottom:12 }}>Tout de Teams, plus :</div>
            <div style={{ fontSize:11, fontWeight:700, color:"#F59E0B", marginBottom:8 }}>Multi-entreprises</div>
            {["Vision Supra Admin","Gestion multi-comptes entreprises","Monitoring global & activité","Journal d'audit complet","Sous-domaines personnalisés"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#F59E0B"/></div>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:"#F59E0B", marginTop:12, marginBottom:8 }}>Support</div>
            {["Support prioritaire dédié","Onboarding personnalisé","SLA garanti 99.9%"].map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                <div style={{ marginTop:1 }}><I n="check" s={12} color="#F59E0B"/></div>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom comparison note */}
        <div style={{ textAlign:"center", marginTop:40, padding:"20px 28px", borderRadius:16, background:"linear-gradient(135deg,#EFF6FF,#F5F3FF)", border:`1px solid ${T.accentBorder}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:24, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="check" s={16} color="#059669"/></div>
              <span style={{ fontSize:13, fontWeight:600 }}>Notifications SMS incluses</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="check" s={16} color="#059669"/></div>
              <span style={{ fontSize:13, fontWeight:600 }}>Données hébergées en France 🇫🇷</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="check" s={16} color="#059669"/></div>
              <span style={{ fontSize:13, fontWeight:600 }}>RGPD natif</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="check" s={16} color="#059669"/></div>
              <span style={{ fontSize:13, fontWeight:600 }}>Annulation à tout moment</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ── AUTH / LOGIN SECTION ── */}
    {authMode==="register" && <div id="auth-section"/>}
    {/* ── AUTH / REGISTER WIZARD (3 steps) ── */}
    {authMode==="register" && (()=>{
      if(!_T.regForm) _T.regForm = {step:1,companyName:'',siret:'',businessId:'',companyPhone:'',companyEmail:'',address:'',city:'',zipCode:'',country:'France',sector:'',website:'',collaboratorsTarget:'',firstName:'',lastName:'',email:'',phone:'',password:'',passwordConfirm:'',cgu:false};
      const rf=_T.regForm;
      const _rr=()=>setAuthError('_'+Date.now()); // force re-render
      const setField=(k,v)=>{rf[k]=v;_rr();};
      const isFR=(rf.country||'France').toLowerCase()==='france';
      const pwOk=rf.password.length>=8&&/[A-Z]/.test(rf.password)&&/[0-9]/.test(rf.password);
      const pwMatch=rf.password===rf.passwordConfirm;

      const canNext1=rf.companyName&&rf.companyPhone&&rf.companyEmail&&rf.address&&rf.city&&rf.zipCode&&rf.country&&(isFR?/^\d{14}$/.test((rf.siret||'').replace(/\s/g,'')):true);
      const canNext2=rf.firstName&&rf.lastName&&rf.email&&rf.phone&&pwOk&&pwMatch;

      // Submit
      const doRegister=async()=>{
        if(!rf.cgu){setAuthError('Vous devez accepter les CGU');return;}
        setAuthError('');
        try{
          const res=await api('/api/auth/register-company',{method:'POST',body:{
            companyName:rf.companyName,siret:rf.siret||'',businessId:rf.businessId||'',companyPhone:rf.companyPhone,companyEmail:rf.companyEmail,
            address:rf.address,city:rf.city,zipCode:rf.zipCode,country:rf.country,
            sector:rf.sector||'',website:rf.website||'',collaboratorsTarget:rf.collaboratorsTarget?parseInt(rf.collaboratorsTarget):null,
            firstName:rf.firstName,lastName:rf.lastName,email:rf.email.trim(),phone:rf.phone,password:rf.password,cgu:true
          }});
          if(res?.success&&res?.pending){rf.step=4;_rr();}
          else setAuthError(res?.error||'Erreur lors de l\'inscription');
        }catch{setAuthError('Erreur de connexion au serveur');}
      };

      return <section style={{maxWidth:580,margin:'60px auto',padding:'0 24px'}}>
        <Card style={{padding:0,overflow:'hidden',boxShadow:'0 12px 40px rgba(0,0,0,0.06)'}}>
          <div style={{padding:'28px 32px 0',textAlign:'center'}}>
            <div style={{margin:'0 auto 12px'}}><Logo s={44} rounded={12}/></div>
            <h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Créer votre compte entreprise</h2>
            <p style={{fontSize:12,color:T.text3,marginBottom:16}}>Inscription en 3 étapes · Validation sous 24-48h</p>
          </div>

          {/* Progress bar */}
          {rf.step<=3 && <div style={{display:'flex',gap:0,margin:'0 32px 20px'}}>
            {[{n:1,l:'Entreprise'},{n:2,l:'Responsable'},{n:3,l:'Validation'}].map(s=>
              <div key={s.n} style={{flex:1,textAlign:'center'}}>
                <div style={{height:4,borderRadius:2,background:rf.step>=s.n?'linear-gradient(135deg,#2563EB,#7C3AED)':T.border,transition:'all .3s',margin:'0 2px'}}/>
                <div style={{fontSize:10,fontWeight:rf.step===s.n?700:400,color:rf.step>=s.n?T.accent:T.text3,marginTop:4}}>Étape {s.n} · {s.l}</div>
              </div>
            )}
          </div>}

          <div style={{padding:'0 32px 28px'}}>

            {/* STEP 1: Company */}
            {rf.step===1 && <>
              <Input label="Nom de l'entreprise *" placeholder="Mon Entreprise" icon="building" value={rf.companyName} onChange={e=>setField('companyName',e.target.value)} style={{marginBottom:10}}/>
              <div style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:4}}>Pays *</label>
                <select value={rf.country} onChange={e=>setField('country',e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,fontSize:13,color:T.text,fontFamily:'inherit'}}>
                  {['France','Belgique','Suisse','Luxembourg','Canada','Maroc','Tunisie','Sénégal','Côte d\'Ivoire','Autre'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {isFR ? <Input label="SIRET *" placeholder="123 456 789 01234" icon="hash" value={rf.siret} onChange={e=>setField('siret',e.target.value.replace(/[^\d\s]/g,''))} style={{marginBottom:10}}/> : <Input label="Numéro d'entreprise" placeholder="Business ID (facultatif)" icon="hash" value={rf.businessId} onChange={e=>setField('businessId',e.target.value)} style={{marginBottom:10}}/>}
              {isFR&&rf.siret&&!/^\d{14}$/.test(rf.siret.replace(/\s/g,''))&&<div style={{fontSize:10,color:T.danger,marginTop:-6,marginBottom:6}}>Le SIRET doit contenir 14 chiffres</div>}
              <Input label="Téléphone entreprise *" placeholder="01 23 45 67 89" icon="phone" value={rf.companyPhone} onChange={e=>setField('companyPhone',e.target.value)} style={{marginBottom:10}}/>
              <Input label="Email entreprise *" placeholder="contact@entreprise.fr" icon="mail" value={rf.companyEmail} onChange={e=>setField('companyEmail',e.target.value)} style={{marginBottom:10}}/>
              <Input label="Adresse *" placeholder="12 rue de Paris" icon="map-pin" value={rf.address} onChange={e=>setField('address',e.target.value)} style={{marginBottom:10}}/>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <div style={{flex:2}}><Input label="Ville *" placeholder="Paris" value={rf.city} onChange={e=>setField('city',e.target.value)}/></div>
                <div style={{flex:1}}><Input label="Code postal *" placeholder="75001" value={rf.zipCode} onChange={e=>setField('zipCode',e.target.value)}/></div>
              </div>
              <Btn primary disabled={!canNext1} onClick={()=>{rf.step=2;_rr();}} style={{width:'100%',justifyContent:'center',padding:'12px 0',fontSize:14,borderRadius:10,marginTop:8}}>Suivant <I n="arrow-right" s={14}/></Btn>
            </>}

            {/* STEP 2: Responsible */}
            {rf.step===2 && <>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <div style={{flex:1}}><Input label="Prénom *" placeholder="Jean" icon="user" value={rf.firstName} onChange={e=>setField('firstName',e.target.value)}/></div>
                <div style={{flex:1}}><Input label="Nom *" placeholder="Dupont" value={rf.lastName} onChange={e=>setField('lastName',e.target.value)}/></div>
              </div>
              <Input label="Email de connexion *" placeholder="jean@entreprise.fr" icon="mail" value={rf.email} onChange={e=>setField('email',e.target.value)} style={{marginBottom:10}}/>
              <div style={{fontSize:10,color:T.text3,marginTop:-6,marginBottom:8}}>Cet email sera utilisé pour vous connecter</div>
              <Input label="Téléphone *" placeholder="06 12 34 56 78" icon="phone" value={rf.phone} onChange={e=>setField('phone',e.target.value)} style={{marginBottom:10}}/>
              <Input label="Mot de passe *" placeholder="••••••••" icon="key" type="password" value={rf.password} onChange={e=>setField('password',e.target.value)} style={{marginBottom:4}}/>
              <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:rf.password.length>=8?'#DCFCE7':'#FEE2E2',color:rf.password.length>=8?'#166534':'#991B1B'}}>8+ caractères</span>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:/[A-Z]/.test(rf.password)?'#DCFCE7':'#FEE2E2',color:/[A-Z]/.test(rf.password)?'#166534':'#991B1B'}}>1 majuscule</span>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:/[0-9]/.test(rf.password)?'#DCFCE7':'#FEE2E2',color:/[0-9]/.test(rf.password)?'#166534':'#991B1B'}}>1 chiffre</span>
              </div>
              <Input label="Confirmer le mot de passe *" placeholder="••••••••" icon="key" type="password" value={rf.passwordConfirm} onChange={e=>setField('passwordConfirm',e.target.value)} style={{marginBottom:4}}/>
              {rf.passwordConfirm&&!pwMatch&&<div style={{fontSize:10,color:T.danger,marginBottom:6}}>Les mots de passe ne correspondent pas</div>}
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <Btn onClick={()=>{rf.step=1;_rr();}} style={{flex:1,justifyContent:'center',padding:'12px 0',fontSize:13,borderRadius:10}}><I n="arrow-left" s={14}/> Retour</Btn>
                <Btn primary disabled={!canNext2} onClick={()=>{rf.step=3;_rr();}} style={{flex:2,justifyContent:'center',padding:'12px 0',fontSize:14,borderRadius:10}}>Suivant <I n="arrow-right" s={14}/></Btn>
              </div>
            </>}

            {/* STEP 3: Recap + Validate */}
            {rf.step===3 && <>
              <div style={{display:'flex',gap:12,marginBottom:16}}>
                <div style={{flex:1,padding:12,borderRadius:10,background:T.bg,border:'1px solid '+T.border}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.accent,marginBottom:6}}>🏢 Entreprise</div>
                  <div style={{fontSize:12,fontWeight:600}}>{rf.companyName}</div>
                  {isFR&&rf.siret&&<div style={{fontSize:10,color:T.text3}}>SIRET : {rf.siret}</div>}
                  {!isFR&&rf.businessId&&<div style={{fontSize:10,color:T.text3}}>ID : {rf.businessId}</div>}
                  <div style={{fontSize:10,color:T.text3}}>{rf.companyPhone}</div>
                  <div style={{fontSize:10,color:T.text3}}>{rf.companyEmail}</div>
                  <div style={{fontSize:10,color:T.text3}}>{rf.address}, {rf.zipCode} {rf.city}</div>
                  <div style={{fontSize:10,color:T.text3}}>{rf.country}</div>
                </div>
                <div style={{flex:1,padding:12,borderRadius:10,background:T.bg,border:'1px solid '+T.border}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#7C3AED',marginBottom:6}}>👤 Responsable</div>
                  <div style={{fontSize:12,fontWeight:600}}>{rf.firstName} {rf.lastName}</div>
                  <div style={{fontSize:10,color:T.text3}}>📧 {rf.email}</div>
                  <div style={{fontSize:10,color:T.text3}}>📱 {rf.phone}</div>
                </div>
              </div>
              {/* Optional fields */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6}}>Informations complémentaires (optionnel)</div>
                <div style={{display:'flex',gap:8,marginBottom:8}}>
                  <div style={{flex:1}}><Input label="Secteur d'activité" placeholder="Formation, Tech..." value={rf.sector} onChange={e=>setField('sector',e.target.value)}/></div>
                  <div style={{flex:1}}><Input label="Nombre de collaborateurs" placeholder="5" type="number" value={rf.collaboratorsTarget} onChange={e=>setField('collaboratorsTarget',e.target.value)}/></div>
                </div>
                <Input label="Site web" placeholder="https://..." value={rf.website} onChange={e=>setField('website',e.target.value)}/>
              </div>
              {/* CGU */}
              <label style={{display:'flex',alignItems:'flex-start',gap:8,margin:'12px 0',cursor:'pointer',fontSize:12,color:T.text2}}>
                <div onClick={()=>setField('cgu',!rf.cgu)} style={{width:18,height:18,borderRadius:5,border:'2px solid '+(rf.cgu?T.accent:T.border),background:rf.cgu?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s',cursor:'pointer',flexShrink:0,marginTop:1}}>
                  {rf.cgu&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span onClick={()=>setField('cgu',!rf.cgu)}>J'accepte les <a href="/mentions-legales" target="_blank" style={{color:T.accent}}>Conditions Générales d'Utilisation</a> et la politique de confidentialité *</span>
              </label>
              {authError&&!authError.startsWith('_')&&<p style={{fontSize:12,color:T.danger,margin:'8px 0',textAlign:'center',fontWeight:600}}>{authError}</p>}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <Btn onClick={()=>{rf.step=2;_rr();}} style={{flex:1,justifyContent:'center',padding:'12px 0',fontSize:13,borderRadius:10}}><I n="arrow-left" s={14}/> Retour</Btn>
                <Btn primary disabled={!rf.cgu||authLoading} onClick={()=>{setAuthLoading(true);doRegister().finally(()=>setAuthLoading(false));}} style={{flex:2,justifyContent:'center',padding:'12px 0',fontSize:14,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#7C3AED)'}}>
                  {authLoading?'Envoi en cours...':'Créer mon compte'} {!authLoading&&<I n="check" s={14}/>}
                </Btn>
              </div>
            </>}

            {/* STEP 4: Pending confirmation */}
            {rf.step===4 && <div style={{textAlign:'center',padding:'20px 0'}}>
              <div style={{width:64,height:64,borderRadius:16,background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><I n="check-circle" s={32} style={{color:'#22C55E'}}/></div>
              <h3 style={{fontSize:18,fontWeight:800,marginBottom:8}}>Demande envoyée !</h3>
              <p style={{fontSize:13,color:T.text3,lineHeight:1.5,marginBottom:20}}>Votre demande d'inscription pour <strong>{rf.companyName}</strong> est en cours de validation.<br/>Vous recevrez un email à <strong>{rf.email}</strong> dès que votre accès sera activé.</p>
              <p style={{fontSize:11,color:T.text3}}>Délai habituel : 24 à 48 heures ouvrées</p>
              <Btn onClick={()=>{_T.regForm=null;setAuthMode('login');setAuthError('');}} style={{marginTop:20,justifyContent:'center',padding:'10px 20px',fontSize:13,borderRadius:10}}>Retour à la connexion</Btn>
            </div>}

          </div>
          {rf.step<=3 && <div style={{textAlign:'center',padding:'0 32px 20px'}}>
            <span onClick={()=>{_T.regForm=null;setAuthMode('login');setAuthError('');}} style={{fontSize:12,color:T.accent,cursor:'pointer'}}>Déjà un compte ? Se connecter</span>
          </div>}
        </Card>
      </section>;
    })()}


    <section id={authMode==="login"?"auth-section":undefined} style={{ maxWidth:480, margin:"80px auto", padding:"0 24px", display:authMode==="register"?"none":undefined }}>
      <Card style={{ padding:0, overflow:"hidden", boxShadow:"0 12px 40px rgba(0,0,0,0.06)" }}>
        <div style={{ padding:"28px 32px 0", textAlign:"center" }}>
          <div style={{ margin:"0 auto 16px" }}><Logo s={48} rounded={14} /></div>
          <h2 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{authMode==="login"?"Connexion":"Créer un compte"}</h2>
          <p style={{ fontSize:13, color:T.text3, marginBottom:20 }}>{authMode==="login"?"Accédez à votre espace Calendar360":"Commencez votre essai gratuit"}</p>
        </div>
        <div style={{ display:"flex", margin:"0 32px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, padding:3, marginBottom:20 }}>
          {["login","register"].map(m=>(
            <div key={m} onClick={()=>setAuthMode(m)} style={{ flex:1, textAlign:"center", padding:"8px 0", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, background:authMode===m?T.surface:"transparent", color:authMode===m?T.accent:T.text3, boxShadow:authMode===m?"0 1px 3px rgba(0,0,0,0.06)":"none", transition:"all .2s" }}>
              {m==="login"?"Connexion":"Inscription"}
            </div>
          ))}
        </div>
        <div style={{ padding:"0 32px 28px" }}>
          <Input label="Email" placeholder="votre@email.com" icon="mail" value={email} onChange={e=>{setEmail(e.target.value);setAuthError("");}} style={{ marginBottom:12 }}/>
          <Input label="Mot de passe" placeholder="••••••••" icon="key" value={password} onChange={e=>{setPassword(e.target.value);setAuthError("");}} style={{ marginBottom:authMode==="register"?12:4 }}/>
          {authMode==="login" && (
            <label style={{ display:"flex", alignItems:"center", gap:8, margin:"10px 0 6px", cursor:"pointer", fontSize:13, color:T.text2, userSelect:"none" }}>
              <div onClick={() => setRememberMe(!rememberMe)} style={{ width:18, height:18, borderRadius:5, border:`2px solid ${rememberMe ? T.accent : T.border}`, background:rememberMe ? T.accent : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", cursor:"pointer", flexShrink:0 }}>
                {rememberMe && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span onClick={() => setRememberMe(!rememberMe)}>Se souvenir de moi</span>
            </label>
          )}
          {authError==='__pending__' ? (
            <div style={{textAlign:'center',padding:'16px 0',margin:'8px 0 12px'}}>
              <div style={{width:48,height:48,borderRadius:12,background:'#FEF3C7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:24}}>⏳</div>
              <div style={{fontSize:14,fontWeight:700,color:'#92400E',marginBottom:4}}>Compte en attente de validation</div>
              <div style={{fontSize:12,color:T.text3,lineHeight:1.5}}>Votre demande d'inscription est en cours d'examen. Vous recevrez un email dès que votre accès sera activé.</div>
              <div onClick={()=>setAuthError('')} style={{marginTop:12,fontSize:12,color:T.accent,cursor:'pointer'}}>← Retour</div>
            </div>
          ) : authError?.startsWith('__rejected__') ? (
            <div style={{textAlign:'center',padding:'16px 0',margin:'8px 0 12px'}}>
              <div style={{width:48,height:48,borderRadius:12,background:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:24}}>❌</div>
              <div style={{fontSize:14,fontWeight:700,color:'#991B1B',marginBottom:4}}>Demande d'inscription refusée</div>
              {authError.includes('|') && <div style={{padding:'8px 12px',borderRadius:8,background:'#FEF2F2',border:'1px solid #FECACA',margin:'8px 0',fontSize:12,color:'#7F1D1D'}}><strong>Motif :</strong> {authError.split('|')[1]}</div>}
              <div style={{fontSize:12,color:T.text3,lineHeight:1.5,marginTop:8}}>Si vous pensez qu'il s'agit d'une erreur, contactez-nous :</div>
              <a href="mailto:support@calendar360.fr" style={{fontSize:12,color:T.accent,fontWeight:600}}>📧 support@calendar360.fr</a>
              <div onClick={()=>setAuthError('')} style={{marginTop:12,fontSize:12,color:T.accent,cursor:'pointer'}}>← Retour</div>
            </div>
          ) : authError && !authError.startsWith('_') ? (
            <p style={{ fontSize:12, color:T.danger, margin:"8px 0 12px", textAlign:"center", fontWeight:600 }}>{authError}</p>
          ) : null}
          {!authError && authMode==="login" && <div style={{ height:8 }}/>}
          {authMode==="register" && <Input label="Nom de l'entreprise" placeholder="Mon Entreprise" icon="building" value={companyName} onChange={e=>{setCompanyName(e.target.value);setAuthError("");}} style={{ marginBottom:20 }}/>}
          <Btn primary onClick={handleLogin} disabled={authLoading} style={{ width:"100%", justifyContent:"center", padding:"12px 0", fontSize:14, borderRadius:10, background:"linear-gradient(135deg,#2563EB,#3B82F6)", opacity:authLoading?0.6:1 }}>
            {authLoading?"Chargement...":(authMode==="supra"?"Connexion Supra":authMode==="login"?"Se connecter":"Créer mon compte")} {!authLoading && <I n="arrow" s={14}/>}
          </Btn>
          {authMode==="login" && <div style={{ textAlign:"center", marginTop:12 }}><span style={{ fontSize:12, color:T.accent, cursor:"pointer" }}>Mot de passe oublié ?</span></div>}
          {authMode==="supra" && <div style={{ textAlign:"center", marginTop:12 }}><span onClick={()=>{setAuthMode('login');setAuthError('');}} style={{ fontSize:12, color:T.text2, cursor:"pointer" }}>Retour connexion normale</span></div>}
          <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0 16px" }}>
            <div style={{ flex:1, height:1, background:T.border }}/><span style={{ fontSize:11, color:T.text3 }}>ou continuer avec</span><div style={{ flex:1, height:1, background:T.border }}/>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {/* Google Sign-In — real button */}
            <div onClick={() => {
              if (googleClientId && window.google?.accounts?.id) {
                window.google.accounts.id.prompt((n) => {
                  if (n.isNotDisplayed() || n.isSkippedMoment()) {
                    window.google.accounts.id.initialize({
                      client_id: googleClientId,
                      callback: handleGoogleCallback,
                      auto_select: false,
                      ux_mode: 'popup',
                    });
                    window.google.accounts.id.prompt();
                  }
                });
              } else setAuthError("Google Sign-In non disponible. Rechargez la page.");
            }} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0", borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, cursor:"pointer", fontSize:11, fontWeight:600, color:T.text2, transition:"all .2s" }}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Google
            </div>
            {/* Other providers — placeholders */}
            {[{l:"Microsoft",c:"#0078D4"},{l:"Apple",c:"#000000"},{l:"SSO",c:T.purple}].map((p,i)=>(
              <div key={i} onClick={() => setAuthError("Connexion " + p.l + " bientôt disponible.")} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:4, padding:"10px 0", borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, cursor:"pointer", fontSize:11, fontWeight:600, color:T.text2, transition:"all .2s" }}>
                <div style={{ width:16, height:16, borderRadius:4, background:p.c, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:8, fontWeight:800 }}>{p.l[0]}</div>
                {p.l}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>

    {/* Supra Admin link (discret) */}
    {authMode!=='supra' && <div style={{ textAlign:"center", marginTop:8, marginBottom:16 }}><span onClick={()=>{setAuthMode('supra');setAuthError('');}} style={{ fontSize:10, color:T.text3+'60', cursor:"pointer" }}>Administration</span></div>}

    {/* ── FOOTER ── */}
    <footer className="section-pad" style={{ borderTop:`1px solid ${T.border}`, maxWidth:1200, margin:"0 auto", paddingTop:48, paddingBottom:32 }}>
      <div className="footer-grid" style={{ marginBottom:40 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <Logo s={28} rounded={8} />
            <span style={{ fontSize:16, fontWeight:800 }}>Calendar360</span>
          </div>
          <p style={{ fontSize:12, color:T.text3, lineHeight:1.7, maxWidth:280 }}>La plateforme de prise de rendez-vous intelligente pour les équipes modernes. Gérez, automatisez, analysez.</p>
        </div>
        <div>
          <h4 style={{ fontSize:12, fontWeight:700, marginBottom:14, color:T.text }}>Produit</h4>
          {["Fonctionnalités","Intégrations","Tarifs","API","Changelog"].map((l,i)=>(<div key={i} style={{ fontSize:12, color:T.text3, marginBottom:8, cursor:"pointer" }}>{l}</div>))}
        </div>
        <div>
          <h4 style={{ fontSize:12, fontWeight:700, marginBottom:14, color:T.text }}>Ressources</h4>
          {["Documentation","Guide démarrage","Blog","Webinaires","Support"].map((l,i)=>(<div key={i} style={{ fontSize:12, color:T.text3, marginBottom:8, cursor:"pointer" }}>{l}</div>))}
        </div>
        <div>
          <h4 style={{ fontSize:12, fontWeight:700, marginBottom:14, color:T.text }}>Entreprise</h4>
          {["À propos","Carrières","Contact"].map((l,i)=>(<div key={i} style={{ fontSize:12, color:T.text3, marginBottom:8, cursor:"pointer" }}>{l}</div>))}
          <a href="/privacy" style={{ fontSize:12, color:T.text3, marginBottom:8, display:"block", textDecoration:"none" }}>Politique de confidentialité</a>
          <a href="/terms" style={{ fontSize:12, color:T.text3, marginBottom:8, display:"block", textDecoration:"none" }}>Conditions d'utilisation</a>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:20, borderTop:`1px solid ${T.border}` }}>
        <div style={{ fontSize:11, color:T.text3 }}>© 2026 Calendar360. Tous droits réservés.</div>
        <div style={{ display:"flex", gap:16 }}>
          <a href="/privacy" style={{ fontSize:11, color:T.text3, textDecoration:"none" }}>Confidentialité</a>
          <a href="/terms" style={{ fontSize:11, color:T.text3, textDecoration:"none" }}>CGU</a>
          {["Cookies","Statut"].map((l,i)=>(<span key={i} style={{ fontSize:11, color:T.text3, cursor:"pointer" }}>{l}</span>))}
        </div>
      </div>
    </footer>
  </div>
  );
};

// ═══════════════════════════════════════════════════
// PUBLIC BUSINESS PAGE
// ═══════════════════════════════════════════════════

export default Landing;
