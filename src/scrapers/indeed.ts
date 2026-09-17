import * as cheerio from "cheerio";
import type { JobOffer, SourceConfig } from "../types/index.js";
import { fetchText } from "./http.js";

function buildUrl(baseUrl: string, query: string, location: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("q", query);
  if (location && location !== "France") u.searchParams.set("l", location);
  u.searchParams.set("from", "searchOnMedia");
  return u.toString();
}

export async function scrapeIndeed(
  source: SourceConfig,
  query: string,
  location: string,
  keywords: string[],
  max: number,
): Promise<JobOffer[]> {
  const baseUrl = source.baseUrl ?? "https://fr.indeed.com/jobs";
  const queries = [query, ...keywords.slice(0, 2)].filter(Boolean);
  const all: JobOffer[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (all.length >= max) break;
    let html: string;
    try {
      html = await fetchText(buildUrl(baseUrl, q, location));
    } catch (e) {
      console.warn(`[indeed] requête "${q}" échouée: ${(e as Error).message}`);
      continue;
    }
    const $ = cheerio.load(html);
    // Indeed expose souvent un JSON ld+json contenant les offres
    $('script[type="application/ld+json"]').each((_, el) => {
      if (all.length >= max) return;
      try {
        const txt = $(el).text();
        if (!txt) return;
        const data = JSON.parse(txt);
        const items = Array.isArray(data) ? data : data.hasPart ?? [data];
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
              description: it.description ? String(it.description).slice(0, 2000) : null,
              contractType: it.employmentType ?? null,
              salary: it.baseSalary?.value?.value ?? null,
              publishedAt: it.datePosted ?? null,
              rawFetchedAt: new Date().toISOString(),
            });
            if (all.length >= max) break;
          }
        }
      } catch {
        // json-ld malformé, on ignore
      }
    });

    // Plan B : selecteurs HTML (ils changent souvent, best-effort)
    if (all.length < max) {
      $('[data-jk], .job_seen_beacon, li.css-').each((_, el) => {
        if (all.length >= max) return;
        const jk = $(el).attr("data-jk");
        if (!jk || seen.has(jk)) return;
        seen.add(jk);
        const title = $(el).find("h2 a, .jobTitle, [id^='jobTitle-']").text().trim();
        const company = $(el).find(".companyName, [id^='company-']").text().trim();
        const loc = $(el).find(".companyLocation, .company_location, [id^='companyLocation-']").text().trim();
        if (!title) return;
        all.push({
          id: jk,
          source: source.name,
          title,
          company: company || null,
          location: loc || null,
          url: `https://fr.indeed.com/viewjob?jk=${jk}`,
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
