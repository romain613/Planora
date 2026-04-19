#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# P0 — Pipeline Live Transfer Button + Badges + Fiche Suivi Tab
# Calendar360 / PLANORA — V7 P0 Deployment
# Date: 2026-04-17
# ═══════════════════════════════════════════════════════════════════════
#
# PRÉREQUIS: deploy-v7.sh doit avoir été exécuté (backend V7 + CRM kanban)
# CE SCRIPT: Ajoute les 3 éléments P0 manquants sur le frontend
#
# RÉUTILISE (déjà en prod via deploy-v7.sh):
#   - v7TransferModal, setV7TransferModal, v7TransferTarget, setV7TransferTarget
#   - handleV7Transfer (appelle PUT /api/transfer/executor/:contactId)
#   - v7FollowersMap (chargé via GET /api/transfer/followers-batch)
#   - collabs, collab (contexte collaborateur)
#   - GET /api/transfer/followers/:contactId (détail par contact)
#
# AJOUTE:
#   P0.1 — Bouton "Transférer" sur Pipeline Live phone kanban
#   P0.2 — Badges executor/source sur cartes Pipeline Live
#   P0.3 — Onglet "Suivi" dans la fiche contact (avec HookIsolator)
#
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

echo "═══ P0 DEPLOYMENT — PIPELINE LIVE + BADGES + SUIVI TAB ═══"
echo ""

# ── 0. Pre-flight checks ──
echo "[0/5] Vérification pré-déploiement..."
$SSH 'bash -s' << 'PREFLIGHT'
cd /var/www/planora/app/src

# Verify V7 base is deployed
if ! grep -q "v7TransferModal" App.jsx; then
  echo "ERREUR: V7 base non déployée (v7TransferModal introuvable)"
  echo "Exécuter deploy-v7.sh d'abord"
  exit 1
fi

if ! grep -q "v7FollowersMap" App.jsx; then
  echo "ERREUR: v7FollowersMap introuvable — deploy-v7.sh incomplet"
  exit 1
fi

if ! grep -q "handleV7Transfer" App.jsx; then
  echo "ERREUR: handleV7Transfer introuvable — deploy-v7.sh incomplet"
  exit 1
fi

echo "V7 base OK — v7TransferModal, v7FollowersMap, handleV7Transfer présents"

# Check if P0 already applied
if grep -q "fromPhonePipeline.*P0" App.jsx; then
  echo "ATTENTION: P0 semble déjà appliqué (fromPhonePipeline P0 trouvé)"
fi
PREFLIGHT
echo ""

# ── 1. Backup ──
echo "[1/5] Backup App.jsx..."
$SSH "cp /var/www/planora/app/src/App.jsx /var/www/planora/app/src/App.jsx.pre-p0"
echo "Backup: App.jsx.pre-p0"
echo ""

# ── 2. P0.1 — Bouton Transférer sur Pipeline Live ──
echo "[2/5] P0.1 — Bouton Transférer sur Pipeline Live..."
$SSH 'bash -s' << 'PATCH_P01'
cd /var/www/planora/app/src

# Check if already patched
if grep -q "fromPhonePipeline.*true.*P0\|Transférer.*fromPhonePipeline" App.jsx; then
  echo "P0.1 déjà appliqué — skip"
  exit 0
fi

# Strategy: Find the SMS button in phone pipeline by its unique pattern
# The SMS button has: setPipelineRightContact(ct);setPhoneRightTab('sms')
# followed by "Envoyer SMS" and "message-square"
# We insert the transfer button AFTER the SMS button line

# Find the SMS button div in phone pipeline
# This is the line containing both setPhoneRightTab('sms') AND message-square
SMS_LINE=$(grep -n "setPhoneRightTab.*sms.*message-square\|message-square.*setPhoneRightTab.*sms" App.jsx | head -1 | cut -d: -f1)

if [ -z "$SMS_LINE" ]; then
  # Fallback: find by "Envoyer SMS" text
  SMS_LINE=$(grep -n "Envoyer SMS" App.jsx | head -1 | cut -d: -f1)
fi

if [ -z "$SMS_LINE" ]; then
  echo "ERREUR: Bouton SMS introuvable dans Pipeline Live"
  exit 1
fi

echo "Bouton SMS trouvé à la ligne $SMS_LINE"

# Insert transfer button after SMS button
# Uses existing: setV7TransferModal, setV7TransferTarget, collabs, collab
sed -i "${SMS_LINE}a\\
                    {/* P0.1 — Transfer button on Pipeline Live */}\\
                    {collabs.length>1&&<div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}} style={{padding:'3px 5px',borderRadius:6,background:'#8B5CF610',color:'#8B5CF6',fontSize:9,cursor:'pointer',border:'1px solid #8B5CF625',display:'flex',alignItems:'center',gap:2}} title='Transférer à un collègue'><I n='users' s={9}/></div>}" App.jsx

