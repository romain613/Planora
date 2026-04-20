# PHASE C — Rapport investigation dette monolithe (2026-04-20)

> **Read-only.** Aucune modification effectuée.
> Périmètre : `calendar360.db` (monolithe) uniquement.
> Source : VPS `/var/www/planora-data/calendar360.db`.

---

## 1. TL;DR — Constat global

| Catégorie | Nb groupes / rows | 100% sur ? |
|---|---|---|
| Doublons emails | 13 groupes / 46 contacts | mixte : 10 sur `c1` (fixtures démo), 3 cross-company (MH propriétaire) |
| Doublons phones | 9 groupes / 30 contacts | mixte : 6 sur `c1` (fixtures démo), 3 cross-company (MH propriétaire) |
| Bookings orphans | 32 rows | **100% sur `c-monbilan`** |
| Call_logs orphans | 48 rows / 16 contactIds | **100% sur `c-monbilan`** |
| Contacts → collab inexistant | 2 rows | 1 sur `c1774809632450`, 1 sur `comp-first` |
| Call_logs avec `contactId=''` (hors scope strict) | 145 rows | c-monbilan (94), c1775722958849 (46), c1776169036725 (5) |

### Insight structurant
**99% de la dette "orphelins" se concentre sur `c-monbilan`** (bookings + call_logs).
Les doublons emails/phones sont en grande majorité des fixtures démo de la company
fictive `c1` (4 batchs de seed rejoués le 2026-04-09, probablement par un script
d'initialisation).

### Note importante sur la Phase B et le mode shadow
D'après Control Tower : `c-monbilan.tenantMode='shadow'` (feature `contacts=shadow`).

En mode shadow : **les écritures runtime vont uniquement dans le monolithe**, la tenant DB
est utilisée en lecture parallèle pour comparaison. La Phase B a corrigé la **tenant DB**
de MonBilan (39 bookings → 0 orphelin). Le **monolithe est resté inchangé** par design
(contrainte "aucun traitement du monolithe").

**Conséquence pratique** : les 30 bookings identifiés en Phase B + 2 nouveaux
(`test002 test002`) existent encore comme orphelins dans le monolithe. Le runtime prod
les considère toujours comme non-valides. Pour un nettoyage complet, il faudrait
**rejouer la Phase B sur le monolithe** (script identique, 18 remaps + 12 marks + les 2
nouveaux test002).

---

## 2. Doublons emails — 13 groupes / 46 rows

### Classification

| Type | # groupes | # rows | Groupes |
|---|---|---|---|
| **Fixtures démo `c1`** | 10 | 40 | claire, emma, hugo, julie, karim, lea, marc, nadia, paul, thomas @mail.com |
| **Cross-company (MH propriétaire)** | 3 | 6 | rc.sitbon@gmail.com (2), romain.biotech@gmail.com (2), sitbon.immobilier@gmail.com (2) |

### 2A — Fixtures `c1` (10 groupes × 4 rows = 40 contacts)

Tous créés le **2026-04-09 en 4 batchs exactement espacés** (8:16:44, 8:31:46, 8:32:59, 17:07:32).
Chaque batch contient exactement les mêmes 10 personnes. Signature d'un **script de seed rejoué 4 fois**.

| Email | Nom | Phone | Batch 1 id | Batch 2 id | Batch 3 id | Batch 4 id |
|---|---|---|---|---|---|---|
| claire@mail.com | Claire Roux | _(vide)_ | ct_1775722604963_kas0is | ct_1775723507164_06ybx4 | ct_1775723579952_uholzt | ct_1775754453245_nfbe8w |
| emma@mail.com | Emma Laurent | _(vide)_ | ct_1775722604902_c9g0wi | ct_1775723507160_ewtby6 | ct_1775723580138_pf1224 | ct_1775754453212_cmge3k |
| hugo@mail.com | Hugo Petit | +33698765432 | ct_1775722604969_wz91ib | ct_1775723507196_vn4lej | ct_1775723580018_b256xc | ct_1775754453250_04wk0u |
| julie@mail.com | Julie Fontaine | _(vide)_ | ct_1775722604948_mgcmu5 | ct_1775723507201_4unqmj | ct_1775723580071_gtfreu | ct_1775754453144_0qbzwy |
| karim@mail.com | Karim Bousaid | +33611223344 | ct_1775722604943_ebu5wf | ct_1775723507185_pwywjx | ct_1775723580098_kuep8h | ct_1775754453253_4hq2de |
| lea@mail.com | Léa Duval | +33677889900 | ct_1775722604945_lrb22h | ct_1775723507157_6qol62 | ct_1775723580131_tqup10 | ct_1775754453229_frr1yr |
| marc@mail.com | Marc Blanc | +33655443322 | ct_1775722604910_n8c4q8 | ct_1775723507191_w0swy1 | ct_1775723580129_c7gvqq | ct_1775754453242_u96aki |
| nadia@mail.com | Nadia Ferhat | +33699887766 | ct_1775722604965_ypidok | ct_1775723507176_movsqv | ct_1775723580134_00efz4 | ct_1775754453257_cghk6x |
| paul@mail.com | Paul Lefèvre | +33612345678 | ct_1775722604967_0d6mza | ct_1775723507172_7t35va | ct_1775723580061_tl6mjh | ct_1775754453248_i5tlje |
| thomas@mail.com | Thomas Girard | _(vide)_ | ct_1775722604974_9yitrx | ct_1775723507104_zarr53 | ct_1775723580140_u40rqi | ct_1775754453255_u9m28c |

Tous `companyId='c1'`, tous `assignedTo=''`, tous `pipeline_stage='nouveau'`, tous
`contract_status='active'`, `totalBookings=1`.

**⚠ Mise à jour** : `c1` **existe** comme vraie company `Calendar360` dans la table
`companies`. Mais cette entreprise a **0 booking et 0 call_log** — uniquement les 40
contacts fixtures sont attachés à elle. Ce qui correspond au bug HANDOFF §6 :
"**Company ID `c1` en prod** : le frontend envoie `companyId=c1` (valeur de fixture/mock
hardcodée à `data/fixtures.js` ligne 3) au lieu du vrai ID". Le bug fait que tout
contact créé via le mock atterrit sur cette company `c1`.

