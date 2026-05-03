// DuplicatesPanel — V2.2.c
// UI résolution doublons admin. Consomme GET /api/data/contacts/duplicates-scan (V2.2.b).
// Réutilise MergeContactsModal V1.13.2.b via callback onOpenMerge fourni par parent.
// Ignore localStorage per-company (Set des signatures).

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Spinner, Avatar, Badge, EmptyState } from "../../../shared/ui";
import { api } from "../../../shared/services/api";

const PAGE_SIZE = 50;

const ignoredKey = (companyId) => `c360-duplicates-ignored-${companyId || 'default'}`;

const loadIgnoredSet = (companyId) => {
  try { return new Set(JSON.parse(localStorage.getItem(ignoredKey(companyId)) || '[]')); }
  catch { return new Set(); }
};

const saveIgnoredSet = (companyId, set) => {
  try { localStorage.setItem(ignoredKey(companyId), JSON.stringify([...set])); } catch {}
};

const TYPE_META = {
  email: { color: '#2563EB', label: 'Même email', icon: 'mail' },
  phone: { color: '#22C55E', label: 'Même téléphone', icon: 'phone' },
  name:  { color: '#A855F7', label: 'Même nom', icon: 'user' },
};

const STAGE_COLORS = {
  nouveau: '#3B82F6', contacte: '#8B5CF6', qualifie: '#F59E0B',
  rdv_programme: '#10B981', nrp: '#EF4444', client_valide: '#22C55E', perdu: '#64748B'
};

const groupKey = (g) => g.type + ':' + g.signature;

const DuplicatesPanel = ({ company, onOpenContact, onOpenMerge, notif }) => {
  const [groups, setGroups] = useState([]);
  const [scannedContacts, setScannedContacts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [ignored, setIgnored] = useState(() => loadIgnoredSet(company?.id));

  const fetchScan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        type,
        includeArchived: String(includeArchived),
        page: String(page),
        pageSize: String(PAGE_SIZE)
      });
      const r = await api(`/api/data/contacts/duplicates-scan?${params.toString()}`);
      if (!r || r.error) {
        setError(r?.error || 'Erreur réseau');
        setGroups([]); setTotal(0); setScannedContacts(0);
      } else {
        setGroups(Array.isArray(r.groups) ? r.groups : []);
        setTotal(r.total || 0);
        setScannedContacts(r.scannedContacts || 0);
      }
    } catch (err) {
      setError(err?.message || 'Erreur réseau');
      setGroups([]); setTotal(0); setScannedContacts(0);
    }
    setLoading(false);
  }, [type, includeArchived, page]);

  useEffect(() => { fetchScan(); }, [fetchScan]);

  // Listener crmContactMerged → refetch après fusion (broadcast par useMergeContacts)
  useEffect(() => {
    const onMerged = () => fetchScan();
    window.addEventListener('crmContactMerged', onMerged);
    return () => window.removeEventListener('crmContactMerged', onMerged);
  }, [fetchScan]);

  const ignoreGroup = (g) => {
    const next = new Set(ignored);
    next.add(groupKey(g));
    setIgnored(next);
    saveIgnoredSet(company?.id, next);
    if (notif) notif('Groupe ignoré (récupérable via vidange localStorage)');
  };

  const visibleGroups = useMemo(
    () => groups.filter(g => !ignored.has(groupKey(g))),
    [groups, ignored]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card style={{ padding: 20 }}>
      {/* Header — controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>
          <I n="git-merge" s={18}/> Doublons potentiels
          <span style={{ fontSize: 11, color: T.text3, marginLeft: 10, fontWeight: 500 }}>
            {total} groupe{total > 1 ? 's' : ''} sur {scannedContacts} contact{scannedContacts > 1 ? 's' : ''} scannés
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={type}
            onChange={e => { setType(e.target.value); setPage(0); }}
            style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="all">Tous types</option>
            <option value="email">Email</option>
            <option value="phone">Téléphone</option>
            <option value="name">Nom</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => { setIncludeArchived(e.target.checked); setPage(0); }}
              style={{ accentColor: T.accent, cursor: 'pointer' }}
            />
            Inclure archivés
          </label>
          <Btn small onClick={fetchScan} disabled={loading}>
            <I n="refresh-cw" s={12}/> Actualiser
          </Btn>
        </div>
      </div>

      {/* States */}
      {loading && <div style={{ padding: 30, textAlign: 'center' }}><Spinner /></div>}
      {error && !loading && (
        <div style={{ padding: 14, borderRadius: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, fontWeight: 600 }}>
          ⚠️ Erreur : {error}
        </div>
      )}
      {!loading && !error && visibleGroups.length === 0 && (
        <EmptyState
          icon="check-circle"
          title={total === 0 ? "Aucun doublon détecté" : "Tous les groupes sont ignorés"}
          subtitle={total === 0
            ? "Tous les contacts sont uniques selon les critères sélectionnés."
            : "Vous avez ignoré tous les groupes visibles. Videz localStorage pour les revoir."}
        />
      )}

      {/* Liste groupes */}
      {!loading && !error && visibleGroups.map(group => {
        const meta = TYPE_META[group.type] || { color: T.text3, label: group.type, icon: 'tag' };
        return (
          <Card key={groupKey(group)} style={{ padding: 14, marginBottom: 10, border: `1.5px solid ${meta.color}40` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Badge color={meta.color}><I n={meta.icon} s={10}/> {meta.label}</Badge>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.signature}
                </span>
                <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>
                  · {group.count} fiches
                </span>
              </div>
              <Btn small onClick={() => ignoreGroup(group)}>
                <I n="x" s={11}/> Ignorer
              </Btn>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: T.bg }}>
                  <Avatar name={c.name || '?'} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || '(sans nom)'}</span>
                      {c.isArchived && (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: '#EF444418', color: '#EF4444', fontWeight: 700 }}>
                          📦 archivé
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                      {c.email && <span><I n="mail" s={10}/> {c.email}</span>}
                      {c.phone && <span><I n="phone" s={10}/> {c.phone}</span>}
                      {c.assignedName && <span><I n="user" s={10}/> {c.assignedName}</span>}
                      {c.pipelineStage && (
                        <span style={{ color: STAGE_COLORS[c.pipelineStage] || T.text3, fontWeight: 600 }}>
                          ● {c.pipelineStage}
                        </span>
                      )}
                    </div>
                  </div>
                  <Btn small onClick={() => onOpenContact && onOpenContact(c)} title="Voir fiche">
                    <I n="eye" s={12}/>
                  </Btn>
                  <Btn small primary onClick={() => onOpenMerge && onOpenMerge(c)} title="Fusionner cette fiche avec une autre">
                    <I n="git-merge" s={12}/> Fusionner
                  </Btn>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Pagination */}
      {!loading && !error && total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Btn small disabled={page === 0} onClick={() => setPage(0)} title="Première page">
            <I n="chevrons-left" s={12}/>
          </Btn>
          <Btn small disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
            <I n="chevron-left" s={12}/>
          </Btn>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text2, padding: '0 8px' }}>
            Page {page + 1} / {totalPages}
          </span>
          <Btn small disabled={(page + 1) >= totalPages} onClick={() => setPage(p => p + 1)}>
            <I n="chevron-right" s={12}/>
          </Btn>
          <Btn small disabled={(page + 1) >= totalPages} onClick={() => setPage(totalPages - 1)} title="Dernière page">
            <I n="chevrons-right" s={12}/>
          </Btn>
        </div>
      )}
    </Card>
  );
};

export default DuplicatesPanel;
