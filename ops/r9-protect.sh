#!/usr/bin/env bash
# r9-protect.sh — Garde-fou anti-régression frontend Planora
# Voir docs/R9-PROTECT.md pour la spec complète.
#
# Usage :
#   ./ops/r9-protect.sh check-source     # pré-build : vérifie alignement Git
#   ./ops/r9-protect.sh check-bundle     # post-build : vérifie marqueurs dans le bundle
#   ./ops/r9-protect.sh pre-build        # alias check-source (avant `npm run build`)
#   ./ops/r9-protect.sh post-build       # alias check-bundle (après `npm run build`)
#   ./ops/r9-protect.sh full             # check-source + check-bundle (si bundle existe)
#
# Codes de sortie :
#   0  OK
#   1  Erreur usage
#   2  Désalignement Git (STOP)
#   3  Marqueur critique manquant dans le bundle (STOP)
#   4  Pas de bundle trouvé

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Couleurs (TTY only) ─────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; BLUE=''; BOLD=''; RESET=''
fi

log_info()  { printf "${BLUE}[r9]${RESET} %s\n" "$*"; }
log_ok()    { printf "${GREEN}[r9]${RESET} %s\n" "$*"; }
log_warn()  { printf "${YELLOW}[r9]${RESET} %s\n" "$*"; }
log_err()   { printf "${RED}${BOLD}[r9 STOP]${RESET} %s\n" "$*"; }

# ── Liste autoritative des marqueurs critiques ──────────────
# Chaque ligne = un marqueur ROBUSTE (string littérale qui survit la minification).
# Si absent du bundle, build = régression. Cf. docs/R9-PROTECT.md §4.1.
#
# Format : "marqueur|description"
# Les marqueurs sont choisis parmi :
#   - Texte UI français (h3, button, placeholder, alert)
#   - Endpoints API (URL string)
#   - Clés localStorage (string littérale persistante)
#   - Champs DB column-named (jamais minifiés car string keys)
R9_MARKERS=(
  "post_call_smart_pipeline|PostCallResultModal (smart post-call)"
  "Agenda partag|SharedAgendaTab (RDV transmis multi-collab)"
  "Fusionner deux fiches|MergeContactsModal (merge contacts)"
  "Doublons potentiels|DuplicatesPanel (CRM doublons admin)"
  "Programmer un RDV|ScheduleRdvModal (prise RDV partagée)"
  "Programmer un appel|ScheduleCallModal (planif appel)"
  "Reprendre / annuler transmission|ReassignBooking/recover (V1.10.4.A)"
  "Réattribuer|Reassign action (V1.10.4.A)"
  "SENDER_SLOT_CONFLICT|SenderConflictModal (V1.10.4.D)"
  "limit=10000|Envelope detail full fetch"
  "calendar360-session|localStorage session client-side"
  "consentStatus|Module consent (toggle + guard call)"
  "googleEventId|Filtre + sync Google Calendar"
  "meetLink|Google Meet integration"
  "bookedByCollaboratorId|V1.10.4.A transmissions cross-collab"
  "agendaOwnerId|V1.10.4.A transmissions cross-collab"
  "/api/bookings/reporting|Endpoint reporting Reçus/Transmis"
  "/api/bookings/transmitted|Endpoint Agenda partagé"
  "nrp_followups_json|NRP follow-ups (intégré Smart V1.10.4-r9)"
  "/merge|Endpoint fusion contacts (POST /api/data/contacts/:id/merge)"
  # === Markers cycle r11.0.27-28 (Audit 14 §7.2) ===
  "ReminderChooser|Reminder system r11.0.27.b modal chooser"
  "ContacteChooser|Contact établi mini-chooser r11.0.27.a"
  "bookingType|Reminder vs RDV discrimination (r11.0.27.b)"
  "reminderFired|Polling 30s reminders flag (r11.0.27.c)"
  "sync-reminders|Endpoint reminder notifications (r11.0.27.c)"
  "loss_reason|Perdu motif fiche contact (r11.0.27.d)"
  "previousChooser|Back to chooser cross-modal state (r11.0.27.b.1)"
  "Retour aux choix|Bouton back chooser (r11.0.27.b.2)"
  "AUJOURD'HUI|Today badge agenda Day+Week (r11.0.28.c)"
  "tabular-nums|Now-line pill heure + numéros jour (r11.0.28.c)"
  "agendaNowPulse|Now-line dot animation (r11.0.28.c)"
  "useRecentActivityFeed|Hook activité récente Command Center (r11.0.25)"
  "pipeline.stage|Pipeline stages multi-cycle"
  "_CASCADE_STAGES|Undo cascade fix r11.0.27.b.1"
  "c360-agendaFilter|localStorage agenda filter (r11.0.25/26)"
)