Companies vérifiées (`SELECT id, name FROM companies`) :
| id | name |
|---|---|
| c1 | Calendar360 |
| c-monbilan | MonBilandeCompetences.fr |
| c1774809632450 | Creatland |
| c1775722958849 | GENETICAT |
| c1776169036725 | CAPFINANCES |
| comp-first | Competences First |

### 2B — Cross-company (MH propriétaire) — 3 groupes × 2 rows

| Email | contactId_1 (company) | contactId_2 (company) | Correspondance |
|---|---|---|---|
| rc.sitbon@gmail.com | `ct_1775723822209_yr8mht` (c1775722958849, u1775723576024) | `ct_1776273340046_5oz9u2` (**c-monbilan**) | MH lui-même |
| romain.biotech@gmail.com | `ct_1775723822217_g44lxh` (c1775722958849) | `ct_1776169517823_mng9ix` (**c1776169036725** = CapFinances) | MH (autre email) |
| sitbon.immobilier@gmail.com | `ct1774569283665` (**c-monbilan**, u-guillaume, `test test`) | `ct_1775723822210_f589e4` (c1775722958849, `Test Test`) | MH (test) |

Ce sont des **vrais duplicates cross-company** mais **légitimes** si l'isolation par
tenant est la règle : un même email peut appartenir à plusieurs entreprises
(chacune a son propre contact, isolée dans sa propre DB).

### Stratégies possibles pour Doublons emails

| # | Stratégie | Périmètre | Avantage | Risque |
|---|---|---|---|---|
| **E1** | Statu quo | 13 groupes | 0 action | Aucun fonctionnellement (emails dupliqués ne cassent rien) |
| **E2** | Delete fixtures `c1` (40 rows) | 10 groupes fixtures | Nettoie le monolithe, aligné sur règle §0 (c1 = fictif) | Si le frontend envoie encore `companyId=c1`, nouvelles fixtures se recréeront |
| **E3** | Fixer d'abord le bug frontend `companyId=c1` + delete fixtures | 10 groupes | Résout la source du problème | Nécessite PR frontend, hors scope DB |
| **E4** | Dedup fixtures `c1` (garder 1 / 4 par personne) | 10 groupes | Compromis — monolithe moins chargé, UX inchangée | Arbitraire sur quel batch garder |
| **L1** | Laisser les 3 cross-company | 3 groupes | Légitime by-design (tenant isolation) | 0 |

