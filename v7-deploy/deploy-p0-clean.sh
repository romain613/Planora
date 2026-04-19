#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# P0 CLEAN — Repart de App.jsx.pre-v7 et applique tout proprement
# Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
#
# CE SCRIPT:
#   1. Restaure App.jsx.pre-v7 (état propre avant tout patch V7)
#   2. Réapplique deploy-v7.sh (V7 base + CRM kanban) via node
#   3. Applique P0.1 — Bouton Transférer sur Pipeline Live
#   4. Applique P0.2 — Badge executor sur Pipeline Live
#   5. Applique P0.3 — Onglet Suivi dans la fiche contact
#   6. Build + restart
#
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

echo "═══ P0 CLEAN DEPLOYMENT ═══"
echo ""

# ── 0. Restore clean App.jsx ──
echo "[0/7] Restauration App.jsx.pre-v7 (état propre)..."
$SSH 'bash -s' << 'RESTORE'
cd /var/www/planora/app/src
if [ ! -f App.jsx.pre-v7 ]; then
  echo "ERREUR: App.jsx.pre-v7 introuvable — impossible de restaurer"
  exit 1
fi
cp App.jsx App.jsx.pre-p0-clean-backup
cp App.jsx.pre-v7 App.jsx
echo "App.jsx restauré depuis pre-v7"

# Verify the clean file does NOT have v7 stuff
if grep -q "v7TransferModal" App.jsx; then
  echo "WARNING: App.jsx.pre-v7 contient déjà du V7 — pas un backup propre"
  exit 1
fi
echo "Fichier propre confirmé (aucun code V7)"
RESTORE
echo ""

