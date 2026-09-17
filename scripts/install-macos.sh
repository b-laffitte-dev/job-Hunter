#!/usr/bin/env bash
# Installeur macOS pour Job Hunter AI (binaire autonome)
# - télécharge le binaire depuis la dernière release GitHub
# - l'installe dans ~/.local/bin (ou /usr/local/bin si sudo)
# - crée ~/.job-hunter-ai/ avec .env et config.json (sans écraser l'existant)
set -euo pipefail

REPO="b-laffitte-dev/job-Hunter"
BIN_NAME="job-hunter-ai"
HOME_DIR="$HOME/.job-hunter-ai"

# Détection d'arch
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ASSET_ARCH="x64" ;;
  arm64)   ASSET_ARCH="arm64" ;;
  *) echo "Architecture non supportée: $ARCH"; exit 1 ;;
esac

echo "🤖 Installation de Job Hunter AI (macOS $ASSET_ARCH)"

# Répertoire d'installation
if [[ -w "/usr/local/bin" ]]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
fi
mkdir -p "$INSTALL_DIR"

# Dernière release
echo "→ Récupération de la dernière release..."
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
ASSET_PATTERN="job-hunter-ai-darwin-${ASSET_ARCH}"

ASSET_URL=$(node -e '
  const https = require("https");
  const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
  const asset = (data.assets || []).find(a => /'${ASSET_PATTERN}'/.test(a.name));
  if (!asset) { console.error("Aucun asset correspondant à '${ASSET_PATTERN}'"); process.exit(1); }
  console.log(asset.browser_download_url);
' < <(node -e '
  const https = require("https");
  https.get("'${API_URL}'", { headers: { "User-Agent": "job-hunter-installer" } }, r => {
    let d=""; r.on("data", c => d+=c); r.on("end", () => process.stdout.write(d));
  }).on("error", e => { console.error(e.message); process.exit(1); });
'))

echo "→ Téléchargement: $ASSET_URL"
TMP_FILE="$(mktemp -t job-hunter-ai.XXXXXX)"
node -e '
  const https = require("https");
  const fs = require("fs");
  const out = fs.createWriteStream(process.env.TMP_FILE);
  https.get(process.env.ASSET_URL, { headers: { "User-Agent": "job-hunter-installer" } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      https.get(r.headers.location, { headers: { "User-Agent": "job-hunter-installer" } }, r2 => {
        r2.pipe(out); out.on("finish", () => out.close());
      }).on("error", e => { console.error(e.message); process.exit(1); });
    } else {
      r.pipe(out); out.on("finish", () => out.close());
    }
  }).on("error", e => { console.error(e.message); process.exit(1); });
'
export TMP_FILE
mv "$TMP_FILE" "$TMP_FILE.tar.gz" 2>/dev/null || true

echo "→ Installation dans $INSTALL_DIR/$BIN_NAME"
tar -xzf "$TMP_FILE.tar.gz" -C "$INSTALL_DIR/" 2>/dev/null || mv "$TMP_FILE" "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"
rm -f "$TMP_FILE" "$TMP_FILE.tar.gz"

# Seed de $HOME/.job-hunter-ai
echo "→ Configuration dans $HOME_DIR"
mkdir -p "$HOME_DIR/data"

if [[ ! -f "$HOME_DIR/.env" ]]; then
  cat > "$HOME_DIR/.env" <<'ENVEOF'
# === LLM (Mistral par défaut, compatible OpenAI) ===
LLM_API_KEY=your_mistral_api_key
LLM_BASE_URL=https://api.mistral.ai/v1
LLM_MODEL=mistral-small-latest

# === France Travail (API officielle) ===
FT_CLIENT_ID=
FT_CLIENT_SECRET=

# === Email (SMTP) ===
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=

# === Planification ===
CRON_SCHEDULE=0 8 * * *

# === Interface de chat ===
SERVE_PORT=3000
SERVE_HOST=127.0.0.1
ENVEOF
  echo "  ✓ .env créé (à éditer avec vos clés)"
else
  echo "  • .env existant conservé"
fi

if [[ ! -f "$HOME_DIR/config.json" ]]; then
  cat > "$HOME_DIR/config.json" <<'CFGEOF'
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
    { "name": "leboncoin", "type": "leboncoin", "enabled": true, "baseUrl": "https://www.leboncoin.fr/recherche" }
  ]
}
CFGEOF
  echo "  ✓ config.json créé"
else
  echo "  • config.json existant conservé"
fi

echo ""
echo "✅ Installation terminée !"
echo ""
echo "Prochaines étapes :"
echo "  1. Éditez $HOME_DIR/.env (clé LLM_API_KEY requise)"
echo "  2. Ajustez $HOME_DIR/config.json (votre recherche)"
echo "  3. Lancez l'interface de chat :  $BIN_NAME --serve"
echo "  4. Ou une recherche unique :    $BIN_NAME --once"
echo ""
echo "Assurez-vous que $INSTALL_DIR est dans votre PATH."