**Recommandation** : **E3 + L1**. Le bug `c1` dans [`fixtures.js`](app/src/data/fixtures.js) ligne 3
est un problème frontend documenté dans HANDOFF §6 ("Bug connu, non résolu, NON prioritaire").
Tant qu'il n'est pas fixé, toute suppression de fixtures sera recréée à chaque chargement
de l'app sans companyId valide. Donc :
- **Fixer d'abord le bug frontend** (PR dédiée : remplacer la valeur de fixture par le vrai companyId sélectionné)
- **Puis nettoyer les 40 fixtures `c1`** en monolithe (delete + verify 0 booking/call_log
  associé — confirmé : 0 partout)
- **Laisser les 3 cross-company tranquilles** (légitimes by-design)

⚠ Attention : la company `c1` (Calendar360) est une vraie company. Donc **NE PAS DELETE
la company elle-même**, juste les 40 contacts fixtures qui y sont rattachés par bug.

---

## 3. Doublons phones — 9 groupes / 30 rows

### Classification

| Type | # groupes | # rows | Phones |
|---|---|---|---|
| Fixtures `c1` | 6 | 24 | +33611223344 (Karim), +33612345678 (Paul), +33655443322 (Marc), +33677889900 (Léa), +33698765432 (Hugo), +33699887766 (Nadia) |
| Cross-company MH | 3 | 6 | +33644686824, 0616367116, 0644686824 |

### 3A — Fixtures `c1` (6 phones × 4 rows = 24 contacts)

**Exactement les mêmes contacts** que §2A (les 6 fixtures qui ont un téléphone).
Dedup résolu en même temps.

### 3B — Cross-company (3 phones × 2 rows = 6 contacts)

