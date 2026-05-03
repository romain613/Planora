# HANDOFF V1.14.1.x.1 — Fix fiche archivée bandeau "pas dans CRM" + barre actions cachée

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `7e39f821`
> **Tag** : `v1.14.1.x.1-archived-fiche-fix`
> **Statut** : ✅ LIVE prod, smoke PASS, frontend-only deploy
> **Phase** : 2 hotfix UX (sur-sub-phase de V1.14.1.x)

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":7162}` |
| PM2 | pid `1114226`, **uptime 119m+, 0 restart** (backend intact depuis V1.13.2.b) |
| Bundle prod | `index-0PTGydcf.js` md5 `fb38d49a` (3.14 MB, gzip 705 KB) |
| Backend | `data.js` md5 `cdd1803a` (V1.13.2.b conservé inchangé) |
| Branche | `clean-main` HEAD `7e39f821` |
| Tag | `v1.14.1.x.1-archived-fiche-fix` push GitHub OK |
| Tags release-track cumulés | **37** (V1.12.x + V1.13.x + V1.14.x) |

---

## 2. Bug fixé (V1.14.1.x.1)

### Symptôme prod (V1.14.1.x)

Ouvrir la fiche d'un contact archivé (ex: Hichem EL FALOUSSI) depuis :
- Sub-tab Archivés CrmTab → click card
- Hub SMS V1.14.1.x → bouton "Voir fiche" archivé

**Affichait** :
- ✅ Bandeau supérieur "📦 Contact archivé / Lecture seule" (correct)
- ❌ **AUSSI** bandeau "Ce contact n'est pas encore dans le CRM" + bouton "Ajouter" (faux)
- ❌ Barre actions complète (Restaurer, Supprimer définitivement, Fusionner) **CACHÉE**
- ❌ Seule la barre actions réduite Email/Appeler s'affichait (pour visiteurs non-CRM)

### Cause racine

