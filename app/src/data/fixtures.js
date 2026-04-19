// data/fixtures.js — Phase 2 extraction (pure helpers/data, no scope deps)

export const COMPANIES = [{ id: "c1", name: "Cabinet Dupont & Associés", slug: "dupont-associes", plan: "team", domain: "cabinet-dupont.fr" }];

export const INIT_COLLABS = [
  { id: "u1", companyId: "c1", name: "Marie Dupont", email: "marie@cabinet-dupont.fr", role: "admin", priority: 5, color: "#2563EB", code: "MARE-5X2P", password: "mdupont2026", phone: "+33612345678", maxWeek: 30, maxMonth: 100, slackId: "@marie" },
  { id: "u2", companyId: "c1", name: "Lucas Martin", email: "lucas@cabinet-dupont.fr", role: "member", priority: 3, color: "#059669", code: "LUCA-8K4R", password: "lmartin2026", phone: "", maxWeek: 25, maxMonth: 80, slackId: "@lucas" },
  { id: "u3", companyId: "c1", name: "Sophie Bernard", email: "sophie@cabinet-dupont.fr", role: "member", priority: 4, color: "#D97706", code: "SOPH-3N7W", password: "sbernard2026", phone: "+33698765432", maxWeek: 20, maxMonth: 70, slackId: "@sophie" },
  { id: "u4", companyId: "c1", name: "Antoine Moreau", email: "antoine@cabinet-dupont.fr", role: "member", priority: 2, color: "#7C3AED", code: "ANTO-6J9M", password: "amoreau2026", phone: "", maxWeek: 20, maxMonth: 60, slackId: "" },
];

export const defAvail = () => ({
  0: { active: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] },
  1: { active: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] },
  2: { active: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] },
  3: { active: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] },
  4: { active: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }] },
  5: { active: false, slots: [] }, 6: { active: false, slots: [] },
});

export const INIT_AVAILS = { u1: defAvail(), u2: defAvail(), u3: defAvail(), u4: defAvail() };

export const INIT_CALS = [
  { id: "cal1", companyId: "c1", name: "Consultation juridique", type: "simple", collaborators: ["u1"], duration: 60, durations: [60], color: "#2563EB", slug: "consultation", location: "Google Meet", price: 0, currency: "EUR", bufferBefore: 0, bufferAfter: 15, minNotice: 120, maxPerDay: 8, maxAdvanceDays: 60, questions: [{id:"q1",label:"Objet de la consultation",type:"text",required:true}], requireApproval: false, allowRecurring: false, groupMax: 1, waitlistEnabled: false, reconfirm: true, reconfirmHours: 24, managed: false, singleUse: false, dependency: "", tags: ["juridique"], videoAuto: true, assignMode: "priority" },
  { id: "cal2", companyId: "c1", name: "Rendez-vous équipe", type: "multi", collaborators: ["u1", "u2", "u3", "u4"], duration: 30, durations: [30], color: "#059669", slug: "rdv-equipe", location: "Zoom", price: 0, currency: "EUR", bufferBefore: 5, bufferAfter: 10, minNotice: 60, maxPerDay: 12, maxAdvanceDays: 30, questions: [], requireApproval: false, allowRecurring: false, groupMax: 1, waitlistEnabled: true, reconfirm: true, reconfirmHours: 12, managed: true, singleUse: false, dependency: "", tags: ["équipe"], videoAuto: true, assignMode: "priority" },
  { id: "cal3", companyId: "c1", name: "Consultation rapide", type: "multi", collaborators: ["u2", "u3"], duration: 15, durations: [15, 30], color: "#D97706", slug: "consultation-rapide", location: "Téléphone", price: 25, currency: "EUR", bufferBefore: 0, bufferAfter: 5, minNotice: 30, maxPerDay: 20, maxAdvanceDays: 14, questions: [{id:"q2",label:"Numéro de téléphone",type:"phone",required:true}], requireApproval: true, allowRecurring: true, groupMax: 1, waitlistEnabled: false, reconfirm: false, reconfirmHours: 0, managed: false, singleUse: false, dependency: "", tags: ["rapide","payant"], videoAuto: false, assignMode: "roundRobin" },
  { id: "cal4", companyId: "c1", name: "Atelier groupe", type: "multi", collaborators: ["u1", "u3"], duration: 90, durations: [90], color: "#7C3AED", slug: "atelier-groupe", location: "12 rue de la Paix, Paris", price: 50, currency: "EUR", bufferBefore: 15, bufferAfter: 15, minNotice: 1440, maxPerDay: 2, maxAdvanceDays: 90, questions: [], requireApproval: true, allowRecurring: false, groupMax: 8, waitlistEnabled: true, reconfirm: true, reconfirmHours: 48, managed: true, singleUse: false, dependency: "cal1", tags: ["atelier","groupe","payant"], videoAuto: false, assignMode: "priority" },
];

