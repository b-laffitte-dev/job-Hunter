# Job Hunter AI 🤖

Agent IA autonome de recherche d'emploi (TypeScript/Node) qui :

- **Scrape** une liste de sites d'emploi que vous choisissez (France Travail via API officielle, Indeed, Le Bon Coin, Welcome to the Jungle, ou tout site générique).
- **Étend les sources** en générant des synonymes et termes liés via un LLM (Mistral / compatible OpenAI) à partir de mots-clés fournis.
- **Score et trie** les offres grâce au LLM selon vos critères (lieu, contrat, expérience, salaire, mots-clés exclus).
- **Détecte les nouvelles offres** (historique de doublons) pour n'alerter que sur le neuf.
- **Planifie** les passages via une expression cron et **envoie des alertes email** au format HTML/CSV/JSON.

> Exemple de recherche : `secrétariat médico social`.

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

# Mode développement (tsx)
npm run dev
```

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
│   ├── llm/            # client OpenAI-compat, keywords, scoring
│   ├── notifier/       # email (nodemailer)
│   ├── scheduler/      # cron (node-cron)
│   ├── storage/        # historique, doublons, CSV
│   ├── types/          # interfaces partagées
│   ├── runner.ts       # orchestration du pipeline
│   └── index.ts        # CLI (commander)
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