echo "P0.1 — Bouton Transférer ajouté après ligne $SMS_LINE"
PATCH_P01
echo ""

# ── 3. P0.2 — Badges executor/source sur Pipeline Live ──
echo "[3/5] P0.2 — Badges executor/source sur Pipeline Live..."
$SSH 'bash -s' << 'PATCH_P02'
cd /var/www/planora/app/src

# Check if already patched
if grep -q "v7FollowersMap.*ct\.id.*executor.*Phone\|P0\.2.*executor badge" App.jsx; then
  echo "P0.2 déjà appliqué — skip"
  exit 0
fi

# Strategy: Find the card_label badge in phone pipeline cards
# Pattern: ct.card_label&&<span style={{padding:'0 4px',borderRadius:4,fontSize:7
# This is in the Avatar + Name row of phone pipeline cards
# We add the executor badge right after card_label

# Find the unique line with card_label + fontSize:7 + flexShrink:0 in the name div
# The phone pipeline version has padding:'0 4px' and fontSize:7
CARD_LABEL_LINE=$(grep -n "ct\.card_label&&<span.*padding.*0 4px.*borderRadius:4.*fontSize:7" App.jsx | head -1 | cut -d: -f1)

if [ -z "$CARD_LABEL_LINE" ]; then
  # Try broader pattern
  CARD_LABEL_LINE=$(grep -n "ct\.card_label&&<span.*fontSize:7.*fontWeight:700.*card_color" App.jsx | head -1 | cut -d: -f1)
fi

if [ -z "$CARD_LABEL_LINE" ]; then
  echo "WARNING: card_label introuvable pour badges Pipeline Live — skip"
  exit 0
fi

echo "card_label trouvé à la ligne $CARD_LABEL_LINE"

# Count occurrences — CRM kanban also has one, we need the second (phone pipeline)
ALL_LINES=$(grep -n "ct\.card_label&&<span.*fontSize:7\|ct\.card_label&&<span.*card_color.*flexShrink" App.jsx | cut -d: -f1)
OCCURRENCE_COUNT=$(echo "$ALL_LINES" | wc -l)
echo "Nombre d'occurrences card_label: $OCCURRENCE_COUNT"

if [ "$OCCURRENCE_COUNT" -ge 2 ]; then
  # Take the LAST occurrence (phone pipeline comes after CRM in the file)
  CARD_LABEL_LINE=$(echo "$ALL_LINES" | tail -1)
  echo "Utilisation de la dernière occurrence (phone pipeline): ligne $CARD_LABEL_LINE"
fi

