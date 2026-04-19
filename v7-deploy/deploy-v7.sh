#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# V7 Source/Executor Transfer — Deployment Script
# Calendar360 / PLANORA
# Date: 2026-04-17
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"
REMOTE_DIR="/var/www/planora"

echo "═══ V7 DEPLOYMENT START ═══"
echo ""

# ── 1. Backup current files ──
echo "[1/6] Backup des fichiers actuels..."
$SSH "cp $REMOTE_DIR/server/db/database.js $REMOTE_DIR/server/db/database.js.pre-v7 && echo 'database.js backed up'"
$SSH "cp $REMOTE_DIR/server/index.js $REMOTE_DIR/server/index.js.pre-v7 && echo 'index.js backed up'"
$SSH "cp $REMOTE_DIR/app/src/App.jsx $REMOTE_DIR/app/src/App.jsx.pre-v7 && echo 'App.jsx backed up'"
echo ""

# ── 2. Upload transfer routes file ──
echo "[2/6] Upload transfer.js route..."
$SCP patches/transfer.js $VPS:$REMOTE_DIR/server/routes/transfer.js
echo "transfer.js uploaded"
echo ""

# ── 3. Patch database.js — insert V7 schema + helpers before final export ──
echo "[3/6] Patch database.js (V7 schema + helpers)..."
$SCP patches/database-v7-patch.js $VPS:/tmp/database-v7-patch.js
$SSH 'bash -s' << 'DBPATCH'
cd /var/www/planora/server/db

# Read the patch content (skip the first comment-only lines that are instructions)
PATCH_CONTENT=$(cat /tmp/database-v7-patch.js | grep -v "^// À INSÉRER\|^// ═══$")

# Find the line number of "export { db, parseRow };"
EXPORT_LINE=$(grep -n "export { db, parseRow };" database.js | head -1 | cut -d: -f1)
if [ -z "$EXPORT_LINE" ]; then
  echo "ERROR: Could not find 'export { db, parseRow };' in database.js"
  exit 1
fi

echo "Found export line at: $EXPORT_LINE"

# Check if V7 already patched
if grep -q "V7 SOURCE/EXECUTOR MODEL" database.js; then
  echo "V7 already patched in database.js — skipping"
else
  # Split file: before export + patch + export onwards
  BEFORE=$((EXPORT_LINE - 1))
  head -n $BEFORE database.js > /tmp/db_part1.js
  cat /tmp/database-v7-patch.js >> /tmp/db_part1.js
  echo "" >> /tmp/db_part1.js
  tail -n +$EXPORT_LINE database.js >> /tmp/db_part1.js
  cp /tmp/db_part1.js database.js
  echo "database.js patched with V7 schema + helpers"
fi
DBPATCH
echo ""

# ── 4. Patch index.js — add transfer route import + mount ──
echo "[4/6] Patch index.js (add transfer route)..."
$SSH 'bash -s' << 'IDXPATCH'
cd /var/www/planora/server

# Check if already patched
if grep -q "transferRoutes" index.js; then
  echo "transfer route already in index.js — skipping"
else
  # Add import after the last import line
  LAST_IMPORT=$(grep -n "^import.*Routes.*from" index.js | tail -1 | cut -d: -f1)
  if [ -z "$LAST_IMPORT" ]; then
    echo "ERROR: Could not find import lines in index.js"
    exit 1
  fi

  # Insert import after last import
  sed -i "${LAST_IMPORT}a\\import transferRoutes from './routes/transfer.js';" index.js
  echo "Added import at line $((LAST_IMPORT + 1))"

  # Add app.use after last app.use route
  LAST_USE=$(grep -n "^app.use('/api/" index.js | tail -1 | cut -d: -f1)
  if [ -z "$LAST_USE" ]; then
    echo "ERROR: Could not find app.use lines in index.js"
    exit 1
  fi

  sed -i "${LAST_USE}a\\app.use('/api/transfer', transferRoutes);" index.js
  echo "Added app.use at line $((LAST_USE + 1))"

  echo "index.js patched"
fi
IDXPATCH
echo ""

# ── 5. Patch App.jsx — add V7 transfer UI ──
echo "[5/6] Patch App.jsx (V7 transfer UI)..."
$SSH 'bash -s' << 'APPPATCH'
cd /var/www/planora/app/src

# Check if already patched
if grep -q "v7TransferModal" App.jsx; then
  echo "V7 transfer UI already in App.jsx — skipping"
  exit 0
fi

# ── A. Add V7 state declarations after pipelineRdvForm line ──
TARGET_LINE=$(grep -n "pipelineRdvForm.*setPipelineRdvForm.*useState" App.jsx | head -1 | cut -d: -f1)
if [ -z "$TARGET_LINE" ]; then
  echo "ERROR: Could not find pipelineRdvForm state in App.jsx"
  exit 1