EXPECTED_BRANCH="clean-main"
REMOTE_NAME="origin"

# ── check-source ────────────────────────────────────────────
# Vérifie qu'on est aligné avec origin/clean-main avant build.
check_source() {
  log_info "Pré-build check — alignement Git"

  # 1. Repo Git ?
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    log_err "Pas dans un dépôt Git."
    return 2
  fi

  # 2. Branche courante = clean-main ?
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "$EXPECTED_BRANCH" ]; then
    log_err "Branche courante = '$branch' (attendu : '$EXPECTED_BRANCH')."
    log_err "Checkout obligatoire : git checkout $EXPECTED_BRANCH"
    return 2
  fi
  log_ok "Branche : $branch"

  # 3. Fetch silencieux pour comparer
  if ! git fetch "$REMOTE_NAME" "$EXPECTED_BRANCH" --quiet 2>/dev/null; then
    log_warn "git fetch $REMOTE_NAME $EXPECTED_BRANCH a échoué (réseau ?)."
    log_warn "Continuer SANS vérification distante n'est PAS sûr — STOP recommandé."
    return 2
  fi

  # 4. Retard sur origin ?
  local behind
  behind="$(git rev-list --count HEAD.."$REMOTE_NAME/$EXPECTED_BRANCH" 2>/dev/null || echo 0)"
  if [ "$behind" -gt 0 ]; then
    log_err "Branche locale en retard de $behind commit(s) sur $REMOTE_NAME/$EXPECTED_BRANCH."
    log_err "Risque R9 : un build maintenant produit un bundle incomplet."
    log_err "Action : git pull $REMOTE_NAME $EXPECTED_BRANCH --ff-only"
    git log --oneline "HEAD..$REMOTE_NAME/$EXPECTED_BRANCH" | sed 's/^/  → /'
    return 2
  fi
  log_ok "À jour avec $REMOTE_NAME/$EXPECTED_BRANCH"

  # 5. Avance non poussée ?
  local ahead
  ahead="$(git rev-list --count "$REMOTE_NAME/$EXPECTED_BRANCH"..HEAD 2>/dev/null || echo 0)"
  if [ "$ahead" -gt 0 ]; then
    log_warn "Branche locale en avance de $ahead commit(s) non poussé(s) sur $REMOTE_NAME/$EXPECTED_BRANCH."
    log_warn "Build OK mais push recommandé avant deploy (pour traçabilité)."
    git log --oneline "$REMOTE_NAME/$EXPECTED_BRANCH..HEAD" | sed 's/^/  → /'
  fi

  # 6. Modifications non commitées dans app/src/ ?
  local dirty
  dirty="$(git status --porcelain -- app/src/ | head -20)"
  if [ -n "$dirty" ]; then
    log_warn "Modifications non commitées dans app/src/ (build inclura ces changements) :"
    printf '%s\n' "$dirty" | sed 's/^/  → /'
    log_warn "Ces modifs SONT-elles intentionnelles pour ce build ? Sinon STOP."
  fi

  log_ok "Pré-build check : OK (commit $(git rev-parse --short HEAD))"
  return 0
}

