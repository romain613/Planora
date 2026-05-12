# R9-PROTECT — Anti-régression frontend Planora

> Établi 2026-05-12 après incident R9 (perte de fonctionnalités suite à rebuild VPS désynchronisé).
> Mainteneur : MH (rc.sitbon@gmail.com).
> Statut : **OBLIGATOIRE** pour tout déploiement frontend.

---

## 1. Principe fondamental

> **La source de vérité du code frontend est `git origin/clean-main HEAD`. Pas le VPS.**

Le bundle servi par nginx (`/var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js`) est un **artefact** — il est régénéré à partir de la source Git. Si on rebuild en dehors d'un répertoire aligné sur `origin/clean-main`, on **régresse** les fonctionnalités absentes du checkout local.

### Règle absolue

- ✅ Avant chaque `npm run build` frontend → l'environnement local doit être aligné sur `origin/clean-main`.
- ✅ Le VPS ne build **jamais** de bundle. Le build se fait sur Mac MH (ou environnement de dev contrôlé), puis le bundle est rsync vers httpdocs.
- ❌ Ne jamais `npm run build` sur le VPS — l'arborescence VPS peut diverger de Git.
- ❌ Ne jamais considérer le bundle live comme référence — il peut être plus vieux que le code Git.

---

## 2. Incident R9 — chronologie de la régression

**2026-05-12** : un rebuild a été lancé sur un checkout local désynchronisé d'`origin/clean-main`. Le bundle généré a omis les modules suivants (commits postérieurs à la dernière sync locale) :

- `PostCallResult` smart pipeline
- `Agenda partagé` (SharedAgendaTab)
- `MergeContacts` / `DuplicatesPanel`
- `HardDelete` UX
- `ReassignBooking` modal
- `SenderConflict` modal V1.10.4.D
- `ScheduleRdv` modal partagé
- `limit=10000` envelope detail fetch
- `calendar360-session` localStorage role
- Modules `consent` (toggle + guard call)
- Filtres `googleEventId`, `meetLink`, `bookedByCollaboratorId`, `agendaOwnerId`

Conséquence : 71 fichiers à rapatrier Mac → VPS, 4 bugs collatéraux, dette technique R9.

**Cause racine** : aucun garde-fou ne vérifiait l'alignement Git **avant** `npm run build`. Le build a réussi (pas d'erreur) car le code local était syntaxiquement valide, mais incomplet sémantiquement.

---

## 3. Procédure obligatoire avant tout `npm run build`

### 3.1 Pré-flight checks

```bash
# 1. Fetch des changements distants
git fetch origin

# 2. Vérifier qu'on est sur la branche de prod
git rev-parse --abbrev-ref HEAD   # doit retourner: clean-main

# 3. Vérifier qu'on n'a pas de retard sur origin
git log --oneline HEAD..origin/clean-main   # doit être vide

# 4. Vérifier qu'on n'a pas de modifications non commitées non intentionnelles
git status --short app/src/   # ne doit montrer que les modifs en cours

# 5. Vérifier les marqueurs critiques dans la source actuelle
./ops/r9-protect.sh check-source
```

### 3.2 Si désalignement détecté

**STOP immédiat**. Ne pas builder. Trois options :

1. **Pull les changements** : `git pull origin clean-main --ff-only`
2. **Investiguer la divergence** : `git diff origin/clean-main -- app/src/` pour identifier ce qui manque/diverge.
3. **Abandonner le build** si la divergence n'est pas comprise. Demander à MH avant action.

### 3.3 Lancer le script garde-fou

```bash
./ops/r9-protect.sh pre-build
```

Le script vérifie l'alignement Git, l'absence de divergence critique avec `origin/clean-main`, et bloque si problème. Voir `ops/r9-protect.sh` pour le détail.

---

## 4. Procédure obligatoire après `npm run build`

### 4.1 Vérifier les marqueurs critiques dans le bundle

```bash
./ops/r9-protect.sh check-bundle
```

Le script grep dans `app/dist/assets/index-*.js` la liste des **marqueurs critiques** suivants. Chaque marqueur absent → STOP build, ne pas déployer.

#### Marqueurs critiques obligatoires (15)