| Phone | contactId_1 (company) | contactId_2 (company) | Notes |
|---|---|---|---|
| +33644686824 | ct_1776273340046_5oz9u2 (c-monbilan, rc.sitbon@gmail.com) | ct_1775723822209_yr8mht (c1775722958849, rc.sitbon@gmail.com) | Même email + même phone, 2 tenants différents |
| 0616367116 | ct_1776206683184_wc90bl (c-monbilan, Romain Sitbon, pas d'email) | ct_1775723822208_eb888z (c1775722958849, ro rom, rc.sitbon@geneticat.fr) | Même phone, 2 personnes fictives |
| 0644686824 | ct_1775723822210_temhbn (c1775722958849, Test01, charlederothschild@gmail.com) | ct_1776169517823_mng9ix (c1776169036725, Romain Sitbon, romain.biotech@gmail.com) | Même phone, 2 contacts test |

### Stratégies possibles pour Doublons phones
Identiques à §2 puisque les phones fixtures `c1` = sous-ensemble des emails fixtures `c1`.
Après nettoyage des 40 fixtures emails, **il ne restera que les 6 cross-company phones**
→ légitimes by-design → **L1 (laisser)**.

---

## 4. Bookings orphans monolithe — 32 rows

### Distribution
**100% sur `companyId='c-monbilan'`.**
- **30 rows** = les mêmes bookings déjà identifiés en Phase B (même ids)
- **2 rows** nouveaux non vus en Phase B (créés après l'audit initial)

### 4A — Les 30 de Phase B (inchangés dans monolithe)

Identiques à Phase B §3. Rappel rapide :
- `ct1774569201336` (rc.sitbon@gmail.com) : 9 bookings → remap vers `ct_1776273340046_5oz9u2`
- `ct1774891551680` (romain.biotech@gmail.com) : 9 bookings → mark `__deleted__`
- `ct1774872506050_uzue` (Melie.guillot@outlook.fr) : 3 → remap vers `ct_1776145908058_wtaru9`
- `ct1775002913105` (Rc@gmail.com) : 3 → remap vers `ct_1776145908236_gmn91t`
- `ct1774872506051_slk5` (marieange1978.maz@gmail.com) : 1 → remap vers `ct_1776289668254_lqufr4`
- `ct1774872506053_vss5` (orlanne.huet@icloud.com) : 1 → remap vers `ct_1776145908086_zo67ea`
- `ct1775553932527` (juju@gmail.com) : 1 → remap vers `ct_1776206683167_iwx8p2`
- `ct1774907550965` (sitbon alain) : 1 → mark `__deleted__`
- `ct1774819397149pw56` (Romain charles charles) : 1 → mark `__deleted__`
- `ct17757957649807a5g` (Romain Sitbon, tel 0616367116) : 1 → mark `__deleted__`

**Détail complet** : voir [PHASE-B-REPORT-2026-04-20.md](PHASE-B-REPORT-2026-04-20.md) §3 + §4.

### 4B — Les 2 nouveaux (test002 test002)

| id | contactId | date | time | status | source | visitorName | visitorEmail | visitorPhone | collab |
|---|---|---|---|---|---|---|---|---|---|
| `bk1776374105401` | `ct_1776362792698_ikea68` | 2026-04-17 | 11:30 | confirmed | pipeline | test002 test002 | test002@gmail.com | _(vide)_ | u-jordan |
| `b_inter_1776374144922_dbk1e3` | `ct_1776362792698_ikea68` | 2026-04-17 | 09:00 | pending | **inter-collab** | test002 test002 | test002@gmail.com | _(vide)_ | u-guillaume |

**Correspondance par email** : oui, un contact actif existe avec `email=test002@gmail.com` :
```
ct_1776535124719_e3g4j8 | test002 test002 | test002@gmail.com | companyId=c-monbilan
```

Note : la table `contacts` a un contact `test002` créé le 2026-04-20 mais l'orphan contactId
`ct_1776362792698_ikea68` ne correspond pas. Donc scenario = contact créé + booking créé +
contact supprimé + contact recréé avec un nouvel id. Même pattern que Phase B.

### Stratégies possibles pour Bookings orphans

| # | Stratégie | Périmètre | Avantage | Risque |
|---|---|---|---|---|
| **B1** | Rejouer Phase B sur monolithe (strictement identique) + ajouter 2 remaps test002 | 32 bookings | Aligne monolithe sur tenant, FK-safe, audit en JSON déjà préparé | Touche le monolithe en écriture |
| **B2** | Statu quo sur le monolithe | 32 | Pas de modif prod | Runtime voit encore les orphans, blocant Phase D FK ON |
| **B3** | Delete les 32 | 32 | Simple | Perte historique RDV (même raison que refus Phase B) |

**Recommandation** : **B1** — rejouer Phase B sur le monolithe pour alignement total.
Script quasi-identique (ajouter les 2 test002 remaps). Audit JSON séparé pour traçabilité
monolithe.

### Mapping proposé pour Phase C-execute (si validée)

**18 + 2 = 20 remaps**, **12 marks** (identique Phase B) :
- Les 18 remaps Phase B + :
  - `bk1776374105401` : `ct_1776362792698_ikea68` → `ct_1776535124719_e3g4j8` (test002)
  - `b_inter_1776374144922_dbk1e3` : `ct_1776362792698_ikea68` → `ct_1776535124719_e3g4j8` (test002)
- Les 12 marks inchangés

---

## 5. Call_logs orphans monolithe — 48 rows / 16 contactIds distincts

### Distribution par contactId (tous `companyId='c-monbilan'`)

| # | orphan contactId | nb calls | dirs | toNums dominant | total_dur (s) | Vu en Phase B ? | Stratégie proposée |
|---|---|---|---|---|---|---|---|
| 1 | `ct1774891551680` | 21 | outbound + inbound | +33644686824 | 951 | ✅ oui → `__deleted__` | **mark `__deleted__`** (cohérent Phase B) |
| 2 | `ct_1775664554375_ebnzzr` | 4 | inbound | +33603490433 | 172 | ❌ nouveau | mark `__deleted__` (aucun match email/phone dans contacts actifs) |
| 3 | `ct_1775664554375_uwngkl` | 4 | inbound | +33755535321 | 0 | ❌ nouveau | mark `__deleted__` (4 appels en sonnerie, pas de données) |
| 4 | `ct1775002913105` | 3 | outbound | +33644686824 | 10 | ✅ oui → `ct_1776145908236_gmn91t` | **remap** vers `ct_1776145908236_gmn91t` (Rc@gmail.com) |
| 5 | `ct1774819397149pw56` | 2 | outbound | +33644686824 | 13 | ✅ oui → `__deleted__` | **mark `__deleted__`** |
| 6 | `ct1774872506051_slk5` | 2 | outbound | +33754529661 | 6 | ✅ oui → `ct_1776289668254_lqufr4` | **remap** vers `ct_1776289668254_lqufr4` (marieange) |
| 7 | `ct1774891615850` | 2 | outbound | +33618284897 | 38 | ❌ nouveau | mark `__deleted__` |
| 8 | `ct1775553408534` | 2 | inbound | +33683939292 | 83 | ❌ nouveau (≠ ct1775553932527) | mark `__deleted__` |
| 9 | `ct1774569201336` | 1 | inbound | — | 0 | ✅ oui → `ct_1776273340046_5oz9u2` | **remap** vers `ct_1776273340046_5oz9u2` (rc.sitbon) |
| 10 | `ct1774872506050_n5w1` | 1 | outbound | +33671671409 | 20 | ❌ nouveau (suffixe `_n5w1` ≠ `_uzue` de Phase B) | mark `__deleted__` |
| 11 | `ct1774872506053_vss5` | 1 | outbound | +33749025487 | 2 | ✅ oui → `ct_1776145908086_zo67ea` | **remap** vers `ct_1776145908086_zo67ea` (orlanne.huet) |
| 12 | `ct1774906474846` | 1 | outbound | +33155785848 | 64 | ❌ nouveau | mark `__deleted__` |
| 13 | `ct_1775664554375_dto6h3` | 1 | inbound | — | 0 | ❌ nouveau | mark `__deleted__` |
| 14 | `ct_1775664554375_fpqftb` | 1 | inbound | — | 0 | ❌ nouveau | mark `__deleted__` |
| 15 | `ct_1775664554375_t8rqaq` | 1 | inbound | — | 0 | ❌ nouveau | mark `__deleted__` |
| 16 | `ct_1775804899342_h5hii4` | 1 | outbound | +33644686824 | 12 | ❌ nouveau | mark `__deleted__` |

### Récap call_logs

| Action | Nb contactIds | Nb calls | Détail |
|---|---|---|---|
| **Remap** (mapping Phase B connu) | 4 | 7 | rc.sitbon (1), Rc@gmail.com (3), marieange (2), orlanne.huet (1) |
| **Mark `__deleted__`** (Phase B cohérent + nouveaux sans match) | 12 | 41 | 21 + 2 connus + 18 nouveaux |
| Total | 16 | **48** | ✅ |

### Stratégies possibles pour Call_logs orphans

| # | Stratégie | Périmètre | Avantage | Risque |
|---|---|---|---|---|
| **CL1** | Même stratégie E que Phase B (remap+mark) | 48 | Préserve 100% historique appels, FK-safe | Aucun |
| **CL2** | Statu quo | 48 | 0 action | Runtime voit les orphans, bloc Phase D FK |
| **CL3** | Delete les 48 | 48 | Simple | **Perte historique VoIP** — MH a explicitement refusé (Décision 5 du brief initial) |

**Recommandation** : **CL1** — cohérent avec Phase B, c'est exactement ce que MH a
décidé pour la Décision 5 ("conserver l'historique", "marquage propre compatible FK").

### Audit JSON pré-calculé (option C de Phase B réutilisé)

Même pattern : un script idempotent + un JSON de mapping committé en git.
Mapping : 7 remaps + 41 marks.

---

## 6. Contacts → collab inexistant — 2 rows

| id | nom | email | phone | companyId | assignedTo (inexistant) |
|---|---|---|---|---|---|
| `ct1774812199599` | Préau Préau | Sitbon.alain@creatland.com | +33 611913142 | `c1774809632450` | `u1774811266836` |
| `ct1774872603359` | efef efef | dee (not email) | _(vide)_ | `comp-first` | `u-rcsitbon` |

### Analyse

- **ct1774812199599** : un contact légit mais assigné à un collaborateur qui n'existe plus.
  Société `c1774809632450` (à vérifier si cette company existe).
- **ct1774872603359** : données clairement de test (`efef efef`, email `dee`, company
  `comp-first`). Probable data polluante.

### Stratégies possibles

| # | Stratégie | Avantage | Risque |
|---|---|---|---|
| **A1** | Set `assignedTo=''` (dé-assigner) | FK-safe, conservation contact | Le contact reste "orphelin de collab" |
| **A2** | Réassigner manuellement à un vrai collab existant | Contact opérationnel | Décision business (qui ?) |
| **A3** | Delete les 2 contacts | Nettoyage total | Perte de données (léger, 2 rows seulement) |

**Recommandation** : **A1** (dé-assigner) pour `ct1774812199599`, **A3** (delete) pour
`ct1774872603359` (clairement du test `efef`).

---

## 7. Hors scope strict mais visible : 145 call_logs avec `contactId=''`

| companyId | nb call_logs empty contactId |
|---|---|
| c-monbilan | 94 |
| c1775722958849 | 46 |
| c1776169036725 (CapFinances) | 5 |

Ce sont des call_logs sans contactId du tout (`NULL` ou `''`) — **pas des orphelins
techniques** puisqu'un contactId vide ne viole aucune FK. Ce sont probablement :
- Des appels entrants inconnus (personne qui appelle sans être dans la CRM)
- Des appels échoués / raccrochés avant rattachement

**Recommandation** : laisser tel quel (by-design acceptable). Mentionné pour info.

---

## 8. Stratégie globale recommandée pour nettoyage monolithe

Ordre suggéré (4 sous-phases, toutes validables indépendamment) :

### Phase C-1 — Rejouer Phase B sur monolithe (32 bookings + 2 test002)
- Script idempotent similaire à Phase B, scope `calendar360.db`
- Backup avant, transaction, integrity_check, audit JSON
- **20 remaps + 12 marks**
- Résultat : 0 bookings orphans dans monolithe

### Phase C-2 — Call_logs orphans (48 rows)
- Même pattern : remap (7 calls) + mark `__deleted__` (41 calls)
- Backup + transaction + audit JSON
- Résultat : 0 call_logs orphans dans monolithe

### Phase C-3 — Contacts → collab inexistant (2 rows)
- 1 dé-assignation + 1 delete (cas test évident)
- Backup + decision confirmée avant execution

### Phase C-4 — Fixtures `c1` (40 contacts)
- **Bloquant** : nécessite d'abord la fix frontend `companyId=c1` (HANDOFF §6).
- Sans fix frontend, les fixtures se recréeront.
- À planifier en parallèle d'une PR frontend dédiée.
- Puis `DELETE FROM contacts WHERE companyId='c1'` + vérifier les bookings/call_logs associés.
- **Hors scope Phase C-execute immédiate** — proposer en dernier.

### Phases C-5 à plus tard
- Les 3 doublons cross-company (MH) → laisser tel quel (légitimes by-design)
- Les 145 call_logs empty contactId → laisser tel quel (by-design)

---

## 9. Alignement avec les décisions actées (brief initial MH)

| Décision | Traduction Phase C |
|---|---|
| 4. "13 doublons emails → audit case-by-case manuel" | ✅ Liste détaillée fournie, stratégie proposée par groupe, décision finale à MH |
| 5. "48 call_logs orphelins → conserver + marquage propre, pas de delete" | ✅ Stratégie CL1 (remap 7 + mark 41) respecte cette contrainte |
| 6. "FK ON plus tard, après nettoyage" | ✅ Phase D arrive après Phase C, tenants-first |

---

## 10. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune correction | ✅ |
| Aucune suppression | ✅ |
| Aucune fusion automatique | ✅ |
| Aucune activation FK | ✅ |
| Read-only uniquement | ✅ (SELECT + PRAGMA exclusivement) |
| Périmètre monolithe uniquement | ✅ |
| 4 listes détaillées | ✅ §2 + §3 + §4 + §5 |
| Ids concernés listés | ✅ ids nominatifs partout |
| Correspondances possibles | ✅ cross-ref emails + phones avec contacts actifs |
| Stratégies proposées par catégorie | ✅ §2, §3, §4, §5, §6 |

Aucune action prise. Décision MH attendue avant tout execute.

---

## 11. Questions à trancher pour Phase C-execute (si décidée)

1. **Bookings orphans** : stratégie B1 (rejouer Phase B + 2 test002) ou autre ?
2. **Call_logs orphans** : stratégie CL1 (remap 7 + mark 41) confirmée ?
3. **Contacts→collab orphans** : A1 pour Préau, A3 pour `efef` ? Ou tout garder ?
4. **Fixtures `c1`** : on attend la fix frontend (PR séparée) ou on traite maintenant
   avec le risque de recréation ?
5. **Ordre d'exécution** : une seule phase monolithique ou 4 sous-phases indépendantes
   (recommandé) ?
6. **Option C réutilisée** (audit JSON en git, pas de colonne DB) ?
7. **CapFinances** : tenant DB propre (audit Phase 1), mais faut-il un audit symétrique
   avant Phase D FK ON ?