# ── check-bundle ────────────────────────────────────────────
# Vérifie que les marqueurs critiques sont présents dans le bundle généré.
check_bundle() {
  log_info "Post-build check — marqueurs critiques dans le bundle"

  local bundle_dir="app/dist/assets"
  if [ ! -d "$bundle_dir" ]; then
    log_err "Pas de dossier $bundle_dir — bundle absent."
    log_err "Lance d'abord : cd app && npm run build"
    return 4
  fi

  # Trouver le bundle index-*.js (peut y en avoir plusieurs si rebuild sans clean)
  local bundles
  bundles=$(find "$bundle_dir" -maxdepth 1 -type f -name 'index-*.js' 2>/dev/null)
  if [ -z "$bundles" ]; then
    log_err "Aucun fichier index-*.js trouvé dans $bundle_dir."
    return 4
  fi

  # Si plusieurs bundles, prendre le plus récent
  local bundle
  bundle="$(ls -t "$bundle_dir"/index-*.js 2>/dev/null | head -1)"
  log_info "Bundle inspecté : $(basename "$bundle") ($(du -h "$bundle" | cut -f1))"

  local missing=()
  local found=0
  for entry in "${R9_MARKERS[@]}"; do
    local marker="${entry%%|*}"
    local desc="${entry#*|}"
    if grep -q -F -- "$marker" "$bundle"; then
      found=$((found + 1))
    else
      missing+=("$marker — $desc")
    fi
  done

  log_info "Marqueurs trouvés : $found / ${#R9_MARKERS[@]}"

  if [ ${#missing[@]} -gt 0 ]; then
    log_err "Marqueur(s) critique(s) ABSENT(S) du bundle :"
    for m in "${missing[@]}"; do
      printf "  → %s\n" "$m"
    done
    log_err "C'est un signal R9 : le build a produit un bundle incomplet."
    log_err "NE PAS DÉPLOYER. Investiguer :"
    log_err "  - git diff $REMOTE_NAME/$EXPECTED_BRANCH -- app/src/ (qu'est-ce qui manque ?)"
    log_err "  - grep -rn '<marqueur>' app/src/ (le code source contient-il le marqueur ?)"
    return 3
  fi

  log_ok "Tous les marqueurs critiques sont présents."
  return 0
}

# ── Constantes SSH (Audit 14 §7) ────────────────────────────
VPS_SSH="${R9_VPS_SSH:-ssh -i $HOME/.ssh/id_ed25519 -o ConnectTimeout=8 root@136.144.204.115}"

# ── check-db ────────────────────────────────────────────────
# Vérifie intégrité + FK des DBs prod via SSH (READ-ONLY).
check_db() {
  log_info "DB check — intégrité + FK (READ-ONLY via SSH)"

  local dbs=(
    "/var/www/planora-data/calendar360.db"
    "/var/www/planora-data/control_tower.db"
  )

  for db in "${dbs[@]}"; do
    local status
    status=$($VPS_SSH "sqlite3 $db 'PRAGMA integrity_check;'" 2>&1 | head -1)
    if [ "$status" != "ok" ]; then
      log_err "$db integrity_check FAILED : $status"
      return 3
    fi
    log_ok "$(basename $db) integrity : ok"

    local fk_count
    fk_count=$($VPS_SSH "sqlite3 $db 'PRAGMA foreign_key_check;' | wc -l" 2>&1)
    if [ "$fk_count" -gt 0 ]; then
      log_err "$db FK violations : $fk_count lignes"
      return 3
    fi
    log_ok "$(basename $db) FK : clean"
  done

  return 0
}

# ── check-pm2 ───────────────────────────────────────────────
# Vérifie PID stable + status online via SSH (READ-ONLY).
# Utilise pm2 jlist + jq pour parsing robuste.
check_pm2() {
  log_info "PM2 check — PID + status (jq parsing)"

  local expected_pid="${PHASE1_BASELINE_PID:-2318858}"
  local pm2_data
  pm2_data=$($VPS_SSH "pm2 jlist 2>/dev/null | jq -r '.[] | select(.name==\"calendar360\") | \"\(.pid) \(.pm2_env.status) \(.pm2_env.restart_time)\"'" 2>&1)

  if [ -z "$pm2_data" ]; then
    log_err "PM2 calendar360 introuvable (jq parse failed)"
    return 3
  fi

  local current_pid current_status current_restarts
  current_pid=$(echo "$pm2_data" | awk '{print $1}')
  current_status=$(echo "$pm2_data" | awk '{print $2}')
  current_restarts=$(echo "$pm2_data" | awk '{print $3}')

  if [ "$current_pid" != "$expected_pid" ]; then
    log_err "PM2 PID changé : attendu $expected_pid, actuel $current_pid"
    log_err "PM2 a redémarré — investigation requise"
    return 3
  fi
  log_ok "PM2 PID stable : $current_pid"

  if [ "$current_status" != "online" ]; then
    log_err "PM2 status ≠ online : $current_status"
    return 3
  fi
  log_ok "PM2 status : online"
  log_ok "PM2 restart_count : $current_restarts"

  return 0
}

# ── check-routes ────────────────────────────────────────────
# Vérifie I2 : aucune route shared/ montée dans server/index.js (local check).
check_routes() {
  log_info "Routes check — invariant I2 (aucune route shared/ montée)"

  local violations=""
  if [ -f server/index.js ]; then
    violations=$(grep -nE "from ['\"]\\./shared/" server/index.js 2>/dev/null || true)
    if [ -n "$violations" ]; then
      log_err "Import depuis shared/ détecté dans server/index.js (violates I2):"
      printf '%s\n' "$violations" | sed 's/^/  → /'
      return 3
    fi

    local mount_violations
    mount_violations=$(grep -nE "app\\.use.*['\"][^'\"]*shared" server/index.js 2>/dev/null || true)
    if [ -n "$mount_violations" ]; then
      log_err "app.use(shared) détecté dans server/index.js (violates I2):"
      printf '%s\n' "$mount_violations" | sed 's/^/  → /'
      return 3
    fi
    log_ok "server/index.js : aucune route shared/ montée"
  else
    log_warn "server/index.js absent localement — check SSH skipped"
  fi

  return 0
}

# ── check-invariants ────────────────────────────────────────
# Orchestrateur I1+I2+I3+I4 (Audit 14 §7.6).
check_invariants() {
  log_info "Invariants check — I1, I2, I3, I4"

  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")

  # I1 — Si branche feature/phase1-* : aucun fichier hors shared/ modifié
  if [[ "$current_branch" == feature/phase1-* ]]; then
    local off_scope
    off_scope=$(git diff --name-only clean-main..HEAD 2>/dev/null | \
                grep -vE '^(server/shared/|\.eslintrc|server/shared/README\.md|\.gitignore|docs/|INCIDENTS/|ops/r9-protect)' \
                || true)
    if [ -n "$off_scope" ]; then
      log_err "I1 violé : fichiers hors server/shared/ modifiés :"
      printf '%s\n' "$off_scope" | sed 's/^/  → /'
      return 3
    fi
    log_ok "I1 : aucun fichier legacy modifié"
  else
    log_info "I1 : skip (branche $current_branch, pas feature/phase1-*)"
  fi

  # I2 — check-routes
  check_routes || return 3

  # I3 — Bundle MD5 (si baseline connue)
  if [ -n "${PHASE1_BASELINE_BUNDLE_MD5:-}" ]; then
    local current_md5
    current_md5=$($VPS_SSH "md5sum /var/www/vhosts/calendar360.fr/httpdocs/assets/$PHASE1_BASELINE_BUNDLE_FILENAME 2>/dev/null | awk '{print \$1}'")
    if [ "$current_md5" != "$PHASE1_BASELINE_BUNDLE_MD5" ]; then
      log_err "I3 violé : bundle MD5 changé"
      log_err "  Attendu: $PHASE1_BASELINE_BUNDLE_MD5"
      log_err "  Actuel : $current_md5"
      return 3
    fi
    log_ok "I3 : bundle MD5 inchangé ($current_md5)"
  else
    log_info "I3 : skip (PHASE1_BASELINE_BUNDLE_MD5 non défini)"
  fi

  # I4 — DB SHA-256 (si baseline connue)
  if [ -n "${PHASE1_BASELINE_DB_SHA:-}" ]; then
    local current_db_sha
    current_db_sha=$($VPS_SSH "sha256sum /var/www/planora-data/calendar360.db | awk '{print \$1}'")
    if [ "$current_db_sha" != "$PHASE1_BASELINE_DB_SHA" ]; then
      log_warn "I4 : DB SHA-256 changé (writes runtime normaux possibles)"
      log_warn "  Baseline: $PHASE1_BASELINE_DB_SHA"
      log_warn "  Actuel : $current_db_sha"
      # I4 = warning, pas erreur, car writes legacy attendus
    else
      log_ok "I4 : DB SHA-256 inchangé"
    fi
  else
    log_info "I4 : skip (PHASE1_BASELINE_DB_SHA non défini)"
  fi

  return 0
}

# ── Dispatcher ──────────────────────────────────────────────
cmd="${1:-}"
case "$cmd" in
  check-source|pre-build)
    check_source
    ;;
  check-bundle|post-build)
    check_bundle
    ;;
  check-db)
    check_db
    ;;
  check-pm2)
    check_pm2
    ;;
  check-routes)
    check_routes
    ;;
  check-invariants)
    check_invariants
    ;;
  full)
    check_source || exit $?
    if [ -d app/dist/assets ]; then
      check_bundle
    else
      log_warn "Pas de bundle local — skip check-bundle (lance d'abord npm run build)."
    fi
    ;;
  full+)
    rc=0
    check_source || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    if [ -d app/dist/assets ]; then
      check_bundle || rc=$?
      [ "$rc" -ne 0 ] && exit "$rc"
    else
      log_warn "Pas de bundle local — skip check-bundle"
    fi
    check_db || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_pm2 || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_routes || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_invariants || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    log_ok "============================================"
    log_ok "R9-PROTECT full+ : TOUS LES CHECKS PASSENT"
    log_ok "============================================"
    ;;
  phase1)
    # Mode CHECKPOINT Phase 1 : skip check-source (branche feature/chore) + skip check-bundle (no rebuild)
    rc=0
    log_info "R9-PROTECT phase1 mode — Phase 1 CHECKPOINT validation"
    check_db || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_pm2 || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_routes || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    check_invariants || rc=$?
    [ "$rc" -ne 0 ] && exit "$rc"
    log_ok "============================================"
    log_ok "R9-PROTECT phase1 : TOUS LES CHECKS PASSENT"
    log_ok "============================================"
    ;;
  ""|-h|--help|help)
    cat <<EOF
