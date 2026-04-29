import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../../../theme";
import { formatPhoneFR, displayPhone } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../../shared/utils/constants";
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import {
  COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS,
  INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS,
  INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG
} from "../../../data/fixtures";
import {
  API_BASE, recUrl, collectEnv, api,
  getAutoTicketCompanyId, setAutoTicketCompanyId
} from "../../../shared/services/api";
import {
  HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card,
  Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState,
  HelpTip, ValidatedInput, ErrorBoundary
} from "../../../shared/ui";
import {
  ENVELOPE_ICONS, ENVELOPE_PRIORITIES, resolveEnvelopeIcon, resolveEnvelopePriority,
  DEFAULT_ENVELOPE_COLOR, DEFAULT_ENVELOPE_ICON, DEFAULT_ENVELOPE_PRIORITY,
} from "../data/envelopeOptions.js";

export default function AdminLeadsScreen({ collab, collabs, company, contacts, pushNotification }) {

          const [leadsSubTab, setLeadsSubTab] = useState('overview');
          const [sources, setSources] = useState([]);
          const [incoming, setIncoming] = useState([]);
          const [envelopes, setEnvelopes] = useState([]);
          const [rules, setRules] = useState([]);
          const [assignments, setAssignments] = useState([]);
          const [leadStats, setLeadStats] = useState(null);
          const [loading, setLoading] = useState(true);
          const [showAddSource, setShowAddSource] = useState(false);
          const [showAddEnvelope, setShowAddEnvelope] = useState(false);
          const [showImport, setShowImport] = useState(null);
          const [showMapping, setShowMapping] = useState(null);
          const [gsheetUrl, setGsheetUrl] = useState('');
          const [gsheetPreview, setGsheetPreview] = useState(null);
          const [csvFile, setCsvFile] = useState(null);
          const [csvHeaders, setCsvHeaders] = useState(null);
          const [csvText, setCsvText] = useState('');
          const [mappingForm, setMappingForm] = useState({});
          const [importEnvelopeId, setImportEnvelopeId] = useState('');
          const [importSourceId, setImportSourceId] = useState('');
          const [dispatchLoading, setDispatchLoading] = useState(false);
          const [selectedBulk, setSelectedBulk] = useState([]);
          const [statusFilter, setStatusFilter] = useState('');
          const [selectedRuleEnv, setSelectedRuleEnv] = useState('');
          const [newSource, setNewSource] = useState({ name:'', type:'csv', config:{}, sync_mode:'manual', gsheet_url:'', sync_envelope_id:'' });
          const [newEnvelope, setNewEnvelope] = useState({ name:'', dispatch_type:'manual', dispatch_mode:'percentage', dispatch_time:'09:00', dispatch_limit:0, auto_dispatch:false, dispatch_start_date:'', dispatch_end_date:'', _collabs:[] });
          const [showManualDispatch, setShowManualDispatch] = useState(null);
          const [manualDispatchForm, setManualDispatchForm] = useState({ count:5, collaboratorIds:[] });
          const [showDistribPopup, setShowDistribPopup] = useState(null);
          const [distribForm, setDistribForm] = useState({ mode:'all', count:10, dispatchMode:'percentage' });
          const [editingRule, setEditingRule] = useState(null);
          const [editRuleForm, setEditRuleForm] = useState({percentage:0,priority:1,dispatch_count:0,max_daily:0});
          const [editEnvId, setEditEnvId] = useState(null);
          const [expandedCampaign, setExpandedCampaign] = useState(null);
          const [leadsView, setLeadsView] = useState('inbox');
          // V1.10.5 P3 — mapping intelligent : champs custom dynamiques + modal CreateField
          const [contactFieldDefs, setContactFieldDefs] = useState([]);
          const [showCreateFieldModal, setShowCreateFieldModal] = useState(null);
          const [newFieldForm, setNewFieldForm] = useState({ label:'', fieldType:'text', scope:'company', label_url:'' });
          // V1.10.6 — suppression enveloppe avec gestion leads assignés
          const [deleteEnvDialog, setDeleteEnvDialog] = useState(null); // { env, preview }
          const [deleteEnvLoading, setDeleteEnvLoading] = useState(false);
          // suggestedMappingDetailed conservé sur showMapping (cf. handler gsheet-preview)

          // csvFile repurposed as search term (string), csvHeaders repurposed as import logs, gsheetPreview repurposed as import report
          const searchTerm = csvFile || '';
          const importLogs = csvHeaders || [];
          const importReport = (gsheetPreview && gsheetPreview.importId) ? gsheetPreview : null;
          // V5-Supervision: données manager-dashboard
          const [supervision, setSupervision] = useState(null);

          const incomingTotal = incoming._total || incoming.length;
          // V5-P2: isAdmin — fonctionne dans AdminDash (pas de collab) ET CollabPortal
          const isAdmin = typeof collab !== 'undefined' ? (collab?.role === 'admin' || collab?.role === 'supra') : true;

          const loadData = () => {
            setLoading(true);
            const searchQ = (typeof csvFile === 'string' && csvFile) ? '&search='+encodeURIComponent(csvFile) : '';
            Promise.all([
              api(`/api/leads/sources?companyId=${company.id}`),
              api(`/api/leads/incoming?companyId=${company.id}${statusFilter?'&status='+statusFilter:''}${searchQ}`),
              api(`/api/leads/envelopes?companyId=${company.id}`),
              api(`/api/leads/stats?companyId=${company.id}`),
              api(`/api/leads/history?companyId=${company.id}`),
              api(`/api/leads/import-logs?companyId=${company.id}`),
              api(`/api/leads/scores?companyId=${company.id}`).catch(()=>[]),
              api(`/api/leads/manager-stats?companyId=${company.id}`).catch(()=>({})),
            ]).then(([s,i,e,st,h,logs,scores,mgr])=>{
              setSources(s||[]);
              // V5-P2: Isolation leads — collab non-admin voit uniquement SES leads assignes
              const rawLeads = (i && i.leads) ? i.leads : (i||[]);
              const filteredLeads = isAdmin ? rawLeads : rawLeads.filter(l => l.assigned_to === (typeof collab !== 'undefined' ? collab?.id : '') || l.status === 'new' || l.status === 'queued');
              if (i && i.leads) { filteredLeads._total = i.total; }
              setIncoming(filteredLeads);
              setEnvelopes(e||[]);
              setLeadStats({...(st||{}), scores: Array.isArray(scores)?scores:[], managerStats: mgr?.collabStats||[]});
              setAssignments(h||[]);
              setCsvHeaders(logs||null);
              setLoading(false);
            }).catch(()=>setLoading(false));
            // V5-Supervision: charger manager-dashboard (admin only)
            if (isAdmin) {
              api(`/api/data/manager-dashboard?companyId=${company.id}`).then(d => { if(d && !d.error) setSupervision(d); }).catch(()=>{});
            }
          };
          useEffect(()=>{
            loadData();
            const _refreshIv = setInterval(loadData, 30000);
            return ()=>clearInterval(_refreshIv);
          }, [company.id, statusFilter]);

          const loadRules = (envId) => {
            if(!envId) return;
            api(`/api/leads/dispatch-rules?companyId=${company.id}&envelope_id=${envId}`).then(r=>setRules(r||[]));
          };
          useEffect(()=>{ if(selectedRuleEnv) loadRules(selectedRuleEnv); }, [selectedRuleEnv]);

          // V1.10.5 P3 — Charge les définitions de champs custom de la company au mount
          useEffect(()=>{
            if (!company?.id) return;
            api('/api/contact-fields?companyId=' + company.id).then(r => {
              if (Array.isArray(r)) setContactFieldDefs(r);
            }).catch(()=>{});
          }, [company?.id]);

          // Helper pour normaliser un label en fieldKey (mirror backend normalizeFieldKey)
          const _normalizeFieldKey = (label) => String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

          const handleAddSource = () => {
            api('/api/leads/sources', { method:'POST', body:{ companyId:company.id, ...newSource } }).then(()=>{ setShowAddSource(false); setNewSource({name:'',type:'csv',config:{},sync_mode:'manual',gsheet_url:'',sync_envelope_id:''}); loadData(); });
          };
          const handleDeleteSource = (id) => { api(`/api/leads/sources/${id}`, { method:'DELETE' }).then(loadData); };
          const handleAddEnvelope = () => {
            const {_collabs, ...envData} = newEnvelope;
            api('/api/leads/envelopes', { method:'POST', body:{ companyId:company.id, ...envData } }).then(r=>{
              if(!r?.id) return;
              const checkedCollabs = (_collabs||[]).filter(c=>c.checked);
              if(checkedCollabs.length>0) {
                Promise.all(checkedCollabs.map(c=>api('/api/leads/dispatch-rules', { method:'POST', body:{ companyId:company.id, envelope_id:r.id, collaborator_id:c.id, percentage:c.percentage||0, priority:1, dispatch_count:0, max_daily:c.maxDaily||0 } }))).then(()=>{ loadData(); });
              } else { loadData(); }
              setShowAddEnvelope(false); setNewEnvelope({name:'',color:DEFAULT_ENVELOPE_COLOR,icon:DEFAULT_ENVELOPE_ICON,priority:DEFAULT_ENVELOPE_PRIORITY,dispatch_type:'manual',dispatch_mode:'percentage',dispatch_time:'09:00',dispatch_limit:0,auto_dispatch:false,dispatch_start_date:'',dispatch_end_date:'',_collabs:[]});
            });
          };
          const handleDeleteEnvelope = (id) => { api(`/api/leads/envelopes/${id}`, { method:'DELETE' }).then(loadData); };

          // V1.10.6 — Suppression enveloppe + leads (hard delete avec gestion assignés)
          const requestDeleteEnvelope = async (env) => {
            try {
              const preview = await api(`/api/leads/envelopes/${env.id}/delete-preview`);
              if (preview?.error) { pushNotification('Erreur', preview.error || 'Impossible de prévisualiser', 'error'); return; }
              if ((preview.total || 0) === 0) {
                if (!confirm(`Supprimer le flux "${env.name}" ?\n\nAucun lead à supprimer.`)) return;
                await runDeleteEnvelopeCascade(env, false);
              } else if ((preview.assigned || 0) === 0) {
                if (!confirm(`Supprimer le flux "${env.name}" ?\n\n${preview.unassigned} leads non assignés seront supprimés définitivement (hard delete).\nLes contacts CRM ne seront pas touchés.`)) return;
                await runDeleteEnvelopeCascade(env, false);
              } else {
                setDeleteEnvDialog({ env, preview });
              }
            } catch (e) { pushNotification('Erreur', 'Impossible de prévisualiser la suppression', 'error'); }
          };

          const runDeleteEnvelopeCascade = async (env, force) => {
            setDeleteEnvLoading(true);
            try {
              const url = `/api/leads/envelopes/${env.id}?cascade=true${force ? '&force=true' : ''}`;
              const res = await api(url, { method:'DELETE' });
              if (res?.error) {
                pushNotification('Erreur', res.error === 'leads_assigned' ? `${res.assigned} leads assignés — désassignation requise` : res.error, 'error');
                setDeleteEnvLoading(false);
                return false;
              }
              setEnvelopes(p => p.filter(e => e.id !== env.id));
              setDeleteEnvDialog(null);
              setDeleteEnvLoading(false);
              const summary = `${res.deletedLeads || 0} leads supprimés${res.unassignedBeforeDelete ? ` (dont ${res.unassignedBeforeDelete} désassignés)` : ''}`;
              pushNotification('Flux supprimé', `"${env.name}" — ${summary}`, 'success');
              loadData();
              return true;
            } catch (e) {
              setDeleteEnvLoading(false);
              pushNotification('Erreur', 'Impossible de supprimer', 'error');
              return false;
            }
          };

          const handleDispatch = (envId) => {
            setDispatchLoading(true);
            api('/api/leads/dispatch', { method:'POST', body:{ companyId:company.id, envelope_id:envId } })
              .then(r=>{
                setDispatchLoading(false);
                if(r?.error) { pushNotification('Erreur distribution', r.error, 'error'); return; }
                if(r?.dispatched>0) {
                  const details = r.summary ? Object.entries(r.summary).map(([name,cnt])=>`${name}: ${cnt}`).join(', ') : '';
                  pushNotification('Distribution terminee', r.dispatched+' leads distribues'+(details?' ('+details+')':''), 'success');
                } else {
                  pushNotification('Distribution', r?.message||'Aucun lead a distribuer', 'info');
                }
                loadData();
              })
              .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
          };

          const handleCsvUpload = (e) => {
            const file = e.target.files[0]; if(!file) return;
            if(file.size>10*1024*1024){pushNotification('Erreur','Fichier trop volumineux (max 10 Mo)','error');return;}
            const reader = new FileReader();
            reader.onload = ev => {
              const text = ev.target.result; setCsvText(text);
              const lines = text.split(/\r?\n/).filter(l=>l.trim());
              if(lines.length<1) return;
              if(lines.length-1>50000){pushNotification('Erreur','Trop de lignes (max 50 000)','error');return;}
              const sep = lines[0].includes('\t')?'\t':',';
              const hdrs = lines[0].split(sep).map(h=>h.replace(/^"|"$/g,'').trim());
              setShowImport(null); setShowMapping({headers:hdrs, type:'csv', _fileName:file.name});
            };
            reader.readAsText(file,'UTF-8');
          };

          const handleGsheetPreview = () => {
            if(!gsheetUrl) return;
            if(!gsheetUrl.includes('docs.google.com/spreadsheets')) {
              pushNotification('Erreur', "L'URL doit etre un lien Google Sheets valide (https://docs.google.com/spreadsheets/d/...)", 'error');
              return;
            }
            setDispatchLoading(true);
            api('/api/leads/import/gsheet-preview', { method:'POST', body:{url:gsheetUrl} })
              .then(r=>{
                setDispatchLoading(false);
                if(r?.error) { pushNotification('Erreur Google Sheet', r.error, 'error'); return; }
                if(r?.headers) {
                  setShowImport(null);
                  const initMapping = {};
                  // V1.10.5 P3 — priorité au mapping détaillé (custom:<key> auto-suggéré)
                  if (r.suggestedMappingDetailed) {
                    Object.entries(r.suggestedMappingDetailed).forEach(([idx, info]) => {
                      if (info && info.field) initMapping[idx] = info.field;
                    });
                    setMappingForm(initMapping);
                  } else if (r.suggestedMapping) {
                    Object.entries(r.suggestedMapping).forEach(([idx,field])=>{ initMapping[idx]=field; }); setMappingForm(initMapping);
                  }
                  setShowMapping({headers:r.headers, type:'gsheet', sampleRows:r.sampleRows, suggestedMappingDetailed:r.suggestedMappingDetailed||null});
                }
                else { pushNotification('Erreur', "Impossible de lire le Google Sheet. Verifiez qu'il est public.", 'error'); }
              })
              .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion au serveur', 'error'); });
          };

          const handleImport = () => {
            const mapping = {};
            Object.entries(mappingForm).forEach(([idx, field])=>{ if(field&&field!=='skip') mapping[idx]=field; });
            if(Object.keys(mapping).length === 0) {
              pushNotification('Mapping requis', 'Selectionnez au moins un champ a importer', 'error');
              return;
            }
            const dupMode = mappingForm._duplicateMode || 'skip';
            setDispatchLoading(true);
            if(showMapping.type === 'csv') {
              api('/api/leads/import/csv', { method:'POST', body:{ companyId:company.id, source_id:importSourceId||null, envelope_id:importEnvelopeId||null, csvText, mapping, duplicateMode:dupMode } })
                .then(r=>{
                  setDispatchLoading(false);
                  if(r?.error) { pushNotification('Erreur Import CSV', r.error, 'error'); return; }
                  setShowMapping(null); setCsvText(''); setMappingForm({}); setImportSourceId(''); setImportEnvelopeId('');
                  if(r?.importId) { setGsheetPreview(r); } else { pushNotification('Import CSV', (r?.imported||0)+' leads importes, '+(r?.duplicates||0)+' doublons', 'success'); }
                  loadData();
                })
                .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
            } else {
              api('/api/leads/import/gsheet', { method:'POST', body:{ companyId:company.id, source_id:importSourceId||null, envelope_id:importEnvelopeId||null, url:gsheetUrl, mapping, duplicateMode:dupMode } })
                .then(r=>{
                  setDispatchLoading(false);
                  if(r?.error) { pushNotification('Erreur Import', r.error, 'error'); return; }
                  setShowMapping(null); setGsheetUrl(''); setMappingForm({}); setImportSourceId(''); setImportEnvelopeId('');
                  if(r?.importId) { setGsheetPreview(r); } else { pushNotification('Import Google Sheet', (r?.imported||0)+' leads importes, '+(r?.duplicates||0)+' doublons', 'success'); }
                  loadData();
                })
                .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
            }
          };

          const handleBulkStatus = (status) => {
            if(selectedBulk.length===0) return;
            api('/api/leads/incoming/bulk-status', { method:'POST', body:{ ids:selectedBulk, status } })
              .then(r=>{ if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; } setSelectedBulk([]); loadData(); pushNotification('Succes', selectedBulk.length+' leads mis a jour', 'success'); })
              .catch(()=> pushNotification('Erreur', 'Erreur de connexion', 'error'));
          };

          const handleBulkDelete = () => {
            if(selectedBulk.length===0) return;
            if(!confirm('Supprimer '+selectedBulk.length+' leads definitivement ?')) return;
            api('/api/leads/incoming/bulk-delete', { method:'POST', body:{ ids:selectedBulk } })
              .then(r=>{ if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; } setSelectedBulk([]); loadData(); pushNotification('Succes', selectedBulk.length+' leads supprimes', 'success'); })
              .catch(()=> pushNotification('Erreur', 'Erreur de connexion', 'error'));
          };

          const handleBulkEnvelope = (envId) => {
            if(selectedBulk.length===0 || !envId) return;
            api('/api/leads/incoming/bulk-status', { method:'POST', body:{ ids:selectedBulk, status:'queued', envelope_id:envId } })
              .then(r=>{ if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; } setSelectedBulk([]); loadData(); pushNotification('Succes', selectedBulk.length+' leads deplaces dans le flux', 'success'); })
              .catch(()=> pushNotification('Erreur', 'Erreur de connexion', 'error'));
          };

          const handleDeleteRule = (id) => { api(`/api/leads/dispatch-rules/${id}`, { method:'DELETE' }).then(()=>loadRules(selectedRuleEnv)); };

          const handleManualDispatch = () => {
            if(!showManualDispatch || !manualDispatchForm.count || manualDispatchForm.collaboratorIds.length===0) return;
            setDispatchLoading(true);
            api('/api/leads/dispatch-manual', { method:'POST', body:{ companyId:company.id, envelope_id:showManualDispatch, count:manualDispatchForm.count, collaboratorIds:manualDispatchForm.collaboratorIds } })
              .then(r=>{
                setDispatchLoading(false);
                if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; }
                const details = r.summary ? Object.entries(r.summary).map(([name,cnt])=>`${name}: ${cnt}`).join(', ') : '';
                pushNotification('Distribution manuelle', (r.dispatched||0)+' leads distribues'+(details?' ('+details+')':''), 'success');
                setShowManualDispatch(null);
                loadData();
              })
              .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
          };

          const handleSaveRule = (ruleId) => {
            api(`/api/leads/dispatch-rules/${ruleId}`, {method:'PUT', body:editRuleForm}).then(r => {
              if(r.success) { setEditingRule(null); loadRules(selectedRuleEnv); pushNotification('Regle mise a jour','','success'); }
            });
          };

          const handleEditEnvelope = () => {
            const {_collabs, ...envData} = newEnvelope;
            api(`/api/leads/envelopes/${editEnvId}`, {method:'PUT', body:envData}).then(r => {
              if(r.success) {
                // Sync rules: delete unchecked, create/update checked
                const checkedCollabs = (_collabs||[]).filter(c=>c.checked);
                const uncheckedCollabs = (_collabs||[]).filter(c=>!c.checked && c.ruleId);
                const promises = [];
                uncheckedCollabs.forEach(c=>{ promises.push(api(`/api/leads/dispatch-rules/${c.ruleId}`, {method:'DELETE'})); });
                checkedCollabs.forEach(c=>{
                  if(c.ruleId) {
                    promises.push(api(`/api/leads/dispatch-rules/${c.ruleId}`, {method:'PUT', body:{percentage:c.percentage||0, priority:1, dispatch_count:0, max_daily:c.maxDaily||0}}));
                  } else {
                    promises.push(api('/api/leads/dispatch-rules', {method:'POST', body:{companyId:company.id, envelope_id:editEnvId, collaborator_id:c.id, percentage:c.percentage||0, priority:1, dispatch_count:0, max_daily:c.maxDaily||0}}));
                  }
                });
                Promise.all(promises).then(()=>{ loadData(); if(selectedRuleEnv===editEnvId) loadRules(editEnvId); });
                setEditEnvId(null); setShowAddEnvelope(false); setNewEnvelope({name:'',color:DEFAULT_ENVELOPE_COLOR,icon:DEFAULT_ENVELOPE_ICON,priority:DEFAULT_ENVELOPE_PRIORITY,dispatch_type:'manual',dispatch_mode:'percentage',dispatch_time:'09:00',dispatch_limit:0,auto_dispatch:false,dispatch_start_date:'',dispatch_end_date:'',_collabs:[]}); pushNotification('Enveloppe modifiee','','success');
              }
            });
          };

          // V1.10.5 P3 — MAPPING_FIELDS de base (standards uniquement). Le rendu modal
          // construit dynamiquement la liste complète avec contactFieldDefs + customs détectés.
          const MAPPING_FIELDS_STANDARDS = [{v:'first_name',l:'Prénom'},{v:'last_name',l:'Nom'},{v:'email',l:'Email'},{v:'phone',l:'Téléphone'},{v:'company',l:'Entreprise'},{v:'date',l:'Date'},{v:'address',l:'Adresse'},{v:'city',l:'Ville'},{v:'situation',l:'Situation'},{v:'accompagnement',l:'Accompagnement'},{v:'qualification',l:'Qualification'},{v:'source',l:'Source / Origine'},{v:'message',l:'Message'},{v:'tags',l:'Tags'},{v:'notes',l:'Notes'}];
          // Compatibilité legacy avec ancien dropdown (usages hors modal mapping)
          const MAPPING_FIELDS = [...MAPPING_FIELDS_STANDARDS,{v:'custom1',l:'Champ perso 1 (legacy)'},{v:'custom2',l:'Champ perso 2 (legacy)'},{v:'skip',l:'Ignorer'}];
          const STATUS_COLORS = {new:'#3B82F6',queued:'#F59E0B',assigned:'#22C55E',converted:'#7C3AED',archived:'#64748B',unassigned:'#EF4444',duplicate:'#EF4444',error:'#EF4444'};
          const STATUS_LABELS = {new:'Nouveau',queued:'En queue',assigned:'Assigne',converted:'Converti',archived:'Archive',unassigned:'Desassigne',duplicate:'Doublon',error:'Erreur'};
          const HISTORY_LABELS = {import:'Import',dispatched:'Distribution',dispatch_batch:'Distribution lot',source_created:'Source creee',envelope_created:'Campagne creee',lead_deleted:'Lead supprime'};
          const DISPATCH_MODE_LABELS = {percentage:'Repartition fixe (%)',ai:'Intelligent (bientot)',hybrid:'Intelligent (bientot)',manual:'Distribution egale'};
          const DISPATCH_MODE_COLORS = {percentage:'#3B82F6',ai:'#8B5CF6',hybrid:'#F59E0B',manual:'#22C55E'};
          const SCORE_FIELDS = [{k:'score_calls',l:'Appels',c:'#3B82F6'},{k:'score_conversion',l:'Conversion',c:'#22C55E'},{k:'score_speed',l:'Rapidite',c:'#F59E0B'},{k:'score_capacity',l:'Capacite',c:'#8B5CF6'},{k:'score_quality',l:'Qualite',c:'#EC4899'}];

          // ─── V6 HELPERS ───
          const timeAgo = (iso) => {
            if(!iso) return '';
            const diff = Date.now() - new Date(iso).getTime();
            if(diff<0) return 'dans '+timeUntil(iso);
            const m=Math.floor(diff/60000), h=Math.floor(m/60), d=Math.floor(h/24);
            if(d>0) return 'il y a '+d+'j';
            if(h>0) return 'il y a '+h+'h'+String(m%60).padStart(2,'0');
            if(m>0) return 'il y a '+m+' min';
            return "a l'instant";
          };
          const timeUntil = (iso) => {
            if(!iso) return '';
            const diff = new Date(iso).getTime() - Date.now();
            if(diff<=0) return 'maintenant';
            const m=Math.floor(diff/60000), h=Math.floor(m/60);
            if(h>0) return h+'h'+String(m%60).padStart(2,'0');
            return m+' min';
          };
          const getEnvBorderColor = (env) => {
            const err = env.leadCounts?.error || env.leadCounts?.duplicate || 0;
            const pending = (env.leadCounts?.new||0) + (env.leadCounts?.queued||0) + (env.leadCounts?.unassigned||0);
            if(err>0) return '#EF4444';
            if(pending>0) return '#F59E0B';
            if(env.totalLeads>0 && pending===0) return '#22C55E';
            return T.border;
          };
          const getFluxStatus = (env) => {
            if(!env.auto_dispatch) return {label:'Manuel',color:'#F59E0B',dot:'#F59E0B'};
            if(env.dispatch_end_date && new Date().toISOString().slice(0,10) > env.dispatch_end_date) return {label:'Termine',color:'#94A3B8',dot:'#94A3B8'};
            // V5-Supervision: detecter blocage et retard
            const envLeads = incoming.filter(l => l.envelope_id === env.id && ['new','queued'].includes(l.status));
            if (envLeads.length > 0 && env.auto_dispatch) {
              if (!env.last_dispatch_at) return {label:'Bloque',color:'#EF4444',dot:'#EF4444'};
              const minsSince = (Date.now() - new Date(env.last_dispatch_at).getTime()) / 60000;
              const expected = env.dispatch_interval_minutes || (env.dispatch_type==='hourly'?60:env.dispatch_type==='daily'?1440:30);
              if (minsSince > expected * 2) return {label:'Bloque',color:'#EF4444',dot:'#EF4444'};
              if (minsSince > expected * 1.2) return {label:'Retard',color:'#F59E0B',dot:'#F59E0B'};
            }
            return {label:'Actif',color:'#22C55E',dot:'#22C55E'};
          };
          const getModeLabel = (env) => {
            if(env.dispatch_mode==='manual') return 'Round-robin';
            if(env.dispatch_mode==='percentage') return 'Repartition %';
            if(env.dispatch_mode==='ai') return 'Intelligent IA';
            if(env.dispatch_mode==='hybrid') return 'Hybride';
            return env.dispatch_mode||'Manuel';
          };

          // ─── VIEW STATE: grille vs detail ───
          const [detailEnvId, setDetailEnvId] = useState(null);
          const [detailPage, setDetailPage] = useState(0);
          const DETAIL_PAGE_SIZE = 50;
          const [detailFilter, setDetailFilter] = useState('');
          const [detailDateRange, setDetailDateRange] = useState('all');
          const [detailCustomStart, setDetailCustomStart] = useState('');
          const [detailCustomEnd, setDetailCustomEnd] = useState('');
          // ─── WIZARD STATE ───
          const [wizardStep, setWizardStep] = useState(0);

          if(loading) return <div style={{padding:40,textAlign:'center'}}><I n="loader" s={24} style={{animation:'spin 1s linear infinite'}}/> Chargement...</div>;

          return <div style={{position:'relative'}}>
            {/* ═══ HEADER HERO ═══ */}
            {!detailEnvId && <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h1 style={{fontSize:24,fontWeight:800,color:T.text,letterSpacing:'-0.02em'}}>Centre de leads</h1>
              <div style={{display:'flex',gap:8}}>
                <Btn primary onClick={()=>{setEditEnvId(null);setWizardStep(0);setNewEnvelope({name:'',color:DEFAULT_ENVELOPE_COLOR,icon:DEFAULT_ENVELOPE_ICON,priority:DEFAULT_ENVELOPE_PRIORITY,dispatch_type:'manual',dispatch_mode:'percentage',dispatch_time:'09:00',dispatch_limit:0,auto_dispatch:false,dispatch_start_date:'',dispatch_end_date:'',dispatch_interval_minutes:0,_collabs:(collabs||[]).map(c=>({id:c.id,name:c.name,color:c.color,checked:false,percentage:0,maxDaily:0}))});setShowAddEnvelope(true);}} style={{background:'linear-gradient(135deg,#22C55E,#16A34A)',border:'none',boxShadow:'0 2px 8px #22C55E40'}}><I n="plus" s={14}/> Nouveau flux</Btn>
                <Btn onClick={()=>setShowImport('csv')}><I n="upload" s={13}/> Import CSV</Btn>
                <Btn onClick={()=>setShowImport('gsheet')}><I n="file-spreadsheet" s={13}/> Connecter Sheet</Btn>
              </div>
            </div>

            {/* ─── 4 KPI CARDS ─── */}
            {(()=>{
              const totalReceived = envelopes.reduce((s,e)=>s+(e.totalLeads||0),0);
              const totalAssigned = envelopes.reduce((s,e)=>s+(e.leadCounts?.assigned||0),0);
              const totalPending = envelopes.reduce((s,e)=>s+(e.leadCounts?.new||0)+(e.leadCounts?.queued||0)+(e.leadCounts?.unassigned||0),0);
              const totalErrors = envelopes.reduce((s,e)=>s+(e.leadCounts?.error||0)+(e.leadCounts?.duplicate||0),0);
              const kpis = [
                {label:'Recus',value:totalReceived,icon:'inbox',color:'#3B82F6'},
                {label:'Distribues',value:totalAssigned,icon:'check-circle',color:'#22C55E'},
                {label:'En attente',value:totalPending,icon:'clock',color:'#F59E0B'},
                {label:'Erreurs',value:totalErrors,icon:'alert-triangle',color:'#EF4444'},
              ];
              return <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
                {kpis.map(k=><div key={k.label} style={{background:T.card,borderRadius:12,padding:'16px 20px',border:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:14}}>
                  <div style={{width:42,height:42,borderRadius:10,background:k.color+'14',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={k.icon} s={20} style={{color:k.color}}/></div>
                  <div>
                    <div style={{fontSize:26,fontWeight:800,color:T.text,letterSpacing:'-0.02em'}}>{k.value}</div>
                    <div style={{fontSize:12,color:T.text2,fontWeight:500}}>{k.label}</div>
                  </div>
                </div>)}
              </div>;
            })()}

            {/* ═══ V5-SUPERVISION : Alertes + Vue Collabs (admin only) ═══ */}
            {isAdmin && supervision && (()=>{
              const { collabStats, risques, anomalies } = supervision;
              const totalAlerts = (risques?.rdvNonQualifies?.length||0) + (risques?.nrpCritiques?.length||0) + (risques?.inactifs?.length||0) + (anomalies?.length||0);
              // Leads bloqués = en attente > 30 min sans dispatch recent
              const blockedEnvs = envelopes.filter(env => {
                if (!env.auto_dispatch || env.dispatch_type === 'manual') return false;
                const pending = incoming.filter(l => l.envelope_id === env.id && ['new','queued'].includes(l.status)).length;
                if (pending === 0) return false;
                if (!env.last_dispatch_at) return true; // jamais dispatché avec des leads en attente
                const minsSinceLast = (Date.now() - new Date(env.last_dispatch_at).getTime()) / 60000;
                const expectedInterval = env.dispatch_interval_minutes || (env.dispatch_type === 'hourly' ? 60 : env.dispatch_type === 'daily' ? 1440 : 30);
                return minsSinceLast > expectedInterval * 1.5; // retard > 50%
              });
              if (totalAlerts === 0 && blockedEnvs.length === 0 && (!collabStats || collabStats.length === 0)) return null;
              return <div style={{marginBottom:20}}>
                {/* ALERTES */}
                {(totalAlerts > 0 || blockedEnvs.length > 0) && <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:16,marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    <div style={{width:28,height:28,borderRadius:8,background:'#EF444415',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="alert-triangle" s={14} style={{color:'#EF4444'}}/></div>
                    <span style={{fontSize:14,fontWeight:700,color:T.text}}>Alertes systeme</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:'#EF444415',color:'#EF4444',fontWeight:700}}>{totalAlerts + blockedEnvs.length}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {blockedEnvs.map(env => <div key={'b'+env.id} style={{padding:'8px 12px',borderRadius:8,background:'#EF444408',border:'1px solid #EF444420',display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:'#EF4444',animation:'pulse 2s infinite'}}/>
                      <span style={{fontSize:12,fontWeight:600,color:'#EF4444'}}>Flux bloque</span>
                      <span style={{fontSize:12,color:T.text}}>"{env.name}" — leads en attente mais aucun dispatch recent</span>
                      <Btn onClick={()=>{setShowDistribPopup(env.id);}} style={{fontSize:10,marginLeft:'auto',padding:'4px 10px',background:'#EF444415',color:'#EF4444',border:'1px solid #EF444430'}}>Forcer</Btn>
                    </div>)}
                    {risques?.rdvNonQualifies?.slice(0,3).map(ct => <div key={'r'+ct.id} style={{padding:'8px 12px',borderRadius:8,background:'#F59E0B08',border:'1px solid #F59E0B20',display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <I n="calendar-x" s={13} style={{color:'#F59E0B'}}/>
                      <span style={{fontWeight:600,color:'#F59E0B'}}>RDV non qualifie</span>
                      <span style={{color:T.text}}>{ct.name} — RDV du {ct.next_rdv_date?.slice(0,10)}</span>
                    </div>)}
                    {risques?.nrpCritiques?.slice(0,3).map(ct => <div key={'n'+ct.id} style={{padding:'8px 12px',borderRadius:8,background:'#EF444408',border:'1px solid #EF444420',display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <I n="phone-missed" s={13} style={{color:'#EF4444'}}/>
                      <span style={{fontWeight:600,color:'#EF4444'}}>NRP critique (5+ relances)</span>
                      <span style={{color:T.text}}>{ct.name}</span>
                    </div>)}
                    {risques?.inactifs?.slice(0,3).map(ct => <div key={'i'+ct.id} style={{padding:'8px 12px',borderRadius:8,background:'#6B728008',border:'1px solid #6B728020',display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <I n="clock" s={13} style={{color:'#6B7280'}}/>
                      <span style={{fontWeight:600,color:'#6B7280'}}>Inactif 14j+</span>
                      <span style={{color:T.text}}>{ct.name}</span>
                    </div>)}
                    {anomalies?.slice(0,3).map((a,i) => <div key={'a'+i} style={{padding:'8px 12px',borderRadius:8,background:'#7C3AED08',border:'1px solid #7C3AED20',display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <I n="shield" s={13} style={{color:'#7C3AED'}}/>
                      <span style={{fontWeight:600,color:'#7C3AED'}}>{a.type?.replace(/_/g,' ')}</span>
                      <span style={{color:T.text2,fontSize:11}}>{a.detail?.slice(0,60)}</span>
                      <span style={{color:T.text3,fontSize:10,marginLeft:'auto'}}>{a.createdAt?.slice(0,16)?.replace('T',' ')}</span>
                    </div>)}
                  </div>
                </div>}

                {/* VUE COLLABORATEURS */}
                {collabStats && collabStats.length > 0 && <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:'20px 22px',marginBottom:16}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#3B82F6,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #3B82F630'}}><I n="users" s={15} style={{color:'#fff'}}/></div>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:T.text}}>Equipe</div>
                      <div style={{fontSize:11,color:T.text3}}>{collabStats.length} collaborateur{collabStats.length>1?'s':''} — charge leads</div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>
                    {collabStats.map(c => {
                      const charge = c.urgentActions > 3 ? 'surcharge' : c.actionsCount === 0 ? 'libre' : 'equilibre';
                      const chargeColor = charge === 'surcharge' ? '#EF4444' : charge === 'libre' ? '#6B7280' : '#22C55E';
                      const chargeLabel = charge === 'surcharge' ? 'Surcharge' : charge === 'libre' ? 'Libre' : 'OK';
                      const chargeIcon = charge === 'surcharge' ? 'alert-triangle' : charge === 'libre' ? 'coffee' : 'check-circle';
                      return <div key={c.id} style={{padding:'16px 18px',borderRadius:14,border:`1.5px solid ${c.color||T.border}25`,background:T.card,boxShadow:'0 2px 8px '+((c.color||'#3B82F6')+'10'),transition:'all .2s'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px '+((c.color||'#3B82F6')+'20');e.currentTarget.style.transform='translateY(-2px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px '+((c.color||'#3B82F6')+'10');e.currentTarget.style.transform='none';}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                          <div style={{width:36,height:36,borderRadius:10,background:(c.color||'#3B82F6')+'15',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:14,color:c.color||'#3B82F6'}}>{(c.name||'?')[0]}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:700,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                            <div style={{fontSize:10,color:T.text3}}>{c.role||'member'}</div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,background:chargeColor+'12',border:`1px solid ${chargeColor}25`}}>
                            <I n={chargeIcon} s={12} style={{color:chargeColor}}/>
                            <span style={{fontSize:10,fontWeight:700,color:chargeColor}}>{chargeLabel}</span>
                          </div>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                          <div style={{padding:'8px 10px',borderRadius:8,background:T.bg,textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:T.text}}>{c.totalContacts}</div>
                            <div style={{fontSize:10,color:T.text3,fontWeight:500}}>Contacts</div>
                          </div>
                          <div style={{padding:'8px 10px',borderRadius:8,background:T.bg,textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:c.avgScore>60?'#22C55E':c.avgScore>30?'#F59E0B':'#EF4444'}}>{c.avgScore}</div>
                            <div style={{fontSize:10,color:T.text3,fontWeight:500}}>Score</div>
                          </div>
                          <div style={{padding:'8px 10px',borderRadius:8,background:c.urgentActions>0?'#EF444408':T.bg,textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:c.urgentActions>0?'#EF4444':T.text}}>{c.actionsCount}{c.urgentActions>0?<span style={{fontSize:11,color:'#EF4444'}}> ({c.urgentActions}!)</span>:''}</div>
                            <div style={{fontSize:10,color:T.text3,fontWeight:500}}>Actions</div>
                          </div>
                          <div style={{padding:'8px 10px',borderRadius:8,background:T.bg,textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:T.text}}>{c.validCalls}</div>
                            <div style={{fontSize:10,color:T.text3,fontWeight:500}}>Appels 30j</div>
                          </div>
                        </div>
                      </div>;
                    })}
                  </div>
                </div>}
              </div>;
            })()}

            {/* ═══ GRILLE DE FLUX (cartes visuelles) ═══ */}
            {envelopes.length===0 && <div style={{textAlign:'center',padding:40,color:T.text2}}>
              <I n="inbox" s={40} style={{color:T.text2,opacity:.3,marginBottom:12}}/>
              <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>Aucun flux configure</div>
              <div style={{fontSize:13,marginBottom:16}}>Creez votre premier flux pour commencer a recevoir et distribuer des leads.</div>
              <Btn onClick={()=>{setEditEnvId(null);setWizardStep(0);setNewEnvelope({name:'',color:DEFAULT_ENVELOPE_COLOR,icon:DEFAULT_ENVELOPE_ICON,priority:DEFAULT_ENVELOPE_PRIORITY,dispatch_type:'manual',dispatch_mode:'percentage',dispatch_time:'09:00',dispatch_limit:0,auto_dispatch:false,dispatch_start_date:'',dispatch_end_date:'',dispatch_interval_minutes:0,_collabs:(collabs||[]).map(c=>({id:c.id,name:c.name,color:c.color,checked:false,percentage:0,maxDaily:0}))});setShowAddEnvelope(true);}} style={{background:'linear-gradient(135deg,#22C55E,#16A34A)',color:'#fff',fontWeight:700,border:'none'}}><I n="plus" s={14}/> Creer un flux</Btn>
            </div>}

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:16}}>
            {envelopes.map(env=>{
              const status = getFluxStatus(env);
              const assigned = env.leadCounts?.assigned||0;
              const pending = (env.leadCounts?.new||0)+(env.leadCounts?.queued||0)+(env.leadCounts?.unassigned||0);
              const total = env.totalLeads||0;
              const pct = total>0?Math.round(assigned/total*100):0;
              const borderColor = getEnvBorderColor(env);
              const isLive = env.source_sync_mode==='live' && env.source_last_sync && (Date.now()-new Date(env.source_last_sync).getTime()<7200000);
              const recentNewLeads = env.leadCounts?.new||0;

              // Per-collab bars
              const rulesForCard = env.rules||[];
              const maxAssigned = Math.max(1,...rulesForCard.map(r=>r.assigned_count||0));
              const totalAssignedEnv = rulesForCard.reduce((s,r)=>s+(r.assigned_count||0),0);
              const avgAssigned = rulesForCard.length>0?totalAssignedEnv/rulesForCard.length:0;

              const envPriority = resolveEnvelopePriority(env.priority);
              const envColor = env.color || DEFAULT_ENVELOPE_COLOR;
              const envIcon = resolveEnvelopeIcon(env.icon);
              return <div key={env.id} style={{background:T.card,borderRadius:14,border:`2px solid ${borderColor}`,padding:20,position:'relative',transition:'border-color .2s'}}>
                {/* LIGNE 1 — Header */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:status.dot,boxShadow:`0 0 6px ${status.dot}60`}}/>
                  <div title={`Identité : ${envPriority.label}`} style={{width:28,height:28,borderRadius:8,background:envColor,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                    <I n={envIcon} s={14}/>
                  </div>
                  <span style={{fontSize:17,fontWeight:800,color:T.text,flex:1}}>{env.name}</span>
                  {env.priority==='high' && <span title="Priorité haute" style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6,background:envPriority.accent,color:envPriority.color,border:`1px solid ${envPriority.color}40`}}>HAUTE</span>}
                  <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:6,background:(env.source_type==='gsheet'?'#34D399':'#3B82F6')+'18',color:env.source_type==='gsheet'?'#059669':'#2563EB'}}>{env.source_type==='gsheet'?'Google Sheet':'CSV'}</span>
                  <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:6,background:DISPATCH_MODE_COLORS[env.dispatch_mode||'percentage']+'18',color:DISPATCH_MODE_COLORS[env.dispatch_mode||'percentage']}}>{getModeLabel(env)}</span>
                </div>

                {/* LIGNE 2 — 3 chiffres DOMINANTS */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14,textAlign:'center'}}>
                  <div><div style={{fontSize:28,fontWeight:800,color:'#3B82F6'}}>{total}</div><div style={{fontSize:11,color:T.text2}}>Recus</div></div>
                  <div><div style={{fontSize:28,fontWeight:800,color:'#22C55E'}}>{assigned}</div><div style={{fontSize:11,color:T.text2}}>Distribues</div></div>
                  <div><div style={{fontSize:28,fontWeight:800,color:pending>0?'#F59E0B':'#94A3B8'}}>{pending}</div><div style={{fontSize:11,color:T.text2}}>Restants</div></div>
                </div>

                {/* LIGNE 3 — Barre de progression */}
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:T.text2,marginBottom:4}}><span>{pct}% distribue</span><span>{assigned}/{total}</span></div>
                  <div style={{height:8,borderRadius:4,background:T.bg,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:4,background:'linear-gradient(90deg,#22C55E,#16A34A)',width:Math.min(pct,100)+'%',transition:'width .3s'}}/>
                  </div>
                </div>

                {/* LIGNE 4 — Repartition par collaborateur */}
                {rulesForCard.length>0 && <div style={{marginBottom:14}}>
                  {rulesForCard.map(r=>{
                    const cnt = r.assigned_count||0;
                    const barW = maxAssigned>0?Math.round(cnt/maxAssigned*100):0;
                    const isUnbalanced = avgAssigned>0 && Math.abs(cnt-avgAssigned)/avgAssigned>0.15;
                    return <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <span style={{width:80,fontSize:12,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.collaborator_name||'?'}</span>
                      <div style={{flex:1,height:12,borderRadius:3,background:T.bg,overflow:'hidden',position:'relative'}}>
                        <div style={{height:'100%',borderRadius:3,background:r.collaborator_color||'#3B82F6',width:barW+'%',transition:'width .3s'}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:T.text,minWidth:28,textAlign:'right'}}>{cnt}</span>
                      {isUnbalanced && <span title="Desequilibre de repartition" style={{fontSize:11,color:'#F59E0B'}}>⚠</span>}
                    </div>;
                  })}
                </div>}

                {/* LIGNE 5 — Timeline + Mode dispatch */}
                <div style={{display:'flex',gap:10,fontSize:11,color:T.text2,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
                  {(()=>{
                    const modeLabels = { immediate:'Immediat', on_import:'Immediat', manual:'Manuel', hourly:'Toutes les heures', daily:'Quotidien', interval:'Intervalle' };
                    const modeColors = { immediate:'#22C55E', on_import:'#22C55E', manual:'#6B7280', hourly:'#3B82F6', daily:'#7C3AED', interval:'#F59E0B' };
                    const mode = env.dispatch_type || 'manual';
                    const mc = modeColors[mode] || '#6B7280';
                    return <>
                      <span style={{padding:'2px 8px',borderRadius:6,background:mc+'15',color:mc,fontWeight:700,fontSize:10}}>
                        {modeLabels[mode]||mode}{mode==='interval'&&env.dispatch_interval_minutes?' ('+env.dispatch_interval_minutes+'min)':''}
                        {mode==='daily'&&env.dispatch_time?' a '+env.dispatch_time:''}
                      </span>
                      {env.dispatch_limit>0 && <span style={{padding:'2px 6px',borderRadius:6,background:'#0EA5E915',color:'#0EA5E9',fontWeight:700,fontSize:10}}>{env.dispatch_limit} leads/cycle</span>}
                      {!env.dispatch_limit && mode!=='manual' && <span style={{padding:'2px 6px',borderRadius:6,background:'#22C55E10',color:'#22C55E',fontWeight:600,fontSize:10}}>Full</span>}
                      {env.last_dispatch_at && <span>Dernier : {timeAgo(env.last_dispatch_at)}</span>}
                      {env.last_dispatch_at && env.dispatch_interval_minutes>0 && <span style={{color:'#F59E0B',fontWeight:600}}>Prochain : {timeUntil(new Date(new Date(env.last_dispatch_at).getTime()+env.dispatch_interval_minutes*60000).toISOString())}</span>}
                      {!env.last_dispatch_at && <span style={{fontStyle:'italic'}}>Jamais distribue</span>}
                      {pending>0 && <span style={{padding:'2px 6px',borderRadius:6,background:'#F59E0B15',color:'#F59E0B',fontWeight:600}}>{pending} en attente</span>}
                    </>;
                  })()}
                </div>

                {/* LIGNE 6 — Badge flux vivant */}
                {isLive && recentNewLeads>0 && <div style={{marginBottom:10,display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:8,background:'#3B82F614',fontSize:11,fontWeight:600,color:'#3B82F6',animation:'pulse 2s ease-in-out infinite'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:'#3B82F6'}}/>
                  {recentNewLeads} nouveau{recentNewLeads>1?'x':''} lead{recentNewLeads>1?'s':''} recemment
                </div>}

                {/* LIGNE 7 — Actions */}
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  <Btn onClick={()=>{const batchSize=env.dispatch_limit||pending;setShowDistribPopup(env.id);setDistribForm({mode:env.dispatch_limit?'choose':'all',count:Math.min(batchSize,pending),dispatchMode:env.dispatch_mode||'percentage'});}} disabled={(typeof dispatchLoading!=='undefined'?dispatchLoading:null)||pending===0} style={{flex:1,background:pending>0?'linear-gradient(135deg,#22C55E,#0EA5E9)':'#94A3B820',color:pending>0?'#fff':'#94A3B8',fontWeight:700,fontSize:14,border:'none',boxShadow:pending>0?'0 2px 10px #22C55E30':'none',cursor:pending>0?'pointer':'not-allowed'}}>
                    {(typeof dispatchLoading!=='undefined'?dispatchLoading:null)?<I n="loader" s={14} style={{animation:'spin 1s linear infinite'}}/>:<I n="rocket" s={14}/>} Distribuer ({pending})
                  </Btn>
                  <Btn onClick={()=>{setDetailEnvId(env.id);setDetailPage(0);setDetailFilter('');setStatusFilter('');}} style={{fontSize:12}}><I n="list" s={13}/> Detail</Btn>
                  <Btn onClick={()=>{
                    const existingRules = env.rules||[];
                    setEditEnvId(env.id);setWizardStep(0);
                    setNewEnvelope({
                      name:env.name,
                      color:env.color||DEFAULT_ENVELOPE_COLOR,
                      icon:resolveEnvelopeIcon(env.icon),
                      priority:env.priority||DEFAULT_ENVELOPE_PRIORITY,
                      dispatch_type:env.dispatch_type||'manual', dispatch_mode:env.dispatch_mode||'percentage',
                      dispatch_time:env.dispatch_time||'09:00', dispatch_limit:env.dispatch_limit||0,
                      auto_dispatch:!!env.auto_dispatch, dispatch_start_date:env.dispatch_start_date||'',
                      dispatch_end_date:env.dispatch_end_date||'', dispatch_interval_minutes:env.dispatch_interval_minutes||0,
                      _collabs:(collabs||[]).map(c=>{
                        const er=existingRules.find(r=>r.collaborator_id===c.id);
                        return {id:c.id,name:c.name,color:c.color,checked:!!er,percentage:er?.percentage||0,maxDaily:er?.max_daily||0,ruleId:er?.id||null};
                      })
                    });
                    setShowAddEnvelope(true);
                  }} style={{fontSize:12}}><I n="settings" s={13}/></Btn>
                  <Btn onClick={()=>requestDeleteEnvelope(env)} style={{fontSize:12,color:'#EF4444',borderColor:'#EF444430'}} title="Supprimer ce flux et ses leads"><I n="trash-2" s={13}/></Btn>
                </div>
              </div>;
            })}
            </div>
            </div>}

            {/* ═══ VUE DETAIL (quand on clique Detail sur une carte) ═══ */}
            {detailEnvId && (()=>{
              const env = envelopes.find(e=>e.id===detailEnvId);
              if(!env) { setDetailEnvId(null); return null; }
              const status = getFluxStatus(env);
              const rulesD = env.rules||[];

              // ─── DATE RANGE FILTERING ───
              const now = new Date();
              const todayStr = now.toISOString().slice(0,10);
              const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1); const weekStr = weekStart.toISOString().slice(0,10);
              const monthStr = todayStr.slice(0,7)+'-01';

              const dateRangeLabel = detailDateRange==='today'?'Aujourd\'hui':detailDateRange==='week'?'Cette semaine':detailDateRange==='month'?'Ce mois':detailDateRange==='custom'?'Periode':'Tout';
              const getDateBounds = () => {
                if(detailDateRange==='today') return [todayStr, todayStr+'T23:59:59'];
                if(detailDateRange==='week') return [weekStr, todayStr+'T23:59:59'];
                if(detailDateRange==='month') return [monthStr, todayStr+'T23:59:59'];
                if(detailDateRange==='custom' && detailCustomStart) return [detailCustomStart, (detailCustomEnd||todayStr)+'T23:59:59'];
                return [null, null];
              };
              const [dateStart, dateEnd] = getDateBounds();

              // All leads in this envelope
              const allEnvLeads = incoming.filter(l=>l.envelope_id===(typeof detailEnvId!=='undefined'?detailEnvId:null));
              // Date-filtered leads
              const envLeads = dateStart ? allEnvLeads.filter(l=>{const d=l.created_at||'';return d>=dateStart&&d<=dateEnd;}) : allEnvLeads;

              // Stats sur la période
              const pRecus = envLeads.length;
              const pAssigned = envLeads.filter(l=>l.status==='assigned').length;
              const pPending = envLeads.filter(l=>['new','queued','unassigned'].includes(l.status)).length;
              const pTaux = pRecus>0?Math.round(pAssigned/pRecus*100):0;

              // Stats par collab sur la période
              const collabStats = {};
              envLeads.filter(l=>l.assigned_to&&l.status==='assigned').forEach(l=>{
                if(!collabStats[l.assigned_to]) {
                  const c = (collabs||[]).find(x=>x.id===l.assigned_to);
                  collabStats[l.assigned_to] = { name:c?.name||l.assigned_to, color:c?.color||'#64748B', count:0 };
                }
                collabStats[l.assigned_to].count++;
              });
              const collabStatsArr = Object.values(collabStats).sort((a,b)=>b.count-a.count);
              const maxCollabCount = Math.max(1,...collabStatsArr.map(c=>c.count));

              // Jour avec le plus de leads
              const dayMap = {};
              envLeads.forEach(l=>{const d=(l.created_at||'').slice(0,10);if(d){dayMap[d]=(dayMap[d]||0)+1;}});
              const dayEntries = Object.entries(dayMap).sort((a,b)=>b[1]-a[1]);
              const peakDay = dayEntries[0];
              const daysInPeriod = dateStart ? Math.max(1, Math.ceil((new Date(dateEnd)-new Date(dateStart))/86400000)) : Math.max(1, dayEntries.length);
              const avgPerDay = pRecus>0?(pRecus/daysInPeriod).toFixed(1):'0';

              // Status + date filter
              const filteredLeads = (typeof detailFilter!=='undefined'?detailFilter:null) ? envLeads.filter(l=>l.status===(typeof detailFilter!=='undefined'?detailFilter:null)) : envLeads;
              const pagedLeads = filteredLeads.slice((typeof detailPage!=='undefined'?detailPage:null)*DETAIL_PAGE_SIZE, ((typeof detailPage!=='undefined'?detailPage:null)+1)*DETAIL_PAGE_SIZE);
              const totalPages = Math.ceil(filteredLeads.length/DETAIL_PAGE_SIZE);

              const filterPills = [
                {id:'',label:'Tous',count:envLeads.length},
                {id:'assigned',label:'Distribues',count:envLeads.filter(l=>l.status==='assigned').length,color:'#22C55E'},
                {id:'queued',label:'En attente',count:envLeads.filter(l=>l.status==='queued').length,color:'#F59E0B'},
                {id:'new',label:'Nouveaux',count:envLeads.filter(l=>l.status==='new').length,color:'#3B82F6'},
                {id:'unassigned',label:'Desassignes',count:envLeads.filter(l=>l.status==='unassigned').length,color:'#EF4444'},
                {id:'duplicate',label:'Doublons',count:envLeads.filter(l=>l.status==='duplicate').length,color:'#EF4444'},
              ];

              return <div>
                {/* HEADER */}
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                  <Btn onClick={()=>setDetailEnvId(null)} style={{fontSize:12}}><I n="arrow-left" s={13}/> Retour</Btn>
                  <h2 style={{fontSize:20,fontWeight:800,color:T.text,flex:1}}>{env.name}</h2>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:status.dot}}/>
                    <span style={{fontSize:12,fontWeight:600,color:status.color}}>{status.label}</span>
                  </div>
                </div>

                {/* FILTRE PERIODE */}
                <div style={{display:'flex',gap:6,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
                  <I n="calendar" s={14} style={{color:T.text2}}/>
                  {[{id:'all',label:'Tout'},{id:'today',label:'Aujourd\'hui'},{id:'week',label:'Semaine'},{id:'month',label:'Mois'},{id:'custom',label:'Periode'}].map(p=>
                    <div key={p.id} onClick={()=>{(typeof setDetailDateRange==='function'?setDetailDateRange:function(){})(p.id);setDetailPage(0);}} style={{padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:detailDateRange===p.id?700:500,background:detailDateRange===p.id?T.accent+'15':T.bg,color:detailDateRange===p.id?T.accent:T.text2,border:`1px solid ${detailDateRange===p.id?T.accent+'40':T.border}`,transition:'all .15s'}}>{p.label}</div>
                  )}
                  {detailDateRange==='custom' && <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <input type="date" value={detailCustomStart} onChange={e=>{(typeof setDetailCustomStart==='function'?setDetailCustomStart:function(){})(e.target.value);setDetailPage(0);}} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:11,background:T.card,color:T.text}}/>
                    <span style={{fontSize:11,color:T.text2}}>au</span>
                    <input type="date" value={detailCustomEnd} onChange={e=>{(typeof setDetailCustomEnd==='function'?setDetailCustomEnd:function(){})(e.target.value);setDetailPage(0);}} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:11,background:T.card,color:T.text}}/>
                  </div>}
                  {(typeof detailDateRange!=='undefined'?detailDateRange:null)!=='all' && <span style={{fontSize:11,color:T.text2,marginLeft:4}}>{pRecus} lead{pRecus>1?'s':''} sur la periode</span>}
                </div>

                {/* STATS RAPIDES (dynamiques par période) */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
                  <div style={{background:T.card,borderRadius:10,padding:14,textAlign:'center',border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,fontWeight:800,color:'#3B82F6'}}>{pRecus}</div><div style={{fontSize:11,color:T.text2}}>Recus</div>
                  </div>
                  <div style={{background:T.card,borderRadius:10,padding:14,textAlign:'center',border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,fontWeight:800,color:'#22C55E'}}>{pAssigned}</div><div style={{fontSize:11,color:T.text2}}>Distribues</div>
                  </div>
                  <div style={{background:T.card,borderRadius:10,padding:14,textAlign:'center',border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,fontWeight:800,color:'#F59E0B'}}>{pPending}</div><div style={{fontSize:11,color:T.text2}}>En attente</div>
                  </div>
                  <div style={{background:T.card,borderRadius:10,padding:14,textAlign:'center',border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,fontWeight:800,color:pTaux>=80?'#22C55E':pTaux>=50?'#F59E0B':'#EF4444'}}>{pTaux}%</div><div style={{fontSize:11,color:T.text2}}>Taux distrib.</div>
                  </div>
                </div>

                {/* REPARTITION PAR COMMERCIAL (dynamique période) */}
                {collabStatsArr.length>0 && <div style={{background:T.card,borderRadius:10,padding:14,marginBottom:16,border:`1px solid ${T.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:T.text}}>Repartition par commercial — {dateRangeLabel}</span>
                    <span style={{fontSize:11,color:T.text2}}>{avgPerDay} leads/jour moy.</span>
                  </div>
                  {collabStatsArr.map(c=>{
                    const pct = pAssigned>0?Math.round(c.count/pAssigned*100):0;
                    return <div key={c.name} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:c.color,flexShrink:0}}/>
                      <span style={{width:110,fontSize:12,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
                      <div style={{flex:1,height:12,borderRadius:4,background:T.bg,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:4,background:c.color,width:Math.round(c.count/maxCollabCount*100)+'%',transition:'width .3s'}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:800,minWidth:30,textAlign:'right',color:c.color}}>{c.count}</span>
                      <span style={{fontSize:10,color:T.text2,minWidth:32}}>({pct}%)</span>
                    </div>;
                  })}
                  {/* Stats résumé */}
                  <div style={{display:'flex',gap:12,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                    {peakDay && <div style={{fontSize:11,color:T.text2}}><I n="trending-up" s={11} style={{marginRight:3}}/> Pic : <b style={{color:T.text}}>{new Date(peakDay[0]).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</b> ({peakDay[1]} leads)</div>}
                    <div style={{fontSize:11,color:T.text2}}><I n="activity" s={11} style={{marginRight:3}}/> Moy : <b style={{color:T.text}}>{avgPerDay}/jour</b></div>
                    <div style={{fontSize:11,color:T.text2}}><I n="pie-chart" s={11} style={{marginRight:3}}/> Taux : <b style={{color:pTaux>=80?'#22C55E':pTaux>=50?'#F59E0B':'#EF4444'}}>{pTaux}%</b></div>
                  </div>
                </div>}
                {/* Fallback repartition si pas de stats par période mais rules existent */}
                {collabStatsArr.length===0 && rulesD.length>0 && <div style={{background:T.card,borderRadius:10,padding:14,marginBottom:16,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>Repartition</div>
                  {rulesD.map(r=>{
                    const cnt=r.assigned_count||0;
                    const maxA=Math.max(1,...rulesD.map(x=>x.assigned_count||0));
                    return <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <span style={{width:90,fontSize:12,fontWeight:600,color:T.text}}>{r.collaborator_name}</span>
                      <div style={{flex:1,height:10,borderRadius:3,background:T.bg,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:3,background:r.collaborator_color||'#3B82F6',width:maxA>0?Math.round(cnt/maxA*100)+'%':'0%'}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,minWidth:28,textAlign:'right'}}>{cnt}</span>
                    </div>;
                  })}
                </div>}

                {/* FILTRES VISUELS (pills) — recalcules par période */}
                <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
                  {filterPills.map(f=><div key={f.id} onClick={()=>{setDetailFilter(f.id);setDetailPage(0);}} style={{
                    padding:'6px 14px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:(typeof detailFilter!=='undefined'?detailFilter:null)===f.id?700:500,
                    background:(typeof detailFilter!=='undefined'?detailFilter:null)===f.id?(f.color||T.accent)+'18':T.bg,
                    color:(typeof detailFilter!=='undefined'?detailFilter:null)===f.id?(f.color||T.accent):T.text2,
                    border:`1px solid ${detailFilter===f.id?(f.color||T.accent)+'40':T.border}`,transition:'all .15s'
                  }}>{f.label} ({f.count})</div>)}
                </div>

                {/* BARRE ACTIONS BULK (au-dessus du tableau) */}
                {(typeof selectedBulk!=='undefined'?selectedBulk:{}).length>0 && <div style={{background:T.card,border:`2px solid ${T.accent}`,padding:'10px 16px',marginBottom:12,borderRadius:12,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',boxShadow:'0 4px 16px rgba(0,0,0,0.1)'}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>{(typeof selectedBulk!=='undefined'?selectedBulk:{}).length} selectionne{(typeof selectedBulk!=='undefined'?selectedBulk:{}).length>1?'s':''}</span>
                  {(typeof selectedBulk!=='undefined'?selectedBulk:{}).length < filteredLeads.length && <Btn onClick={()=>(typeof setSelectedBulk==='function'?setSelectedBulk:function(){})(filteredLeads.map(l=>l.id))} style={{fontSize:11,background:T.accent+'12',color:T.accent,border:`1px solid ${T.accent}30`}}><I n="check-square" s={11}/> Tout selectionner ({filteredLeads.length})</Btn>}
                  <Btn onClick={()=>{
                    if(!confirm('Desassigner '+(typeof selectedBulk!=='undefined'?selectedBulk:{}).length+' lead(s) ?\n\n• Les leads redeviennent disponibles\n• Les contacts non travailles sont retires du pipeline collab')) return;
                    api('/api/leads/incoming/bulk-unassign', { method:'POST', body:{ ids:(typeof selectedBulk!=='undefined'?selectedBulk:null), companyId:company.id } })
                      .then(r=>{
                        if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; }
                        pushNotification('Desassignation', r.unassigned+' leads desassignes'+(r.contactsRemoved>0?', '+r.contactsRemoved+' contacts retires':''), 'success');
                        setSelectedBulk([]); loadData();
                      })
                      .catch(()=>pushNotification('Erreur', 'Erreur de connexion', 'error'));
                  }} style={{fontSize:11,background:'#F59E0B18',color:'#D97706',border:'1px solid #F59E0B30',fontWeight:700}}><I n="user-minus" s={11}/> Desassigner</Btn>
                  <Btn onClick={()=>handleBulkStatus('archived')} style={{fontSize:11}}><I n="archive" s={11}/> Exclure</Btn>
                  <Btn onClick={handleBulkDelete} style={{fontSize:11,color:'#EF4444'}}><I n="trash-2" s={11}/> Supprimer</Btn>
                  <Btn onClick={()=>setSelectedBulk([])} style={{fontSize:11,color:T.text2}}><I n="x" s={11}/> Annuler</Btn>
                </div>}

                {/* LEGENDE COULEURS COLLABS */}
                {(()=>{
                  const assignedCollabIds = [...new Set(envLeads.filter(l=>l.assigned_to).map(l=>l.assigned_to))];
                  const legendCollabs = assignedCollabIds.map(id=>(collabs||[]).find(c=>c.id===id)).filter(Boolean);
                  return legendCollabs.length>0 ? <div style={{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.text2}}>Collabs :</span>
                    {legendCollabs.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:8,background:c.color+'15',border:`1px solid ${c.color}30`}}>
                      <span style={{width:10,height:10,borderRadius:'50%',background:c.color,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:c.color}}>{c.name}</span>
                    </div>)}
                  </div> : null;
                })()}

                {/* TABLEAU LEADS */}
                <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{background:T.bg}}>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>
                          <input type="checkbox" checked={(typeof selectedBulk!=='undefined'?selectedBulk:{}).length===filteredLeads.length && filteredLeads.length>0} onChange={e=>(typeof setSelectedBulk==='function'?setSelectedBulk:function(){})(e.target.checked?filteredLeads.map(l=>l.id):[])}/>
                        </th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Date</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Nom</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Tel</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Email</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Statut</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:700,fontSize:11,color:T.text2}}>Score</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,fontSize:11,color:T.text2}}>Collab</th>
                        <th style={{padding:'10px 12px',textAlign:'right',fontWeight:700,fontSize:11,color:T.text2}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLeads.map(lead=>{
                        const rowColors = {assigned:'#22C55E08',new:'#3B82F608',queued:'#F59E0B08',duplicate:'#EF444408',error:'#EF444408',archived:'#94A3B808'};
                        const sColor = STATUS_COLORS[lead.status]||'#94A3B8';
                        const assignedCollab = (collabs||[]).find(c=>c.id===lead.assigned_to);
                        const collabName = assignedCollab?.name||'';
                        const collabColor = assignedCollab?.color||'#94A3B8';
                        return <tr key={lead.id} style={{background:lead.assigned_to?collabColor+'30':rowColors[lead.status]||'transparent',borderLeft:lead.assigned_to?`4px solid ${collabColor}`:'4px solid transparent',borderBottom:`1px solid ${lead.assigned_to?collabColor+'40':T.border+'20'}`}}>
                          <td style={{padding:'8px 12px'}}><input type="checkbox" checked={(typeof selectedBulk!=='undefined'?selectedBulk:{}).includes(lead.id)} onChange={e=>(typeof setSelectedBulk==='function'?setSelectedBulk:function(){})(e.target.checked?[...selectedBulk,lead.id]:(typeof selectedBulk!=='undefined'?selectedBulk:{}).filter(x=>x!==lead.id))}/></td>
                          <td style={{padding:'8px 12px',fontSize:11,color:T.text2}}>{lead.created_at?.slice(0,10)}</td>
                          <td style={{padding:'8px 12px',fontWeight:600}}>{lead.assigned_to && <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:collabColor,marginRight:6,verticalAlign:'middle',boxShadow:`0 0 0 2px ${collabColor}30`}}/>}{[lead.first_name,lead.last_name].filter(Boolean).join(' ')||'-'}</td>
                          <td style={{padding:'8px 12px',fontSize:12}}>{lead.phone||'-'}</td>
                          <td style={{padding:'8px 12px',fontSize:12}}>{lead.email||'-'}</td>
                          <td style={{padding:'8px 12px'}}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:6,background:sColor+'18',color:sColor}}>{STATUS_LABELS[lead.status]||lead.status}</span></td>
                          <td style={{padding:'8px 12px',textAlign:'center'}}>{(()=>{const ct=(contacts||[]).find(c=>c.id===lead.contact_id);const s=ct?.lead_score||0;if(!s)return <span style={{color:T.text3,fontSize:10}}>-</span>;return <span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:6,background:s>60?'#22C55E15':s>30?'#F59E0B15':'#EF444415',color:s>60?'#22C55E':s>30?'#F59E0B':'#EF4444'}}>{s}</span>;})()}</td>
                          <td style={{padding:'8px 12px',fontSize:12,fontWeight:500}}>{collabName ? <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,borderRadius:'50%',background:collabColor,flexShrink:0,boxShadow:`0 0 0 2px ${collabColor}30`}}/><span style={{fontWeight:600,color:collabColor}}>{collabName}</span></span> : '-'}</td>
                          <td style={{padding:'8px 12px',textAlign:'right'}}>
                            <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                              {lead.status!=='assigned' && <Btn onClick={()=>{setShowManualDispatch((typeof detailEnvId!=='undefined'?detailEnvId:null));setManualDispatchForm({count:1,collaboratorIds:[],_leadIds:[lead.id]});}} style={{fontSize:10,padding:'3px 8px'}}><I n="send" s={11}/></Btn>}
                              <Btn onClick={()=>{if(confirm('Exclure ce lead ?')) api(`/api/leads/incoming/${lead.id}`,{method:'PUT',body:{status:'archived'}}).then(loadData);}} style={{fontSize:10,padding:'3px 8px'}}><I n="x" s={11}/></Btn>
                            </div>
                          </td>
                        </tr>;
                      })}
                      {pagedLeads.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:30,color:T.text2,fontSize:13}}>Aucun lead{(typeof detailFilter!=='undefined'?detailFilter:null)?' avec ce filtre':''}</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* PAGINATION */}
                {totalPages>1 && <div style={{display:'flex',justifyContent:'center',gap:4,marginTop:12}}>
                  <Btn onClick={()=>(typeof setDetailPage==='function'?setDetailPage:function(){})(Math.max(0,detailPage-1))} disabled={detailPage===0} style={{fontSize:11,padding:'4px 8px'}}><I n="chevron-left" s={12}/></Btn>
                  {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                    const p = totalPages<=7?i:(typeof detailPage!=='undefined'?detailPage:null)<3?i:detailPage>totalPages-4?totalPages-7+i:(typeof detailPage!=='undefined'?detailPage:null)-3+i;
                    return <Btn key={p} onClick={()=>(typeof setDetailPage==='function'?setDetailPage:function(){})(p)} style={{fontSize:11,padding:'4px 10px',fontWeight:detailPage===p?700:400,background:detailPage===p?T.accent+'15':'transparent',color:detailPage===p?T.accent:T.text2}}>{p+1}</Btn>;
                  })}
                  <Btn onClick={()=>(typeof setDetailPage==='function'?setDetailPage:function(){})(Math.min(totalPages-1,detailPage+1))} disabled={detailPage>=totalPages-1} style={{fontSize:11,padding:'4px 8px'}}><I n="chevron-right" s={12}/></Btn>
                </div>}

                {/* old bulk bar removed — now above table */}
              </div>;
            })()}

            {/* ═══ POPUP DISTRIBUTION ═══ */}
            {(typeof showDistribPopup!=='undefined'?showDistribPopup:null) && (()=>{
              const env = envelopes.find(e=>e.id===(typeof showDistribPopup!=='undefined'?showDistribPopup:null));
              if(!env) return null;
              const pendingCount = (env.leadCounts?.new||0)+(env.leadCounts?.queued||0)+(env.leadCounts?.unassigned||0);
              const directCollab = (typeof distribForm!=='undefined'?distribForm:{})._directCollabs||{}; // {collabId: count}
              const directTotal = Object.values(directCollab).reduce((s,v)=>s+(parseInt(v)||0),0);
              const finalCount = (typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct' ? directTotal : (typeof distribForm!=='undefined'?distribForm:{}).mode==='all' ? pendingCount : Math.min((typeof distribForm!=='undefined'?distribForm:{}).count, pendingCount);
              const rulesD = env.rules||[];
              const allCollabs = (collabs||[]).filter(c=>c.companyId===company.id && c.role!=='admin');
              return <Modal open={true} title="Distribuer les leads" onClose={()=>setShowDistribPopup(null)}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {/* Compteur */}
                  <div style={{background:T.bg,borderRadius:12,padding:16,textAlign:'center'}}>
                    <div style={{fontSize:32,fontWeight:800,color:'#22C55E'}}>{pendingCount}</div>
                    <div style={{fontSize:13,color:T.text2}}>leads en attente de distribution</div>
                  </div>

                  {/* Mode : Tous ou nombre choisi (hidden in direct mode) */}
                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode!=='direct' && <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>Combien distribuer ?</div>
                    <div style={{display:'flex',gap:8}}>
                      <div onClick={()=>(typeof setDistribForm==='function'?setDistribForm:function(){})(f=>({...f,mode:'all',count:pendingCount}))} style={{flex:1,padding:'12px 16px',borderRadius:10,border:`2px solid ${(typeof distribForm!=='undefined'?distribForm:{}).mode==='all'?'#22C55E':T.border}`,background:(typeof distribForm!=='undefined'?distribForm:{}).mode==='all'?'#22C55E08':T.card,cursor:'pointer',textAlign:'center'}}>
                        <div style={{fontSize:15,fontWeight:800,color:(typeof distribForm!=='undefined'?distribForm:{}).mode==='all'?'#22C55E':T.text}}>Tous ({pendingCount})</div>
                        <div style={{fontSize:11,color:T.text2}}>Distribuer tout</div>
                      </div>
                      <div onClick={()=>(typeof setDistribForm==='function'?setDistribForm:function(){})(f=>({...f,mode:'partial'}))} style={{flex:1,padding:'12px 16px',borderRadius:10,border:`2px solid ${(typeof distribForm!=='undefined'?distribForm:{}).mode==='partial'?'#3B82F6':T.border}`,background:(typeof distribForm!=='undefined'?distribForm:{}).mode==='partial'?'#3B82F608':T.card,cursor:'pointer',textAlign:'center'}}>
                        <div style={{fontSize:15,fontWeight:800,color:(typeof distribForm!=='undefined'?distribForm:{}).mode==='partial'?'#3B82F6':T.text}}>Choisir</div>
                        <div style={{fontSize:11,color:T.text2}}>Nombre precis</div>
                      </div>
                    </div>
                    {(typeof distribForm!=='undefined'?distribForm:{}).mode==='partial' && <div style={{marginTop:10}}>
                      <input type="number" min={1} max={pendingCount} value={(typeof distribForm!=='undefined'?distribForm:{}).count} onChange={e=>(typeof setDistribForm==='function'?setDistribForm:function(){})(f=>({...f,count:Math.min(parseInt(e.target.value)||1,pendingCount)}))} style={{width:'100%',padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:15,fontWeight:700,textAlign:'center',background:T.card,color:T.text}}/>
                      <div style={{fontSize:11,color:T.text2,textAlign:'center',marginTop:4}}>sur {pendingCount} disponibles</div>
                    </div>}
                  </div>}

                  {/* Mode de distribution */}
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>Mode de distribution</div>
                    <div style={{display:'flex',gap:6}}>
                      {[
                        {id:'manual',label:'Egal',desc:'Round-robin equitable',icon:'repeat',color:'#22C55E'},
                        {id:'percentage',label:'Pourcentage',desc:'Repartition configurable',icon:'pie-chart',color:'#3B82F6'},
                        {id:'ai',label:'Score IA',desc:'Selon performance commerciale',icon:'brain',color:'#8B5CF6'},
                        {id:'direct',label:'Direct',desc:'Choisir collab + nombre',icon:'user-check',color:'#F59E0B'},
                      ].map(m=><div key={m.id} onClick={()=>(typeof setDistribForm==='function'?setDistribForm:function(){})(f=>({...f,dispatchMode:m.id}))} style={{flex:1,padding:'10px 8px',borderRadius:10,border:`2px solid ${(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode===m.id?m.color:T.border}`,background:(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode===m.id?m.color+'08':T.card,cursor:'pointer',textAlign:'center'}}>
                        <I n={m.icon} s={18} style={{color:(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode===m.id?m.color:T.text2,marginBottom:4}}/>
                        <div style={{fontSize:12,fontWeight:700,color:(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode===m.id?m.color:T.text}}>{m.label}</div>
                        <div style={{fontSize:10,color:T.text2}}>{m.desc}</div>
                      </div>)}
                    </div>
                  </div>

                  {/* Mode Direct — selection collab + nombre */}
                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct' && <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>Choisir collaborateur(s) et nombre de leads</div>
                    {allCollabs.map(c=>{
                      const cnt = directCollab[c.id]||0;
                      const isSelected = cnt > 0;
                      return <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',marginBottom:6,borderRadius:10,background:isSelected?(c.color||'#F59E0B')+'12':T.bg,border:`1px solid ${isSelected?(c.color||'#F59E0B')+'40':T.border}`}}>
                        <div style={{width:12,height:12,borderRadius:'50%',background:c.color||'#64748B',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:13,fontWeight:600,color:isSelected?(c.color||T.text):T.text}}>{c.name}</span>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <Btn onClick={()=>setDistribForm(f=>({...f,_directCollabs:{...directCollab,[c.id]:Math.max(0,(parseInt(directCollab[c.id])||0)-1)}}))} style={{padding:'2px 8px',fontSize:12,fontWeight:700}}>-</Btn>
                          <input type="number" min={0} max={pendingCount} value={cnt} onChange={e=>setDistribForm(f=>({...f,_directCollabs:{...directCollab,[c.id]:Math.min(pendingCount,Math.max(0,parseInt(e.target.value)||0))}}))} style={{width:50,textAlign:'center',padding:'4px 6px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,fontWeight:700,background:T.card,color:T.text}}/>
                          <Btn onClick={()=>setDistribForm(f=>({...f,_directCollabs:{...directCollab,[c.id]:Math.min(pendingCount,(parseInt(directCollab[c.id])||0)+1)}}))} style={{padding:'2px 8px',fontSize:12,fontWeight:700}}>+</Btn>
                        </div>
                      </div>;
                    })}
                    {allCollabs.length===0 && <div style={{padding:10,borderRadius:8,background:'#FEF3C7',color:'#92400E',fontSize:12}}>Aucun collaborateur dans cette entreprise.</div>}
                    {directTotal>0 && <div style={{marginTop:8,fontSize:12,fontWeight:600,color:'#F59E0B',textAlign:'right'}}>{directTotal} lead{directTotal>1?'s':''} a distribuer sur {pendingCount} disponibles</div>}
                  </div>}

                  {/* Collaborateurs — mode Egal */}
                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='manual' && rulesD.length>0 && <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:6}}>Collaborateurs ({rulesD.length})</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {rulesD.map(r=><span key={r.id} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,background:(r.collaborator_color||'#64748B')+'14',fontSize:12,fontWeight:600}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:r.collaborator_color||'#64748B'}}/>
                        {r.collaborator_name}
                      </span>)}
                    </div>
                  </div>}

                  {/* Collaborateurs — mode Pourcentage (editable) */}
                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='percentage' && rulesD.length>0 && (()=>{
                    const pcts = (typeof distribForm!=='undefined'?distribForm:{})._pctOverrides||{};
                    const totalPct = rulesD.reduce((s,r)=>s+(parseInt(pcts[r.collaborator_id]??r.percentage)||0),0);
                    return <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                        <span style={{fontSize:12,fontWeight:700,color:T.text}}>Repartition par collaborateur</span>
                        <span style={{fontSize:11,fontWeight:700,color:totalPct===100?'#22C55E':'#EF4444'}}>Total : {totalPct}%</span>
                      </div>
                      {rulesD.map(r=>{
                        const pct = parseInt(pcts[r.collaborator_id]??r.percentage)||0;
                        const leadsForThis = Math.round(finalCount*pct/100);
                        return <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'8px 10px',borderRadius:8,background:(r.collaborator_color||'#3B82F6')+'10',border:`1px solid ${(r.collaborator_color||'#3B82F6')}25`}}>
                          <div style={{width:10,height:10,borderRadius:'50%',background:r.collaborator_color||'#3B82F6',flexShrink:0}}/>
                          <span style={{flex:1,fontSize:12,fontWeight:600}}>{r.collaborator_name}</span>
                          <input type="range" min={0} max={100} value={pct} onChange={e=>setDistribForm(f=>({...f,_pctOverrides:{...pcts,[r.collaborator_id]:parseInt(e.target.value)}}))} style={{width:80,accentColor:r.collaborator_color||'#3B82F6'}}/>
                          <input type="number" min={0} max={100} value={pct} onChange={e=>setDistribForm(f=>({...f,_pctOverrides:{...pcts,[r.collaborator_id]:Math.min(100,Math.max(0,parseInt(e.target.value)||0))}}))} style={{width:45,textAlign:'center',padding:'3px 4px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,fontWeight:700,background:T.card,color:T.text}}/>
                          <span style={{fontSize:11,color:T.text2,minWidth:24}}>%</span>
                          <span style={{fontSize:11,fontWeight:700,color:r.collaborator_color||'#3B82F6',minWidth:40,textAlign:'right'}}>{leadsForThis} lead{leadsForThis>1?'s':''}</span>
                        </div>;
                      })}
                      {totalPct!==100 && <div style={{padding:8,borderRadius:8,background:'#FEF3C7',color:'#92400E',fontSize:11,fontWeight:600,textAlign:'center'}}><I n="alert-triangle" s={12}/> Le total doit faire 100% (actuellement {totalPct}%)</div>}
                    </div>;
                  })()}

                  {/* Collaborateurs — mode Score IA (simulation) */}
                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='ai' && (()=>{
                    const sim = (typeof distribForm!=='undefined'?distribForm:{})._aiSimulation;
                    return <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                        <span style={{fontSize:12,fontWeight:700,color:T.text}}>Simulation Score IA</span>
                        <Btn onClick={()=>{
                          api('/api/leads/dispatch-simulate', {method:'POST', body:{companyId:company.id, envelope_id:env.id, count:finalCount}})
                            .then(r=>{
                              if(r?.error) { pushNotification('Erreur',r.error,'error'); return; }
                              setDistribForm(f=>({...f,_aiSimulation:r}));
                            });
                        }} style={{fontSize:11,background:'#8B5CF615',color:'#8B5CF6',border:'1px solid #8B5CF630',fontWeight:700}}><I n="brain" s={12}/> Simuler</Btn>
                      </div>
                      {!sim && <div style={{padding:16,borderRadius:10,background:T.bg,textAlign:'center',color:T.text2,fontSize:12}}>
                        <I n="brain" s={24} style={{color:'#8B5CF640',marginBottom:8,display:'block'}}/> Cliquez sur "Simuler" pour voir la repartition IA basee sur les scores de performance
                      </div>}
                      {sim && sim.simulation && <div>
                        <div style={{background:T.bg,borderRadius:8,padding:10,marginBottom:10,display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:11,color:T.text2}}>{sim.available} leads disponibles</span>
                          <span style={{fontSize:11,fontWeight:700,color:'#8B5CF6'}}>{sim.total_to_dispatch} a distribuer</span>
                        </div>
                        {sim.simulation.map((s,idx)=><div key={s.collaborator_id} style={{padding:'10px 12px',marginBottom:8,borderRadius:10,background:(s.color||'#8B5CF6')+'10',border:`1px solid ${(s.color||'#8B5CF6')}25`}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:16,fontWeight:800,color:T.text2,opacity:0.4}}>#{idx+1}</span>
                              <div style={{width:10,height:10,borderRadius:'50%',background:s.color||'#8B5CF6'}}/>
                              <span style={{fontSize:13,fontWeight:700,color:s.color||T.text}}>{s.name}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <span style={{fontSize:18,fontWeight:800,color:s.color||'#8B5CF6'}}>{s.leads_count}</span>
                              <span style={{fontSize:11,color:T.text2}}>leads ({s.percentage}%)</span>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#22C55E18',color:'#22C55E',fontWeight:600}}>Score: {s.score_global}/100</span>
                            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#3B82F618',color:'#3B82F6',fontWeight:600}}>Appels: {s.metrics.valid_calls}/{s.metrics.total_calls}</span>
                            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#F59E0B18',color:'#D97706',fontWeight:600}}>Qualite: {s.metrics.avg_quality}/10</span>
                            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#7C3AED18',color:'#7C3AED',fontWeight:600}}>Conversions: {s.metrics.conversions}</span>
                            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#EC489918',color:'#EC4899',fontWeight:600}}>Actifs: {s.metrics.active_leads}</span>
                          </div>
                          {/* Score bar */}
                          <div style={{marginTop:6,height:6,borderRadius:3,background:T.bg,overflow:'hidden'}}>
                            <div style={{height:'100%',borderRadius:3,background:s.color||'#8B5CF6',width:s.score_global+'%',transition:'width .3s'}}/>
                          </div>
                        </div>)}
                      </div>}
                    </div>;
                  })()}

                  {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode!=='direct' && (typeof distribForm!=='undefined'?distribForm:{}).dispatchMode!=='percentage' && (typeof distribForm!=='undefined'?distribForm:{}).dispatchMode!=='ai' && rulesD.length===0 && <div style={{padding:10,borderRadius:8,background:'#FEF3C7',color:'#92400E',fontSize:12,fontWeight:600}}>
                    <I n="alert-triangle" s={13}/> Aucun collaborateur configure. Allez dans ⚙️ pour ajouter des collaborateurs.
                  </div>}

                  {/* Resume + bouton */}
                  <div style={{background:T.bg,borderRadius:10,padding:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700}}>{finalCount} lead{finalCount>1?'s':''} → {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct' ? Object.entries(directCollab).filter(([,v])=>v>0).length : rulesD.length} collab{((typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct' ? Object.entries(directCollab).filter(([,v])=>v>0).length : rulesD.length)>1?'s':''}</div>
                      <div style={{fontSize:11,color:T.text2}}>Mode : {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='manual'?'Round-robin egal':(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='percentage'?'Repartition %':(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct'?'Attribution directe':'Score IA'}</div>
                      {(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct' && directTotal>0 && <div style={{fontSize:10,color:T.text2,marginTop:2}}>{Object.entries(directCollab).filter(([,v])=>v>0).map(([id,v])=>{const c=allCollabs.find(x=>x.id===id);return c?c.name+': '+v:null;}).filter(Boolean).join(' | ')}</div>}
                    </div>
                    <Btn onClick={()=>{
                      if((typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct') {
                        // Direct mode — dispatch to chosen collabs with specific counts
                        const entries = Object.entries(directCollab).filter(([,v])=>parseInt(v)>0);
                        if(entries.length===0) { pushNotification('Erreur','Selectionnez au moins un collaborateur','error'); return; }
                        setDispatchLoading(true);
                        api('/api/leads/dispatch-direct', { method:'POST', body:{ companyId:company.id, envelope_id:env.id, assignments:entries.map(([collabId,count])=>({collaborator_id:collabId,count:parseInt(count)})) } })
                          .then(r=>{
                            setDispatchLoading(false);
                            if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; }
                            const details = r.summary ? Object.entries(r.summary).map(([name,cnt])=>`${name}: ${cnt}`).join(', ') : '';
                            pushNotification('Distribution directe', (r.dispatched||0)+' leads distribues'+(details?' ('+details+')':''), 'success');
                            loadData();
                          })
                          .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
                        setShowDistribPopup(null);
                        return;
                      }
                      if(rulesD.length===0) return;
                      if((typeof distribForm!=='undefined'?distribForm:{}).dispatchMode !== env.dispatch_mode) {
                        api(`/api/leads/envelopes/${env.id}`, {method:'PUT', body:{dispatch_mode:(typeof distribForm!=='undefined'?distribForm:{}).dispatchMode}});
                      }
                      if((typeof distribForm!=='undefined'?distribForm:{}).mode==='all') {
                        handleDispatch(env.id);
                      } else {
                        setDispatchLoading(true);
                        api('/api/leads/dispatch-manual', { method:'POST', body:{ companyId:company.id, envelope_id:env.id, count:(typeof distribForm!=='undefined'?distribForm:{}).count, collaboratorIds:rulesD.map(r=>r.collaborator_id) } })
                          .then(r=>{
                            setDispatchLoading(false);
                            if(r?.error) { pushNotification('Erreur', r.error, 'error'); return; }
                            const details = r.summary ? Object.entries(r.summary).map(([name,cnt])=>`${name}: ${cnt}`).join(', ') : '';
                            pushNotification('Distribution terminee', (r.dispatched||0)+' leads distribues'+(details?' ('+details+')':''), 'success');
                            loadData();
                          })
                          .catch(()=>{ setDispatchLoading(false); pushNotification('Erreur', 'Erreur de connexion', 'error'); });
                      }
                      setShowDistribPopup(null);
                    }} disabled={(typeof dispatchLoading!=='undefined'?dispatchLoading:null)||((typeof distribForm!=='undefined'?distribForm:{}).dispatchMode==='direct'?directTotal===0:rulesD.length===0)} style={{background:'linear-gradient(135deg,#22C55E,#0EA5E9)',color:'#fff',fontWeight:700,fontSize:14,border:'none',boxShadow:'0 2px 10px #22C55E30',padding:'12px 24px'}}>
                      {(typeof dispatchLoading!=='undefined'?dispatchLoading:null)?<I n="loader" s={14} style={{animation:'spin 1s linear infinite'}}/>:<I n="rocket" s={14}/>} Distribuer {finalCount} lead{finalCount>1?'s':''}
                    </Btn>
                  </div>
                </div>
              </Modal>;
            })()}

            {/* ═══ IMPORT MODALS (CSV / GSheet) ═══ */}
            {showImport==='csv' && <Modal open={true} title="Importer des leads (CSV)" onClose={()=>(typeof setShowImport==='function'?setShowImport:function(){})(null)}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontSize:13,color:T.text2}}>Selectionnez un fichier CSV (max 50 000 lignes, 10 Mo)</div>
                <input type="file" accept=".csv,.txt,.tsv" onChange={handleCsvUpload} style={{fontSize:13}}/>
              </div>
            </Modal>}
            {showImport==='gsheet' && <Modal open={true} title="Connecter un Google Sheet" onClose={()=>{(typeof setShowImport==='function'?setShowImport:function(){})(null);setGsheetPreview(null);}}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontSize:13,color:T.text2}}>Collez le lien de votre Google Sheet (doit etre <b>public</b> ou partage avec "Tout le monde avec le lien")</div>
                <input value={gsheetUrl} onChange={e=>{(typeof setGsheetUrl==='function'?setGsheetUrl:function(){})(e.target.value);if((typeof gsheetPreview!=='undefined'?gsheetPreview:null)?.error) (typeof setGsheetPreview==='function'?setGsheetPreview:function(){})(null);}} placeholder="https://docs.google.com/spreadsheets/d/..." style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                {(typeof gsheetPreview!=='undefined'?gsheetPreview:null)?.error && <div style={{padding:10,borderRadius:8,background:'#FEE2E2',color:'#DC2626',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:6}}><I n="alert-triangle" s={14}/> {gsheetPreview.error}</div>}
                <Btn primary onClick={()=>{
                  if(!(typeof gsheetUrl!=='undefined'?gsheetUrl:null)) return;
                  if(!(typeof gsheetUrl!=='undefined'?gsheetUrl:{}).includes('docs.google.com/spreadsheets')) {
                    setGsheetPreview({error:"L'URL doit etre un lien Google Sheets valide"});
                    return;
                  }
                  setDispatchLoading(true);
                  setGsheetPreview(null);
                  api('/api/leads/import/gsheet-preview', { method:'POST', body:{url:(typeof gsheetUrl!=='undefined'?gsheetUrl:null)} })
                    .then(r=>{
                      setDispatchLoading(false);
                      if(r?.error) { setGsheetPreview({error:r.error}); return; }
                      if(r?.headers) {
                        setShowImport(null);
                        const initMapping = {};
                        // V1.10.5 P3 — priorité au mapping détaillé (custom:<key> auto-suggéré)
                        if (r.suggestedMappingDetailed) {
                          Object.entries(r.suggestedMappingDetailed).forEach(([idx, info]) => {
                            if (info && info.field) initMapping[idx] = info.field;
                          });
                          setMappingForm(initMapping);
                        } else if (r.suggestedMapping) {
                          Object.entries(r.suggestedMapping).forEach(([idx,field])=>{ initMapping[idx]=field; }); setMappingForm(initMapping);
                        }
                        setShowMapping({headers:r.headers, type:'gsheet', sampleRows:r.sampleRows, suggestedMappingDetailed:r.suggestedMappingDetailed||null});
                      } else {
                        setGsheetPreview({error:"Impossible de lire le Google Sheet. Verifiez qu'il est public."});
                      }
                    })
                    .catch(()=>{ setDispatchLoading(false); setGsheetPreview({error:"Erreur de connexion au serveur"}); });
                }} disabled={(typeof dispatchLoading!=='undefined'?dispatchLoading:null)||!(typeof gsheetUrl!=='undefined'?gsheetUrl:null)}>
                  {(typeof dispatchLoading!=='undefined'?dispatchLoading:null)?<><I n="loader" s={13} style={{animation:'spin 1s linear infinite'}}/> Chargement...</>:<><I n="eye" s={13}/> Previsualiser</>}
                </Btn>
                <div style={{fontSize:11,color:T.text3,padding:'4px 0'}}>
                  <b>Comment rendre un Sheet public :</b> Ouvrir le Sheet → Fichier → Partager → "Tout le monde avec le lien" → Lecteur
                </div>
              </div>
            </Modal>}

            {/* MAPPING MODAL */}
            {showMapping && <Modal open={true} title={`Mapping des colonnes (${(typeof showMapping!=='undefined'?showMapping:{}).type==='csv'?'CSV':'Google Sheet'})`} onClose={()=>{(typeof setShowMapping==='function'?setShowMapping:function(){})(null);setMappingForm({});}}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontSize:13,color:T.text2}}>Associez chaque colonne au champ correspondant</div>
                <div style={{display:'flex',gap:8,marginBottom:8}}>
                  <select value={importEnvelopeId} onChange={e=>(typeof setImportEnvelopeId==='function'?setImportEnvelopeId:function(){})(e.target.value)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.card,color:T.text}}>
                    <option value="">Flux destination (optionnel)</option>
                    {envelopes.map(e2=><option key={e2.id} value={e2.id}>{e2.name}</option>)}
                  </select>
                  <select value={importSourceId} onChange={e=>(typeof setImportSourceId==='function'?setImportSourceId:function(){})(e.target.value)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.card,color:T.text}}>
                    <option value="">Source (optionnel)</option>
                    {sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {/* V1.10.5 P3 — modal mapping intelligent : badge type + bouton Créer */}
                {(typeof showMapping!=='undefined'?showMapping:{}).headers.map((h,i)=>{
                  const _detail = ((typeof showMapping!=='undefined'?showMapping:{}).suggestedMappingDetailed||{})[i] || {};
                  const _type = _detail.type || 'text';
                  const _typeColors = { url:'#3B82F6', email:'#22C55E', date:'#F59E0B', number:'#8B5CF6', boolean:'#EC4899', phone:'#0EA5E9', text:'#64748B', empty:'#9CA3AF' };
                  const _typeLabels = { url:'URL', email:'Email', date:'Date', number:'Nombre', boolean:'Oui/Non', phone:'Tél', text:'Texte', empty:'(vide)' };
                  const _samples = ((typeof showMapping!=='undefined'?showMapping:{}).sampleRows||[]).map(r=>Array.isArray(r)?r[i]:'').filter(s=>s&&String(s).trim()!=='');
                  const _sampleVal = _samples.length > 0 ? String(_samples[0]).slice(0, 60) + (String(_samples[0]).length > 60 ? '…' : '') : '—';
                  const _curVal = mappingForm[i] || '';
                  const _isCustomMapped = typeof _curVal === 'string' && _curVal.startsWith('custom:');
                  return <div key={i} style={{display:'flex',flexDirection:'column',gap:4,padding:'8px 10px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{flex:1,fontSize:12,fontWeight:700,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h || '(colonne sans header)'}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:_typeColors[_type]+'20',color:_typeColors[_type]}}>{_typeLabels[_type]}</span>
                    </div>
                    <div style={{fontSize:10,color:T.text3,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Ex : {_sampleVal}</div>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <select value={_curVal} onChange={e=>{
                        const v = e.target.value;
                        if (v === '__create__') {
                          setShowCreateFieldModal({ idx: i, headerLabel: h || '', detectedType: _type });
                          setNewFieldForm({ label: h || '', fieldType: _type === 'empty' ? 'text' : _type, scope: 'company', label_url: _type === 'url' ? ('Voir ' + (h || 'le lien')) : '' });
                        } else {
                          (typeof setMappingForm==='function'?setMappingForm:function(){})({...mappingForm,[i]:v});
                        }
                      }} style={{flex:1,padding:6,borderRadius:6,border:`1px solid ${_isCustomMapped?'#3B82F6':T.border}`,fontSize:12,background:T.card,color:T.text}}>
                        <option value="">— Ignorer —</option>
                        <optgroup label="Champs standards">
                          {MAPPING_FIELDS_STANDARDS.map(f=><option key={f.v} value={f.v}>{f.l}</option>)}
                        </optgroup>
                        <optgroup label="Champs personnalisés existants">
                          {(contactFieldDefs||[]).map(d=>(<option key={'cf_'+d.id} value={'custom:'+d.fieldKey}>{d.label || d.fieldKey} (custom)</option>))}
                        </optgroup>
                        {/* Custom détecté mais non encore créé */}
                        {_detail.field && typeof _detail.field === 'string' && _detail.field.startsWith('custom:') && !(contactFieldDefs||[]).some(d=>'custom:'+d.fieldKey === _detail.field) && (
                          <optgroup label="Détecté (sera créé)">
                            <option value={_detail.field}>{_detail.field.slice(7)} (à créer auto)</option>
                          </optgroup>
                        )}
                        <optgroup label="Actions">
                          <option value="__create__">+ Créer un nouveau champ…</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>;
                })}
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:12,fontWeight:600}}>Doublons :</span>
                    {/* V1.10.5 P1 — names alignés backend (skip|merge|replace|allow). Default = merge (enrichissement) */}
                    <select value={(typeof mappingForm!=='undefined'?mappingForm:{})._duplicateMode||'merge'} onChange={e=>(typeof setMappingForm==='function'?setMappingForm:function(){})({...mappingForm,_duplicateMode:e.target.value})} style={{padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.card,color:T.text}}>
                      <option value="merge">Enrichir (recommandé) — mode merge</option>
                      <option value="skip">Ignorer (skip)</option>
                      <option value="replace">Remplacer complètement</option>
                      <option value="allow">Importer même si doublon</option>
                    </select>
                  </div>
                  <div style={{fontSize:10,color:T.text3,fontStyle:'italic',paddingLeft:8}}>
                    {((typeof mappingForm!=='undefined'?mappingForm:{})._duplicateMode||'merge')==='merge' && 'Enrichit data_json + custom_fields_json sans modifier l\'assignation, le pipeline ni l\'enveloppe d\'origine'}
                    {((typeof mappingForm!=='undefined'?mappingForm:{})._duplicateMode||'merge')==='skip' && 'Ignore tous les doublons (mode safe legacy)'}
                    {((typeof mappingForm!=='undefined'?mappingForm:{})._duplicateMode||'merge')==='replace' && '⚠ Remplace les valeurs existantes (champs standards uniquement)'}
                    {((typeof mappingForm!=='undefined'?mappingForm:{})._duplicateMode||'merge')==='allow' && '⚠ Crée un nouveau lead même en cas de doublon — déconseillé'}
                  </div>
                </div>
                {(typeof showMapping!=='undefined'?showMapping:{}).sampleRows && <div style={{fontSize:11,color:T.text2,padding:8,background:T.bg,borderRadius:6,maxHeight:120,overflow:'auto'}}>
                  <strong>Apercu :</strong> {(typeof showMapping!=='undefined'?showMapping:{}).sampleRows.length} premieres lignes<br/>
                  {(typeof showMapping!=='undefined'?showMapping:{}).sampleRows.slice(0,3).map((row,ri)=><div key={ri}>{row.join(' | ')}</div>)}
                </div>}
                <Btn primary onClick={handleImport} disabled={dispatchLoading}>
                  {(typeof dispatchLoading!=='undefined'?dispatchLoading:null)?<><I n="loader" s={13} style={{animation:'spin 1s linear infinite'}}/> Import en cours...</>:<><I n="upload" s={13}/> Importer</>}
                </Btn>
              </div>
            </Modal>}

            {/* V1.10.5 P3 — MODAL CRÉER CHAMP PERSONNALISÉ */}
            {showCreateFieldModal && <Modal open={true} title="Créer un champ personnalisé" onClose={()=>setShowCreateFieldModal(null)}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontSize:12,color:T.text2}}>
                  Colonne détectée : <b>{showCreateFieldModal.headerLabel}</b>
                  {showCreateFieldModal.detectedType && showCreateFieldModal.detectedType !== 'empty' && <span style={{marginLeft:6,fontSize:10,padding:'2px 6px',borderRadius:4,background:T.bg,color:T.text3}}>type détecté : {showCreateFieldModal.detectedType}</span>}
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:T.text2,display:'block',marginBottom:4}}>Nom du champ</label>
                  <input value={newFieldForm.label} onChange={e=>setNewFieldForm({...newFieldForm,label:e.target.value})} placeholder="Ex: Permis B" style={{width:'100%',padding:8,borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                  <div style={{fontSize:10,color:T.text3,marginTop:2}}>Clé technique : <code>{_normalizeFieldKey(newFieldForm.label) || '(à remplir)'}</code></div>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:T.text2,display:'block',marginBottom:4}}>Type</label>
                  <select value={newFieldForm.fieldType} onChange={e=>setNewFieldForm({...newFieldForm,fieldType:e.target.value})} style={{width:'100%',padding:8,borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}>
                    <option value="text">Texte court</option>
                    <option value="textarea">Texte long</option>
                    <option value="date">Date</option>
                    <option value="number">Nombre</option>
                    <option value="url">URL (lien externe)</option>
                    <option value="email">Email</option>
                    <option value="phone">Téléphone</option>
                    <option value="boolean">Oui / Non</option>
                    <option value="select">Choix unique</option>
                  </select>
                </div>
                {newFieldForm.fieldType === 'url' && <div>
                  <label style={{fontSize:11,fontWeight:600,color:T.text2,display:'block',marginBottom:4}}>Label public du lien</label>
                  <input value={newFieldForm.label_url} onChange={e=>setNewFieldForm({...newFieldForm,label_url:e.target.value})} placeholder="Ex: Voir CV" style={{width:'100%',padding:8,borderRadius:6,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                </div>}
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:T.text2,display:'block',marginBottom:4}}>Visibilité</label>
                  <div style={{display:'flex',gap:12,fontSize:13}}>
                    <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="radio" checked={newFieldForm.scope==='company'} onChange={()=>setNewFieldForm({...newFieldForm,scope:'company'})}/> Toute la company</label>
                    <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="radio" checked={newFieldForm.scope==='collab'} onChange={()=>setNewFieldForm({...newFieldForm,scope:'collab'})}/> Personnel</label>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:6}}>
                  <Btn onClick={()=>setShowCreateFieldModal(null)}>Annuler</Btn>
                  <Btn primary disabled={!newFieldForm.label || !_normalizeFieldKey(newFieldForm.label)} onClick={()=>{
                    const fieldKey = _normalizeFieldKey(newFieldForm.label);
                    if (!fieldKey) { pushNotification && pushNotification('Erreur', 'Nom invalide', 'danger'); return; }
                    api('/api/contact-fields', { method:'POST', body:{ companyId: company.id, label: newFieldForm.label, fieldKey, fieldType: newFieldForm.fieldType, scope: newFieldForm.scope } })
                      .then(r => {
                        if (r?.success || r?.id) {
                          // Ajoute la def à la liste locale (ou refetch)
                          const newDef = { id: r.id, companyId: company.id, label: newFieldForm.label, fieldKey: r.fieldKey || fieldKey, fieldType: newFieldForm.fieldType, scope: newFieldForm.scope, options: [], createdBy: collab?.id || '' };
                          setContactFieldDefs(prev => {
                            const exists = (prev||[]).some(d => d.fieldKey === newDef.fieldKey);
                            return exists ? prev : [...(prev||[]), newDef];
                          });
                          // Auto-applique le mapping vers cette nouvelle def
                          if (typeof showCreateFieldModal.idx === 'number') {
                            setMappingForm({...mappingForm, [showCreateFieldModal.idx]: 'custom:' + newDef.fieldKey});
                          }
                          setShowCreateFieldModal(null);
                          pushNotification && pushNotification('Champ créé', `"${newFieldForm.label}" disponible`, 'success');
                        } else {
                          pushNotification && pushNotification('Erreur', r?.error || 'Création échouée', 'danger');
                        }
                      })
                      .catch(e => pushNotification && pushNotification('Erreur', e.message || 'Erreur réseau', 'danger'));
                  }}>+ Créer le champ</Btn>
                </div>
              </div>
            </Modal>}

            {/* IMPORT REPORT */}
            {importReport && <Modal open={true} title="Rapport d'import" onClose={()=>setGsheetPreview(null)}>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                  <div style={{background:'#22C55E12',borderRadius:8,padding:12,textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'#22C55E'}}>{importReport.imported||0}</div><div style={{fontSize:11,color:T.text2}}>Importes</div></div>
                  <div style={{background:'#F59E0B12',borderRadius:8,padding:12,textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'#F59E0B'}}>{importReport.duplicates||0}</div><div style={{fontSize:11,color:T.text2}}>Doublons</div></div>
                  <div style={{background:'#EF444412',borderRadius:8,padding:12,textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'#EF4444'}}>{importReport.errors||0}</div><div style={{fontSize:11,color:T.text2}}>Erreurs</div></div>
                </div>
                <Btn primary onClick={()=>setGsheetPreview(null)}><I n="check" s={13}/> Fermer</Btn>
              </div>
            </Modal>}

            {/* ═══ WIZARD CREER / MODIFIER UN FLUX ═══ */}
            {showAddEnvelope && <Modal open={true} title={editEnvId?'Modifier le flux':'Creer un flux'} onClose={()=>{(typeof setShowAddEnvelope==='function'?setShowAddEnvelope:function(){})(false);(typeof setEditEnvId==='function'?setEditEnvId:function(){})(null);}}>
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {/* STEPS INDICATOR */}
                <div style={{display:'flex',gap:4,marginBottom:4}}>
                  {['Source','Configuration','Collaborateurs','Lancement'].map((s,i)=><div key={i} style={{flex:1,textAlign:'center'}}>
                    <div style={{height:4,borderRadius:2,background:i<=(typeof wizardStep!=='undefined'?wizardStep:null)?T.accent:T.border,marginBottom:4,transition:'background .2s'}}/>
                    <span style={{fontSize:10,fontWeight:i===(typeof wizardStep!=='undefined'?wizardStep:null)?700:400,color:i<=(typeof wizardStep!=='undefined'?wizardStep:null)?T.accent:T.text2}}>{s}</span>
                  </div>)}
                </div>

                {/* ETAPE 1 — Source */}
                {wizardStep===0 && <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text}}>Nom du flux</label>
                  <input value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).name} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,name:e.target.value})} placeholder="Ex: Leads Google Ads Mars" style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>

                  {/* Identité visuelle (L2) — couleur / icône / priorité */}
                  <div style={{padding:12,borderRadius:8,background:T.bg,border:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text2,textTransform:'uppercase',letterSpacing:0.5}}>Identité visuelle</div>
                    <div style={{display:'flex',gap:12,alignItems:'center'}}>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        <label style={{fontSize:10,color:T.text3,fontWeight:600}}>Couleur</label>
                        <input type="color" value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).color||DEFAULT_ENVELOPE_COLOR} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,color:e.target.value})} style={{width:46,height:36,padding:0,border:`1px solid ${T.border}`,borderRadius:6,background:T.card,cursor:'pointer'}}/>
                      </div>
                      <div style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
                        <label style={{fontSize:10,color:T.text3,fontWeight:600}}>Icône</label>
                        <select value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).icon||DEFAULT_ENVELOPE_ICON} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,icon:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.card,color:T.text}}>
                          {ENVELOPE_ICONS.map(opt=><option key={opt.key} value={opt.key}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'center'}}>
                        <label style={{fontSize:10,color:T.text3,fontWeight:600}}>Aperçu</label>
                        <div style={{width:36,height:36,borderRadius:8,background:(typeof newEnvelope!=='undefined'?newEnvelope:{}).color||DEFAULT_ENVELOPE_COLOR,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
                          <I n={resolveEnvelopeIcon((typeof newEnvelope!=='undefined'?newEnvelope:{}).icon)} s={18}/>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:T.text3,fontWeight:600,display:'block',marginBottom:6}}>Priorité</label>
                      <div style={{display:'flex',gap:6}}>
                        {ENVELOPE_PRIORITIES.map(p=>{
                          const active = ((typeof newEnvelope!=='undefined'?newEnvelope:{}).priority||DEFAULT_ENVELOPE_PRIORITY)===p.key;
                          return <button key={p.key} type="button" onClick={()=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,priority:p.key})} style={{flex:1,padding:'8px 10px',borderRadius:6,border:active?`1.5px solid ${p.color}`:`1px solid ${T.border}`,background:active?p.accent:T.card,color:active?p.color:T.text2,fontSize:12,fontWeight:active?700:500,cursor:'pointer',transition:'all .15s'}}>{p.label}</button>;
                        })}
                      </div>
                    </div>
                  </div>

                  <label style={{fontSize:12,fontWeight:600,color:T.text}}>Source des leads</label>
                  <select value={(typeof newEnvelope!=='undefined'?newEnvelope:{})._sourceType||'csv'} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,_sourceType:e.target.value})} style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}>
                    <option value="csv">Import CSV</option>
                    <option value="gsheet">Google Sheet</option>
                  </select>
                  <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:8}}>
                    <Btn primary onClick={()=>setWizardStep(1)} disabled={!(typeof newEnvelope!=='undefined'?newEnvelope:{}).name}><I n="arrow-right" s={13}/> Suivant</Btn>
                  </div>
                </div>}

                {/* ETAPE 2 — Configuration */}
                {wizardStep===1 && <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <label style={{fontSize:12,fontWeight:600}}>Date de depart</label>
                  <input type="date" value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_start_date} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_start_date:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                  <label style={{fontSize:12,fontWeight:600}}>Mode de distribution</label>
                  <select value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_mode} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_mode:e.target.value})} style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}>
                    <option value="manual">Round-robin (egal)</option>
                    <option value="percentage">Repartition en %</option>
                    <option value="ai">Intelligent (IA)</option>
                  </select>
                  <label style={{fontSize:12,fontWeight:600}}>Frequence de distribution</label>
                  <select value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_type==='immediate'?-1:((typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes||0)} onChange={e=>{
                    const v=parseInt(e.target.value);
                    if(v===-1) { (typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_interval_minutes:0,auto_dispatch:true,dispatch_type:'immediate'}); }
                    else { (typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_interval_minutes:v,auto_dispatch:v>0,dispatch_type:v>0?'interval':'manual'}); }
                  }} style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}>
                    <option value={-1}>Immediat (des l'import)</option>
                    <option value={0}>Manuel seulement</option>
                    <option value={15}>Toutes les 15 min</option>
                    <option value={30}>Toutes les 30 min</option>
                    <option value={60}>Toutes les heures</option>
                    <option value={120}>Toutes les 2 heures</option>
                    <option value={360}>Toutes les 6 heures</option>
                    <option value={720}>Toutes les 12 heures</option>
                    <option value={1440}>Une fois par jour</option>
                  </select>
                  {(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes>0 && (typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_type==='daily' && <div>
                    <label style={{fontSize:12,fontWeight:600}}>Heure de distribution</label>
                    <input type="time" value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_time} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_time:e.target.value})} style={{padding:8,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                  </div>}
                  {((typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_type !== 'manual') && <div>
                    <label style={{fontSize:12,fontWeight:600}}>Volume par cycle</label>
                    <select value={(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_limit||0} onChange={e=>(typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,dispatch_limit:parseInt(e.target.value)})} style={{padding:10,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text,width:'100%'}}>
                      <option value={0}>Tous les leads disponibles</option>
                      <option value={1}>1 lead par cycle</option>
                      <option value={2}>2 leads par cycle</option>
                      <option value={5}>5 leads par cycle</option>
                      <option value={10}>10 leads par cycle</option>
                      <option value={20}>20 leads par cycle</option>
                      <option value={50}>50 leads par cycle</option>
                    </select>
                    <div style={{fontSize:11,color:T.text3,marginTop:4}}>{(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_limit>0?`${(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_limit} lead${(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_limit>1?'s':''} distribue${(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_limit>1?'s':''} a chaque passage`:'Tous les leads en attente seront distribues a chaque passage'}</div>
                  </div>}
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8}}>
                    <Btn onClick={()=>setWizardStep(0)}><I n="arrow-left" s={13}/> Retour</Btn>
                    <Btn primary onClick={()=>setWizardStep(2)}><I n="arrow-right" s={13}/> Suivant</Btn>
                  </div>
                </div>}

                {/* ETAPE 3 — Collaborateurs */}
                {wizardStep===2 && <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{fontSize:13,color:T.text2}}>Selectionnez les collaborateurs qui recevront les leads</div>
                  <div style={{maxHeight:250,overflow:'auto',display:'flex',flexDirection:'column',gap:4}}>
                    {((typeof newEnvelope!=='undefined'?newEnvelope:{})._collabs||[]).map((c,ci)=><div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:8,background:c.checked?(c.color||T.accent)+'08':T.bg,border:`1px solid ${c.checked?(c.color||T.accent)+'30':T.border}`,cursor:'pointer'}} onClick={()=>{
                      const arr=[...newEnvelope._collabs]; arr[ci]={...arr[ci],checked:!arr[ci].checked};
                      (typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,_collabs:arr});
                    }}>
                      <input type="checkbox" checked={c.checked} readOnly/>
                      <div style={{width:28,height:28,borderRadius:7,background:(c.color||'#64748B')+'18',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="user" s={13} style={{color:c.color||'#64748B'}}/></div>
                      <span style={{flex:1,fontSize:13,fontWeight:600}}>{c.name}</span>
                      {c.checked && (typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_mode==='percentage' && <input type="number" value={c.percentage||0} onClick={e=>e.stopPropagation()} onChange={e=>{
                        const arr=[...newEnvelope._collabs]; arr[ci]={...arr[ci],percentage:parseInt(e.target.value)||0};
                        (typeof setNewEnvelope==='function'?setNewEnvelope:function(){})({...newEnvelope,_collabs:arr});
                      }} style={{width:55,padding:4,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,textAlign:'center',background:T.card,color:T.text}} placeholder="%"/>}
                    </div>)}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8}}>
                    <Btn onClick={()=>setWizardStep(1)}><I n="arrow-left" s={13}/> Retour</Btn>
                    <Btn primary onClick={()=>setWizardStep(3)} disabled={((typeof newEnvelope!=='undefined'?newEnvelope:{})._collabs||[]).filter(c=>c.checked).length===0}><I n="arrow-right" s={13}/> Suivant</Btn>
                  </div>
                </div>}

                {/* ETAPE 4 — Resume + Lancement */}
                {wizardStep===3 && <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{background:T.bg,borderRadius:10,padding:16,display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:T.text2}}>Nom du flux</span><span style={{fontSize:13,fontWeight:700}}>{(typeof newEnvelope!=='undefined'?newEnvelope:{}).name}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:T.text2}}>Mode</span><span style={{fontSize:13,fontWeight:600}}>{(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_mode==='manual'?'Round-robin':(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_mode==='percentage'?'Repartition %':'Intelligent IA'}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:T.text2}}>Frequence</span><span style={{fontSize:13,fontWeight:600}}>{(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes>0?((typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes>=1440?'Quotidien':(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes>=60?'Toutes les '+Math.round((typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes/60)+'h':'Toutes les '+(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_interval_minutes+' min'):'Manuel'}</span></div>
                    {(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_start_date && <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:T.text2}}>Depart</span><span style={{fontSize:13,fontWeight:600}}>{(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_start_date}</span></div>}
                    <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:4}}>
                      <span style={{fontSize:12,fontWeight:700,color:T.text}}>Collaborateurs ({((typeof newEnvelope!=='undefined'?newEnvelope:{})._collabs||[]).filter(c=>c.checked).length})</span>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
                        {((typeof newEnvelope!=='undefined'?newEnvelope:{})._collabs||[]).filter(c=>c.checked).map(c=><span key={c.id} style={{fontSize:12,fontWeight:600,padding:'3px 10px',borderRadius:6,background:(c.color||'#64748B')+'18',color:c.color||'#64748B'}}>{c.name}{(typeof newEnvelope!=='undefined'?newEnvelope:{}).dispatch_mode==='percentage'?' ('+c.percentage+'%)':''}</span>)}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8}}>
                    <Btn onClick={()=>setWizardStep(2)}><I n="arrow-left" s={13}/> Retour</Btn>
                    <Btn onClick={(typeof editEnvId!=='undefined'?editEnvId:null)?handleEditEnvelope:handleAddEnvelope} style={{background:'linear-gradient(135deg,#22C55E,#16A34A)',color:'#fff',fontWeight:700,border:'none',boxShadow:'0 2px 8px #22C55E40'}}>
                      <I n={(typeof editEnvId!=='undefined'?editEnvId:null)?"check":"plus"} s={14}/> {(typeof editEnvId!=='undefined'?editEnvId:null)?'Enregistrer':'Creer le flux'}
                    </Btn>
                  </div>
                </div>}
              </div>
            </Modal>}

            {/* ═══ MANUAL DISPATCH MODAL ═══ */}
            {showManualDispatch && <Modal open={true} title="Distribution manuelle" onClose={()=>(typeof setShowManualDispatch==='function'?setShowManualDispatch:function(){})(null)}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <label style={{fontSize:12,fontWeight:600}}>Nombre de leads a distribuer</label>
                <input type="number" min={1} max={500} value={(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).count} onChange={e=>(typeof setManualDispatchForm==='function'?setManualDispatchForm:function(){})({...manualDispatchForm,count:parseInt(e.target.value)||1})} style={{padding:8,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.card,color:T.text}}/>
                <label style={{fontSize:12,fontWeight:600}}>Collaborateurs</label>
                <div style={{maxHeight:200,overflow:'auto',display:'flex',flexDirection:'column',gap:4}}>
                  {(collabs||[]).map(c=><label key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:6,cursor:'pointer',background:(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.includes(c.id)?(c.color||T.accent)+'12':T.bg,border:`1px solid ${(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.includes(c.id)?(c.color||T.accent)+'40':T.border}`}}>
                    <input type="checkbox" checked={(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.includes(c.id)} onChange={e=>{const ids=(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds;(typeof setManualDispatchForm==='function'?setManualDispatchForm:function(){})({...manualDispatchForm,collaboratorIds:e.target.checked?[...ids,c.id]:ids.filter(x=>x!==c.id)});}}/>
                    <div style={{width:24,height:24,borderRadius:6,background:(c.color||'#64748B')+'18',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="user" s={12} style={{color:c.color||'#64748B'}}/></div>
                    <span style={{fontSize:13,fontWeight:500}}>{c.name}</span>
                  </label>)}
                </div>
                {(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.length>0 && <div style={{padding:8,borderRadius:6,background:T.bg,fontSize:11,color:T.text2}}>
                  {(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).count} lead{(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).count>1?'s':''} seront distribues en round-robin entre {(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.length} collaborateur{(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.length>1?'s':''}
                </div>}
                <Btn primary onClick={handleManualDispatch} disabled={(typeof dispatchLoading!=='undefined'?dispatchLoading:null)||(typeof manualDispatchForm!=='undefined'?manualDispatchForm:{}).collaboratorIds.length===0}>
                  {(typeof dispatchLoading!=='undefined'?dispatchLoading:null)?<><I n="loader" s={13} style={{animation:'spin 1s linear infinite'}}/> Distribution en cours...</>:<><I n="send" s={13}/> Distribuer</>}
                </Btn>
              </div>
            </Modal>}

            {/* ═══ V1.10.6 — DELETE ENVELOPE WARNING (leads assignés) ═══ */}
            {deleteEnvDialog && <Modal open={true} title="⚠️ Suppression bloquée — leads assignés" onClose={()=>!deleteEnvLoading && setDeleteEnvDialog(null)}>
              <div style={{display:'flex',flexDirection:'column',gap:14,fontSize:13}}>
                <div>
                  L'enveloppe <b>"{deleteEnvDialog.env.name}"</b> contient :
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:140,padding:'10px 12px',borderRadius:8,background:'#10B98112',border:'1px solid #10B98140'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#10B981'}}>{deleteEnvDialog.preview.unassigned}</div>
                    <div style={{fontSize:11,color:T.text2}}>leads non assignés</div>
                    <div style={{fontSize:10,color:T.text3,marginTop:2}}>suppression directe</div>
                  </div>
                  <div style={{flex:1,minWidth:140,padding:'10px 12px',borderRadius:8,background:'#F59E0B12',border:'1px solid #F59E0B40'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#F59E0B'}}>{deleteEnvDialog.preview.assigned}</div>
                    <div style={{fontSize:11,color:T.text2}}>leads assignés à des contacts</div>
                    <div style={{fontSize:10,color:T.text3,marginTop:2}}>désassignation requise</div>
                  </div>
                </div>
                <div style={{padding:'10px 12px',borderRadius:8,background:'#FEF3C7',border:'1px solid #F59E0B40',fontSize:12,color:'#92400E'}}>
                  ⚠ Pour supprimer cette enveloppe, les <b>{deleteEnvDialog.preview.assigned} leads assignés</b> seront automatiquement désassignés (le lien lead → contact sera retiré).
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #F59E0B30'}}>
                    <b>Préservé strictement :</b><br/>
                    ✓ contacts CRM (non supprimés)<br/>
                    ✓ pipeline_stage / statut contact<br/>
                    ✓ RDV, notes, historique<br/>
                    ✓ aucune redistribution déclenchée
                  </div>
                </div>
                {(deleteEnvDialog.preview.assignedSamples||[]).length>0 && <div style={{maxHeight:140,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:8}}>
                  <div style={{padding:'6px 10px',fontSize:11,fontWeight:600,color:T.text2,background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                    Aperçu (5 premiers) :
                  </div>
                  {(deleteEnvDialog.preview.assignedSamples||[]).map((s,i)=>(
                    <div key={i} style={{padding:'6px 10px',fontSize:11,borderBottom:i<deleteEnvDialog.preview.assignedSamples.length-1?`1px solid ${T.border}`:'none',display:'flex',justifyContent:'space-between',gap:8}}>
                      <span>{s.leadName || s.contactName || s.leadId}</span>
                      <span style={{color:T.text3}}>{s.collabName || '—'}</span>
                    </div>
                  ))}
                </div>}
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
                  <Btn onClick={()=>!deleteEnvLoading && setDeleteEnvDialog(null)} disabled={deleteEnvLoading}>Annuler</Btn>
                  <Btn primary onClick={()=>runDeleteEnvelopeCascade(deleteEnvDialog.env, true)} disabled={deleteEnvLoading} style={{background:'#EF4444',borderColor:'#EF4444'}}>
                    {deleteEnvLoading ? <><I n="loader" s={13} style={{animation:'spin 1s linear infinite'}}/> Suppression…</> : <><I n="trash-2" s={13}/> Désassigner les {deleteEnvDialog.preview.assigned} leads + Supprimer</>}
                  </Btn>
                </div>
              </div>
            </Modal>}
          </div>;
        
}