export const INIT_BOOKINGS = [
  { id: "b1", calendarId: "cal2", collaboratorId: "u1", date: "2026-03-03", time: "10:00", duration: 30, visitorName: "Paul Lefèvre", visitorEmail: "paul@mail.com", visitorPhone: "+33612345678", status: "confirmed", notes: "", noShow: false, source: "link", rating: null, tags: ["prospect"], checkedIn: false, internalNotes: "Client fidèle", reconfirmed: true },
  { id: "b2", calendarId: "cal2", collaboratorId: "u3", date: "2026-03-03", time: "14:30", duration: 30, visitorName: "Claire Roux", visitorEmail: "claire@mail.com", visitorPhone: "", status: "confirmed", notes: "Rappeler le dossier", noShow: false, source: "embed", rating: 5, tags: ["VIP"], checkedIn: true, internalNotes: "", reconfirmed: true },
  { id: "b3", calendarId: "cal1", collaboratorId: "u1", date: "2026-03-04", time: "09:00", duration: 60, visitorName: "Hugo Petit", visitorEmail: "hugo@mail.com", visitorPhone: "+33698765432", status: "confirmed", notes: "", noShow: false, source: "link", rating: 4, tags: [], checkedIn: false, internalNotes: "Dossier prioritaire", reconfirmed: true },
  { id: "b4", calendarId: "cal3", collaboratorId: "u2", date: "2026-03-04", time: "15:00", duration: 15, visitorName: "Léa Duval", visitorEmail: "lea@mail.com", visitorPhone: "+33677889900", status: "pending", notes: "", noShow: false, source: "routing", rating: null, tags: ["urgent"], checkedIn: false, internalNotes: "", reconfirmed: false },
  { id: "b5", calendarId: "cal2", collaboratorId: "u2", date: "2026-03-05", time: "11:00", duration: 30, visitorName: "Marc Blanc", visitorEmail: "marc@mail.com", visitorPhone: "+33655443322", status: "confirmed", notes: "", noShow: true, source: "link", rating: null, tags: [], checkedIn: false, internalNotes: "Ne répond plus", reconfirmed: true },
  { id: "b6", calendarId: "cal2", collaboratorId: "u1", date: "2026-03-05", time: "14:00", duration: 30, visitorName: "Julie Fontaine", visitorEmail: "julie@mail.com", visitorPhone: "", status: "confirmed", notes: "", noShow: false, source: "link", rating: 3, tags: ["retour"], checkedIn: true, internalNotes: "", reconfirmed: true },
  { id: "b7", calendarId: "cal1", collaboratorId: "u1", date: "2026-03-05", time: "16:00", duration: 60, visitorName: "Karim Bousaid", visitorEmail: "karim@mail.com", visitorPhone: "+33611223344", status: "pending", notes: "Première consultation", noShow: false, source: "embed", rating: null, tags: ["prospect"], checkedIn: false, internalNotes: "", reconfirmed: false },
  { id: "b8", calendarId: "cal4", collaboratorId: "u1", date: "2026-03-06", time: "14:00", duration: 90, visitorName: "Emma Laurent", visitorEmail: "emma@mail.com", visitorPhone: "", status: "confirmed", notes: "Atelier créativité", noShow: false, source: "link", rating: 5, tags: ["VIP","groupe"], checkedIn: false, internalNotes: "Salle B", reconfirmed: true },
  { id: "b9", calendarId: "cal4", collaboratorId: "u1", date: "2026-03-06", time: "14:00", duration: 90, visitorName: "Thomas Girard", visitorEmail: "thomas@mail.com", visitorPhone: "", status: "confirmed", notes: "", noShow: false, source: "qr", rating: null, tags: ["groupe"], checkedIn: false, internalNotes: "", reconfirmed: true },
  { id: "b10", calendarId: "cal3", collaboratorId: "u3", date: "2026-03-06", time: "09:30", duration: 15, visitorName: "Nadia Ferhat", visitorEmail: "nadia@mail.com", visitorPhone: "+33699887766", status: "confirmed", notes: "", noShow: false, source: "sms", rating: 4, tags: [], checkedIn: true, internalNotes: "", reconfirmed: true },
];

