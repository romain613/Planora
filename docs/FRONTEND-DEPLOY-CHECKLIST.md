# Frontend Deploy Checklist — Planora

> Établi 2026-05-12. Référence : `docs/R9-PROTECT.md`.
> **Aucune étape n'est skippable.** Toutes les étapes doivent passer avant tag/commit.

---

## Étape 0 — Pré-requis environnement

- [ ] Tu es sur le Mac MH (ou environnement de dev contrôlé, **pas le VPS**)
- [ ] Tu es dans `/Users/design/Desktop/PLANORA/` (ou équivalent)
- [ ] Tu as accès SSH au VPS via `~/.ssh/id_ed25519`
- [ ] Tu as `node`, `npm`, `git`, `rsync`, `ssh`, `curl`, `md5` disponibles

---

## Étape 1 — Backup pré-modif

- [ ] **Fichiers source modifiés** :
  ```bash
  for f in <liste des fichiers à modifier>; do
    cp "$f" "$f.pre-<feature-name>-$(date +%Y%m%d-%H%M%S)"
  done
  ```
- [ ] **httpdocs VPS** :
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
    "tar czf /var/backups/planora/pre-<feature>-$(date +%Y%m%d-%H%M%S)-httpdocs.tar.gz \
     -C /var/www/vhosts/calendar360.fr/httpdocs ."
  ```

---

## Étape 2 — Pré-build R9-PROTECT (OBLIGATOIRE)

- [ ] **Alignement Git** :
  ```bash
  ./ops/r9-protect.sh check-source
  # → doit retourner code 0
  # → si code 2 : STOP, ne pas builder
  ```
- [ ] Si modifications non commitées dans `app/src/` : confirmer que ce sont **les modifs voulues** pour ce build. Sinon `git stash` ou `git checkout` avant de continuer.

---

## Étape 3 — Build

- [ ] **Build minifié standard** :
  ```bash
  cd app && npm run build
  ```
- [ ] **Ne JAMAIS** utiliser `--minify=false` sur le VPS (OOM 8 Go RAM). Sourcemap OK si besoin debug.
- [ ] Vérifier la sortie : `✓ built in <Xs>` + taille bundle dans `app/dist/assets/index-*.js`
- [ ] Sortie attendue : 1 seul bundle `index-<hash>.js` + `index-<hash>.css` + `index.html`

---

## Étape 4 — Post-build R9-PROTECT (OBLIGATOIRE)

- [ ] **Marqueurs critiques présents** :
  ```bash
  cd /Users/design/Desktop/PLANORA && ./ops/r9-protect.sh check-bundle
  # → doit retourner code 0 et "Marqueurs trouvés : N / N"
  # → si code 3 : STOP, NE PAS DÉPLOYER
  ```
- [ ] Capturer md5 du bundle local :
  ```bash
  md5 app/dist/assets/index-*.js
  ```

---

## Étape 5 — Deploy rsync (sans --delete + exclusions obligatoires)

- [ ] **Rsync vers httpdocs** :
  ```bash
  rsync -avz --no-times -e "ssh -i ~/.ssh/id_ed25519" \
    --exclude=.htaccess \
    --exclude=mentions-legales.html \
    --exclude=privacy.html \
    --exclude=terms.html \
    --exclude=favicon.svg \
    --exclude=vite.svg \
    app/dist/ \
    root@136.144.204.115:/var/www/vhosts/calendar360.fr/httpdocs/
  ```
- [ ] **Ne JAMAIS** ajouter `--delete` sans les 6 `--exclude` ci-dessus (cf. R9-PROTECT §5).

---

## Étape 6 — Vérification déploiement

- [ ] **MD5 bundle local vs VPS identique** :
  ```bash
  md5 app/dist/assets/index-*.js
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
    "md5sum /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js"
  ```
- [ ] **Index.html serve bien le nouveau bundle** :
  ```bash
  curl -sk https://calendar360.fr/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
  # → doit retourner le nouveau nom de bundle
  ```

---

## Étape 7 — Backend deploy (uniquement si modif backend)

- [ ] Backup auth.js/route.js modifiés sur VPS via SSH
- [ ] `scp` fichiers modifiés vers `/var/www/planora/server/...`
- [ ] **node --check** sur chaque fichier modifié :
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
    "node --check /var/www/planora/server/routes/<file>.js"
  ```
- [ ] `pm2 restart calendar360`
- [ ] Vérifier PID changé + uptime reset + status online :
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 list | grep calendar360"
  ```

---

## Étape 8 — Healthcheck post-deploy

- [ ] **API health** :
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
    "curl -sk https://calendar360.fr/api/health"
  # → {"status":"ok","db":"connected","companies":<N>,"collaborateurs":<N>}
  ```
