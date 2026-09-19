import { request, Agent } from "undici";
import type { ToolParams, ToolResults } from "../types.js";

// User-Agent moderne pour éviter les blocages (Chrome 131 sur macOS)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Headers communs pour toutes les requêtes (éviter la détection bot)
const DEFAULT_HEADERS = {
  "user-agent": UA,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  connection: "keep-alive",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

const dispatcher = new Agent({
  connectTimeout: 15_000,
  keepAliveTimeout: 4_000,
});

/**
 * Récupère le contenu HTML d'une URL via HTTP
 */
async function fetchText(url: string, opts: { timeoutMs?: number } = {}): Promise<string> {
  const u = new URL(url);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: { ...DEFAULT_HEADERS, accept: "text/html,*/*" },
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
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
          html = await fetchText(url, { timeoutMs: 30000 });
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
