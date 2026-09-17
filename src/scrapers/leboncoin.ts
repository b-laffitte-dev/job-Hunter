import * as cheerio from "cheerio";
import type { JobOffer, SourceConfig } from "../types/index.js";
import { fetchJson } from "./http.js";

interface LBCResult {
  ads?: Array<{
    list_id?: number | string;
    subject?: string;
    body?: string;
    location?: string | { city?: string; zipcode?: string; label?: string };
    url?: string;
    first_publication_date?: string;
    index_date?: string;
    price?: number | string;
  }>;
}

function buildApiUrl(query: string, location: string): string {
  const u = new URL("https://api.leboncoin.fr/finder/search");
  u.searchParams.set("limit", "35");
  u.searchParams.set("filters", JSON.stringify({
    category: { id: "33" }, // catégorie Emploi
    keywords: { text: query },
    ranges: {},
    location: location && location !== "France" ? { value: location } : {},
  }));
  return u.toString();
}

export async function scrapeLeboncoin(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  const queries = [query, ...keywords.slice(0, 2)].filter(Boolean);
  const all: JobOffer[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (all.length >= max) break;
    try {
      const data = await fetchJson<LBCResult>(buildApiUrl(q, location), {
        headers: {
          "api_key": "ba0c9dad-41c7-4d39-81d0-3a1e5b6b6f6c",
          accept: "application/json",
          origin: "https://www.leboncoin.fr",
          referer: "https://www.leboncoin.fr/",
        },
      });
      for (const ad of data.ads ?? []) {
        const id = ad.list_id ? String(ad.list_id) : Math.random().toString(36);
        if (seen.has(id)) continue;
        seen.add(id);
        const loc =
          typeof ad.location === "string"
            ? ad.location
            : ad.location?.label ?? ad.location?.city ?? null;
        const url = ad.url
          ? ad.url.startsWith("http")
            ? ad.url
            : `https://www.leboncoin.fr${ad.url}`
          : `https://www.leboncoin.fr/emplois/${id}.htm`;
        all.push({
          id,
          source: source.name,
          title: ad.subject ?? "(sans titre)",
          company: null,
          location: loc,
          url,
          description: ad.body ? ad.body.slice(0, 2000) : null,
          contractType: null,
          salary: ad.price ? `${ad.price}` : null,
          publishedAt: ad.first_publication_date ?? ad.index_date ?? null,
          rawFetchedAt: new Date().toISOString(),
        });
        if (all.length >= max) break;
      }
    } catch (e) {
      console.warn(`[leboncoin] requête "${q}" échouée: ${(e as Error).message}`);
    }
  }
  return all;
}
