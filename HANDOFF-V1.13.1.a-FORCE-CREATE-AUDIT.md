# HANDOFF V1.13.1.a — Force-create audit + admin-only restriction

> **Date** : 2026-05-03
> **Tag** : `v1.13.1.a-force-create-audit`
> **Commit** : `bbc412c2`
> **Statut** : ✅ LIVE prod, smoke + source PASS, tests UI MH à valider

---

## 1. Scope livré

Première sous-phase V1.13.1 (Duplicate Resolution avancée). **Backend minimal** :
- Restriction admin/supra sur `_forceCreate=true`
- Audit log obligatoire `'contact_force_created_duplicate'`
- Capture optionnelle reason + justification (lenient phase)

**Aucune migration DB. Aucun nouveau endpoint. Aucune modif frontend.**

---

## 2. Décisions Q1-Q8 validées MH

| # | Décision | État V1.13.1.a |
|---|---|---|
| Q1 enrich-only | ✅ validé | (V1.13.1.c/d frontend) |
| Q2 notes append `\n---\n` | ✅ validé | (V1.13.1.c/d frontend) |
| Q3 force-create admin/supra + justif | ✅ validé | **BACKEND APPLIQUÉ V1.13.1.a (admin-only)** |
| Q4 multi-match badge UI | ✅ validé | (V1.13.1.c frontend) |
| Q5 "Me partager" auto /share | ✅ validé | (V1.13.1.d frontend) |
| Q6 actions in-modal | ✅ validé | (V1.13.1.c/d frontend) |
| Q7 voir détails inline | ✅ validé | (V1.13.1.b composant) |
| Q8 raison structurée + texte | ✅ validé | **BACKEND ENUM PRÊT V1.13.1.a** |

---

## 3. Fichier modifié (1 fichier, +33 / 0)

| Fichier | Position | Changement |
|---|---|---|
| [server/routes/data.js](server/routes/data.js) L343-365 | Avant `INSERT contacts` | Restrictions `_forceCreate` admin/supra + reason enum validation |
| [server/routes/data.js](server/routes/data.js) L367-380 | Après `INSERT`, avant `res.json` | Audit log `contact_force_created_duplicate` + console.log |

### Code ajouté (extrait)

```js
const FORCE_CREATE_REASONS = ['real_second_person', 'test_data', 'data_correction', 'other'];
if (c._forceCreate) {
  if (!req.auth.isAdmin && !req.auth.isSupra) {
    return res.status(403).json({
      error: 'FORCE_CREATE_ADMIN_ONLY',
      message: 'La creation forcee de doublon est reservee admin/supra'
    });
  }
  if (c._forceCreateReason && !FORCE_CREATE_REASONS.includes(c._forceCreateReason)) {
    return res.status(400).json({ error: 'FORCE_REASON_INVALID', allowed: FORCE_CREATE_REASONS, received: c._forceCreateReason });
  }
}
// ... INSERT ...
if (c._forceCreate) {
  logAudit(req, 'contact_force_created_duplicate', 'data', 'contact', id,
    'Contact cree en doublon explicite: ' + (c.name || ''),
    { reason: c._forceCreateReason || 'unspecified', justification: c._forceCreateJustification || '', email, phone, actor }
  );
}
```

---

## 4. Phase LENIENT — choix architectural

**Reason et justification OPTIONNELS en V1.13.1.a** car frontend prod actuel (`index-BFUGoraH.js` V1.13.0-modal-stacking-fix) n'envoie pas ces champs.

| Acteur | Frontend V1.13.0 actuel | Backend V1.13.1.a | Résultat |
|---|---|---|---|
| Member | envoie `_forceCreate:true` seul | check admin → fail | **403 FORCE_CREATE_ADMIN_ONLY** ✅ (objectif Q3) |
| Admin | envoie `_forceCreate:true` seul | accepte (lenient) | **200** + audit log avec `reason='unspecified'` ✅ |
| Admin V1.13.1.c+ | envoie `_forceCreate:true` + reason + justif | accepte tous | **200** + audit log riche ✅ |

**V1.13.1.f optionnel** (à décider plus tard) : enforcer `reason` obligatoire + `justification.length >= 10`.

---

## 5. Backend prêt + INCHANGÉ

### Inchangé
- ✅ Anti-doublon legacy V1.13.0 (`_duplicate:true` silent return) préservé pour ScheduleRdvModal V1.8.22
- ✅ Frontend bundle `index-BFUGoraH.js` (V1.13.0-modal-stacking-fix) compatible
- ✅ Bookings / RDV / reporting / agenda / call_logs : zéro impact

