# Job Hunter AI 🐦

Assistant conversationnel de recherche d'emploi (TypeScript/Node) qui :

- **Discute en langage naturel** : chaque message est interprété par le LLM pour mettre à jour les critères (requête, lieu, nombre d'offres) ou déclencher une recherche.
- **Recherche des offres actuelles** via la [Mistral Agents API](https://docs.mistral.ai/) avec l'outil `web_search` : l'agent interroge le web en temps réel et retourne des offres structurées (titre, entreprise, lieu, URL, contrat, salaire).
- **Affiche les résultats dans une UI web** avec les références/URLs sources.

> Exemple de recherche : `secrétariat médico social à Lyon`.

---

## 👍 Installation grand public (macOS, sans connaissances techniques)

Vous n'avez **pas besoin de savoir programmer**. Le logiciel est un binaire autonome (aucun Node.js à installer) pour Mac Apple Silicon (M1/M2/M3/M4/M5).

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
- « *10 offres maximum* »
- « *lance la recherche* »

Pour arrêter : `Ctrl+C` dans le Terminal.

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

## 🚀 Démarrage rapide (développeurs)

### 1. Pré-requis

- Node.js 20+
- Une clé API Mistral : https://console.mistral.ai/api-keys

### 2. Installation

```bash
git clone https://github.com/b-laffitte-dev/job-Hunter.git job-hunter-ai
cd job-hunter-ai
npm install
cp .env.example .env          # renseignez votre clé Mistral
```

### 3. Configuration

**`.env`** — secrets et paramètres :

| Variable | Rôle |
|---|---|
| `MISTRAL_API_KEY` (ou `LLM_API_KEY`) | Clé API Mistral — **requis** |
| `LLM_BASE_URL` | `https://api.mistral.ai/v1` (défaut) |
| `MISTRAL_AGENTS_URL` | `https://api.mistral.ai/v1/agents` (défaut) |
| `MISTRAL_CONVERSATIONS_URL` | `https://api.mistral.ai/v1/conversations` (défaut) |
| `MISTRAL_MODEL` | `mistral-medium-latest` (défaut) |
| `SERVE_PORT` | Port HTTP (défaut `3000`) |
| `SERVE_HOST` | Hôte bind (défaut `localhost`) |

### 4. Lancement

```bash
# Interface de chat web (recommandée)
npm run serve

# Build + lancement en production
npm run build && npm run serve:prod

# Typecheck / tests / format
npm run typecheck
npm test
npm run format
```

---

## 💬 Interface de chat

Le serveur web (`npm run serve`) expose une UI conversationnelle pour **lancer et affiner les recherches en langage naturel**.

- Ouvrez `http://127.0.0.1:3000` (ou `SERVE_PORT`) dans votre navigateur.
- Discutez avec l'agent : chaque message est interprété par le LLM pour mettre à jour les critères (requête, lieu, nombre max d'offres) ou déclencher une recherche via l'agent Mistral `web_search`.
- Le panneau latéral affiche en temps réel les critères courants et les offres trouvées.

Exemples de messages :

- « cherche secrétariat médico social à Lyon » → met à jour la requête et le lieu
- « 10 offres maximum » → met à jour le nombre de résultats
- « lance la recherche » → exécute la recherche web et affiche les offres
- « réinitialise » → revient aux critères par défaut

### API du serveur

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | UI web statique (chat + résultats) |
| WS | `/chat` | Conversation temps réel (envoi de messages, réception état + résultats) |
| GET | `/api/state` | Critères de recherche courants (session `default`) |
| POST | `/api/search` | Lance une recherche (`{query, location?}`) |

Le serveur gère des sessions isolées (via `?sessionId=...` sur le WebSocket) : chaque session conserve son état de recherche et son historique de conversation.

### Comment fonctionne une recherche

1. Le message de l'utilisateur est interprété par le LLM (action : `update`, `search`, `reset` ou `answer`).
2. Si l'action est `search`, un agent Mistral avec l'outil `web_search` est créé (une seule fois par session serveur) et une conversation est démarrée avec les critères courants.
3. Le serveur attend la fin du traitement Mistral (polling avec timeout), extrait les offres au format JSON et valide les URLs (liste blanche de domaines d'emploi français).
4. Les offres structurées sont envoyées au client via WebSocket, avec les références sources.

---

## 📁 Structure

```
job-hunter-ai/
├── src/
│   ├── llm/
│   │   ├── chat.ts        # interprétation des messages (LLM)
│   │   └── client.ts       # Mistral Chat + Agents/Conversations API
│   ├── types/             # interfaces partagées
│   ├── env.ts             # chargement .env
│   ├── server.ts          # serveur HTTP/WS + UI chat
│   └── index.ts           # CLI (commander)
├── public/                # UI web statique (index.html, app.js, style.css)
├── scripts/               # gen-ui-assets.mjs, install-macos.sh
├── .github/workflows/     # build-macos.yml (GitHub Action binaire SEA)
├── data/                  # (gitignoré sauf .gitkeep)
├── .env.example
└── package.json
```

---

## 🍎 Binaire autonome macOS (Node SEA)

Pour une installation **sans Node.js** sur macOS, téléchargez le binaire autonome généré par GitHub Actions (Node SEA — Single Executable Application).

- Téléchargement automatique : `curl -fsSL .../install-macos.sh | bash` (voir ci-dessus).
- Installation manuelle : page [Releases](https://github.com/b-laffitte-dev/job-Hunter/releases), fichier `job-hunter-ai-darwin-arm64.tar.gz`.

### Configuration dans `$HOME`

Le binaire autonome cherche sa configuration dans **`~/.job-hunter-ai/`** (créé automatiquement au premier lancement) :

```
~/.job-hunter-ai/
└── .env          # secrets (MISTRAL_API_KEY / LLM_API_KEY)
```

### Déclencher un build de release

Le workflow `.github/workflows/build-macos.yml` se déclenche :

- automatiquement quand vous poussez un tag `v*` (ex: `git tag v0.3.0 && git push origin v0.3.0`),
- manuellement depuis l'onglet Actions → « build-macos-package » → Run workflow.

Il compile pour `arm64` (macOS Tahoe/Sequoia), teste le binaire et publie les archives en release GitHub.

---

## 🛠️ Dépannage

- **`Une clé API Mistral est requise`** : renseignez `MISTRAL_API_KEY` ou `LLM_API_KEY` dans `.env` (ou `~/.job-hunter-ai/.env` pour le binaire).
- **Aucune offre** : vérifiez votre clé API et la connectivité ; reformulez la recherche avec un métier et un lieu précis.
- **`Timeout attendu pour la fin de la conversation`** : l'agent Mistral a mis trop de temps à répondre ; relancez la recherche.

## Licence

MIT
