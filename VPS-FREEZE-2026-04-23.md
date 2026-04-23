# VPS Production Freeze — 2026-04-23 09:10 UTC

## Date / Heure / Auteur
- Freeze UTC : **2026-04-23 09:10**
- Snapshot source : `root@136.144.204.115:/var/www/planora/` (rsync read-only)
- Auteur : MH via Claude, branche locale `clean-main`

## Raison du freeze
Fixation d'un point de rollback versionné APRÈS une série de 9 hotfix runtime
sur la VPS aujourd'hui (23 avril 2026). La production est stable, le portail
collaborateur charge sans ReferenceError. Cet état mérite d'être capturé
dans Git avant toute action future (déploiement / refactor / reprise S2.13).

## Résumé des hotfix runtime du 23/04/2026 (chronologique)

| Ordre | Heure UTC | Correction | Classe |
|:---:|---|---|---|
| 1 | 07:37 | `AdminDash.jsx` : retrait `collab={collab}` sur `<AdminLeadsScreen>` | Prop undefined |
| 2 | 07:52 | `CollabPortal.jsx` : retrait phantom `phoneStatsOpen/setPhoneStatsOpen` | Provider phantom |
| 3 | 08:00 | `CollabPortal.jsx` : retrait phantoms `voipDevice, voipCall` (gardé `voipCallRef`) | Provider phantom |
| 4 | 08:06 | `CollabPortal.jsx` : retrait 7 phantoms (`pdResult, zoom, setZoom, histOpen, setHistOpen, statusHist, setStatusHist`) | Provider phantom |
| 5 | 08:13 | `CollabPortal.jsx` + `PhoneTab.jsx` : wiring `todayCallCount` context | Tab-consume sans câblage |
| 6 | 08:29 | Audit v4 : +37 expositions provider, destructures ajoutées dans 4 tabs (52 crashes latents) | Tab-consume sans câblage |
| 7 | 08:37 | Audit v5 : +9 handlers JSX câblés (togglePhoneDND, etc.) | JSX attr handler manquant |
| 8 | 08:47 | Audit v6 : +7 provider + 9 destructures (togglePhoneRightPanel, etc.) | JSX attr handler (suite) |
| 9 | 09:05 | **Audit v7 AST complet via @babel/parser** : +39 provider + 72 destructures (isAdminView, iaHubCollapse, scanImageModal, handleCollabUpdateContact, ...) | Toutes classes combinées, détection AST exhaustive |

**Total éradiqué** : 151 symboles phantoms sur 6 audits successifs.
**Résultat final** : scan AST sur 9 tabs = 0 phantom restant.

## Contenu du freeze

- `app/src/` : état VPS au 2026-04-23 09:05 UTC (post audit AST v7)
- `server/` : code backend complet (`cron/`, `db/`, `routes/`, `services/`, `middleware/`, `templates/`, `scripts/`)
  — à l'exclusion de `.env`, `node_modules/`, `*.db*`, `*.log`, `uploads/`, `dist/`, `*.pre-*`, `*.bak*`
- `ecosystem.config.cjs` : config PM2 avec env vars DB (E.3.8-E)

## Secrets

🔐 **La clé Brevo API (regénérée le 2026-04-23) n'est PAS versionnée.**
Elle existe uniquement dans `/var/www/planora/server/.env` sur le VPS (chmod 600).
Cette branche EXCLUT strictement tout fichier `.env` ou `.env.*` via les filtres rsync.

⚠️ Note héritage : le fichier `server/.env` présent dans `origin/main`
préexistant à ce freeze (non touché par cette commit) contient encore une
ANCIENNE version de cette clé. À nettoyer lors d'un audit sécurité séparé
(`git filter-repo` ou équivalent), hors scope de ce freeze.

## Divergence avec `clean-main`

Cette branche représente **l'état prod pré-S1/S2 + hotfix**.
La branche `refactor-s1-s2-20260423` représente **le refactor local S1+S2
(12 modals extraits, CrmTab modularisé) jamais déployé**.

Les deux évolutions divergent depuis ~67 commits. À réconcilier plus tard
lors d'une phase de déploiement dédiée.

## Backups VPS préservés côté serveur (pas dans Git)

22 fichiers `.pre-*-hotfix-20260423` sur `/var/www/planora/app/src/features/`
permettent un rollback unitaire VPS en cas de besoin. Non versionnés ici
(exclusion rsync `*.pre-*`).
