# Règles métier — Leads issus d'enveloppes (v1, figé 2026-04-21)

**Statut** : v1 validée MH, 2026-04-21. Source de vérité produit pour tout le chantier "Enveloppes de leads" (phases L1 → L6).

**Principe directeur** :

> Un lead d'enveloppe = ressource business.
> Le collaborateur TRAVAILLE. Seul l'admin SUPPRIME.
> Aucune action collab ne peut faire disparaître un lead ou son contact.
> Aucune règle ne se branche sur la `pipeline_stage` — comportement unique, prévisible.

---

## A. Création du contact

**Règle unique, aucun cas particulier.**

À chaque dispatch (auto cron ou manuel admin), un `contacts` row est **toujours** créé dans le CRM :

- `pipeline_stage = 'nouveau'`
- `source = 'lead'`
- `envelopeId = <envId>` (immuable dès cet instant)
- `assignedTo = <collabId>`

Le collaborateur voit ce contact **immédiatement** dans son pipeline. Pas de quarantaine, pas de "pending acceptance", pas d'état intermédiaire.

C'est un vrai contact CRM dès la seconde 1.

---

## B. Actions autorisées au collaborateur

**2 actions maximum, rien d'autre :**

| Action | Effet |
|---|---|
| **TRAVAILLER** | Libre : changer pipeline_stage, ajouter notes, passer appels, prendre RDV, marquer `gagne` / `perdu` / etc. Même comportement qu'aujourd'hui pour tout contact. |
| **RENVOYER** | Dire explicitement "je ne traite pas ce lead". Effet unique décrit en §C. |

**Interdits au collaborateur** :

- ❌ Supprimer un contact avec `envelopeId != ''`
- ❌ Modifier `envelopeId`
- ❌ Se désassigner lui-même
- ❌ Modifier `assignedTo` d'un contact

Le flag `collaborators.can_delete_contacts` est **ignoré** pour les contacts avec `envelopeId != ''`. Il ne reste valide que pour les contacts de source manuelle.

---

## C. « Renvoyer » — logique unique sans aucune variante

**Peu importe la `pipeline_stage` au moment du renvoi, l'effet est strictement identique** :

1. **`contacts`** : `assignedTo = ''`, `pipeline_stage = 'recycle'` (archivé, toutes notes/appels/historique préservés)
2. **`incoming_leads`** : `status = 'unassigned'`, `assigned_to = ''`, `contact_id = ''`, `dispatched = 1`
3. **`lead_assignments`** : row supprimée
4. **`envelopeId`** sur le contact : **préservé** (traçabilité permanente)
5. **`lead_history`** : `action = 'rejected_by_collab'`, `user_id` = collabId
6. **Notification** : admin alerté

**Aucune branche selon la stage. Aucun "si nouveau delete sinon keep". Un seul chemin.**

Un contact en `pipeline_stage = 'recycle'` n'apparaît pas dans le pipe actif (ni côté collab, ni côté admin default). Il reste visible en "Archives" pour audit.

---

## D. Actions admin

### D.1 — Retirer un lead à un collab

Effet **identique à "Renvoyer"**, sauf que l'admin en est l'auteur :

1. `contacts.assignedTo = ''`, `pipeline_stage = 'recycle'`
2. `incoming_leads.status = 'unassigned'`, `contact_id = ''`, `dispatched = 1`
3. `lead_assignments` row supprimée
4. `envelopeId` préservé (immuable)
5. `lead_history` : `action = 'unassigned_by_admin'`, `user_id` = adminId
6. Notification : collab retiré alerté

**Comportement unique**, peu importe la `pipeline_stage`. Ceci simplifie le `bulk-unassign` actuel qui branchait sur `stage = 'nouveau'` pour supprimer le contact — désormais le contact n'est **jamais supprimé** par ce chemin.

### D.2 — Redispatcher un lead

1. `incoming_leads.status = 'queued'`, `dispatched = 0` → éligible au cron auto OU au dispatch manuel ciblé
2. Au dispatch effectif :
   - Si le contact existe encore (`pipeline_stage = 'recycle'`) → UPDATE `contacts.assignedTo = <newCollab>`, `pipeline_stage = 'nouveau'`, création nouveau `lead_assignments`
   - Si le contact a été forcé-delete par un supra (cas rare) → INSERT nouveau contact
3. `envelopeId` inchangé (immuable)
4. `lead_history` : `action = 'redispatched'`
5. Notification : nouveau collab alerté

---

## E. envelopeId IMMUTABLE

Règle absolue, gravée :

`contacts.envelopeId` est écrit **une seule fois** à l'INSERT depuis un dispatch de lead. **Jamais modifié** par :