### Audit trail
- Action : `contact_force_created_duplicate`
- Category : `data`
- Entity : `contact`
- Metadata : `{ reason, justification, email, phone, actor }`
- Volume actuel audit_logs : 1989 entries (pré-V1.13.1.a)

---

## 6. Smoke post-deploy (4/4 PASS)

| # | Test | Résultat |
|---|---|---|
| S1 | `/api/health` | HTTP 200, uptime 15s ✅ |
| S2 | POST /contacts sans auth | HTTP 401 ✅ (middleware order intact) |
| S3 | Source prod check (grep V1.13.1.a + 4 patterns) | 4/4 présents lignes 343-370 ✅ |
| S4 | PM2 stable | pid 1061392, uptime 102s, **0 unstable_restart** ✅ |

### Vérification programmatique server-side (non destructif)
- audit_logs schema confirmé (`metadata_json` colonne pour reason/justification)
- 1989 entries pré-test (aucun INSERT destructif effectué)

---

## 7. Tests T1-T3 à valider par MH (UI réelle)

⚠️ **T-S2 (admin reason invalid) testable seulement après V1.13.1.c front**.

| # | Setup | Action | Attendu | Niveau |
|---|---|---|---|:---:|
| **T1** | Login Hiba/Thomas (member) → fiche doublon → "Créer quand même" | clic confirm | **403 FORCE_CREATE_ADMIN_ONLY** + toast "Erreur création contact" | UI |
| **T2** | (différé V1.13.1.c) | (différé) | (différé) | — |
| **T3** | Login admin (Anthony/MH) → fiche doublon → "Créer quand même" | clic confirm | **200** : 2ème contact créé + audit log entry | UI/SQL |

### Vérification SQL post-T3
```sql
SELECT action, detail, metadata_json, createdAt
FROM audit_logs
WHERE action='contact_force_created_duplicate'
ORDER BY id DESC LIMIT 3;
-- Attendu : entries avec reason='unspecified' (lenient phase)
```

---

## 8. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1131a-pre/data.js` | Pré (rollback) | `3e9ee270` (V1.13.0) |
| `/var/backups/planora/v1131a-pre/calendar360.db` | Pré DB | `991ba287` |
| `/var/backups/planora/v1131a-post/data.js` | Post V1.13.1.a | `19129312` |
| `/var/backups/planora/v1131a-post/calendar360.db` | Post DB (inchangée) | `991ba287` |

---

## 9. Reste V1.13.1 (~4h)

| Sub-tag | Effort | Contenu |
|---|---|---|
| `v1.13.1.b-match-card` | 1h30 | NEW `DuplicateMatchCard.jsx` sous-composant (~150 lignes) avec actions par card (compléter/voir/me partager/archiver/hard delete) |
| `v1.13.1.c-modal-refactor` | 1h30 | REFACTOR `DuplicateOnCreateModal.jsx` (~100 → ~280 lignes) : zones 1-4, footer "Créer quand même" admin+justif, retire boutons "Voir/Modifier" externes |
| `v1.13.1.d-handlers` | 1h | Handlers CollabPortal `enrichExistingContact` + `shareContactToSelf` + `archiveDuplicate` + render integration |
| `v1.13.1.e-tested` | 1h | Tests régression F1-F12 |

---

## 10. Rollback (si T1/T3 KO)

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1131a-pre/data.js /var/www/planora/server/routes/data.js
pm2 restart calendar360
# Retour comportement V1.13.0 : pas de check admin, pas d'audit log force-create
```

Aucune ligne audit_logs à supprimer (lenient = additif compatible).

---

## 11. Workflow strict (10/10 OK)

1. ✅ Audit READ-ONLY (8 décisions Q1-Q8 validées)
2. ✅ Diff preview + GO MH
3. ✅ Apply diff (1 fichier, +33/0)
4. ✅ `node --check` data.js
5. ✅ Backup pré md5 `3e9ee270` + `991ba287`
6. ✅ SCP + PM2 restart pid 1061392
7. ✅ Smoke 4/4 (health 200, 401 sans auth, source aligned, PM2 stable)
8. ✅ Commit `bbc412c2` + tag + push
9. ✅ Backup post md5 `19129312`
10. ✅ Handoff (ce document)

---

## 12. Tags release-track cumulés

**25 tags** (24 pré-existants V1.12+V1.13.0+fix + `v1.13.1.a-force-create-audit`).