fi

# Insert V7 states
sed -i "${TARGET_LINE}a\\
\\
  // ── V7 Transfer State ──\\
  const [v7TransferModal, setV7TransferModal] = useState(null); // { contact, fromPipeline: true }\\
  const [v7TransferTarget, setV7TransferTarget] = useState('');\\
  const [v7TransferLoading, setV7TransferLoading] = useState(false);\\
  const [v7FollowersMap, setV7FollowersMap] = useState({});\\
  const v7FollowersLoadedRef = useRef(false);" App.jsx

echo "V7 states added after line $TARGET_LINE"

# ── B. Add V7 data loader after the state declarations ──
# Find the newly inserted v7FollowersLoadedRef line
V7REF_LINE=$(grep -n "v7FollowersLoadedRef = useRef" App.jsx | head -1 | cut -d: -f1)

sed -i "${V7REF_LINE}a\\
\\
  // ── V7: Load followers batch for badges ──\\
  useEffect(() => {\\
    if (!company?.id || v7FollowersLoadedRef.current) return;\\
    v7FollowersLoadedRef.current = true;\\
    api('/api/transfer/followers-batch').then(r => {\\
      if (r && typeof r === 'object' && !r.error) setV7FollowersMap(r);\\
    }).catch(() => {});\\
  }, [company?.id]);\\
\\
  // ── V7: Transfer handler ──\\
  const handleV7Transfer = async () => {\\
    if (!v7TransferModal?.contact?.id || !v7TransferTarget) return;\\
    setV7TransferLoading(true);\\
    try {\\
      const r = await api('/api/transfer/executor/' + v7TransferModal.contact.id, {\\
        method: 'PUT',\\
        body: { executorCollabId: v7TransferTarget }\\
      });\\
      if (r?.success) {\\
        showNotif(r.message || 'Contact transféré', 'success');\\
        // Refresh contacts list\\
        const updated = await api('/api/data/contacts?companyId=' + company.id + '&collaboratorId=' + collab.id);\\
        if (updated?.contacts) setContacts(updated.contacts);\\
        // Refresh followers map\\
        v7FollowersLoadedRef.current = false;\\
        const fm = await api('/api/transfer/followers-batch');\\
        if (fm && typeof fm === 'object' && !fm.error) setV7FollowersMap(fm);\\
        setV7TransferModal(null);\\
        setV7TransferTarget('');\\
      } else {\\
        showNotif(r?.error || 'Erreur lors du transfert', 'danger');\\
      }\\
    } catch (e) {\\
      showNotif('Erreur réseau', 'danger');\\
    }\\
    setV7TransferLoading(false);\\
  };" App.jsx

echo "V7 data loader + handler added"

# ── C. Add "Transférer" button on Kanban cards ──
# Find the line with the Notes button on kanban cards
# Pattern: "Notes</div>" right after the Email button in the kanban card action buttons
NOTES_BTN_LINE=$(grep -n "n=\"edit-3\" s={9}/> Notes</div>" App.jsx | head -1 | cut -d: -f1)
if [ -z "$NOTES_BTN_LINE" ]; then
  echo "WARNING: Could not find Notes button in kanban cards"
else
  sed -i "${NOTES_BTN_LINE}a\\
                              <div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget('');}} style={{flex:'1 1 28%',padding:'3px 0',borderRadius:8,fontSize:10,fontWeight:600,cursor:'pointer',background:'#8B5CF618',color:'#8B5CF6',textAlign:'center',border:'1px solid #8B5CF630'}} title='Transférer à un collègue'>Transférer</div>" App.jsx
  echo "Transfer button added to kanban cards at line $NOTES_BTN_LINE"
fi

# ── D. Add V7 Transfer Modal before the last closing div of CollabPortal ──
# Find a good injection point — after the existing modals, before return ends
# We'll add the modal right after the pipeline bulk SMS modal closing
# Search for the transfer modal injection point: near the end of the kanban section
# Actually, let's find the collabChatFloating section which is near the end
INJECT_LINE=$(grep -n "collabChatFloating.*&&.*<div.*style.*position.*fixed" App.jsx | head -1 | cut -d: -f1)
if [ -z "$INJECT_LINE" ]; then
  # Fallback: find near end of collab portal component
  INJECT_LINE=$(grep -n "return.*<div.*className.*collab-portal\|CollabPortal.*return" App.jsx | head -1 | cut -d: -f1)
fi

if [ -n "$INJECT_LINE" ]; then
  INJECT_BEFORE=$((INJECT_LINE - 1))
  sed -i "${INJECT_BEFORE}a\\
