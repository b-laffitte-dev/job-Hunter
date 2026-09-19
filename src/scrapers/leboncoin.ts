import * as cheerio from "cheerio";
import type { JobOffer, SourceConfig } from "../types/index.js";
import { fetchText } from "./http.js";

function buildSearchUrl(
  baseUrl: string,
  query: string,
  location: string,
): string {
  const u = new URL(baseUrl);
  u.searchParams.set("q", query);
  u.searchParams.set("category", "33");
  if (location && location !== "France") {
    u.searchParams.set("location", location);
  }
  u.searchParams.set("search_types", "list");
  return u.toString();
}

export async function scrapeLeboncoin(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  const baseUrl = source.baseUrl ?? "https://www.leboncoin.fr/recherche";
  const queries = [query, ...keywords.slice(0, 2)].filter(Boolean);
  const all: JobOffer[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (all.length >= max) break;
    let html: string;
    try {
      html = await fetchText(buildSearchUrl(baseUrl, q, location));
    } catch (e) {
      console.warn(
        `[leboncoin] requête "${q}" échouée: ${(e as Error).message}`,
      );
      continue;
    }
    const $ = cheerio.load(html);

    // Leboncoin expose souvent un JSON ld+json contenant les annonces
    $('script[type="application/ld+json"]').each((_, el) => {
      if (all.length >= max) return;
      try {
        const txt = $(el).text();
        if (!txt) return;
        const data = JSON.parse(txt);
        const items = Array.isArray(data) ? data : [data];
        for (const it of items) {
          if (it["@type"] && it["@type"].toString().includes("JobPosting")) {
            const id = it.identifier ?? it.url ?? it.title + it.datePosted;
            if (seen.has(id)) continue;
            seen.add(id);
            all.push({
              id,
              source: source.name,
              title: it.title ?? "(sans titre)",
              company: it.hiringOrganization?.name ?? null,
              location:
                it.jobLocation?.address?.addressLocality ??
                it.jobLocation?.name ??
                null,
              url: it.url ?? baseUrl,
              description: it.description
                ? String(it.description).slice(0, 2000)
                : null,
              contractType: it.employmentType ?? null,
              salary:
                it.baseSalary?.value?.value ??
                it.baseSalary?.value?.minValue ??
                null,
              publishedAt: it.datePosted ?? null,
              rawFetchedAt: new Date().toISOString(),
            });
            if (all.length >= max) return;
          }
        }
      } catch {
        // json-ld malformé, on ignore
      }
    });

    // Plan B : parser les résultats HTML directement
    if (all.length < max) {
      const selectors = [
        '[data-qa-id="aditem_container"]',
        ".tgmw_b",
        'li[class*="AdCard"]',
        'article[class*="ad"]',
        'a[href*="/emplois/"]',
      ];

      for (const selector of selectors) {
        if (all.length >= max) break;
        $(selector).each((_, el) => {
          if (all.length >= max) return;
          const $el = $(el);
          const $link = $el.find('a[href*="/emplois/"]').first();
          const href = $link.attr("href");
          if (!href) return;

          const url = href.startsWith("http")
            ? href
            : new URL(href, baseUrl).toString();
          const id = url;
          if (seen.has(id)) return;
          seen.add(id);

          const title =
            $el
              .find('[class*="title"], [class*="subject"], h2, h3')
              .text()
              .trim() || $link.text().trim();
          const company =
            $el.find('[class*="company"], [class*="owner"]').text().trim() ||
            null;
          const location =
            $el.find('[class*="location"], [class*="city"]').text().trim() ||
            null;
          const salary =
            $el.find('[class*="price"], [class*="salary"]').text().trim() ||
            null;
          const date =
            $el.find('[class*="date"], [class*="created"]').text().trim() ||
            null;

          if (!title || title.length < 5) return;

          all.push({
            id,
            source: source.name,
            title,
            company,
            location,
            url,
            description: null,
            contractType: null,
            salary: salary ? salary.replace(/[^\d.,]/g, "") : null,
            publishedAt: date,
            rawFetchedAt: new Date().toISOString(),
          });
        });
      }
    }
  }
  return all;
}
