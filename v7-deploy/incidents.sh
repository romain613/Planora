#!/bin/bash
# PLANORA — Incidents browser
# Affiche l'historique des deploys + bugs détectés depuis le log JSONL sur VPS.
#
# Usage:
#   ./v7-deploy/incidents.sh             # Liste les 10 derniers deploys avec verdict
#   ./v7-deploy/incidents.sh latest      # Détails du dernier deploy uniquement
#   ./v7-deploy/incidents.sh <deploy_id> # Détails d'un deploy spécifique (ex: d-20260420-003000)
#   ./v7-deploy/incidents.sh critical    # Liste les bugs CRITIQUES historiques
#   ./v7-deploy/incidents.sh major       # Liste les bugs MAJEURS historiques

set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY -o ConnectTimeout=10"
LOG="/var/log/planora-deploys.jsonl"

R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'; B='\033[0;34m'; N='\033[0m'; BOLD='\033[1m'

MODE="${1:-list}"

case "$MODE" in
  list)
    echo -e "${BOLD}═══ Derniers 10 deploys ═══${N}"
    $SSH $VPS "test -f $LOG && tail -n 200 $LOG || echo NO_LOG_YET" | \
      grep -E '"event":"check"|"event":"rollback"' | \
      awk -F'"' '
      {
        for(i=1;i<=NF;i++){
          if($i=="ts"){ts=$(i+2)}
          if($i=="deploy_id"){did=$(i+2)}
          if($i=="event"){evt=$(i+2)}
          if($i=="severity"){sev=$(i+2)}
          if($i=="status"){st=$(i+2)}
          if($i=="name"){nm=$(i+2)}
        }
        deploys[did]=ts
        if(evt=="check"&&st=="fail"){
          if(sev=="critique"){crit[did]++}
          if(sev=="majeur"){maj[did]++}
        }
        if(evt=="check"&&st=="warn"){
          if(sev=="mineur"){min[did]++}
        }
        if(evt=="rollback"){rb[did]=1}
      }
      END {
        for(d in deploys){
          printf "%s|%s|%d|%d|%d|%d\n", deploys[d], d, crit[d]+0, maj[d]+0, min[d]+0, rb[d]+0
        }
      }
    ' | sort -r | head -10 | while IFS='|' read -r ts did c m mn rb; do
      if [ "$rb" = "1" ]; then
        STATUS="${R}ROLLBACK${N}"
      elif [ "$c" -gt 0 ]; then
        STATUS="${R}CRITIQUE${N}"
      elif [ "$m" -gt 0 ]; then
        STATUS="${Y}MAJEUR${N}  "
      elif [ "$mn" -gt 0 ]; then
        STATUS="${Y}MINEUR${N}  "
      else
        STATUS="${G}SUCCESS${N} "
      fi
      printf "  %-22s %-22s " "$ts" "$did"
      printf "%b  " "$STATUS"
      printf "C:%d M:%d m:%d\n" "$c" "$m" "$mn"
    done
    echo
    echo "  Détails: ./v7-deploy/incidents.sh <deploy_id>"
    echo "  Dernier: ./v7-deploy/incidents.sh latest"
    ;;

  latest)
    LATEST_ID=$($SSH $VPS "test -f $LOG && tail -n 50 $LOG | grep -oE '\"deploy_id\":\"[^\"]+\"' | tail -1 | cut -d'\"' -f4")
    if [ -z "$LATEST_ID" ]; then
      echo "Aucun deploy enregistré."
      exit 0
    fi
    echo -e "${BOLD}═══ Détails du dernier deploy ($LATEST_ID) ═══${N}"
    $SSH $VPS "grep '$LATEST_ID' $LOG" | while IFS= read -r line; do
      TS=$(echo "$line" | grep -oE '"ts":"[^"]+"' | cut -d'"' -f4)
      EVT=$(echo "$line" | grep -oE '"event":"[^"]+"' | cut -d'"' -f4)
      SEV=$(echo "$line" | grep -oE '"severity":"[^"]+"' | cut -d'"' -f4)
      NAME=$(echo "$line" | grep -oE '"name":"[^"]+"' | cut -d'"' -f4)
      STATUS=$(echo "$line" | grep -oE '"status":"[^"]+"' | cut -d'"' -f4)
      DETAIL=$(echo "$line" | grep -oE '"detail":"[^"]+"' | cut -d'"' -f4)
      REASON=$(echo "$line" | grep -oE '"reason":"[^"]+"' | cut -d'"' -f4)
      case "$EVT-$SEV-$STATUS" in
        check-info-pass)    echo -e "  ${G}✅${N} $NAME — $DETAIL" ;;
        check-mineur-warn)  echo -e "  ${Y}⚠ MINEUR${N}   $NAME — $DETAIL" ;;
        check-majeur-fail)  echo -e "  ${Y}⚠ MAJEUR${N}   $NAME — $DETAIL" ;;
        check-critique-fail) echo -e "  ${R}❌ CRITIQUE${N} $NAME — $DETAIL" ;;
        rollback-*)          echo -e "  ${R}↩ ROLLBACK${N} — $REASON" ;;
        *)                   echo "  $line" ;;
      esac
    done
    ;;

  critical|critique)
    echo -e "${BOLD}═══ Tous les bugs CRITIQUES historiques ═══${N}"
    $SSH $VPS "test -f $LOG && grep '\"severity\":\"critique\"' $LOG | grep '\"status\":\"fail\"'" | while IFS= read -r line; do
      TS=$(echo "$line" | grep -oE '"ts":"[^"]+"' | cut -d'"' -f4)
      DID=$(echo "$line" | grep -oE '"deploy_id":"[^"]+"' | cut -d'"' -f4)
      NAME=$(echo "$line" | grep -oE '"name":"[^"]+"' | cut -d'"' -f4)
      DETAIL=$(echo "$line" | grep -oE '"detail":"[^"]+"' | cut -d'"' -f4)
      echo -e "  ${R}❌${N} $TS  $DID  $NAME — $DETAIL"
    done
    ;;

  major|majeur)
    echo -e "${BOLD}═══ Tous les bugs MAJEURS historiques ═══${N}"
    $SSH $VPS "test -f $LOG && grep '\"severity\":\"majeur\"' $LOG | grep '\"status\":\"fail\"'" | while IFS= read -r line; do
      TS=$(echo "$line" | grep -oE '"ts":"[^"]+"' | cut -d'"' -f4)
      DID=$(echo "$line" | grep -oE '"deploy_id":"[^"]+"' | cut -d'"' -f4)
      NAME=$(echo "$line" | grep -oE '"name":"[^"]+"' | cut -d'"' -f4)
      DETAIL=$(echo "$line" | grep -oE '"detail":"[^"]+"' | cut -d'"' -f4)
      echo -e "  ${Y}⚠${N} $TS  $DID  $NAME — $DETAIL"
    done
    ;;

  d-*)
    DID="$MODE"
    echo -e "${BOLD}═══ Détails du deploy $DID ═══${N}"
    $SSH $VPS "test -f $LOG && grep '$DID' $LOG" | while IFS= read -r line; do
      TS=$(echo "$line" | grep -oE '"ts":"[^"]+"' | cut -d'"' -f4)
      EVT=$(echo "$line" | grep -oE '"event":"[^"]+"' | cut -d'"' -f4)
      SEV=$(echo "$line" | grep -oE '"severity":"[^"]+"' | cut -d'"' -f4)
      NAME=$(echo "$line" | grep -oE '"name":"[^"]+"' | cut -d'"' -f4)
      STATUS=$(echo "$line" | grep -oE '"status":"[^"]+"' | cut -d'"' -f4)
      DETAIL=$(echo "$line" | grep -oE '"detail":"[^"]+"' | cut -d'"' -f4)
      echo "  [$TS] $EVT $SEV/$STATUS  $NAME — $DETAIL"
    done
    ;;

  *)
    echo "Usage: $0 [list|latest|critical|major|<deploy_id>]"
    exit 1
    ;;
esac