export const INIT_WORKFLOWS = [
  {id:"w1",name:"Rappel 24h email",trigger:"before",delay:-1440,action:"email",template:"Rappel : votre RDV demain à {{time}}",active:true},
  {id:"w2",name:"Rappel 1h SMS",trigger:"before",delay:-60,action:"sms",template:"RDV dans 1h — {{company}}",active:true},
  {id:"w3",name:"Suivi post-RDV",trigger:"after",delay:60,action:"email",template:"Merci {{visitorName}} !",active:true},
  {id:"w4",name:"Relance no-show",trigger:"noshow",delay:30,action:"email",template:"Vous n'avez pas pu venir. Replanifier ?",active:true},
  {id:"w5",name:"Enquête satisfaction",trigger:"after",delay:1440,action:"email",template:"Évaluez votre expérience ⭐",active:true},
  {id:"w6",name:"Reconfirmation 24h",trigger:"reconfirm",delay:-1440,action:"email",template:"Confirmez-vous votre RDV ? [Oui] [Non]",active:true},
  {id:"w7",name:"Notification Slack",trigger:"new_booking",delay:0,action:"slack",template:"Nouveau RDV : {{visitorName}} — {{calendar}}",active:true},
  {id:"w8",name:"Webhook Zapier",trigger:"new_booking",delay:0,action:"webhook",template:"POST /webhooks/booking",active:false},
];

export const INIT_ROUTING = [{id:"rf1",name:"Orientation visiteur",fields:[{id:"f1",label:"Type de besoin",type:"select",options:["Consultation juridique","Question rapide","Atelier groupe"]},{id:"f2",label:"Urgence",type:"select",options:["Normal","Urgent"]}],rules:[{condition:{field:"f1",value:"Consultation juridique"},redirectTo:"cal1"},{condition:{field:"f1",value:"Question rapide"},redirectTo:"cal3"},{condition:{field:"f1",value:"Atelier groupe"},redirectTo:"cal4"},{condition:{field:"f2",value:"Urgent"},override:{minNotice:15}}],active:true}];

export const INIT_POLLS = [{id:"p1",title:"Réunion stratégie Q2",creator:"u1",options:["2026-03-10 10:00","2026-03-10 14:00","2026-03-11 09:00"],votes:{},status:"open",expires:"2026-03-08"}];

export const INIT_CONTACTS = [
  {id:"ct1",name:"Paul Lefèvre",email:"paul@mail.com",phone:"+33612345678",totalBookings:3,lastVisit:"2026-03-03",tags:["prospect"],notes:"Intéressé droit commercial",rating:null,docs:[]},
  {id:"ct2",name:"Claire Roux",email:"claire@mail.com",phone:"",totalBookings:7,lastVisit:"2026-03-03",tags:["VIP"],notes:"Cliente fidèle",rating:5,docs:["contrat.pdf"]},
  {id:"ct3",name:"Hugo Petit",email:"hugo@mail.com",phone:"+33698765432",totalBookings:1,lastVisit:"2026-03-04",tags:[],notes:"",rating:4,docs:[]},
  {id:"ct4",name:"Nadia Ferhat",email:"nadia@mail.com",phone:"+33699887766",totalBookings:2,lastVisit:"2026-03-06",tags:[],notes:"Consultation rapide régulière",rating:4,docs:[]},
];

export const COMPANY_SETTINGS = {blackoutDates:["2026-05-01","2026-12-25","2026-07-14"],showBusyPercent:100,timezone:"Europe/Paris",language:"fr",cancelPolicy:"Annulation gratuite jusqu'à 24h avant.",customDomain:"",brandColor:"#2563EB"};

export const INIT_ALL_COMPANIES = [
  { id:"c1", name:"Cabinet Dupont & Associés", slug:"dupont-associes", domain:"cabinet-dupont.fr", plan:"pro", contactEmail:"contact@cabinet-dupont.fr", createdAt:"2025-11-15", active:true, collaboratorsCount:4, calendarsCount:4, bookingsCount:10 },
  { id:"c2", name:"Clinique Saint-Louis", slug:"clinique-saint-louis", domain:"clinique-stlouis.fr", plan:"pro", contactEmail:"admin@clinique-stlouis.fr", createdAt:"2026-01-10", active:true, collaboratorsCount:8, calendarsCount:6, bookingsCount:47 },
  { id:"c3", name:"Studio Graphique Nantes", slug:"studio-graphique", domain:"studio-nantes.fr", plan:"free", contactEmail:"hello@studio-nantes.fr", createdAt:"2026-02-20", active:true, collaboratorsCount:2, calendarsCount:1, bookingsCount:5 },
  { id:"c4", name:"Agence Immobilière Provence", slug:"immo-provence", domain:"immo-provence.fr", plan:"enterprise", contactEmail:"contact@immo-provence.fr", createdAt:"2025-09-01", active:false, collaboratorsCount:12, calendarsCount:10, bookingsCount:234 },
  { id:"c5", name:"Coach Sportif Lyon", slug:"coach-lyon", domain:"coach-lyon.fr", plan:"free", contactEmail:"tom@coach-lyon.fr", createdAt:"2026-03-01", active:true, collaboratorsCount:1, calendarsCount:2, bookingsCount:3 },
];