- [ ] **Pas d'erreur critique dans logs PM2** (200 dernières lignes) :
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
    "pm2 logs calendar360 --lines 200 --nostream --err"
  ```

---

## Étape 9 — Tests navigateur (Hard refresh Cmd+Shift+R)

### 9.1 Smoke fondamental

- [ ] Page d'accueil charge sans erreur
- [ ] Login MH (rc.sitbon@gmail.com) → accès admin OK
- [ ] Login Julie ou Ilane → accès collab OK
- [ ] DevTools Console : 0 erreur rouge critique (warnings tolérés)
- [ ] DevTools Network : tous les `/api/*` retournent 200 (sauf 401 attendus pour endpoints supra/non-auth)

### 9.2 Modules critiques visibles

- [ ] **Pipeline Live** : colonnes affichées, contacts présents
- [ ] **Mon CRM** : liste contacts, fiche détaillée
- [ ] **Agenda** : Day/Week/Month/Custom views
- [ ] **Reporting RDV → Reçus** : 13 lignes pour Julie (CapFinances)
- [ ] **Reporting RDV → Transmis** : N lignes pour Ilane
- [ ] **Reporting RDV → Agenda partagé** (sous-onglet) : RDV transmis listés
- [ ] **Téléphone (PhoneTab)** : Pipeline Live + fiche contact ouverte
- [ ] **Settings → Google Calendar** : statut connecté visible
- [ ] **Settings → Outlook** : statut connecté visible
- [ ] **Settings → SMS / Twilio** : configuration accessible

### 9.3 Flow post-call (BUG 1 r9)

- [ ] Lancer appel test (Twilio dispo)
- [ ] Si appel >10s sur contact non-NRP → Smart modal s'ouvre, choix stages
- [ ] Si appel <10s → Smart modal avec bandeau orange "Appel très court"
- [ ] Si contact déjà NRP → Smart modal avec badge `NRP #N` + progress bar
- [ ] Clic stage 'nrp' sur contact NRP → toast "NRP #N+1 enregistré", DB incrémentée
- [ ] **Aucun ancien `NrpPostCallModal` qui s'ouvre seul**

### 9.4 Auth (BUG 4 r9)

- [ ] Login supra rc.sitbon@gmail.com → passe en 1 tentative correcte
- [ ] Si rate-limit déclenché → message "Réessayez dans 2 minutes" (pas 5)

### 9.5 Actions fiche RDV transmis (BUG 3 r9)

- [ ] Ouvrir fiche d'un contact avec RDV transmis Ilane→Julie + googleEventId
- [ ] Bandeau orange Phase 3 différée visible
- [ ] Boutons 🔄 et ↩️ grisés avec tooltip explicite
- [ ] Workaround mentionné dans le bandeau

### 9.6 Régressions à exclure

- [ ] **Détail enveloppe lead 656/655/610** : ouvre + affiche tous les leads
- [ ] **Consent toggle envelope** : déclenche le changement
- [ ] **Merge contacts** : modal s'ouvre depuis CRM
- [ ] **Duplicates panel** : visible dans Admin Dashboard
- [ ] **ScheduleRdvModal** : prise RDV depuis Pipeline OK
- [ ] **ReassignBooking modal** : ouvre si conditions remplies
- [ ] **SenderConflict modal** : ouvre si test conflit créneau sender

---

## Étape 10 — STOP avant tag

- [ ] Tous les tests 9.x cochés
- [ ] Aucun regression report MH
- [ ] R9-PROTECT `full` repassé sans erreur :
  ```bash
  ./ops/r9-protect.sh full
  ```
- [ ] Demander GO explicite MH avant `git commit` + `git tag`

---

## Étape 11 — Commit + Tag (seulement après GO)

- [ ] `git status` : seuls les fichiers attendus sont modifiés
- [ ] `git add` ciblé (pas `git add .` ni `git add -A`)
- [ ] Commit message explicite avec préfixe `fix(<scope>)`, `feat(<scope>)`, ou `chore(<scope>)`
- [ ] Tag SemVer (`v1.10.4-<version>` ou similaire)
- [ ] `git push origin clean-main && git push origin <tag>`

---

## En cas de problème

### Rollback frontend

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "cd /var/www/vhosts/calendar360.fr/httpdocs && \
   tar xzf /var/backups/planora/pre-<feature>-<TS>-httpdocs.tar.gz"
```

### Rollback backend

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "cp /var/www/planora/server/routes/<file>.js.pre-<feature>-<TS> \
      /var/www/planora/server/routes/<file>.js && \
   pm2 restart calendar360"
```

### Logs en cas d'erreur

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "pm2 logs calendar360 --lines 500 --nostream"
```

---

## Référence in-code

- Garde-fou : `ops/r9-protect.sh`
- Doc R9 : `docs/R9-PROTECT.md`
- Règle frontend (rappel) : `CLAUDE.md §0bis`
