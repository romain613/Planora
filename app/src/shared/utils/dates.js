// utils/dates.js — Phase 2 extraction (pure helpers/data, no scope deps)

export const DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

export const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

export const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export const getDow = (ds) => (new Date(ds).getDay() + 6) % 7;

export const fmtDate = (ds) => { if(!ds) return '—'; const d = new Date(ds); if(isNaN(d.getTime())) return '—'; return `${DAYS_SHORT[getDow(ds)]} ${d.getDate()} ${(MONTHS_FR[d.getMonth()]||'???').slice(0,3)}`; };