r9-protect.sh — Garde-fou anti-régression frontend + invariants Phase 1 Planora

Modes :
  check-source       Pré-build : alignement Git vs origin/clean-main
  check-bundle       Post-build : marqueurs critiques bundle (35 markers)
  check-db           DB intégrité + FK (READ-ONLY SSH)
  check-pm2          PM2 PID stable + status online (READ-ONLY SSH)
  check-routes       Aucune route shared/ montée (invariant I2)
  check-invariants   Orchestrateur I1+I2+I3+I4
  full               check-source + check-bundle (legacy, pre-deploy depuis clean-main)
  full+              check-source + check-bundle + check-db + check-pm2 + check-routes + check-invariants
  phase1             CHECKPOINT Phase 1 : check-db + check-pm2 + check-routes + check-invariants
                     (skip check-source/check-bundle car branche feature + no rebuild)

Variables baseline (export pour I3/I4) :
  PHASE1_BASELINE_PID            = 2318858
  PHASE1_BASELINE_BUNDLE_MD5     = 63b8d8e1...
  PHASE1_BASELINE_BUNDLE_FILENAME= index-B9BAx_hy.js
  PHASE1_BASELINE_DB_SHA         = 02cca29c...
  R9_VPS_SSH                     = ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 (override)

Voir docs/R9-PROTECT.md + AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md.

Codes de sortie :
  0 OK
  2 Désalignement Git
  3 Marqueur critique manquant / invariant violé
  4 Pas de bundle
EOF
    exit 0
    ;;
  *)
    log_err "Commande inconnue : $cmd"
    log_err "Utilise --help pour voir l'usage."
    exit 1
    ;;
esac