`ct._linked` est mis à `true` dans [CollabPortal.jsx:2892,2906](app/src/features/collab/CollabPortal.jsx#L2892) lors de l'enrichment contacts depuis `/api/init`. Backend `/api/init` filtre archivés (V1.12.5.a) → contacts archivés ne passent **pas** par cet enrichment → `_linked: undefined`.

Modale fiche CrmTab a 11 occurrences de `ct._linked` qui interprètent `undefined` comme "non lié au CRM" → bandeau "pas dans CRM" + masque barre actions complète (incluant Restaurer/SupprDef).

### Stratégie B retenue (validée MH)

Normaliser au **point d'entrée** : forcer `_linked: true` sur l'objet contact passé à `setSelectedCrmContact` pour les 2 sites où on ouvre une fiche archivée. Sans toucher la modale ni les 11 occurrences `ct._linked`.

---

## 3. Patches (2 fichiers, 2 lignes fonctionnelles + 6 commentaire)

### `tabs/CrmTab.jsx:219` (sub-tab Archivés card click)

```diff
 {archivedContacts.map(ct => (
+  // V1.14.1.x.1 — Force _linked:true pour fiche archivee...
-  <Card key={ct.id} onClick={()=>{setSelectedCrmContact(ct);setCollabFicheTab("notes");}}
+  <Card key={ct.id} onClick={()=>{setSelectedCrmContact({...ct, _linked: true});setCollabFicheTab("notes");}}
     ...
```

### `tabs/PhoneTab.jsx` (V1.14.1.x Hub SMS Voir fiche archivé, ligne ~1062)

```diff
+    {/* V1.14.1.x.1 — Force _linked:true pour fiche archivee... */}
-    <div onClick={()=>{ if(selectedContact && setSelectedCrmContact) setSelectedCrmContact(selectedContact); }} ...>
+    <div onClick={()=>{ if(selectedContact && setSelectedCrmContact) setSelectedCrmContact({...selectedContact, _linked: true}); }} ...>
       <I n="eye" s={13}/> Voir fiche
     </div>
```

**Total : +8 / -2 lignes** (2 lignes fonctionnelles, 6 commentaire). **0 NEW fichier.**

---

## 4. Effet attendu

| Scénario | Avant V1.14.1.x.1 | Après V1.14.1.x.1 |
|---|---|---|
| Sub-tab Archivés → click fiche archivée | Bandeau "📦" + bandeau "pas dans CRM" + Ajouter (incohérent) · barre actions complète CACHÉE | Bandeau "📦 Contact archivé" SEUL · barre actions complète VISIBLE avec Restaurer + Supprimer définitivement + Fusionner |
| Hub SMS Voir fiche archivé | Idem bug | Idem fix |
| Visiteur non-CRM (cards Kanban legacy) | "Ajouter au CRM" visible | **INCHANGÉ** (CRM cards Kanban non touchées) |
| FicheContactModal.jsx (dormant) | Bug latent | Couvert (lit selectedCrmContact du context, déjà normalisé) |

---

## 5. Compatibilité

- ✅ V1.13.x backend : aucun changement
- ✅ V1.14.0 mutation centralisée : inchangé
- ✅ V1.14.1 listeners modales : inchangé
- ✅ V1.14.1.x Hub SMS UI 3 états : préservée
- ✅ V1.14.1.x bouton Fusionner archivé + Étape 0 : préservée
- ✅ Backend / DB : 0 changement, md5 `cdd1803a` (V1.13.2.b) invariable

---

## 6. Tests UI à valider visuellement par MH

### T1 — Sub-tab Archivés → fiche archivée
1. CRM tab → toggle "📦 Archivés"
2. Click sur une card archivée
3. ✅ Bandeau "📦 Contact archivé" SEUL en haut
4. ✅ **AUCUN** bandeau "Ce contact n'est pas encore dans le CRM"
5. ✅ Barre actions complète : Email · Appeler · SMS · RDV · Classer Perdu · **Restaurer** · **Supprimer définitivement** · **Fusionner**

### T2 — Hub SMS Voir fiche archivé
1. Hub SMS → conversation avec contact archivé (selectedConv.contactId existant)
2. Click "Voir fiche" (bouton gris)
3. ✅ Modale fiche s'ouvre comme T1 (barre actions complète)

### T3 — Visiteur non-CRM (régression check)
1. Cards Kanban CRM avec contact visiteur non-lié (legacy, rare)
2. Click "Fiche"
3. ✅ Bandeau "Ce contact n'est pas encore dans le CRM" + bouton Ajouter visible (comportement INCHANGÉ)

### T4 — Régression V1.14.1.x
1. Hub SMS lookup archivé
2. ✅ UI 3 états (📦 violet / ? rouge / actif) intact
3. ✅ Boutons Restaurer / Supprimer définitivement Hub SMS intacts
4. CRM tab fiche → bouton Fusionner archivé → modale Étape 0 violet "Restaurer puis fusionner" intact

---

## 7. Backups

### V1.14.1.x.1
- **Pré-deploy** : `/var/backups/planora/v1141x1-pre-20260503-102015/` (httpdocs `20c67aad` = V1.14.1.x)
- **Post-deploy** : `/var/backups/planora/v1141x1-post-20260503-102212/` (httpdocs `9ff9a13a` = V1.14.1.x.1)

⚠ Pas de backup data.js (backend non modifié, md5 `cdd1803a` invariable depuis V1.13.2.b).

---

## 8. Rollback

### Rollback V1.14.1.x.1 → V1.14.1.x (frontend uniquement)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1141x1-pre-20260503-102015/httpdocs-pre.tar.gz
# Pas de PM2 restart nécessaire — backend inchangé
```

---

## 9. Prochains chantiers

### En pause (audits livrés, attendent décisions MH)
- **V1.14.1.y** flag permission `ALLOW_ALL_CONTACT_DELETION` (3 options A/B/C — conflit directive backend identifié)
  - Audit : `docs/audits/2026-05/AUDIT-V1.14.1.y-PERMISSION-FLAG-2026-05-03.md`
- **V1.14.2** `contactStore` + `useContact` hook
  - Audit : `docs/audits/2026-05/AUDIT-V1.14.2-CONTACT-STORE-HOOK-2026-05-03.md`

### Annoncé MH après tests visuels prod
- **V2 logique doublons intelligente** (audit READ-ONLY à venir)

### Roadmap (rappel)
- V1.15 : polling/WebSocket/SSE + versioning ETag
- PHASE 3 : Outlook Calendar
- PHASE 4 : Refonte Agenda UX
- PHASE 5 : Refonte fiche CRM
- PHASE 6 : Import rapide colonne droite
- PHASE 7 : Optimisations UX globales

---

## 10. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 37 tags)
2. **`HANDOFF-V1.14.1.x.1-ARCHIVED-FICHE-FIX.md`** (ce document)
3. `HANDOFF-V1.14.1.x-FIX-UX-ARCHIVE.md` (V1.14.1.x parent)
4. `HANDOFF-V1.14.1-MODALES-LISTENERS.md`
5. `HANDOFF-V1.14.0-MUTATION-CENTRALIZED.md`
6. `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md`
7. `CLAUDE.md` §0/§0bis/§10

### Audits en pause
- `docs/audits/2026-05/AUDIT-V1.14.1.y-PERMISSION-FLAG-2026-05-03.md`
- `docs/audits/2026-05/AUDIT-V1.14.2-CONTACT-STORE-HOOK-2026-05-03.md`

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V1.14.1.x.1 livré, déployé, smoke PASS. Bug critique modale fiche archivée corrigé en 2 lignes (Stratégie B normalisation au point d'entrée). Backend intact (md5 `cdd1803a` depuis V1.13.2.b), PM2 sans restart 119m+, V1.13.x + V1.14.0/1/1.x préservés, comportement visiteurs non-CRM inchangé.

**Aucune régression. Prochaine étape : tests visuels MH T1-T4 puis V1.14.1.y/V1.14.2/V2 doublons selon priorités MH.**
