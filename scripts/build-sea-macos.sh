#!/usr/bin/env bash
# Script de build local pour créer un binaire SEA macOS autonome
# Usage: ./scripts/build-sea-macos.sh
set -euo pipefail

echo "🔧 Build SEA local pour Job Hunter AI (macOS)"

# Vérifier qu'on est dans le bon répertoire
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Installer les dépendances
if [ ! -d "node_modules" ]; then
  echo "→ Installation des dépendances npm..."
  npm install
fi

# Build TypeScript
echo "→ Compilation TypeScript..."
npm run build

# Bundle avec esbuild
echo "→ Bundle avec esbuild..."
npm run bundle

# Générer le blob SEA
echo "→ Génération du blob SEA..."
cat > sea-config.json <<'EOF'
{
  "main": "dist/job-hunter-ai.cjs",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSeaWarning": true
}
EOF
node --experimental-sea-config sea-config.json

# Créer le binaire SEA
echo "→ Création du binaire SEA..."
NODE_BIN=$(node -p "process.execPath")
echo "  Node binary: $NODE_BIN"

# Copier le binaire node
cp "$NODE_BIN" dist/job-hunter-ai

# Supprimer la signature existante
codesign --remove-signature dist/job-hunter-ai || true

# Injecter le blob avec postject
echo "→ Injection du blob avec postject..."
npx postject dist/job-hunter-ai NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# Re-signer (ad-hoc)
echo "→ Signature ad-hoc..."
codesign --force --sign - dist/job-hunter-ai

# Vérifier le binaire
echo "→ Vérification..."
chmod +x dist/job-hunter-ai
file dist/job-hunter-ai

# Tester le binaire
echo "→ Test du binaire..."
./dist/job-hunter-ai --help

# Nettoyer
echo "→ Nettoyage..."
rm -f sea-config.json

# Afficher la taille du binaire
BIN_SIZE=$(stat -f%z dist/job-hunter-ai 2>/dev/null || stat -c%s dist/job-hunter-ai)
echo ""
echo "✅ Build SEA terminé !"
echo "   Taille du binaire: $(numfmt --to=iec --suffix=B $BIN_SIZE 2>/dev/null || echo "$BIN_SIZE bytes")"
echo "   Chemin: dist/job-hunter-ai"
echo ""
echo "Pour tester:"
echo "  ./dist/job-hunter-ai --serve"
echo ""
echo "Pour installer:"
echo "  cp dist/job-hunter-ai ~/.local/bin/"
echo "  chmod +x ~/.local/bin/job-hunter-ai"
