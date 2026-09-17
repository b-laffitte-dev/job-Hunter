#!/usr/bin/env node
// Génère src/ui-assets.generated.ts à partir des fichiers dans public/
// Embarque l'UI web dans le binaire (SEA) pour ne pas dépendre de fichiers externes.
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";

const PUBLIC_DIR = resolve("public");
const OUT_FILE = resolve("src", "ui-assets.generated.ts");

if (!existsSync(PUBLIC_DIR)) {
  console.error("Dossier public/ introuvable");
  process.exit(1);
}

function escapeForJs(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

const files = readdirSync(PUBLIC_DIR).filter((f) => /\.(html|css|js|svg|ico|json)$/.test(f));
const entries = files.map((f) => {
  const content = readFileSync(resolve(PUBLIC_DIR, f), "utf-8");
  const route = f === "index.html" ? "/" : `/${f}`;
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  }[extname(f)] ?? "application/octet-stream";
  return `  ${JSON.stringify(route)}: { mime: ${JSON.stringify(mime)}, body: \`${escapeForJs(content)}\` }`;
});

const output = `// AUTO-GÉNÉRÉ par scripts/gen-ui-assets.mjs — NE PAS ÉDITER À LA MAIN
// Contenu de l'UI web embarqué dans le binaire (SEA) pour servir sans fichiers externes.

export interface UiAsset { mime: string; body: string; }

export const UI_ASSETS: Record<string, UiAsset> = {
${entries.join(",\n")}
};
`;

mkdirSync(resolve("src"), { recursive: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(OUT_FILE, output, "utf-8");
console.log(`✓ ${OUT_FILE} généré (${files.length} fichiers embarqués: ${files.join(", ")})`);
