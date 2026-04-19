#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# V7 Patch — Add Transfer button to Pipeline Live (phone kanban)
# + Add Suivi tab in right panel contact fiche
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

echo "═══ V7 PATCH — PIPELINE LIVE + FICHE SUIVI ═══"
echo ""

# ── 1. Backup App.jsx ──
echo "[1/4] Backup..."
$SSH "cp /var/www/planora/app/src/App.jsx /var/www/planora/app/src/App.jsx.pre-v7-patch2"
echo "App.jsx backed up"
echo ""

# ── 2. Add Transfer button to Pipeline Live phone kanban ──
echo "[2/4] Ajout bouton Transférer sur Pipeline Live..."
$SSH 'bash -s' << 'PATCH1'
cd /var/www/planora/app/src

# Check if already patched
if grep -q "v7TransferModal.*fromPhonePipeline" App.jsx; then
  echo "Phone pipeline transfer button already present — skipping"
  exit 0
fi

# Find the SMS button line in the phone pipeline (the one with "message-square" and "Envoyer SMS")
# It's the last button before the closing </div> of the action buttons row
# Pattern: ct.phone&&<div.*Envoyer SMS.*message-square
SMS_BTN_LINE=$(grep -n 'Envoyer SMS.*message-square\|message-square.*Envoyer SMS' App.jsx | head -1 | cut -d: -f1)

if [ -z "$SMS_BTN_LINE" ]; then
  echo "WARNING: Could not find SMS button in phone pipeline"
  # Fallback: find the action buttons div closing in phone pipeline area
  # Search for pattern near line 10422 equivalent
  SMS_BTN_LINE=$(grep -n "setPipelineRightContact.*setPhoneRightTab.*sms" App.jsx | head -1 | cut -d: -f1)
fi

if [ -z "$SMS_BTN_LINE" ]; then
  echo "ERROR: Could not locate phone pipeline action buttons"
  exit 1
fi

echo "Found SMS button at line $SMS_BTN_LINE"

# Insert Transfer button after the SMS button
sed -i "${SMS_BTN_LINE}a\\
                    {collabs.length>1&&<div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}} style={{padding:'3px 5px',borderRadius:6,background:'#8B5CF610',color:'#8B5CF6',fontSize:9,cursor:'pointer',border:'1px solid #8B5CF625',display:'flex',alignItems:'center',gap:2}} title='Transférer à un collègue'><I n='users' s={9}/></div>}" App.jsx

echo "Transfer button added to Pipeline Live"
PATCH1
echo ""

# ── 3. Add V7 executor badge on phone pipeline cards ──
echo "[3/4] Ajout badges executor/source sur Pipeline Live..."
$SSH 'bash -s' << 'PATCH2'
cd /var/www/planora/app/src

if grep -q "v7FollowersMap.*fromPhonePipeline\|v7FollowersMap.*ct\.id.*executor.*Phone" App.jsx; then
  echo "Phone pipeline V7 badges already present — skipping"
  exit 0
fi

# Find the card_label badge in phone pipeline cards
# Pattern: ct.card_label&&<span — this is in the phone pipeline card header
CARD_LABEL_LINE=$(grep -n "ct\.card_label&&<span.*card_color.*flexShrink" App.jsx | head -1 | cut -d: -f1)

if [ -z "$CARD_LABEL_LINE" ]; then
  echo "WARNING: Could not find card_label badge in phone pipeline — skipping badges"
  exit 0
fi

echo "Found card_label at line $CARD_LABEL_LINE"

# Insert V7 badges after the card_label badge
sed -i "${CARD_LABEL_LINE}a\\
                      {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'0 4px',borderRadius:4,fontSize:7,fontWeight:700,background:'#8B5CF620',color:'#8B5CF6',flexShrink:0}} title={'Chez '+v7FollowersMap[ct.id].executor.collaboratorName}>{(v7FollowersMap[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}" App.jsx

echo "V7 badges added to phone pipeline cards"
PATCH2
echo ""

# ── 4. Build & Restart ──
echo "[4/4] Build frontend & restart PM2..."
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -3"
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

# ── Verification ──
echo "═══ VERIFICATION ═══"
$SSH "grep -c 'v7TransferModal' /var/www/planora/app/src/App.jsx"
$SSH "grep -c 'v7FollowersMap' /var/www/planora/app/src/App.jsx"
$SSH "grep -c 'fromPhonePipeline' /var/www/planora/app/src/App.jsx"
echo ""
echo "═══ PATCH COMPLETE ═══"
echo "Le bouton Transférer (icône users violet) apparaît maintenant sur Pipeline Live aussi."
echo "Recharge la page et vérifie."