| Marqueur | Représente |
|---|---|
| `PostCallResult` | Smart modal post-call (BUG 1 r9) |
| `Agenda partag` | SharedAgendaTab onglet |
| `MergeContacts` | Modal merge contacts |
| `DuplicatesPanel` | Panneau doublons |
| `HardDelete` | UX delete dur |
| `ReassignBooking` | Modal réattribution |
| `SenderConflict` | Modal V1.10.4.D conflit slot sender |
| `ScheduleRdv` | Modal prise RDV partagée |
| `limit=10000` | Envelope detail fetch full |
| `calendar360-session` | localStorage session client-side |
| `consent` | Module consent (toggle + guard) |
| `googleEventId` | Filtre + sync Google |
| `meetLink` | Google Meet integration |
| `bookedByCollaboratorId` | V1.10.4.A transmissions cross-collab |
| `agendaOwnerId` | V1.10.4.A transmissions cross-collab |

Liste autoritative maintenue dans `ops/r9-protect.sh` (constante `R9_MARKERS`).

### 4.2 Backup VPS avant deploy

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "tar czf /var/backups/planora/pre-deploy-\$(date +%Y%m%d-%H%M%S)-httpdocs.tar.gz \
   -C /var/www/vhosts/calendar360.fr/httpdocs ."
```

### 4.3 Deploy rsync SANS --delete + exclusions obligatoires

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

**Pourquoi pas `--delete`** : un rsync `--delete` sans ces 6 exclusions a déjà supprimé `.htaccess` et les pages Twilio compliance — incident V3.x.17 du 2026-05-08. Règle gravée.

### 4.4 Vérifier le bundle live

```bash
# md5 doit matcher entre local et VPS
md5 app/dist/assets/index-*.js
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "md5sum /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js"

# Vérifier que le live serve le bon bundle
curl -sk https://calendar360.fr/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

### 4.5 Healthcheck + tests non-régression

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "curl -sk https://calendar360.fr/api/health"
```

Puis dans le navigateur (Hard refresh Cmd+Shift+R), parcourir la checklist `docs/FRONTEND-DEPLOY-CHECKLIST.md`.

---

## 5. Interdictions formelles

| Interdiction | Raison |
|---|---|
| `npm run build` sur le VPS | L'arbo VPS peut diverger de Git → bundle incomplet |
| `git pull` sur le VPS | Idem |
| Considérer le bundle live comme référence | Le bundle peut être plus vieux que Git si rollback antérieur |
| `rsync --delete` sans les 6 exclusions | Supprime `.htaccess` + pages compliance |
| `pm2 restart` sans modif backend | Inutile + risque coupure |
| Tag de version sans avoir validé R9-PROTECT | Faux signal de stabilité |
| Builder en mode `--minify=false` sur VPS | OOM (consomme 3+ Go RAM, tue le serveur) |
| Skipper les marqueurs critiques | C'est ce qui a permis l'incident R9 |

---

## 6. Cas où R9-PROTECT s'applique

R9-PROTECT s'applique **à chaque déploiement frontend**, y compris :

- Hotfix d'1 ligne
- Patch d'un seul composant
- Build "rapide" sans changement majeur
- Tests préprod
- Démos live (rare mais possible)

**Aucune exception**. Le coût du script (~30 secondes) est négligeable face au coût d'une régression R9.

---

## 7. Cas où R9-PROTECT NE s'applique PAS

- Modifications backend pures (Node.js dans `server/`) qui ne touchent à aucun fichier `app/src/` → déployer le fichier modifié + `pm2 restart`, pas besoin de build frontend.
- Modifications de docs/scripts ops (`docs/`, `ops/`, `*.md`) → pas de build.
- Modifications de config nginx, plesk, certificates → hors R9.

---

## 8. Maintenance de la liste des marqueurs

Quand une nouvelle feature critique ship, **ajouter son marqueur** à la liste R9_MARKERS dans `ops/r9-protect.sh`.

Critères pour qu'un marqueur soit considéré "critique" :
- Feature business visible utilisateur (Pipeline, Agenda, RDV, Reporting, Consent…)
- Composant React standalone vérifiable par grep du nom de classe/fichier
- Endpoint backend client-côté vérifiable par grep URL
- localStorage key persistante client-côté

Anti-critère : un marqueur trop générique (ex: `useState`, `useEffect`, `api`) — il sera toujours présent et ne détecte rien.

---

## 9. Référence in-code

- Script garde-fou : `ops/r9-protect.sh`
- Checklist deploy : `docs/FRONTEND-DEPLOY-CHECKLIST.md`
- Règle frontend (rappel) : `CLAUDE.md §0bis`