# ── 1. Re-apply V7 base via node (safer than sed for complex patches) ──
echo "[1/7] Application V7 base (states + handler + modal + CRM button)..."
$SSH 'node -e "
const fs = require(\"fs\");
const file = \"/var/www/planora/app/src/App.jsx\";
let code = fs.readFileSync(file, \"utf8\");

// ── A. V7 State declarations — after pipelineRdvForm useState ──
const stateTarget = \"pipelineRdvForm, setPipelineRdvForm\";
const stateIdx = code.indexOf(stateTarget);
if (stateIdx === -1) { console.error(\"ERROR: pipelineRdvForm not found\"); process.exit(1); }
const stateLineEnd = code.indexOf(\"\\n\", stateIdx);

const v7States = \`

  // ── V7 Transfer State ──
  const [v7TransferModal, setV7TransferModal] = useState(null);
  const [v7TransferTarget, setV7TransferTarget] = useState(\\'\\');
  const [v7TransferLoading, setV7TransferLoading] = useState(false);
  const [v7FollowersMap, setV7FollowersMap] = useState({});
  const v7FollowersLoadedRef = useRef(false);

  // ── V7: Load followers batch for badges ──
  useEffect(() => {
    if (!company?.id || v7FollowersLoadedRef.current) return;
    v7FollowersLoadedRef.current = true;
    api(\\'/api/transfer/followers-batch\\').then(r => {
      if (r && typeof r === \\'object\\' && !r.error) setV7FollowersMap(r);
    }).catch(() => {});
  }, [company?.id]);

  // ── V7: Transfer handler ──
  const handleV7Transfer = async () => {
    if (!v7TransferModal?.contact?.id || !v7TransferTarget) return;
    setV7TransferLoading(true);
    try {
      const r = await api(\\'/api/transfer/executor/\\' + v7TransferModal.contact.id, {
        method: \\'PUT\\',
        body: { executorCollabId: v7TransferTarget }
      });
      if (r?.success) {
        showNotif(r.message || \\'Contact transféré\\', \\'success\\');
        const updated = await api(\\'/api/data/contacts?companyId=\\' + company.id + \\'&collaboratorId=\\' + collab.id);
        if (updated?.contacts) setContacts(updated.contacts);
        v7FollowersLoadedRef.current = false;
        const fm = await api(\\'/api/transfer/followers-batch\\');
        if (fm && typeof fm === \\'object\\' && !fm.error) setV7FollowersMap(fm);
        setV7TransferModal(null);
        setV7TransferTarget(\\'\\');
      } else {
        showNotif(r?.error || \\'Erreur lors du transfert\\', \\'danger\\');
      }
    } catch (e) {
      showNotif(\\'Erreur réseau\\', \\'danger\\');
    }
    setV7TransferLoading(false);
  };\`;

code = code.slice(0, stateLineEnd + 1) + v7States + code.slice(stateLineEnd + 1);
console.log(\"V7 states + handler added\");

// ── B. Transfer button on CRM Kanban (after Notes button) ──
const notesBtn = \`n=\\\"edit-3\\\" s={9}/> Notes</div>\`;
const notesBtnIdx = code.indexOf(notesBtn);
if (notesBtnIdx !== -1) {
  const notesLineEnd = code.indexOf(\"\\n\", notesBtnIdx);
  const crmTransferBtn = \`
                              <div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget(\\'\\');}} style={{flex:\\'1 1 28%\\',padding:\\'3px 0\\',borderRadius:8,fontSize:10,fontWeight:600,cursor:\\'pointer\\',background:\\'#8B5CF618\\',color:\\'#8B5CF6\\',textAlign:\\'center\\',border:\\'1px solid #8B5CF630\\'}} title=\\'Transférer à un collègue\\'>Transférer</div>\`;
  code = code.slice(0, notesLineEnd) + crmTransferBtn + code.slice(notesLineEnd);
  console.log(\"CRM kanban transfer button added\");
}

// ── C. V7 Transfer Modal (before collabChatFloating) ──
const chatFloat = \"collabChatFloating\";
const chatFloatIdx = code.indexOf(chatFloat);
if (chatFloatIdx !== -1) {
  const chatFloatLineStart = code.lastIndexOf(\"\\n\", chatFloatIdx);
  const modalCode = \`
            {/* V7 TRANSFER MODAL */}
            {v7TransferModal && (
              <div style={{position:\\'fixed\\',inset:0,background:\\'rgba(0,0,0,0.5)\\',zIndex:9999,display:\\'flex\\',alignItems:\\'center\\',justifyContent:\\'center\\'}} onClick={()=>setV7TransferModal(null)}>
                <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:24,width:420,maxWidth:\\'90vw\\',boxShadow:\\'0 20px 60px rgba(0,0,0,0.3)\\'}}>
                  <div style={{display:\\'flex\\',alignItems:\\'center\\',gap:10,marginBottom:16}}>
                    <div style={{width:36,height:36,borderRadius:10,background:\\'#8B5CF618\\',display:\\'flex\\',alignItems:\\'center\\',justifyContent:\\'center\\',color:\\'#8B5CF6\\'}}><I n=\\'users\\' s={18}/></div>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:T.text}}>Transférer un contact</div>
                      <div style={{fontSize:12,color:T.text3}}>{v7TransferModal.contact?.name}</div>
                    </div>
                  </div>
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:\\'block\\'}}>Transférer à :</label>
                    <select value={v7TransferTarget} onChange={e=>setV7TransferTarget(e.target.value)} style={{width:\\'100%\\',padding:\\'10px 12px\\',borderRadius:10,border:\\'1px solid \\'+T.border,background:T.bg,color:T.text,fontSize:14}}>
                      <option value=\\'\\'>Sélectionner un collaborateur...</option>
                      {(collabs||[]).filter(c=>c.id!==collab.id).map(c=>(<option key={c.id} value={c.id}>{c.name} {c.email ? \\'(\\'+c.email+\\')\\' : \\'\\'}</option>))}
                    </select>
                  </div>
                  <div style={{fontSize:12,color:T.text3,marginBottom:16,padding:10,borderRadius:8,background:T.accentBg}}>
                    <I n=\\'info\\' s={12}/> Le contact sera transféré. Vous resterez en suivi comme source.
                  </div>
                  <div style={{display:\\'flex\\',gap:10,justifyContent:\\'flex-end\\'}}>
                    <div onClick={()=>setV7TransferModal(null)} style={{padding:\\'8px 16px\\',borderRadius:10,fontSize:13,fontWeight:600,cursor:\\'pointer\\',color:T.text2,background:T.bg,border:\\'1px solid \\'+T.border}}>Annuler</div>
                    <div onClick={handleV7Transfer} style={{padding:\\'8px 20px\\',borderRadius:10,fontSize:13,fontWeight:700,cursor:v7TransferTarget&&!v7TransferLoading?\\'pointer\\':\\'not-allowed\\',color:\\'#fff\\',background:v7TransferTarget?\\'#8B5CF6\\':\\'#8B5CF660\\',opacity:v7TransferLoading?0.6:1}}>
                      {v7TransferLoading?\\'Transfert...\\':\\'Transférer\\'}
                    </div>
                  </div>
                </div>
              </div>
            )}
\`;
  code = code.slice(0, chatFloatLineStart) + modalCode + code.slice(chatFloatLineStart);
  console.log(\"V7 transfer modal added\");
}

// ── D. CRM Kanban executor/source badges (after Partagé badge) ──
const sharedBadge = \`Partagé</span>\`;
const sharedIdx = code.indexOf(sharedBadge);
if (sharedIdx !== -1) {
  const sharedLineEnd = code.indexOf(\"\\n\", sharedIdx);
  const badgeCode = \`
                                  {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:\\'1px 5px\\',borderRadius:8,fontSize:8,fontWeight:700,background:\\'#8B5CF618\\',color:\\'#8B5CF6\\',flexShrink:0}} title={\\'Chez \\'+v7FollowersMap[ct.id].executor.collaboratorName}>Chez {(v7FollowersMap[ct.id].executor.collaboratorName||\\'\\').split(\\' \\')[0]}</span>}\`;
  code = code.slice(0, sharedLineEnd) + badgeCode + code.slice(sharedLineEnd);
  console.log(\"CRM kanban badges added\");
}

fs.writeFileSync(file, code);
console.log(\"V7 base complete\");
"'
echo ""

# ── 2. P0.1 — Transfer button on Pipeline Live ──
echo "[2/7] P0.1 — Bouton Transférer sur Pipeline Live..."
$SSH 'node -e "
const fs = require(\"fs\");
const file = \"/var/www/planora/app/src/App.jsx\";
let code = fs.readFileSync(file, \"utf8\");

// Find SMS button in phone pipeline: setPhoneRightTab + sms + message-square on same line
const lines = code.split(\"\\n\");
let smsLineIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(\"setPhoneRightTab\") && lines[i].includes(\"sms\") && lines[i].includes(\"message-square\")) {
    smsLineIdx = i;
    break;
  }
}

if (smsLineIdx === -1) {
  console.error(\"ERROR: SMS button not found in phone pipeline\");
  process.exit(1);
}

console.log(\"SMS button found at line \" + (smsLineIdx + 1));

const transferBtn = \"                    {collabs.length>1&&<div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget(\\'\\'');}} style={{padding:\\'3px 5px\\',borderRadius:6,background:\\'#8B5CF610\\',color:\\'#8B5CF6\\',fontSize:9,cursor:\\'pointer\\',border:\\'1px solid #8B5CF625\\',display:\\'flex\\',alignItems:\\'center\\',gap:2}} title=\\'Transférer à un collègue\\'><I n=\\'users\\' s={9}/></div>}\";

lines.splice(smsLineIdx + 1, 0, transferBtn);
fs.writeFileSync(file, lines.join(\"\\n\"));
console.log(\"P0.1 — Transfer button added to Pipeline Live\");
"'
echo ""

# ── 3. P0.2 — Executor badge on Pipeline Live ──
echo "[3/7] P0.2 — Badge executor sur Pipeline Live..."
$SSH 'node -e "
const fs = require(\"fs\");
const file = \"/var/www/planora/app/src/App.jsx\";
let code = fs.readFileSync(file, \"utf8\");

// Find the card_label in phone pipeline
// The phone pipeline version has fontSize:7 (CRM has fontSize:8)
// Its in a div with: ct.name, building-2, and card_label all on the same line
const lines = code.split(\"\\n\");
let phoneBadgeLine = -1;

// We need to find the SECOND occurrence of card_label&&<span (first is CRM, second is phone)
let occurrences = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(\"card_label&&<span\") && lines[i].includes(\"card_color\")) {
    occurrences++;
    if (occurrences === 2) {
      phoneBadgeLine = i;
      break;
    }
  }
}

// Fallback: search for the line containing ct.name + fontSize:7 + card_label
if (phoneBadgeLine === -1) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(\"fontSize:7\") && lines[i].includes(\"card_label\") && lines[i].includes(\"card_color\")) {
      phoneBadgeLine = i;
      break;
    }
  }
}

if (phoneBadgeLine === -1) {
  console.log(\"WARNING: card_label line not found for phone pipeline badges — skipping\");
  process.exit(0);
}

console.log(\"Phone pipeline card_label found at line \" + (phoneBadgeLine + 1));

const badgeLine = \"                      {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:\\'0 4px\\',borderRadius:4,fontSize:7,fontWeight:700,background:\\'#8B5CF620\\',color:\\'#8B5CF6\\',flexShrink:0}} title={\\'Chez \\'+v7FollowersMap[ct.id].executor.collaboratorName}>{(v7FollowersMap[ct.id].executor.collaboratorName||\\'\\'').split(\\' \\')[0]}</span>}\";

lines.splice(phoneBadgeLine + 1, 0, badgeLine);
fs.writeFileSync(file, lines.join(\"\\n\"));
console.log(\"P0.2 — Executor badge added to Pipeline Live\");
"'
echo ""

# ── 4. P0.3A — Add Suivi tab definition ──
echo "[4/7] P0.3A — Ajout onglet Suivi dans la barre..."
$SSH 'node -e "
const fs = require(\"fs\");
const file = \"/var/www/planora/app/src/App.jsx\";
let code = fs.readFileSync(file, \"utf8\");

// Add suivi tab after docs tab in the tab bar
const target = \"{id:\\\"docs\\\",label:\\\"📎 Docs\\\"}\";
if (!code.includes(target)) {
  console.error(\"ERROR: docs tab definition not found\");
  process.exit(1);
}

code = code.replace(target, target + \",{id:\\\"suivi\\\",label:\\\"📋 Suivi\\\"}\");
fs.writeFileSync(file, code);
console.log(\"P0.3A — Suivi tab added to tab bar\");
"'
echo ""

# ── 5. P0.3B — Add Suivi tab content ──
echo "[5/7] P0.3B — Ajout contenu onglet Suivi..."
$SSH 'node -e "
const fs = require(\"fs\");
const file = \"/var/www/planora/app/src/App.jsx\";
let code = fs.readFileSync(file, \"utf8\");

// Find the docs tab content line
const docsTabPattern = \"collabFicheTab===\\\"docs\\\"\";
const docsIdx = code.indexOf(docsTabPattern);
if (docsIdx === -1) {
  console.error(\"ERROR: docs tab content not found\");
  process.exit(1);
}

// Find the start of the line containing the docs tab
const docsLineStart = code.lastIndexOf(\"\\n\", docsIdx);

const suiviTabContent = \`

                  {/* P0.3 — Onglet Suivi — V7 Transfer Tracking */}
                  {collabFicheTab===\"suivi\"&&<HookIsolator>{()=>{
                    const [followers, setFollowers] = useState({executor:null,sources:[],viewers:[],followers:[]});
                    const [loaded, setLoaded] = useState(false);
                    useEffect(()=>{
                      if(!ct?.id) return;
                      api(\"/api/transfer/followers/\"+ct.id).then(d=>{
                        if(d&&!d.error) setFollowers(d);
                        setLoaded(true);
                      }).catch(()=>setLoaded(true));
                    },[ct.id]);
                    if(!loaded) return <div style={{textAlign:\"center\",padding:30,color:T.text3,fontSize:13}}>Chargement...</div>;
                    const hasData = followers.executor || followers.sources.length>0 || followers.viewers.length>0 || followers.followers.length>0;
                    if(!hasData) return (
                      <div style={{textAlign:\"center\",padding:40}}>
                        <div style={{width:48,height:48,borderRadius:14,background:\"#8B5CF612\",display:\"flex\",alignItems:\"center\",justifyContent:\"center\",margin:\"0 auto 12px\"}}>
                          <I n=\"users\" s={22} style={{color:\"#8B5CF6\"}}/>
                        </div>
                        <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>Aucun suivi actif</div>
                        <div style={{fontSize:12,color:T.text3}}>Ce contact n\\'a pas encore \u00e9t\u00e9 transf\u00e9r\u00e9.<br/>Utilisez le bouton Transf\u00e9rer pour assigner ce contact \u00e0 un coll\u00e8gue.</div>
                      </div>
                    );
                    return (
                      <div>
                        {followers.executor && (
                          <div style={{padding:\"12px 14px\",borderRadius:10,background:\"#8B5CF608\",border:\"1.5px solid #8B5CF625\",marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:\"#8B5CF6\",marginBottom:8,display:\"flex\",alignItems:\"center\",gap:4}}><I n=\"user-check\" s={13}/> Executor actuel</div>
                            <div style={{display:\"flex\",alignItems:\"center\",gap:10}}>
                              <Avatar name={followers.executor.collaboratorName||\"?\"} color=\"#8B5CF6\" s={32}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{followers.executor.collaboratorName}</div>
                                <div style={{fontSize:11,color:T.text3}}>{followers.executor.collaboratorEmail||\"\"}</div>
                              </div>
                              <div style={{textAlign:\"right\"}}>
                                {followers.executor.lastKnownExecutorStage && <div style={{fontSize:10,fontWeight:600,color:\"#8B5CF6\",padding:\"2px 6px\",borderRadius:4,background:\"#8B5CF612\"}}>{followers.executor.lastKnownExecutorStage}</div>}
                                <div style={{fontSize:9,color:T.text3,marginTop:2}}>depuis {new Date(followers.executor.createdAt).toLocaleDateString(\"fr-FR\",{day:\"numeric\",month:\"short\"})}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {followers.sources.length>0 && (
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:\"#F97316\",marginBottom:6,display:\"flex\",alignItems:\"center\",gap:4}}><I n=\"arrow-right-circle\" s={13}/> Source{followers.sources.length>1?\"s\":\"\"} ({followers.sources.length})</div>
                            {followers.sources.map(s=>(
                              <div key={s.id} style={{display:\"flex\",alignItems:\"center\",gap:8,padding:\"8px 10px\",borderRadius:8,background:T.bg,border:\"1px solid \"+T.border,marginBottom:4}}>
                                <Avatar name={s.collaboratorName||\"?\"} color=\"#F97316\" s={26}/>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{s.collaboratorName}</div>
                                  <div style={{fontSize:10,color:T.text3}}>Mode: {s.trackingMode||\"silent\"}</div>
                                </div>
                                <div style={{fontSize:9,color:T.text3}}>{new Date(s.createdAt).toLocaleDateString(\"fr-FR\",{day:\"numeric\",month:\"short\"})}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(followers.viewers.length>0||followers.followers.length>0) && (
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:\"flex\",alignItems:\"center\",gap:4}}><I n=\"eye\" s={13}/> Observateurs ({followers.viewers.length+followers.followers.length})</div>
                            {[...followers.viewers,...followers.followers].map(f=>(
                              <div key={f.id} style={{display:\"flex\",alignItems:\"center\",gap:8,padding:\"6px 10px\",borderRadius:8,background:T.bg,border:\"1px solid \"+T.border,marginBottom:3}}>
                                <Avatar name={f.collaboratorName||\"?\"} color={T.text3} s={22}/>
                                <div style={{fontSize:12,color:T.text}}>{f.collaboratorName}</div>
                                <div style={{fontSize:9,color:T.text3,marginLeft:\"auto\"}}>{f.role}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{display:\"flex\",gap:8,marginTop:8}}>
                          {collabs.length>1 && <div onClick={()=>{setV7TransferModal({contact:ct,fromFicheSuivi:true});setV7TransferTarget(\\'\\');}} style={{flex:1,padding:\"8px 0\",borderRadius:8,textAlign:\"center\",fontSize:12,fontWeight:700,cursor:\"pointer\",background:\"#8B5CF610\",color:\"#8B5CF6\",border:\"1px solid #8B5CF625\"}}>
                            <I n=\"users\" s={13}/> Transf\u00e9rer
                          </div>}
                        </div>
                      </div>
                    );
                  }}</HookIsolator>}
\`;

code = code.slice(0, docsLineStart) + suiviTabContent + code.slice(docsLineStart);
fs.writeFileSync(file, code);
console.log(\"P0.3B — Suivi tab content added\");
"'
echo ""

# ── 6. Build & Restart ──
echo "[6/7] Build frontend & restart PM2..."
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -3"
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

# ── 7. Verification ──
echo "[7/7] ═══ VERIFICATION ═══"
echo ""
echo "— V7 base —"
$SSH "echo 'v7TransferModal:' \$(grep -c 'v7TransferModal' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'handleV7Transfer:' \$(grep -c 'handleV7Transfer' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'v7FollowersMap:' \$(grep -c 'v7FollowersMap' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.1: Pipeline Live transfer button —"
$SSH "echo 'fromPhonePipeline:' \$(grep -c 'fromPhonePipeline' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.2: Pipeline Live executor badge —"
$SSH "echo 'executor badge (phone):' \$(grep -c 'Chez.*executor.*collaboratorName.*fontSize:7' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.3: Suivi tab —"
$SSH "echo 'suivi tab def:' \$(grep -c 'id:\"suivi\"' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'suivi tab content:' \$(grep -c 'collabFicheTab===\"suivi\"' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— PM2 status —"
$SSH "pm2 logs planora --lines 3 --nostream 2>&1 | tail -3"
echo ""
echo "═══ P0 CLEAN DEPLOYMENT COMPLETE ═══"
echo ""
echo "Recharge la page et vérifie :"
echo "  1. Pipeline Live → bouton users violet à côté de SMS"
echo "  2. Pipeline Live → badge violet si contact transféré"
echo "  3. Fiche contact → onglet 📋 Suivi"