export const INIT_ALL_USERS = [
  { id:"gu1", companyId:"c1", companyName:"Cabinet Dupont & Associés", name:"Marie Dupont", email:"marie@cabinet-dupont.fr", role:"admin", lastActive:"2026-03-04", status:"active" },
  { id:"gu2", companyId:"c1", companyName:"Cabinet Dupont & Associés", name:"Lucas Martin", email:"lucas@cabinet-dupont.fr", role:"member", lastActive:"2026-03-03", status:"active" },
  { id:"gu3", companyId:"c1", companyName:"Cabinet Dupont & Associés", name:"Sophie Bernard", email:"sophie@cabinet-dupont.fr", role:"member", lastActive:"2026-03-03", status:"active" },
  { id:"gu4", companyId:"c1", companyName:"Cabinet Dupont & Associés", name:"Antoine Moreau", email:"antoine@cabinet-dupont.fr", role:"member", lastActive:"2026-03-01", status:"active" },
  { id:"gu5", companyId:"c2", companyName:"Clinique Saint-Louis", name:"Dr. Isabelle Morel", email:"morel@clinique-stlouis.fr", role:"admin", lastActive:"2026-03-04", status:"active" },
  { id:"gu6", companyId:"c2", companyName:"Clinique Saint-Louis", name:"Jean-Pierre Lemaire", email:"lemaire@clinique-stlouis.fr", role:"member", lastActive:"2026-03-02", status:"active" },
  { id:"gu7", companyId:"c3", companyName:"Studio Graphique Nantes", name:"Camille Fournier", email:"camille@studio-nantes.fr", role:"admin", lastActive:"2026-02-28", status:"active" },
  { id:"gu8", companyId:"c4", companyName:"Agence Immo Provence", name:"Olivier Perrin", email:"operrin@immo-provence.fr", role:"admin", lastActive:"2026-01-15", status:"inactive" },
  { id:"gu9", companyId:"c5", companyName:"Coach Sportif Lyon", name:"Tom Girard", email:"tom@coach-lyon.fr", role:"admin", lastActive:"2026-03-04", status:"active" },
];

export const INIT_ACTIVITY_LOG = [
  { id:"a1", companyId:"c1", companyName:"Cabinet Dupont", action:"booking_created", detail:"Paul Lefèvre — Consultation juridique", timestamp:"2026-03-04 09:15", user:"Marie Dupont" },
  { id:"a2", companyId:"c2", companyName:"Clinique Saint-Louis", action:"collab_added", detail:"Nouveau collaborateur: Dr. Vidal", timestamp:"2026-03-04 08:30", user:"Dr. Isabelle Morel" },
  { id:"a3", companyId:"c1", companyName:"Cabinet Dupont", action:"calendar_created", detail:"Nouveau calendrier: Médiation", timestamp:"2026-03-03 17:45", user:"Marie Dupont" },
  { id:"a4", companyId:"c3", companyName:"Studio Nantes", action:"booking_cancelled", detail:"Annulation: Projet branding", timestamp:"2026-03-03 14:20", user:"Camille Fournier" },
  { id:"a5", companyId:"c4", companyName:"Agence Immo", action:"plan_changed", detail:"Pro → Enterprise", timestamp:"2026-03-02 11:00", user:"Système" },
  { id:"a6", companyId:"c2", companyName:"Clinique Saint-Louis", action:"booking_created", detail:"Consultation Dr. Morel — Pierre Durand", timestamp:"2026-03-02 09:40", user:"Dr. Isabelle Morel" },
  { id:"a7", companyId:"c1", companyName:"Cabinet Dupont", action:"no_show", detail:"No-show: Marc Blanc", timestamp:"2026-03-01 11:30", user:"Système" },
  { id:"a8", companyId:"c5", companyName:"Coach Lyon", action:"account_created", detail:"Nouveau compte créé", timestamp:"2026-03-01 10:00", user:"Super Admin" },
];
