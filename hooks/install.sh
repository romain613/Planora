#!/usr/bin/env bash
# hooks/install.sh — Installe les Git hooks Phase 1 hardening dans .git/hooks/
# Source: Audit 14 §4.2.2-4.2.5
# Usage: ./hooks/install.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$REPO_ROOT/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_DST" ]; then
  echo "ERROR: $HOOKS_DST not found (not a git repo?)"
  exit 1
fi

echo "Installing Phase 1 hardening hooks..."
echo "  Source : $HOOKS_SRC"
echo "  Dest   : $HOOKS_DST"
echo ""

for hook in pre-commit commit-msg pre-push; do
  if [ -f "$HOOKS_DST/$hook" ] && [ ! -f "$HOOKS_DST/$hook.before-hardening" ]; then
    cp "$HOOKS_DST/$hook" "$HOOKS_DST/$hook.before-hardening"
    echo "  Backup : $HOOKS_DST/$hook.before-hardening"
  fi
  cp "$HOOKS_SRC/$hook" "$HOOKS_DST/$hook"
  chmod +x "$HOOKS_DST/$hook"
  echo "  Installed : $HOOKS_DST/$hook"
done

echo ""
echo "Hooks installed. Tests recommandés :"
echo "  1. git checkout clean-main && touch test.db && git add test.db && git commit -m 'test'"
echo "     → doit échouer (clean-main + .db block)"
echo "  2. ALLOW_MAIN_COMMIT=1 git commit -m 'bad message'"
echo "     → doit échouer (commit-msg format invalide)"
echo ""
echo "Bypass autorisés (cas exceptionnels documentés) :"
echo "  ALLOW_MAIN_COMMIT=1     : autorise commit clean-main"
echo "  ALLOW_PHASE1_LEGACY=1   : autorise commit hors server/shared/ sur branche feature/phase1-*"
echo "  ALLOW_MSG_FREE=1        : autorise message non-conforme"
echo "  ALLOW_DESTRUCTIVE_PUSH=1: autorise force-push tag ou delete branche"
echo ""
echo "Voir docs/RUNBOOKS/ + AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md §4.2"