# Insert executor badge after card_label
# Reuses existing v7FollowersMap loaded by deploy-v7.sh useEffect
sed -i "${CARD_LABEL_LINE}a\\
                      {/* P0.2 — Executor badge on Pipeline Live */}\\
                      {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'0 4px',borderRadius:4,fontSize:7,fontWeight:700,background:'#8B5CF620',color:'#8B5CF6',flexShrink:0}} title={'Chez '+v7FollowersMap[ct.id].executor.collaboratorName}>{(v7FollowersMap[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}" App.jsx

echo "P0.2 — Badge executor ajouté après ligne $CARD_LABEL_LINE"
PATCH_P02
echo ""

# ── 4. P0.3 — Onglet Suivi dans la fiche contact ──
echo "[4/5] P0.3 — Onglet Suivi dans la fiche contact..."
$SSH 'bash -s' << 'PATCH_P03A'
cd /var/www/planora/app/src

# Check if already patched
if grep -q 'id:"suivi"' App.jsx; then
  echo "P0.3 tab définition déjà présente — skip tab ajout"
  exit 0
fi

# ── STEP A: Add "Suivi" tab to the tab bar ──
# The tab definitions are in an array like:
# [{id:"notes",label:"Info & Notes"},{id:"client_msg",...},...(ct._linked?...:[])].map(t=>(
# We need to add {id:"suivi",label:"Suivi"} before the conditional partage tab
# Pattern to find: ...{id:"docs",label:"📎 Docs"},...(ct._linked

# Find the exact line with the tab definitions
TAB_LINE=$(grep -n '{id:"docs",label:"📎 Docs"}' App.jsx | head -1 | cut -d: -f1)

if [ -z "$TAB_LINE" ]; then
  TAB_LINE=$(grep -n 'id:"docs".*label.*Docs' App.jsx | head -1 | cut -d: -f1)
fi

if [ -z "$TAB_LINE" ]; then
  echo "ERREUR: Ligne des tabs introuvable"
  exit 1
fi

echo "Tabs trouvés à la ligne $TAB_LINE"

# Replace the docs tab entry to add suivi after it
# Before: {id:"docs",label:"📎 Docs"},...(ct._linked
# After:  {id:"docs",label:"📎 Docs"},{id:"suivi",label:"📋 Suivi"},...(ct._linked
sed -i 's/{id:"docs",label:"📎 Docs"}/{id:"docs",label:"📎 Docs"},{id:"suivi",label:"📋 Suivi"}/g' App.jsx

echo "P0.3A — Tab 'Suivi' ajouté dans la barre d'onglets"
PATCH_P03A

$SSH 'bash -s' << 'PATCH_P03B'
cd /var/www/planora/app/src

# Check if already patched
if grep -q 'collabFicheTab==="suivi"' App.jsx; then
  echo "P0.3 tab contenu déjà présent — skip"
  exit 0
fi

# ── STEP B: Add Suivi tab CONTENT ──
# Insert after the "partage" tab section (which ends with a closing div and })
# We look for the unique pattern: collabFicheTab==="docs"
# and insert the suivi tab content BEFORE it

DOCS_TAB_LINE=$(grep -n 'collabFicheTab==="docs"' App.jsx | head -1 | cut -d: -f1)

if [ -z "$DOCS_TAB_LINE" ]; then
  echo "ERREUR: Tab docs introuvable pour insertion du contenu Suivi"
  exit 1
fi

echo "Tab docs trouvé à la ligne $DOCS_TAB_LINE — insertion du Suivi avant"

# Insert Suivi tab content BEFORE the docs tab
# This uses HookIsolator (same pattern as other tabs with hooks)
# Calls GET /api/transfer/followers/:contactId (existing API from deploy-v7.sh)
INJECT_BEFORE=$((DOCS_TAB_LINE - 1))

sed -i "${INJECT_BEFORE}a\\
\\
                  {/* P0.3 — Onglet Suivi — V7 Transfer Tracking */}\\
                  {collabFicheTab===\"suivi\"&&<HookIsolator>{()=>{\\
                    const [followers, setFollowers] = useState({executor:null,sources:[],viewers:[],followers:[]});\\
                    const [loaded, setLoaded] = useState(false);\\
                    useEffect(()=>{\\
                      if(!ct?.id) return;\\
                      api('/api/transfer/followers/'+ct.id).then(d=>{\\
                        if(d&&!d.error) setFollowers(d);\\
                        setLoaded(true);\\
                      }).catch(()=>setLoaded(true));\\
                    },[ct.id]);\\
                    if(!loaded) return <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Chargement...</div>;\\
                    const hasData = followers.executor || followers.sources.length>0 || followers.viewers.length>0 || followers.followers.length>0;\\
                    if(!hasData) return (\\
                      <div style={{textAlign:'center',padding:40}}>\\
                        <div style={{width:48,height:48,borderRadius:14,background:'#8B5CF612',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>\\
                          <I n='users' s={22} style={{color:'#8B5CF6'}}/>\\
                        </div>\\
                        <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>Aucun suivi actif</div>\\
                        <div style={{fontSize:12,color:T.text3}}>Ce contact n'a pas encore été transféré.<br/>Utilisez le bouton Transférer pour assigner ce contact à un collègue.</div>\\
                      </div>\\
                    );\\
                    return (\\
                      <div>\\
                        {/* Executor actuel */}\\
                        {followers.executor && (\\
                          <div style={{padding:'12px 14px',borderRadius:10,background:'#8B5CF608',border:'1.5px solid #8B5CF625',marginBottom:12}}>\\
                            <div style={{fontSize:11,fontWeight:700,color:'#8B5CF6',marginBottom:8,display:'flex',alignItems:'center',gap:4}}><I n='user-check' s={13}/> Executor actuel</div>\\
                            <div style={{display:'flex',alignItems:'center',gap:10}}>\\
                              <Avatar name={followers.executor.collaboratorName||'?'} color='#8B5CF6' s={32}/>\\
                              <div style={{flex:1}}>\\
                                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{followers.executor.collaboratorName}</div>\\
                                <div style={{fontSize:11,color:T.text3}}>{followers.executor.collaboratorEmail||''}</div>\\
                              </div>\\
                              <div style={{textAlign:'right'}}>\\
                                {followers.executor.lastKnownExecutorStage && <div style={{fontSize:10,fontWeight:600,color:'#8B5CF6',padding:'2px 6px',borderRadius:4,background:'#8B5CF612'}}>{followers.executor.lastKnownExecutorStage}</div>}\\
                                <div style={{fontSize:9,color:T.text3,marginTop:2}}>depuis {new Date(followers.executor.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>\\
                              </div>\\
                            </div>\\
                          </div>\\
                        )}\\
                        {/* Sources */}\\
                        {followers.sources.length>0 && (\\
                          <div style={{marginBottom:12}}>\\
                            <div style={{fontSize:11,fontWeight:700,color:'#F97316',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n='arrow-right-circle' s={13}/> Source{followers.sources.length>1?'s':''} ({followers.sources.length})</div>\\
                            {followers.sources.map(s=>(\\
                              <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,marginBottom:4}}>\\
                                <Avatar name={s.collaboratorName||'?'} color='#F97316' s={26}/>\\
                                <div style={{flex:1}}>\\
                                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{s.collaboratorName}</div>\\
                                  <div style={{fontSize:10,color:T.text3}}>Mode: {s.trackingMode||'silent'}</div>\\
                                </div>\\
                                <div style={{fontSize:9,color:T.text3}}>{new Date(s.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>\\
                              </div>\\
                            ))}\\
                          </div>\\
                        )}\\
                        {/* Followers / Viewers */}\\
                        {(followers.viewers.length>0||followers.followers.length>0) && (\\
                          <div style={{marginBottom:12}}>\\
                            <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n='eye' s={13}/> Observateurs ({followers.viewers.length+followers.followers.length})</div>\\
                            {[...followers.viewers,...followers.followers].map(f=>(\\
                              <div key={f.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,marginBottom:3}}>\\
                                <Avatar name={f.collaboratorName||'?'} color={T.text3} s={22}/>\\
                                <div style={{fontSize:12,color:T.text}}>{f.collaboratorName}</div>\\
                                <div style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{f.role}</div>\\
                              </div>\\
                            ))}\\
                          </div>\\
                        )}\\
                        {/* Actions rapides */}\\
                        <div style={{display:'flex',gap:8,marginTop:8}}>\\
                          {collabs.length>1 && <div onClick={()=>{setV7TransferModal({contact:ct,fromFicheSuivi:true});setV7TransferTarget('');}} style={{flex:1,padding:'8px 0',borderRadius:8,textAlign:'center',fontSize:12,fontWeight:700,cursor:'pointer',background:'#8B5CF610',color:'#8B5CF6',border:'1px solid #8B5CF625'}}>\\
                            <I n='users' s={13}/> Transférer\\
                          </div>}\\
                        </div>\\
                      </div>\\
                    );\\
                  }}</HookIsolator>}" App.jsx

echo "P0.3B — Contenu tab Suivi ajouté avant la ligne $DOCS_TAB_LINE"
PATCH_P03B
echo ""

# ── 5. Build & Restart ──
echo "[5/5] Build frontend & restart PM2..."
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -5"
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -5"
echo ""

# ── Verification ──
echo "═══ VERIFICATION P0 ═══"
echo ""
echo "— P0.1: Bouton Transférer Pipeline Live —"
$SSH "grep -c 'fromPhonePipeline' /var/www/planora/app/src/App.jsx"
echo ""
echo "— P0.2: Badges Pipeline Live —"
$SSH "grep -c 'P0.2.*executor badge\|Executor badge on Pipeline' /var/www/planora/app/src/App.jsx"
echo ""
echo "— P0.3: Onglet Suivi —"
$SSH "grep -c 'collabFicheTab.*suivi\|id:\"suivi\"' /var/www/planora/app/src/App.jsx"
echo ""
echo "— Counts totaux V7 —"
$SSH "grep -c 'v7TransferModal\|v7FollowersMap\|handleV7Transfer' /var/www/planora/app/src/App.jsx"
echo ""

# Quick syntax check — look for build errors
echo "— Dernières lignes PM2 —"
$SSH "pm2 logs planora --lines 5 --nostream 2>&1 | tail -5"
echo ""

echo "═══ P0 DEPLOYMENT COMPLETE ═══"
echo ""
echo "Ce qui a été ajouté :"
echo "  P0.1 — Bouton Transférer (icône users violet) sur Pipeline Live"
echo "  P0.2 — Badge executor (prénom violet) sur les cartes Pipeline Live"
echo "  P0.3 — Onglet 📋 Suivi dans la fiche contact (executor, source, observers)"
echo ""
echo "Recharge la page et vérifie :"
echo "  1. Pipeline Live → carte contact → icône users violet à côté de SMS"
echo "  2. Pipeline Live → carte transférée → badge violet avec prénom"
echo "  3. Fiche contact → onglet 📋 Suivi → détails du transfert"