\\
            {/* ═══ V7 TRANSFER MODAL ═══ */}\\
            {v7TransferModal && (\\
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setV7TransferModal(null)}>\\
                <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:24,width:420,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>\\
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>\\
                    <div style={{width:36,height:36,borderRadius:10,background:'#8B5CF618',display:'flex',alignItems:'center',justifyContent:'center',color:'#8B5CF6'}}><I n='users' s={18}/></div>\\
                    <div>\\
                      <div style={{fontSize:16,fontWeight:700,color:T.text}}>Transférer un contact</div>\\
                      <div style={{fontSize:12,color:T.text3}}>{v7TransferModal.contact?.name}</div>\\
                    </div>\\
                  </div>\\
                  <div style={{marginBottom:16}}>\\
                    <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:'block'}}>Transférer à :</label>\\
                    <select value={v7TransferTarget} onChange={e=>setV7TransferTarget(e.target.value)} style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:14}}>\\
                      <option value=''>Sélectionner un collaborateur...</option>\\
                      {(collabs||[]).filter(c=>c.id!==collab.id).map(c=>(<option key={c.id} value={c.id}>{c.name} {c.email ? '('+c.email+')' : ''}</option>))}\\
                    </select>\\
                  </div>\\
                  <div style={{fontSize:12,color:T.text3,marginBottom:16,padding:10,borderRadius:8,background:T.accentBg}}>\\
                    <I n='info' s={12}/> Le contact sera transféré au collaborateur sélectionné. Vous resterez en suivi comme source du contact.\\
                  </div>\\
                  <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>\\
                    <div onClick={()=>setV7TransferModal(null)} style={{padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',color:T.text2,background:T.bg,border:'1px solid '+T.border}}>Annuler</div>\\
                    <div onClick={handleV7Transfer} style={{padding:'8px 20px',borderRadius:10,fontSize:13,fontWeight:700,cursor:v7TransferTarget&&!v7TransferLoading?'pointer':'not-allowed',color:'#fff',background:v7TransferTarget?'#8B5CF6':'#8B5CF660',opacity:v7TransferLoading?0.6:1}}>\\
                      {v7TransferLoading?'Transfert...':'Transférer'}\\
                    </div>\\
                  </div>\\
                </div>\\
              </div>\\
            )}" App.jsx
  echo "V7 transfer modal added before line $INJECT_LINE"
fi

# ── E. Add V7 executor badge on kanban cards ──
# Find the "Partagé" badge on kanban cards and add executor badge after it
SHARED_BADGE_LINE=$(grep -n "Partagé</span>" App.jsx | head -1 | cut -d: -f1)
if [ -n "$SHARED_BADGE_LINE" ]; then
  sed -i "${SHARED_BADGE_LINE}a\\
                                  {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'1px 5px',borderRadius:8,fontSize:8,fontWeight:700,background:'#8B5CF618',color:'#8B5CF6',flexShrink:0}} title={'Executor: '+v7FollowersMap[ct.id].executor.collaboratorName}>Chez {(v7FollowersMap[ct.id].executor.collaboratorName||\"\").split(' ')[0]}</span>}\\
                                  {v7FollowersMap[ct.id]?.sources?.length > 0 && <span style={{padding:'1px 5px',borderRadius:8,fontSize:8,fontWeight:700,background:'#F9731618',color:'#F97316',flexShrink:0}} title={'Source: '+(v7FollowersMap[ct.id].sources||[]).map(s=>s.collaboratorName).join(', ')}>Source: {(v7FollowersMap[ct.id].sources[0]?.collaboratorName||\"\").split(' ')[0]}</span>}" App.jsx
  echo "V7 executor/source badges added to kanban cards"
fi

echo "App.jsx patched with V7 transfer UI"
APPPATCH
echo ""

# ── 6. Build & Restart ──
echo "[6/6] Build frontend & restart PM2..."
$SSH "cd $REMOTE_DIR/app && npm run build 2>&1 | tail -5"
$SSH "cd $REMOTE_DIR && pm2 restart ecosystem.config.cjs 2>&1 | tail -5"
echo ""

# ── Verification ──
echo "═══ VERIFICATION ═══"
$SSH "grep -c 'V7 SOURCE/EXECUTOR MODEL\|setActiveExecutor\|addSourceFollower' $REMOTE_DIR/server/db/database.js"
$SSH "test -f $REMOTE_DIR/server/routes/transfer.js && echo 'transfer.js: OK' || echo 'transfer.js: MISSING'"
$SSH "grep -c 'transferRoutes' $REMOTE_DIR/server/index.js"
$SSH "grep -c 'v7TransferModal\|handleV7Transfer' $REMOTE_DIR/app/src/App.jsx"
$SSH "pm2 logs planora --lines 5 --nostream 2>&1 | grep -i 'V7\|error\|ready' | tail -5"
echo ""
echo "═══ V7 DEPLOYMENT COMPLETE ═══"
echo "Teste en te connectant comme collaborateur et regarde les cartes Kanban → bouton 'Transférer'"
