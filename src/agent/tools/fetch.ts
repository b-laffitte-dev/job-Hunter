import { request, Agent } from "undici";
import type { ToolParams, ToolResults } from "../types.js";

// User-Agent moderne pour éviter les blocages (Chrome 131 sur macOS)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Génère un User-Agent aléatoire parmi une liste de navigateurs modernes
function getRandomUserAgent(): string {
  const userAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Headers communs pour toutes les requêtes (éviter la détection bot)
function getDefaultHeaders(): Record<string, string> {
  return {
    "user-agent": getRandomUserAgent(),
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    connection: "keep-alive",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
}

const dispatcher = new Agent({
  connectTimeout: 30_000, // Augmenté pour les sites lents
  keepAliveTimeout: 10_000, // Augmenté pour maintenir les connexions
  // Les options TLS sont gérées automatiquement par undici
});

/**
 * Récupère le contenu HTML d'une URL via HTTP
 */
async function fetchText(url: string, opts: { timeoutMs?: number } = {}): Promise<string> {
  const u = new URL(url);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: { ...getDefaultHeaders(), accept: "text/html,*/*" },
    headersTimeout: opts.timeoutMs ?? 30_000, // Augmenté
    bodyTimeout: opts.timeoutMs ?? 60_000, // Augmenté pour les pages lourdes
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text().catch(() => "");
    throw new Error(
      `HTTP ${res.statusCode} sur ${u.toString()}: ${body.slice(0, 200)}`,
    );
  }
  return res.body.text();
}

/**
 * Outil : Récupère le contenu HTML d'une page
 * Utilise HTTP simple par défaut, avec option Puppeteer pour les sites difficiles
 */
export const fetchPageTool = {
  name: "fetch_page",
  description: "Récupère le HTML d'une URL. Utilise HTTP par défaut, ou Puppeteer si le site bloque les requêtes simples.",
  
  async execute(params: ToolParams["fetch_page"]): Promise<ToolResults["fetch_page"]> {
    const startTime = Date.now();
    const { url, usePuppeteer = false } = params;

    console.log(`[fetch_page] → Récupération de: ${url} (Puppeteer: ${usePuppeteer})`);

    try {
      let html: string;
      let statusCode: number;
      let methodUsed = "HTTP";

      if (usePuppeteer) {
        // Utiliser Puppeteer pour les sites qui bloquent
        console.log(`[fetch_page]   → Méthode: Puppeteer (site bloquant)`);
        html = await this.fetchWithPuppeteer(url);
        statusCode = 200;
        methodUsed = "Puppeteer";
      } else {
        // Essayer avec HTTP simple d'abord
        try {
          console.log(`[fetch_page]   → Méthode: HTTP simple`);
          html = await fetchText(url, { timeoutMs: 60000 });
          statusCode = 200;
        } catch (httpError) {
          // Si HTTP échoue, essayer avec Puppeteer automatiquement
          console.log(`[fetch_page]   ⚠️  HTTP échoué: ${(httpError as Error).message}`);
          console.log(`[fetch_page]   → Tentative avec Puppeteer...`);
          html = await this.fetchWithPuppeteer(url);
          statusCode = 200;
          methodUsed = "Puppeteer (fallback)";
        }
      }

      const executionTime = Date.now() - startTime;
      console.log(`[fetch_page] ✓ ${url} via ${methodUsed} (${executionTime}ms, ${html.length} bytes)`);

      return {
        url,
        html,
        statusCode,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[fetch_page] ✗ ${url}: ${errorMessage}`);
      throw new Error(`Échec de récupération de ${url}: ${errorMessage}`);
    }
  },

  /**
   * Récupère une page avec Puppeteer (pour les sites qui bloquent)
   */
  async fetchWithPuppeteer(url: string): Promise<string> {
    const puppeteer = await import("puppeteer");
    const os = await import("os");
    const path = await import("path");

    const userDataDir = process.env.PUPPETEER_USER_DATA_DIR || "/tmp/puppeteer_user_data";
    const defaultChromePath = path.join(
      os.homedir(),
      ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.204/chrome-headless-shell-mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );

    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || defaultChromePath,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      });
      
      // délai aléatoire pour éviter la détection
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 3000) + 1000));
      
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      const html = await page.content();
      await page.close();
      return html;
    } finally {
      try {
        await browser.close();
      } catch {
        // Ignorer les erreurs de fermeture
      }
    }
  },
};
