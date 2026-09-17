import * as cheerio from "cheerio";
import type { JobOffer, SourceConfig } from "../types/index.js";
import { fetchText } from "./http.js";
import { loadEnv } from "../config/index.js";

function buildUrl(baseUrl: string, query: string, location: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("query", query);
  if (location && location !== "France") u.searchParams.set("cityName", location);
  return u.toString();
}

async function fetchWithPuppeteer(url: string): Promise<string> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 40_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function scrapeGeneric(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  const env = loadEnv();
  const baseUrl = source.baseUrl!;
  const queries = [query, ...keywords.slice(0, 2)].filter(Boolean);
  const all: JobOffer[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (all.length >= max) break;
    const url = buildUrl(baseUrl, q, location);
    let html: string;
    try {
      if (source.needsPuppeteer && env.ENABLE_PUPPETEER) {
        html = await fetchWithPuppeteer(url);
      } else {
        html = await fetchText(url);
      }
    } catch (e) {
      console.warn(`[generic:${source.name}] requête "${q}" échouée: ${(e as Error).message}`);
      continue;
    }
    const $ = cheerio.load(html);

    // Extraction des JobPosting JSON-LD (standard largement répandu)
    $('script[type="application/ld+json"]').each((_, el) => {
      if (all.length >= max) return;
      try {
        const data = JSON.parse($(el).text());
        const items = Array.isArray(data) ? data : [data];
        for (const it of items) {
          if (it["@type"] === "JobPosting" || (Array.isArray(it["@type"]) && it["@type"].includes("JobPosting"))) {
            const id = it.identifier ?? it.url ?? `${it.title}-${it.datePosted}`;
            if (seen.has(id)) continue;
            seen.add(id);
            all.push({
              id,
              source: source.name,
              title: it.title ?? "(sans titre)",
              company: it.hiringOrganization?.name ?? null,
              location: it.jobLocation?.address?.addressLocality ?? it.jobLocation?.name ?? null,
              url: it.url ?? url,
              description: it.description ? String(it.description).slice(0, 2000) : null,
              contractType: Array.isArray(it.employmentType) ? it.employmentType.join(",") : it.employmentType ?? null,
              salary: it.baseSalary?.value?.value ?? it.baseSalary?.value?.minValue ?? null,
              publishedAt: it.datePosted ?? null,
              rawFetchedAt: new Date().toISOString(),
            });
            if (all.length >= max) break;
          }
        }
      } catch {
        // ignore
      }
    });

    // Plan B : heuristique générique sur des liens d'offres
    if (all.length < max) {
      $('a[href*="job"], a[href*="offre"], a[href*="postuler"]').each((_, el) => {
        if (all.length >= max) return;
        const $el = $(el);
        const title = $el.text().trim();
        if (title.length < 8 || title.length > 200) return;
        const href = $el.attr("href") ?? "";
        const full = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
        const id = full;
        if (seen.has(id)) return;
        seen.add(id);
        all.push({
          id,
          source: source.name,
          title,
          company: null,
          location: null,
          url: full,
          description: null,
          contractType: null,
          salary: null,
          publishedAt: null,
          rawFetchedAt: new Date().toISOString(),
        });
      });
    }
  }
  return all;
}
