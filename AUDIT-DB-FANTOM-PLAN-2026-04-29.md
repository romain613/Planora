# AUDIT — DB fantôme `/var/www/planora/server/calendar360.db` (cadrage)

> **Date** : 2026-04-29
> **Demandeur** : MH
> **Type** : cadrage safe, **0 action immédiate**
> **Origine détection** : 1ère exécution `enrich-batch-AssurCV01-20260429.mjs` sans `DB_PATH` → fallback silencieux a touché un fichier fantôme préexistant.

---

## 1. Constat factuel (snapshot 2026-04-29 ~06:30 UTC)

```
/var/www/planora/server/calendar360.db        1 589 248 octets   mtime: 2026-04-24 04:35
/var/www/planora/server/calendar360.db-shm       32 768 octets   mtime: 2026-04-29 06:30   ← créé par mon run sans DB_PATH
/var/www/planora/server/calendar360.db-wal       94 792 octets   mtime: 2026-04-27 11:14
```

**Violation déclarative** : CLAUDE.md §10.4 affirme `Fantômes runtime : aucun` depuis archivage E.3.7 (2026-04-20 16:59).

---

## 1bis. 🚨 ESCALADE CRITIQUE — DB SQLite trackée dans repo PUBLIC GitHub

Découverte 2026-04-29 lors de la préparation du commit diagnostic :

```
$ git ls-files server/calendar360.db
server/calendar360.db                              ← TRACKÉ

$ git log --oneline -- server/calendar360.db
c4312619 V7 clean no backup no secrets             ← commité dans cet ancien commit (ironique vu le message)

$ git cat-file -s HEAD:server/calendar360.db
819200                                              ← 800 Ko commités

$ git remote -v
origin	https://github.com/romain613/Planora.git (fetch/push)   ← PUBLIC
```

**Implication** : une DB SQLite calendar360 contenant des données business (contacts, bookings, audit_logs…) a été commitée dans le repo public `romain613/Planora` au commit `c4312619`. Le contenu commit est un snapshot ancien (800 Ko, antérieur à E.3 — le monolithe prod fait actuellement 6.8 Mo).

