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

# ── Dispatcher ──────────────────────────────────────────────
cmd="${1:-}"
case "$cmd" in
  check-source|pre-build)
    check_source
    ;;
  check-bundle|post-build)
    check_bundle
    ;;
  full)
    check_source || exit $?
    if [ -d app/dist/assets ]; then
      check_bundle
    else
      log_warn "Pas de bundle local — skip check-bundle (lance d'abord npm run build)."
    fi
    ;;
  ""|-h|--help|help)
    cat <<EOF
r9-protect.sh — Garde-fou anti-régression frontend Planora

Usage :
  ./ops/r9-protect.sh check-source   Pré-build : vérifie alignement Git
  ./ops/r9-protect.sh check-bundle   Post-build : vérifie marqueurs critiques
  ./ops/r9-protect.sh full           Les deux (skip bundle si absent)

Voir docs/R9-PROTECT.md pour le détail.

Codes de sortie :
  0 OK
  2 Désalignement Git
  3 Marqueur critique manquant
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
