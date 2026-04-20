# `ops/smoke/` — smoke tests frontend isolés

Détecte les régressions de rendu côté calendar360.fr (crashs React, ReferenceError,
ErrorBoundary, 4xx/5xx réseau) via un Chromium headless Playwright.

**Non intégré à la CI. Non branché sur le VPS. Lance-le à la main.**

## Installation (1 fois)

```bash
cd ops/smoke
npm install                            # installe @playwright/test
npx playwright install chromium        # télécharge le binaire chromium (~150 Mo)
```

## Usage

### Test "page de login seule" (pas de credentials nécessaires)

```bash
cd ops/smoke
npm run smoke
```

Vérifie que la home charge proprement (bundle, CSS, assets, pas de crash dès l'arrivée).

### Test "connexion collab simulée via injection session"

Quand tu as un token de session collab valide (issu d'un login réel copié depuis
DevTools → Application → Local Storage → `calendar360-session`) :

```bash
SMOKE_SESSION='<contenu exact du localStorage calendar360-session, format JSON string>' \
  npm run smoke
```

Le script l'écrit dans `localStorage.calendar360-session`, recharge, puis observe
le rendu du portail collab pendant ~6 s (laisse passer les useEffect heartbeats).

### Test "login via le formulaire"

```bash
SMOKE_EMAIL='julie@…'  SMOKE_PASS='…'  npm run smoke
```

Remplit le formulaire de login, submit, puis observe le rendu post-login.

### Options

| Variable | Défaut | Effet |
|---|---|---|
| `SMOKE_URL` | `https://calendar360.fr/` | Cible |
| `SMOKE_ROUNDS` | `1` | Nombre de rounds consécutifs (pour détecter flaky crashs) |
| `SMOKE_TIMEOUT` | `30000` | Timeout de navigation (ms) |
| `SMOKE_WAIT` | `6000` | Temps d'attente après login (ms) pour laisser tourner useEffects |
| `SMOKE_HEADLESS` | `1` | `0` = fenêtre Chromium visible pour debug |

## Sortie

1. **stdout** — résumé JSON (`summary`) + liste des erreurs critiques + network groupé par URL
2. **`ops/smoke/last-report.json`** — rapport complet avec tous les events capturés
3. **Exit code** — `1` si au moins une `pageerror` ou un ErrorBoundary visible, sinon `0`

Format du rapport :

```jsonc
{
  "target": "https://calendar360.fr/",
  "rounds": 1,
  "timestamp": "2026-04-20T…",
  "firstRound": { "loginMethod": "none|session-injection|form", "finalUrl": "…", "title": "…" },
  "summary": { "total": 0, "critical": 0, "console": 0, "network": 0, "nav": 0 },
  "critical": [ { "kind": "pageerror|errorBoundary", "message": "…", "stack": "…" } ],
  "consoleErrors": [ … ],
  "networkGrouped": { "400 GET https://…/api/messaging?…": 3 },
  "networkSample": [ … ],
  "nav": [ … ]
}
```

## Règles

- **Ne corrige rien** : ne modifie jamais de code applicatif.
- **Ne déploie rien** : jamais de scp, jamais de PM2.
- **Ne branche pas la CI** : usage manuel exclusivement.
- Le dossier `node_modules/` et `last-report.json` ne doivent pas être commités
  (ajouter à `.gitignore` si besoin).

## Interprétation rapide

| Évènement | Sévérité | Action |
|---|---|---|
| `pageerror` | 🔴 critique | bug JS qui crashe React — corriger en priorité |
| `errorBoundary` (texte "Erreur de rendu" visible) | 🔴 critique | idem |
| `console.error` | 🟠 moyenne | souvent conséquence d'un pageerror, parfois standalone |
| `network 4xx` | 🟡 à investiguer | backend/params — vérifier si symptôme ou cause |
| `network 5xx` | 🟠 moyenne | côté backend |
| `request-failed` | 🟡 | DNS / réseau local / CORS — contexte |

## V2 — tour des onglets (`collab-tour.mjs`)

Version enrichie qui, après login collab, visite successivement plusieurs
onglets du portail en définissant `localStorage.c360-portalTab` + reload.
Capture les erreurs par onglet.

### Usage

```bash
cd ops/smoke

# Tour par défaut: home → phone → crm → agenda
SMOKE_EMAIL='…'  SMOKE_PASS='…'  npm run tour

# Tour custom (sous-ensemble ou réordonné)
SMOKE_EMAIL='…'  SMOKE_PASS='…'  SMOKE_TOUR='home,phone'  npm run tour

# Fenêtre visible pour debug
SMOKE_EMAIL='…'  SMOKE_PASS='…'  npm run tour:visible
```

### Variables spécifiques V2

| Variable | Défaut | Effet |
|---|---|---|
| `SMOKE_TOUR` | `home,phone,crm,agenda` | Liste ordonnée d'onglets à visiter |
| `SMOKE_TAB_WAIT` | `4000` | Temps d'attente par onglet (ms) |

### Rapport V2

- **stdout** — summary global + **breakdown par onglet** + critical + network grouped + other
- **`ops/smoke/last-tour-report.json`** — rapport complet avec tous les events tagués par onglet (`byTab`, `critical`, `consoleErrors`, `networkGrouped`, `nav`, `other`)
- **Exit code** — `1` si au moins une `pageerror` ou `errorBoundary` détectée

Format :

```jsonc
{
  "target": "…",
  "tour": ["home", "phone", "crm", "agenda"],
  "loginMethod": "api-login",
  "summary": { "total": …, "critical": …, "console": …, "network": …, "nav": …, "other": … },
  "byTab": {
    "auth":   { "total": 0, "critical": 0, … },
    "home":   { "total": 0, … },
    "phone":  { "total": 0, … },
    "crm":    { "total": 0, … },
    "agenda": { "total": 0, … }
  },
  "critical": [ { "tab": "phone", "kind": "pageerror", … } ]
}
```

### Principe de navigation (pourquoi localStorage + reload plutôt que click DOM)

- **Plus stable** : pas dépendant des sélecteurs CSS/JSX de la nav qui peuvent bouger au refacto.
- **Déterministe** : au reload, CollabPortal lit `c360-portalTab` dans son `useState` initializer (L51) et démarre directement sur l'onglet cible.
- **Contre-partie** : chaque onglet = une nav complète (~3-4 s). Tour par défaut = ~30 s.

### Limites (à améliorer plus tard si besoin)

- Pas de clicks sur les éléments internes (ex : cliquer sur un contact dans CRM pour tester le render de la fiche). Si un bug ne se déclenche qu'à l'ouverture d'une fiche, le tour ne le verra pas.
- Onglets custom (`settings`, `messages`, `tables`, `ai-profile`, `availability`, `objectifs`) ne sont pas dans le tour par défaut — ajoutables via `SMOKE_TOUR`.

## V3 — tour avec click non-destructif par onglet (`collab-click.mjs`)

Prolonge V2 en ajoutant, pour chaque onglet visité : **1 click sur un élément
"carte / ligne / listitem"** dont le texte ne matche aucun verbe destructif,
puis `Escape` pour fermer tout modal/panneau éventuellement ouvert. Chaque
événement capturé est tagué `tab` + `phase` (`render` / `click` / `close`)
pour localiser précisément d'où vient un bug.

### Usage

```bash
cd ops/smoke

# Tour par défaut home → phone → crm → agenda avec 1 safe click par tab
SMOKE_EMAIL='…'  SMOKE_PASS='…'  npm run click

# Avec screenshots PNG par tab/phase dans ops/smoke/screenshots/
SMOKE_EMAIL='…'  SMOKE_PASS='…'  npm run click:shots

# Fenêtre visible pour debug
SMOKE_EMAIL='…'  SMOKE_PASS='…'  npm run click:visible
```

### Variables spécifiques V3

| Variable | Défaut | Effet |
|---|---|---|
| `SMOKE_CLICK_WAIT` | `2500` | Temps d'attente après le click (ms) pour laisser React re-render |
| `SMOKE_SCREENSHOTS` | `0` | `1` = capture PNG fullPage=false après render + après click |

### Modèle de sûreté du clicker

Sélecteurs tentés (dans l'ordre) :

```
[data-pipeline-card]
[data-contact-card]
[data-testid*="card" i]
[data-testid*="row" i]
[role="listitem"]
[role="row"]
[role="article"]
tr[class*="row" i]
div[class*="Card" i]
div[class*="pipeline-card" i]
div[class*="contact-card" i]
```

Pour chaque match, un filtre regex est appliqué au texte visible (max 200 car).
Skip si le texte matche :

```
/supprimer|delete|envoyer|send|créer|ajouter|add|appeler|call|logout|
  déconnect|archiver|archive|retirer|remove|publier|publish|enregistrer|
  save|confirmer|confirm|valider|transférer|transfer|payer|pay|démarrer|
  start|annuler|cancel/i
```

Si aucun élément safe trouvé, un event `interaction: no safe clickable found`
est émis (bucket `interaction`, non critique) et le tour continue.

### Rapport V3 supplémentaire

- **`byTabPhase`** : breakdown par combinaison onglet × phase (ex: `phone/render`, `phone/click`, `phone/close`)
- **`interactions`** : pour chaque onglet, ce qui a été cliqué (`selector`, `textPreview`, `result`)
- **`interaction` bucket** : events soft concernant le clicker lui-même (cible manquante, click failed…)
- **`last-click-report.json`** : rapport complet tagué par tab × phase
- **`screenshots/`** (si `SMOKE_SCREENSHOTS=1`) : PNG par `<tab>-<phase>` pour inspection visuelle

### Limites (à améliorer plus tard si besoin)

- **1 seul click par tab** : si plusieurs interactions différentes pourraient déclencher des bugs (ex: ouvrir une fiche OU changer de filtre), V3 ne teste qu'une seule par tab.
- **Sélecteurs génériques** : si l'app utilise des classes sans `card`/`row` et sans data-attribute pertinent, le clicker n'a rien à tester. Le rapport dira alors `no-safe-target` et tu sauras qu'il faut ajouter un `data-testid` ou enrichir la liste des sélecteurs.
- **Pas de chaîne d'interactions** : pas de "click A puis click B puis click C" dans la même session — chaque onglet est testé indépendamment.
- **Escape pour fermer** : fonctionne pour les modals React standards mais pas garanti pour tous les panneaux custom.

## Ajouts futurs possibles (non faits aujourd'hui)

- Comparer automatiquement `last-*-report.json` avec un baseline attendu
- Lancer sur plusieurs navigateurs (firefox, webkit)
- Chaînes d'interactions par tab (click A → click B → retour)
- Rotation JSON → alerter si nouvelle erreur apparaît vs baseline