**Vraisemblance fuite PII** : 🔴 oui — le contenu reste accessible via `git show c4312619:server/calendar360.db` ou clone public, même si le fichier est supprimé dans une future commit (reste dans l'historique).

**Lien avec le fantôme runtime** : explique la persistance. Tout `git pull`/`checkout` régénère le fichier sur disque dans `server/`, recréant le fantôme. Les `mtime` 2026-04-24 et 2026-04-27 correspondent probablement à des `git checkout`/pull récents.

**Décision MH requise avant action** :
1. Audit contenu DB committée (`git show c4312619:server/calendar360.db | sqlite3 :memory: '.tables'` puis dumps des tables sensibles)
2. Évaluer la PII exposée (contacts mails/téls, audit_logs, sessions, …)
3. Plan de remédiation :
   - **Option A** : `git filter-repo` ou `bfg-repo-cleaner` pour réécrire l'historique et purger ce blob de tous les commits → push --force vers GitHub. **Casse les SHAs** + risque coordination clones existants.
   - **Option B** : déclarer le repo compromis, créer un nouveau repo propre, archiver l'ancien en private + désactiver l'accès public.
   - **Option C** : accepter le risque (si le contenu DB committée est déjà obsolète/test/sans PII réelle vérifiée).
4. Notification éventuelle utilisateurs concernés (RGPD si PII confirmée).

**À NE PAS FAIRE avant audit** :
- ❌ git rm + commit du `.db` actuel (n'efface PAS l'historique, garde le blob accessible)
- ❌ push --force aveugle (risque de casser des branches actives)
- ❌ ajouter au `.gitignore` sans purger l'historique (faux sentiment de sécurité)

---

## 2. Vérifications déjà effectuées

### 2.1 PM2 n'utilise PAS le fantôme

```
$ lsof -p 771284 | grep '\.db'
… /var/www/planora-data/calendar360.db
… /var/www/planora-data/calendar360.db-wal
… /var/www/planora-data/calendar360.db-shm
```

✅ Le process PM2 (PID 771284, calendar360) tient ouverts uniquement les fichiers de `/var/www/planora-data/`. Le fantôme dans `server/` n'est pas en use par le runtime.

### 2.2 Healthcheck cohérent

```
GET /api/health
{"status":"ok","db":"connected","companies":6,"collaborateurs":15,"dbPath":"/var/www/planora-data/calendar360.db","uptime":3465}
```

✅ Le backend rapporte le bon `dbPath`.

### 2.3 Guard `DB_PATH` actif

[server/db/database.js](server/db/database.js) : `if (!process.env.DB_PATH && process.env.NODE_ENV === 'production') throw …`. Le PM2 process tourne avec `NODE_ENV=production` ET `DB_PATH=/var/www/planora-data/calendar360.db` (injectés par `ecosystem.config.cjs` E.3.8-E).

**Faille connue** : un script Node lancé manuellement sur le VPS sans `NODE_ENV=production` ni `DB_PATH` tombe dans le fallback `/var/www/planora/server/calendar360.db` au lieu de lever une exception. C'est ce qui a recréé le `.db-shm` aujourd'hui.

---

## 3. Hypothèses sur l'origine du fantôme préexistant (mtime 2026-04-24)

| Hypothèse | Vraisemblance | Indice |
|---|:---:|---|
| Script ad-hoc lancé sans `DB_PATH` entre 2026-04-20 (archivage E.3.7) et 2026-04-24 | 🔴 forte | mtime principal = 2026-04-24 04:35, soit hors fenêtre prod |
| Process node test/dev lancé depuis `/var/www/planora/server` cwd | 🟡 moyenne | better-sqlite3 résout les chemins relatifs depuis cwd |
| Fantôme jamais réellement archivé, oublié lors de E.3.7 | 🟢 faible | E.3.7 a archivé 6 DBs avec checksums — improbable |

**À déterminer dans la phase d'audit** : grep historique des scripts/cron/manuel runs.

---

## 4. Plan d'audit (sans action sur fichiers — pure lecture)

### Phase A1 — Inventaire complet
- `find /var/www/planora -name '*.db*' -type f` (hors `node_modules`)
- `lsof | grep planora.*\.db` → identifier tous process qui tiennent une DB ouverte
- Vérifier qu'il n'existe pas un autre fantôme ailleurs (storage/, app/, etc.)

### Phase A2 — Origine
- `stat /var/www/planora/server/calendar360.db` → atime/mtime/ctime précis
- `grep -rln 'calendar360.db' /var/www/planora --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.sh'` → repérer les chemins relatifs codés en dur
- `crontab -l && cat /etc/cron.*` → cron qui pourrait toucher la DB
- Audit logs systemd journalctl si script ad-hoc tracé
- `find /root /home /var/www -name '*.mjs' -newer <timestamp_E37>` → scripts récents

### Phase A3 — Différentiel contenu
- `sqlite3 /var/www/planora/server/calendar360.db '.tables'` vs `sqlite3 /var/www/planora-data/calendar360.db '.tables'`
- `sqlite3 .../server/calendar360.db 'SELECT MAX(createdAt) FROM contacts'` → date dernière écriture côté fantôme
- Comparer SHA-256 du `.db` fantôme avec les archives E.3.7 dans `/var/backups/planora/fantom-db-20260420-165926/` → si match, c'est un re-extract, sinon c'est nouveau

### Phase A4 — Verrou anti-récidive (proposition)
- **Option 1** : durcir le guard `db/database.js` pour throw aussi en `NODE_ENV != production` si `DB_PATH` absent ET cwd contient `/server` → empêche fallback dans server/.
- **Option 2** : ajouter `.gitignore` + une règle systemd path watcher qui alerte sur création de `*.db` dans `/var/www/planora/server/`.
- **Option 3** : pre-flight check dans tout script ad-hoc — `if (!process.env.DB_PATH) { throw }`.
- → MH décide entre les 3 selon priorité.

---

## 5. Plan d'archivage (à exécuter SEULEMENT après audit)

> Ne PAS lancer avant validation explicite MH des résultats Phase A1-A3.

```bash
# 1. Snapshot intégrité fantôme
sqlite3 /var/www/planora/server/calendar360.db 'PRAGMA integrity_check' > /tmp/fantom-integrity.txt

# 2. SHA-256 traçable
sha256sum /var/www/planora/server/calendar360.db* > /tmp/fantom-sha256.txt

# 3. Archive vers /var/backups/planora/
mkdir -p /var/backups/planora/fantom-db-recurrence-20260429
cp /var/www/planora/server/calendar360.db* /var/backups/planora/fantom-db-recurrence-20260429/
cp /tmp/fantom-{integrity,sha256}.txt /var/backups/planora/fantom-db-recurrence-20260429/
tar -czf /var/backups/planora/fantom-db-recurrence-20260429.tar.gz -C /var/backups/planora fantom-db-recurrence-20260429/

# 4. Vérifier qu'aucun process ne tient le fantôme ouvert
fuser /var/www/planora/server/calendar360.db || echo "no process holds it"

# 5. Si étape 4 OK → suppression fantôme
rm /var/www/planora/server/calendar360.db /var/www/planora/server/calendar360.db-shm /var/www/planora/server/calendar360.db-wal

# 6. Healthcheck immédiat
curl -s http://localhost:3001/api/health
pm2 list | grep calendar360

# 7. Re-vérifier qu'aucun nouveau .db n'apparaît dans server/ après 1h
```

---

## 6. Risques

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| R1 | Suppression sans audit → perte de données utiles si fantôme contient écritures non backuppées | 🔴 | Phase A3 (diff contenu) avant tout `rm` |
| R2 | Process inconnu lit le fantôme et crashe à la suppression | 🟡 | `fuser` check + monitoring pm2 logs |
| R3 | Script cron récurrent re-crée le fantôme après suppression | 🟡 | Phase A2 (origine cron) avant suppression |
| R4 | Fix au mauvais endroit → guard `db/database.js` durci casse les scripts dev locaux | 🟢 | Tester en dev avant prod, garder fallback en `NODE_ENV=development` |

---

## 7. Décision attendue MH

Après audit Phase A1-A3, MH tranche :
1. **Origine confirmée** ? (script ad-hoc / cron / dev test)
2. **Contenu fantôme = obsolète** ? (oui → archive+rm ; non → enquête plus profonde)
3. **Quel verrou anti-récidive** ? (Option 1 / 2 / 3 du §4)
4. **Fenêtre d'exécution archivage** ? (heure low traffic + backup pré-action)

---

**Aucune modification effectuée. Cadrage uniquement.**
