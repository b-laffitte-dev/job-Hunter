import type { AppConfig, JobOffer, SourceConfig } from "../types/index.js";
import { scrapeFranceTravail } from "./francetravail.js";
import { scrapeIndeed } from "./indeed.js";
import { scrapeLeboncoin } from "./leboncoin.js";
import { scrapeGeneric } from "./generic.js";

async function scrapeSource(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  switch (source.type) {
    case "francetravail":
      return scrapeFranceTravail(source, query, location, keywords, max);
    case "indeed":
      return scrapeIndeed(source, query, location, keywords, max);
    case "leboncoin":
      return scrapeLeboncoin(source, query, location, keywords, max);
    case "generic":
      return scrapeGeneric(source, query, location, keywords, max);
    default:
      console.warn(`[scraper] type inconnu pour ${source.name}, ignoré`);
      return [];
  }
}

export async function scrapeAll(
  config: AppConfig,
  keywords: string[],
): Promise<JobOffer[]> {
  const { query, location, maxResultsPerSource } = config.search;
  const enabled = config.sources.filter((s) => s.enabled);
  if (enabled.length === 0) {
    throw new Error("Aucune source activée dans la configuration.");
  }
  const results = await Promise.allSettled(
    enabled.map((s) =>
      scrapeSource(s, query, location, keywords, maxResultsPerSource),
    ),
  );
  const offers: JobOffer[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") offers.push(...r.value);
    else console.error(`[scraper] source échouée: ${r.reason?.message ?? r.reason}`);
  }
  // Dédoublonnage global par URL/id
  const seen = new Set<string>();
  return offers.filter((o) => {
    const key = o.url || o.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
