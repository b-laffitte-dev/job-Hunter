# Job Hunter AI 🤖

Agent IA autonome de recherche d'emploi (TypeScript/Node) qui :

- **Scrape** une liste de sites d'emploi que vous choisissez (France Travail via API officielle, Indeed, Le Bon Coin, Welcome to the Jungle, ou tout site générique).
- **Étend les sources** en générant des synonymes et termes liés via un LLM (Mistral / compatible OpenAI) à partir de mots-clés fournis.
- **Score et trie** les offres grâce au LLM selon vos critères (lieu, contrat, expérience, salaire, mots-clés exclus).
- **Détecte les nouvelles offres** (historique de doublons) pour n'alerter que sur le neuf.
- **Planifie** les passages via une expression cron et **envoie des alertes email** au format HTML/CSV/JSON.

> Exemple de recherche : `secrétariat médico social`.

---

## 👍 Installation grand public (macOS, sans connaissances techniques)

Vous n'avez **pas besoin de savoir programmer**. Le logiciel est un binaire autonome (aucun Node.js à installer) pour Mac Apple Silicon (M1/M2/M3/M4).

### Étape 1 — Installer le logiciel

Ouvrez le **Terminal** (`Cmd+Espace` → tapez « Terminal ») et collez :

```bash
curl -fsSL https://raw.githubusercontent.com/b-laffitte-dev/job-Hunter/main/scripts/install-macos.sh | bash
```

Le script télécharge le binaire, l'installe dans `~/.local/bin/` et crée le dossier de configuration `~/.job-hunter-ai/`.

> Si macOS affiche « *développeur non vérifié* », allez dans **Réglages Système → Confidentialité et sécurité** → « Autoriser quand même ».

### Étape 2 — Rendre la commande accessible (une seule fois)

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Vérifiez : `job-hunter-ai --help` doit afficher l'aide.

### Étape 3 — Renseigner votre clé IA (gratuite)

1. Créez une clé gratuite sur [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) (cliquez « Create new key »).
2. Ouvrez le fichier de configuration :

```bash
open -e ~/.job-hunter-ai/.env
```

3. Remplacez la ligne `LLM_API_KEY=your_mistral_api_key` par votre vraie clé, puis enregistrez (Cmd+S).

### Étape 4 — Lancer

```bash
job-hunter-ai --serve
```

Ouvrez votre navigateur sur **http://127.0.0.1:3000** et discutez avec l'agent :
- « *cherche secrétariat médico social à Lyon* »
- « *seulement en CDI* »
- « *lance la recherche* »

Pour arrêter : `Ctrl+C` dans le Terminal. Les résultats sont dans `~/.job-hunter-ai/data/` (ouvrez-les avec `open ~/.job-hunter-ai`).

### En 4 commandes

```bash
curl -fsSL https://raw.githubusercontent.com/b-laffitte-dev/job-Hunter/main/scripts/install-macos.sh | bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
open -e ~/.job-hunter-ai/.env   # collez votre clé Mistral
job-hunter-ai --serve
```

### Mac Intel (x64)

