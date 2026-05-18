# GO-CONDITIONS — PLANORA

> Conditions de GO par étape Phase 1. Toutes vertes ET GO MH explicite = avancement autorisé.
> Source : Audit 13 §1.4 + Audit 14 §10.1, §10.3

## GO Sprint 0

### Pré-démarrage
- [ ] MH disponible 4 semaines bloquées (ou cadence négociée)
- [ ] Aucun incident en cours sur calendar360.fr
- [ ] Aucun deploy legacy planifié pendant Phase 1
- [ ] Audit 12, 13, 14 relus et validés MH

### État runtime baseline
- [ ] PM2 PID 2318858 actif
- [ ] `/api/health` 200 OK
- [ ] Bundle MD5 = `63b8d8e1...` (référence cycle r11.0.28.b.2)
- [ ] HEAD = `7ea8a364` sur clean-main
- [ ] git status propre sur clean-main

### Hardening complet
- [ ] Pre-commit/commit-msg/pre-push hooks installés Mac MH + testés
- [ ] `.gitignore` Phase 1 hardenisé
- [ ] `ops/r9-protect.sh` étendu + `phase1` mode vert
- [ ] Branch protection GitHub clean-main + main activée
- [ ] `/usr/local/bin/planora-backup.sh` + integrity-check + cleanup installés sur VPS
- [ ] Cron `/etc/cron.d/planora-backup` mis à jour
- [ ] R9-PROTECT phase1 vert sur état actuel

### Backup baseline triple-redondance
- [ ] Backup baseline Sprint 0 créé sur VPS
- [ ] SHA-256 manifest généré
- [ ] Copié sur Mac MH (`~/Desktop/PLANORA/backups/`)
- [ ] Copié sur iCloud Drive
- [ ] SHA-256 identiques sur les 3 emplacements

### DR validation
- [ ] DR drill exécuté (R-008)
- [ ] integrity_check restore = ok
- [ ] FK violations = 0
- [ ] Compteurs métier cohérents

### Documentation
- [ ] `docs/RUNBOOKS/` créé avec 10 runbooks
- [ ] `docs/STOP-CONDITIONS.md` créé
- [ ] `docs/GO-CONDITIONS.md` créé (ce doc)
- [ ] `docs/PHASE1-BASELINE.md` créé avec fingerprints
- [ ] `docs/SECRETS-INVENTORY.md` créé
- [ ] `INCIDENTS/INC-TEMPLATE.md` créé

### Git
- [ ] Branche `feature/phase1-invisible-foundation` créée depuis clean-main
- [ ] Branche pushée sur remote
- [ ] Tag `phase1-sprint-0-closure` créé + pushé

### Validation finale
- [ ] Toutes les cases ci-dessus cochées
- [ ] **MH dit "GO Sprint 1" explicitement**

---

## GO Sprint 1 (DB foundations)

Cf. Audit 13 §1.4 CHECKPOINT-1.

### Livrables Sprint 1
- [ ] `server/shared/db/` créé avec dbHandles.js, migrate.js, backup.js, schema/
- [ ] Tests unitaires sur les 4 modules ci-dessus
- [ ] Migration script idempotent (verified double-run)

### Invariants
- [ ] I1 — aucun fichier hors `server/shared/*` modifié
- [ ] I2 — aucune route montée (grep server/index.js)
- [ ] I3 — bundle MD5 inchangé
- [ ] I4 — `calendar360.db` SHA-256 inchangé

### Intégrité
- [ ] sqlite3 PRAGMA integrity_check = ok
- [ ] sqlite3 PRAGMA foreign_key_check vide
- [ ] PM2 PID inchangé (2318858)

### Tests
- [ ] `cd server && npm test -- shared/db/` vert
- [ ] Anti-leak tests verts
- [ ] R9-PROTECT phase1 vert
- [ ] Smoke V1 vert

### Validation
- [ ] **MH dit "GO Sprint 2" explicitement**

---

## GO Sprint 2 (Auth + Guards + Logging + Errors)

Cf. Audit 13 §1.4 CHECKPOINT-2.

### Livrables Sprint 2
- [ ] `server/shared/auth/` — 4 guards (SUPRA, SUPRO, CLIENT, USER)
- [ ] `server/shared/middleware/` — tenant context resolver
- [ ] `server/shared/errors/` — classes erreur typées
- [ ] `server/shared/logging/` — pino + redact list

### Invariants
- [ ] I1, I2, I3, I4 tous verts (R9-PROTECT phase1)

### Tests
- [ ] Tests auth couvrent 4 niveaux (reject + accept)
- [ ] Tests errors couvrent sérialisation + héritage
- [ ] Tests logging vérifient redact actif
- [ ] Anti-leak tests étendus
- [ ] R9-PROTECT phase1 vert

### Validation
- [ ] **MH dit "GO Sprint 3" explicitement**

---

## GO Sprint 3 (Provider Engine)

Cf. Audit 13 §1.4 CHECKPOINT-3.

### Livrables Sprint 3
- [ ] `server/shared/providers/interface.js`
- [ ] `server/shared/providers/registry.js`
- [ ] `server/shared/providers/router.js` (LCR mock-compatible)
- [ ] `server/shared/providers/adapters/twilio.js` (WRAP only)
- [ ] `server/shared/providers/adapters/brevo.js` (optionnel ou stub)
- [ ] `server/shared/providers/adapters/mock.js` (full)

### Invariants
- [ ] Aucun adapter monté runtime
- [ ] Twilio webhook legacy intact (diff = 0)
- [ ] Aucun secret nouveau ajouté

### Tests
- [ ] E2E mockAdapter : 100% interface covered
- [ ] Router fallback test
- [ ] Registry get/missing test
- [ ] Anti-leak étendu providers
- [ ] R9-PROTECT phase1 vert

### Validation
- [ ] **MH dit "GO Sprint 4" explicitement**

---

## GO Sprint 4 (ESLint + Tests E2E + README + R9 alignment)

Cf. Audit 13 §1.4 CHECKPOINT-4.

### Livrables Sprint 4
- [ ] `.eslintrc.*` avec custom rules
- [ ] `server/shared/README.md` complet
- [ ] Tests E2E provider engine
- [ ] R9-PROTECT alignment (markers ajoutés si nouveaux)

### Invariants finaux
- [ ] I1 — aucun fichier hors scope modifié
- [ ] I2 — aucune route runtime montée
- [ ] I3 — bundle MD5 inchangé
- [ ] I4 — `calendar360.db` SHA-256 inchangé
- [ ] PM2 PID inchangé depuis Sprint 0

### Tests
- [ ] Tous tests unit + integration + e2e verts
- [ ] Smoke V1+V2+V3 verts
- [ ] R9-PROTECT phase1 + full+ verts
- [ ] ESLint passe sur `server/shared/`

### Clôture Phase 1
- [ ] Tag `phase1-closure-YYYYMMDD` créé
- [ ] HANDOFF-PHASE1-CLOSURE-YYYY-MM-DD.md rédigé
- [ ] MEMORY.md updated hook 1-ligne
- [ ] **MH dit "Phase 1 clôturée, GO Phase 2 ou pause" explicitement**

---

## Principe absolu

> **Aucun GO automatique** : chaque étape attend confirmation MH écrite.
> Aucune avancée Sprint N+1 sans GO MH explicite pour Sprint N.

## Référence

- Audit 13 §1.4 — Checkpoints GO/STOP critères mécaniques
- Audit 14 §10.1 — Checklist hardening pré-Sprint 0
- Audit 14 §10.3 — Conditions GO Sprint 0