- Aucune action collab (quelle qu'elle soit)
- "Retirer" admin
- "Renvoyer" collab
- "Redispatcher" (le contact réactivé garde son envelopeId d'origine)
- Cron recycle 7j
- Aucune migration future sans décision explicite

**Garantie d'implémentation** : aucune route applicative n'expose l'UPDATE de `envelopeId`. La colonne n'a pas de mutateur. Si un changement exceptionnel est nécessaire, c'est par intervention SQL manuelle supra-admin avec audit log.

---

## Historique — traçabilité distincte par cause

Bien que le retour collab et le retrait admin aient un **état final identique**, l'historique enregistre des actions distinctes dans `lead_history.action` :

| Déclencheur | `action` | `user_id` | Notification cible |
|---|---|---|---|
| Collab renvoie | `rejected_by_collab` | collab | Admin |
| Admin retire | `unassigned_by_admin` | admin | Collab retiré |
| Recycle auto 7j après `perdu` | `recycled_auto` | `system:cron` | (optionnelle) |
| Redispatch manuel | `redispatched` | admin | Nouveau collab |

Cette distinction permet au reporting (phase L5) de compter séparément les causes de retour enveloppe.

---

## Statuts `incoming_leads` (inchangés, 5 existants)

| Statut | Rôle | Transitions |
|---|---|---|
| `new` | Importé, pas encore dispatchable | → `queued` |
| `queued` | Prêt à dispatch | → `assigned` |
| `assigned` | Actif chez un collab | → `unassigned` (Renvoyer OU Retirer) |
| `unassigned` | Attend décision admin | → `queued` (redispatch) |
| `duplicate` / `error` | Terminal technique | — |

**Aucun nouveau statut créé.** Le statut `rejected` n'a pas été introduit : `unassigned` couvre le cas (le "qui" et le "pourquoi" sont dans `lead_history.action`).

---

## Matrice des permissions

| Action | Collab | Admin | Supra |
|---|---|---|---|
| Travailler (stage, notes, RDV, appels) | ✅ | ✅ | ✅ |
| Renvoyer | ✅ | ✅ (log=collab) | ✅ |
| Retirer | ❌ | ✅ (log=admin) | ✅ |
| Redispatcher | ❌ | ✅ | ✅ |
| DELETE contact avec envelopeId | ❌ | ❌ | ✅ override |
| Modifier envelopeId | ❌ | ❌ | ❌ (SQL manuel uniquement) |
| DELETE lead row brut | ❌ | ✅ (rare, brutal) | ✅ |

---

## Ce qui reste strictement inchangé dans le système existant

- Flow dispatch auto (cron every 5 min)
- Flow dispatch manuel admin
- Dedup import (email + phone)
- Pipeline drag & drop collab
- Transitions de `pipeline_stage` (`nouveau` → `qualifie` → `rdv_pris` → `gagne` / `perdu` / etc.)
- Règles de dispatch (percentage, round-robin, quotas)
- Import CSV / Google Sheet
- Cron recycle 7j `perdu` (effet aligné sur Renvoyer : contact → `recycle`, lead → `queued`)
- Notifications existantes

---

## Ajouts code nécessaires (phases suivantes, hors L1)

1. **Garde DELETE contact** : refuser si `envelopeId != ''` pour rôle collab (y compris `can_delete_contacts=1`). Admin/supra peut forcer.
2. **Route `POST /api/leads/contacts/:id/reject`** (collab) — effet C.
3. **Simplification `bulk-unassign`** : retirer la branche `stage = 'nouveau' → delete`. Toujours `stage = 'recycle'`, contact jamais supprimé.
4. **Alignement cron recycle 7j** : vérifier que l'effet actuel correspond à §C (contact → `recycle`, lead → `queued`), sinon aligner.
5. **Écriture des 3 valeurs `action` distinctes** dans `lead_history` aux bons call-sites.

**Rien d'autre.** Aucune modification de :
- `pipeline_stage` transitions
- `lead_dispatch_rules`
- Flow dedup
- Flow import

---

## Invariants non-négociables (5)

Toute modification future doit respecter ces invariants sans exception :

1. **Un contact avec `envelopeId != ''` ne peut jamais être supprimé par une action collab**, quel que soit son `pipeline_stage` ou son flag `can_delete_contacts`.
2. **`envelopeId` n'est jamais modifié après création.** Aucune route mutate.
3. **Le collab n'a que 2 actions métier** : Travailler, Renvoyer. Pas d'ajout sans revue.
4. **Renvoyer et Retirer produisent le même état final** : contact `stage=recycle` préservé, lead `unassigned`. Seule l'action loggée dans `lead_history` les distingue.
5. **Zéro branche sur `pipeline_stage`** dans les flows de retour enveloppe. Comportement unique, prévisible.

---

## Références

- CLAUDE.md §0bis (règles architecture frontend)
- CLAUDE.md §10 (Option A runtime — monolithe source de vérité)
- Phase L1 : DDL + backfill + propagation `envelopeId` (commits `ce18b2cc` suivi de L1.a/L1.b appliqués 2026-04-21)
- Phases L2-L6 : à ouvrir après validation de ce cadrage v1 (gelé tant que MH n'a pas donné GO explicite)