Le binaire distribué est pour Apple Silicon. Pour un Mac Intel : menu  → « À propos de ce Mac » → ligne « Puce ». Si « Intel » apparaît, installez [Node.js 22+](https://nodejs.org/) puis :

```bash
git clone https://github.com/b-laffitte-dev/job-Hunter.git
cd job-Hunter && npm install && npm run serve
```

> Une page d'installation HTML autonome est également disponible : 
> - directement dans le dépôt : [INSTALLATION.html](https://github.com/b-laffitte-dev/job-Hunter/blob/main/INSTALLATION.html) (clic droit → « Enregistrer sous »), 
> - ou en pièce jointe des [Releases](https://github.com/b-laffitte-dev/job-Hunter/releases) (fichier `INSTALLATION.html`).
> 
> Ouvrable dans tout navigateur, même hors connexion.

---

## 🚀 Démarrage rapide

### 1. Pré-requis

- Node.js 20+
- Une clé API LLM (Mistral recommandé : https://console.mistral.ai/api-keys)
- (Optionnel) Identifiants API France Travail : https://pole-emploi.io/inscription
- (Optionnel) Un compte SMTP pour les alertes email (Gmail avec mot de passe d'application, ou tout SMTP)

### 2. Installation

```bash
git clone <votre-repo> job-hunter-ai
cd job-hunter-ai
npm install
cp .env.example .env          # renseignez vos secrets
cp config/config.example.json config/config.json
```

### 3. Configuration

**`.env`** — secrets et paramètres globaux :

| Variable | Rôle |
|---|---|
| `LLM_API_KEY` | Clé API Mistral (ou compatible OpenAI) — **requis** |
| `LLM_BASE_URL` | `https://api.mistral.ai/v1` (défaut) |
| `LLM_MODEL` | `mistral-small-latest` (défaut) |
| `FT_CLIENT_ID` / `FT_CLIENT_SECRET` | API France Travail (requis si source `francetravail` activée) |
| `SMTP_*` / `EMAIL_*` | Configuration email pour les alertes |
| `CRON_SCHEDULE` | Expression cron (défaut `0 8 * * *` = tous les jours à 8h) |
| `ENABLE_PUPPETEER` | `true` pour scraper les sites SPA (Welcome to the Jungle) — nécessite Chrome |

**`config/config.json`** — recherche, critères et sources :

```jsonc
{
  "search": {
    "query": "secrétariat médico social",
    "location": "France",
    "maxResultsPerSource": 30,
    "minScore": 60
  },
  "criteria": {
    "keywords": ["secrétariat", "médico-social", "accueil", "orientation"],
    "excludeKeywords": ["commercial", "vente"],
    "experience": "débutant accepté",
    "contractTypes": ["CDI", "CDD", "MIS"],
    "remoteOk": true,
    "maxSalary": null
  },
  "sources": [
    { "name": "francetravail", "type": "francetravail", "enabled": true },
    { "name": "indeed", "type": "indeed", "enabled": true, "baseUrl": "https://fr.indeed.com/jobs" },
    { "name": "leboncoin", "type": "leboncoin", "enabled": true, "baseUrl": "https://www.leboncoin.fr/recherche" },
    { "name": "welcometothejungle", "type": "generic", "enabled": false, "baseUrl": "https://www.welcometothejungle.com/jobs", "needsPuppeteer": true }
  ]
}
```

### 4. Ajouter vos propres sites

Ajoutez une entrée dans le tableau `sources` avec `"type": "generic"` et le `baseUrl` de la page de recherche du site. Le scraper générique exploite en priorité les balises JSON-LD `JobPosting` (standard) puis une heuristique sur les liens. Pour les sites très dynamiques (SPA), mettez `"needsPuppeteer": true` et `ENABLE_PUPPETEER=true` dans `.env`.

### 5. Lancement

```bash
# Exécuter une seule recherche immédiatement
npm run run:once

# Lancer le planificateur (tourne selon CRON_SCHEDULE)
npm start

# Interface de chat web (affiner la recherche par la conversation)
npm run serve

# Mode développement (tsx)
npm run dev
```

---

## 🍎 Installation macOS (binaire autonome)

Pour une installation **sans Node.js** sur macOS, téléchargez le binaire autonome généré par GitHub Actions (Node SEA — Single Executable Application).

### Installation en une commande

```bash
curl -fsSL https://raw.githubusercontent.com/b-laffitte-dev/job-Hunter/main/scripts/install-macos.sh | bash
```

Le script :
1. détecte l'architecture (Apple Silicon `arm64` ou Intel `x64`),
2. télécharge le binaire correspondant depuis la dernière release,
3. l'installe dans `~/.local/bin` (ou `/usr/local/bin` si vous avez les droits),
4. crée `~/.job-hunter-ai/` avec `.env` et `config.json` (sans écraser l'existant).

### Installation manuelle

1. Allez sur la page [Releases](https://github.com/b-laffitte-dev/job-Hunter/releases) et téléchargez `job-hunter-ai-darwin-arm64.tar.gz` (Apple Silicon) ou `job-hunter-ai-darwin-x64.tar.gz` (Intel).
2. Décompressez et installez :

```bash
tar -xzf job-hunter-ai-darwin-*.tar.gz
chmod +x job-hunter-ai
# installation locale (recommandé)
mkdir -p ~/.local/bin && mv job-hunter-ai ~/.local/bin/
# ou système (avec sudo): sudo mv job-hunter-ai /usr/local/bin/
```

### Configuration dans `$HOME`

Le binaire autonome cherche sa configuration et ses données dans **`~/.job-hunter-ai/`** (créé automatiquement au premier lancement) :

```
~/.job-hunter-ai/
├── .env          # secrets (LLM_API_KEY, SMTP, France Travail…)
├── config.json   # recherche, critères, sources
└── data/         # historique des runs, doublons, CSV
    ├── seen.json
    ├── latest.json
    └── history/
```

Première configuration :

```bash
# Éditez vos clés (LLM_API_KEY est requis)
$EDITOR ~/.job-hunter-ai/.env
# Ajustez votre recherche (ex: secrétariat médico social)
$EDITOR ~/.job-hunter-ai/config.json

# Lancez l'interface de chat
job-hunter-ai --serve
# → ouvrez http://127.0.0.1:3000

# Ou une recherche unique
job-hunter-ai --once
```

### Note sur le binaire SEA

Le binaire embarque le runtime Node.js et tout le code applicatif (dont l'UI web), il n'a donc **aucune dépendance externe à installer**. La seule dépendance optionnelle non embarquée est `puppeteer` (pour le scraping de sites SPA) — désactivée par défaut (`ENABLE_PUPPETEER=false`).

### Déclencher un build de release

Le workflow `.github/workflows/build-macos.yml` se déclenche :
- automatiquement quand vous poussez un tag `v*` (ex: `git tag v0.1.0 && git push origin v0.1.0`),
- manuellement depuis l'onglet Actions → « build-macos-package » → Run workflow.

Il compile pour `arm64` (macos-14) et `x64` (macos-13) et publie les binaires en release GitHub.

---

## 💬 Interface de chat

Le serveur web (`npm run serve`) expose une UI conversationnelle pour **lancer et affiner les recherches en langage naturel**.

- Ouvrez `http://127.0.0.1:3000` (ou `SERVE_PORT`) dans votre navigateur.
- Discutez avec l'agent : chaque message est interprété par le LLM pour mettre à jour les critères (requête, lieu, contrat, salaire, exclusions…) ou déclencher une recherche.
- Le panneau latéral affiche en temps réel les critères courants et les offres scorées.

Exemples de messages :

- « cherche secrétariat médico social à Lyon » → met à jour la requête et le lieu
- « seulement en CDI » → ajoute la contrainte de contrat
- « exclue les offres commerciales » → ajoute une exclusion
- « lance la recherche » → exécute le pipeline complet (scraping + scoring) et affiche les résultats
- « réinitialise » → revient aux critères de la configuration

### API du serveur

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | UI web statique (chat + résultats) |
| WS | `/chat` | Conversation temps réel (envoi de messages, reception état + résultats) |
| GET | `/api/state` | Critères de recherche courants (session `default`) |
| GET | `/api/latest` | Dernières offres scorées (`data/latest.json`) |
| POST | `/api/run` | Lance un run (`{sessionId?, state?}`) |

### Variables d'environnement (interface)

| Variable | Rôle |
|---|---|
| `SERVE_PORT` | Port HTTP (défaut `3000`) |
| `SERVE_HOST` | Hôte bind (défaut `127.0.0.1` — local only) |

Le serveur gère des sessions isolées (via `?sessionId=...` sur le WebSocket) : chaque session conserve son état de recherche et son historique de conversation.

---

## 🧠 Pipeline d'exécution

```
runOnce()
  ├─ 1. expandKeywords()      → LLM génère synonymes + termes liés
  ├─ 2. scrapeAll()           → scraping parallèle des sources activées
  ├─ 3. filtrage nouvelles    → dédoublonnage vs historique (data/seen.json)
  ├─ 4. scoreJobs()           → LLM score 0-100 par batch de 10, tri descendant
  ├─ 5. filtrage minScore     → garde les offres >= search.minScore
  ├─ 6. persistance           → data/latest.json + data/history/run-*.json + run-*.csv
  └─ 7. sendEmailAlert()      → email HTML trié par pertinence
```

Chaque étape est résiliente : une source qui échoue est isolée, le LLM indisponible déclenche un scoring heuristique de repli.

---

## 📁 Structure

```
job-hunter-ai/
├── src/
│   ├── config/         # chargement .env + config.json (validés par zod)
│   ├── scrapers/       # francetravail, indeed, leboncoin, generic, http
│   ├── llm/            # client OpenAI-compat, keywords, scoring, chat
│   ├── notifier/       # email (nodemailer)
│   ├── scheduler/      # cron (node-cron)
│   ├── server.ts       # serveur HTTP/WS + UI chat
│   ├── storage/        # historique, doublons, CSV
│   ├── types/          # interfaces partagées
│   ├── runner.ts       # orchestration du pipeline
│   └── index.ts        # CLI (commander)
├── public/             # UI web statique (index.html, app.js, style.css)
├── scripts/            # gen-ui-assets.mjs, install-macos.sh
├── .github/workflows/  # build-macos.yml (GitHub Action binaire SEA)
├── config/config.example.json
├── data/               # historique des runs (gitignoré sauf .gitkeep)
├── .env.example
└── package.json
```

---

## ⚖️ Notes légales et éthiques

- Scraping : respectez les CGU de chaque site et les fréquences raisonnables. Le dédoublonnage et la planification limitent la charge.
- France Travail : utilisez l'API officielle (recommandée) plutôt que le HTML.
- Le LLM n'envoie que des résumés d'offres (titre + extrait), jamais vos données personnelles.
- Les sélecteurs HTML des agrégateurs (Indeed, Le Bon Coin) changent souvent ; préférez France Travail (stable) et le mode générique JSON-LD.

## 🛠️ Dépannage

- **`Configuration introuvable`** : copiez `config/config.example.json` vers `config/config.json`.
- **Aucune offre** : vérifiez vos identifiants France Travail et la connectivité ; certains agrégateurs bloquent les bots (passez en puppeteer).
- **`SMTP non configuré`** : les alertes email sont ignorées, les résultats restent dans `data/`.
- **Scoring vide** : la clé LLM est probablement invalide (vérifiez `LLM_API_KEY`), le repli heuristique prend le relais.

## Licence

MIT
