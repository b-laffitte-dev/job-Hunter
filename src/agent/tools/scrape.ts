/**
 * Outil : Scraping direct des sites d'emploi sans LLM
 * Utilise du parsing HTML pour extraire les offres rapidement
 */
import { JSDOM } from "jsdom";
import type { ToolParams, ToolResults } from "../types.js";
import type { JobOffer } from "../../types/index.js";

/**
 * Extrait les offres d'emploi d'une page Indeed
 */
function scrapeIndeed(html: string, url: string): JobOffer[] {
  const jobs: JobOffer[] = [];
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  try {
    // Indeed: les offres sont dans des div avec data-tn-component="jobResult"
    const jobCards = Array.from(doc.querySelectorAll('[data-tn-component="jobResult"]'));
    
    if (jobCards.length === 0) {
      // Essayer une autre sélecteur
      const altCards = Array.from(doc.querySelectorAll('.job_seen_beacon, .jobCardShelf'));
      if (altCards.length > 0) {
        altCards.forEach(card => {
          jobs.push(extractJobFromIndeedCard(card, url));
        });
      }
      return jobs;
    }
    
    jobCards.forEach(card => {
      jobs.push(extractJobFromIndeedCard(card, url));
    });
  } catch (error) {
    console.log(`[scrape] Erreur scraping Indeed: ${(error as Error).message}`);
  }
  
  return jobs;
}

function extractJobFromIndeedCard(card: any, baseUrl: string): JobOffer {
  const dom = new JSDOM(`<div>${card.innerHTML}</div>`);
  const doc = dom.window.document;
  
  // Extraire le titre
  const titleEl = doc.querySelector('h2 a[rel="noopener nofollow"]') || 
                  doc.querySelector('h2 a') ||
                  doc.querySelector('.jobTitle');
  const title = titleEl?.textContent?.trim() || "(sans titre)";
  
  // Extraire l'URL
  let url = baseUrl;
  if (titleEl && titleEl.hasAttribute('href')) {
    const href = titleEl.getAttribute('href') || '';
    if (href.startsWith('http')) {
      url = href;
    } else {
      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        url = baseUrl + href;
      }
    }
  }
  
  // Extraire l'entreprise
  const companyEl = doc.querySelector('.companyName') ||
                   doc.querySelector('.company') ||
                   doc.querySelector('[data-tn-element="companyName"]');
  const company = companyEl?.textContent?.trim() || null;
  
  // Extraire le lieu
  const locationEl = doc.querySelector('.companyLocation') ||
                    doc.querySelector('.location') ||
                    doc.querySelector('[data-tn-element="location"]');
  const location = locationEl?.textContent?.trim() || null;
  
  // Extraire le salaire
  const salaryEl = doc.querySelector('.salary-snippet') ||
                  doc.querySelector('.salary') ||
                  doc.querySelector('[data-tn-element="salary"]');
  const salary = salaryEl?.textContent?.trim() || null;
  
  // Extraire le type de contrat
  const contractEl = doc.querySelector('.employmentType') ||
                     doc.querySelector('[data-tn-element="employmentType"]');
  const contractType = contractEl?.textContent?.trim() || null;
  
  // Extraire la date
  const dateEl = doc.querySelector('.date') ||
                 doc.querySelector('.postedDate') ||
                 doc.querySelector('[data-tn-element="date"]');
  const publishedAt = dateEl?.textContent?.trim() || null;
  
  // Extraire la description (si présente)
  const descEl = doc.querySelector('.job-snippet') ||
                 doc.querySelector('[data-tn-element="jobSnippet"]');
  const description = descEl?.textContent?.trim()?.slice(0, 500) || null;
  
  return {
    id: `${baseUrl}-${title}-${Math.random().toString(36).slice(2, 9)}`,
    source: 'indeed.fr',
    title,
    company,
    location,
    url,
    description,
    contractType,
    salary,
    publishedAt,
    rawFetchedAt: new Date().toISOString(),
  };
}

/**
 * Extrait les offres d'emploi d'une page Pôle Emploi / France Travail
 */
function scrapePoleEmploi(html: string, url: string): JobOffer[] {
  const jobs: JobOffer[] = [];
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  try {
    // France Travail: les offres sont dans des li.result avec un lien .media.with-fav
    // On cherche les li avec classe "result" qui contiennent un élément avec classe "media-heading-title"
    const jobCards = Array.from(doc.querySelectorAll('li.result:has(.media-heading-title), li.result:has(.media-heading)'));
    
    // Si le sélecteur :has n'est pas supporté (ancien navigateur), utiliser une autre approche
    if (jobCards.length === 0) {
      // Trouver tous les éléments avec .media-heading-title et remonter au parent li.result
      const titleElements = Array.from(doc.querySelectorAll('.media-heading-title, .media-heading'));
      titleElements.forEach(el => {
        const liParent = el.closest('li.result');
        if (liParent && !jobCards.includes(liParent)) {
          jobCards.push(liParent);
        }
      });
    }
    
    if (jobCards.length === 0) {
      // Fallback: essayer .result-list > li
      const altCards = Array.from(doc.querySelectorAll('.result-list > li'));
      altCards.forEach(card => {
        const job = extractJobFromPoleEmploiCard(card, url);
        if (job.title !== '(sans titre)') {
          jobs.push(job);
        }
      });
      return jobs;
    }
    
    jobCards.forEach(card => {
      const job = extractJobFromPoleEmploiCard(card, url);
      if (job.title !== '(sans titre)') {
        jobs.push(job);
      }
    });
  } catch (error) {
    console.log(`[scrape] Erreur scraping Pôle Emploi: ${(error as Error).message}`);
  }
  
  return jobs;
}

function extractJobFromPoleEmploiCard(card: any, baseUrl: string): JobOffer {
  // Le card est déjà un élément DOM, on peut l'interroger directement
  const dom = new JSDOM(`<div>${card.innerHTML}</div>`);
  const doc = dom.window.document;
  
  // Extraire le titre - sur Pôle Emploi c'est dans .media-heading-title
  const titleEl = doc.querySelector('.media-heading-title');
  const title = titleEl?.textContent?.trim() || "(sans titre)";
  
  // Extraire l'URL - le lien parent a l'attribut href
  let url = baseUrl;
  const linkEl = doc.querySelector('a[href*="/offres/recherche/detail/"]');
  if (linkEl && linkEl.hasAttribute('href')) {
    const href = linkEl.getAttribute('href') || '';
    if (href.startsWith('http')) {
      url = href;
    } else if (href.startsWith('/')) {
      url = new URL(href, baseUrl).toString();
    }
  }
  
  // Extraire l'entreprise et le lieu - sur Pôle Emploi c'est dans .subtext
  // Formats possibles:
  // - "NOM_ENTREPRISE - CODE - VILLE"
  // - "NOM_ENTREPRISE - VILLE"
  // - "CODE - VILLE" (pas d'entreprise)
  // - "VILLE"
  const subtextEl = doc.querySelector('.subtext');
  let company = null;
  let location = null;
  
  if (subtextEl) {
    let text = subtextEl.textContent?.trim() || '';
    // Nettoyer les espaces insécables
    text = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Chercher le pattern "XX - VILLE" où XX est un code département (2 chiffres)
    const codeVilleMatch = text.match(/(\d{2,3})\s*-\s*([A-Z\s'-]+)$/i);
    
    if (codeVilleMatch) {
      // On a trouvé un code département suivi d'une ville à la fin
      const code = codeVilleMatch[1];
      const ville = codeVilleMatch[2];
      location = `${code} - ${ville}`;
      
      // Ce qui est avant le code est l'entreprise (peut être vide)
      let avantCode = text.slice(0, codeVilleMatch.index).trim();
      // Nettoyer les tirets en trop à la fin
      avantCode = avantCode.replace(/\s*-\s*$/, '').trim();
      company = avantCode || null;
    } else {
      // Pas de code département détecté, essayer un split simple
      const parts = text.split('-').map(p => p.trim()).filter(p => p);
      
      if (parts.length >= 2) {
        // Prendre tout sauf la dernière partie comme entreprise
        company = parts.slice(0, -1).join(' - ');
        location = parts[parts.length - 1];
      } else if (parts.length === 1) {
        location = parts[0];
      }
    }
  }
  
  // Extraire le salaire
  const salaryEl = doc.querySelector('.salaire');
  const salary = salaryEl?.textContent?.trim() || null;
  
  // Extraire le type de contrat
  const contratEl = doc.querySelector('.contrat');
  const typeContratEl = doc.querySelector('.type-contrat');
  const contractType = (contratEl?.textContent?.trim() || '') + 
                      (typeContratEl?.textContent?.trim() ? ' - ' + typeContratEl.textContent.trim() : '');
  
  // Extraire la date
  const dateEl = doc.querySelector('.date');
  const publishedAt = dateEl?.textContent?.trim() || null;
  
  // Extraire la description
  const descEl = doc.querySelector('.description');
  const description = descEl?.textContent?.trim()?.slice(0, 500) || null;
  
  return {
    id: `${url}-${title}-${Math.random().toString(36).slice(2, 9)}`,
    source: 'francetravail.fr',
    title,
    company,
    location,
    url,
    description,
    contractType: contractType || null,
    salary,
    publishedAt,
    rawFetchedAt: new Date().toISOString(),
  };
}

/**
 * Extrait les offres d'emploi d'une page LinkedIn
 */
function scrapeLinkedIn(html: string, url: string): JobOffer[] {
  const jobs: JobOffer[] = [];
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  try {
    // LinkedIn: les offres sont dans des li avec classe contenant "job"
    const jobCards = Array.from(doc.querySelectorAll('li[class*="job"]'));
    
    if (jobCards.length === 0) {
      // Essayer d'autres sélecteurs
      const altCards = Array.from(doc.querySelectorAll('.job-listing, .jobs-search-results__list-item'));
      altCards.forEach(card => {
        const job = extractJobFromLinkedInCard(card, url);
        if (job.title !== '(sans titre)') {
          jobs.push(job);
        }
      });
      return jobs;
    }
    
    jobCards.forEach(card => {
      const job = extractJobFromLinkedInCard(card, url);
      if (job.title !== '(sans titre)') {
        jobs.push(job);
      }
    });
  } catch (error) {
    console.log(`[scrape] Erreur scraping LinkedIn: ${(error as Error).message}`);
  }
  
  return jobs;
}

function extractJobFromLinkedInCard(card: any, baseUrl: string): JobOffer {
  const dom = new JSDOM(`<div>${card.innerHTML}</div>`);
  const doc = dom.window.document;
  
  // Extraire le titre
  const titleEl = doc.querySelector('h3 a, h2 a') || doc.querySelector('a[href*="/jobs/view/"]');
  const title = titleEl?.textContent?.trim() || "(sans titre)";
  
  // Extraire l'URL
  let url = baseUrl;
  if (titleEl && titleEl.hasAttribute('href')) {
    const href = titleEl.getAttribute('href') || '';
    if (href.startsWith('http')) {
      url = href;
    } else {
      url = new URL(href, baseUrl).toString();
    }
  }
  
  // Extraire l'entreprise
  const companyEl = doc.querySelector('.company, .employer');
  const company = companyEl?.textContent?.trim() || null;
  
  // Extraire le lieu
  const locationEl = doc.querySelector('.location, .job-location');
  const location = locationEl?.textContent?.trim() || null;
  
  // Extraire le salaire
  const salaryEl = doc.querySelector('.salary');
  const salary = salaryEl?.textContent?.trim() || null;
  
  // Extraire le type de contrat
  const contractEl = doc.querySelector('.employment-type');
  const contractType = contractEl?.textContent?.trim() || null;
  
  // Extraire la date
  const dateEl = doc.querySelector('.posted-date, .date');
  const publishedAt = dateEl?.textContent?.trim() || null;
  
  // Extraire la description
  const descEl = doc.querySelector('.description, .job-description');
  const description = descEl?.textContent?.trim()?.slice(0, 500) || null;
  
  return {
    id: `${baseUrl}-${title}-${Math.random().toString(36).slice(2, 9)}`,
    source: 'linkedin.fr',
    title,
    company,
    location,
    url,
    description,
    contractType,
    salary,
    publishedAt,
    rawFetchedAt: new Date().toISOString(),
  };
}

/**
 * Extrait les offres d'emploi d'une page Leboncoin
 */
function scrapeLeboncoin(html: string, url: string): JobOffer[] {
  const jobs: JobOffer[] = [];
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  try {
    // Leboncoin: les offres sont dans des div avec classe contenant "ad"
    const jobCards = Array.from(doc.querySelectorAll('[class*="ad"]'));
    
    if (jobCards.length === 0) {
      return jobs;
    }
    
    jobCards.forEach(card => {
      const titleEl = card.querySelector('h2 a');
      const title = titleEl?.textContent?.trim() || "(sans titre)";
      
      if (title !== '(sans titre)') {
        let jobUrl = url;
        if (titleEl && titleEl.hasAttribute('href')) {
          const href = titleEl.getAttribute('href') || '';
          if (href.startsWith('http')) {
            jobUrl = href;
          } else {
            jobUrl = new URL(href, url).toString();
          }
        }
        
        const companyEl = card.querySelector('.company, .author');
        const locationEl = card.querySelector('.location');
        const salaryEl = card.querySelector('.price');
        const contractEl = card.querySelector('.contract');
        const dateEl = card.querySelector('.date');
        const descEl = card.querySelector('.description');
        
        jobs.push({
          id: `${jobUrl}-${title}-${Math.random().toString(36).slice(2, 9)}`,
          source: 'leboncoin.fr',
          title,
          company: companyEl?.textContent?.trim() || null,
          location: locationEl?.textContent?.trim() || null,
          url: jobUrl,
          description: descEl?.textContent?.trim()?.slice(0, 500) || null,
          contractType: contractEl?.textContent?.trim() || null,
          salary: salaryEl?.textContent?.trim() || null,
          publishedAt: dateEl?.textContent?.trim() || null,
          rawFetchedAt: new Date().toISOString(),
        });
      }
    });
  } catch (error) {
    console.log(`[scrape] Erreur scraping Leboncoin: ${(error as Error).message}`);
  }
  
  return jobs;
}

/**
 * Détecte le type de site à partir de l'URL
 */
function detectSiteType(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  
  if (hostname.includes('indeed')) return 'indeed';
  if (hostname.includes('francetravail') || hostname.includes('pole-emploi')) return 'pole-emploi';
  if (hostname.includes('linkedin')) return 'linkedin';
  if (hostname.includes('leboncoin')) return 'leboncoin';
  
  return 'generic';
}

/**
 * Outil de scraping direct
 */
export const scrapePageTool = {
  name: "scrape_page",
  description: "Scrape directement les offres d'emploi d'une page HTML sans utiliser LLM. Plus rapide et moins coûteux.",
  
  async execute(params: { url?: string; html?: string }): Promise<ToolResults["extract_jobs"]> {
    const startTime = Date.now();
    const { url, html } = params;
    
    if (!html && !url) {
      throw new Error("Le scraping nécessite une URL ou du HTML");
    }
    
    let pageHtml = html || "";
    let pageUrl = url || "";
    
    console.log(`[scrape_page] → Début scraping de: ${pageUrl}`);
    
    try {
      let jobs: JobOffer[] = [];
      const siteType = detectSiteType(pageUrl);
      
      switch (siteType) {
        case 'indeed':
          jobs = scrapeIndeed(pageHtml, pageUrl);
          break;
        case 'pole-emploi':
          jobs = scrapePoleEmploi(pageHtml, pageUrl);
          break;
        case 'linkedin':
          jobs = scrapeLinkedIn(pageHtml, pageUrl);
          break;
        case 'leboncoin':
          jobs = scrapeLeboncoin(pageHtml, pageUrl);
          break;
        default:
          // Essayer JSON-LD en fallback
          jobs = extractJsonLdJobs(pageHtml, pageUrl);
          break;
      }
      
      const executionTime = Date.now() - startTime;
      console.log(`[scrape_page] ✓ ${jobs.length} offres scrapées en ${executionTime}ms`);
      
      return {
        jobs,
        confidence: 85, // Confiance élevée car c'est du parsing direct
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[scrape_page] ✗ Erreur: ${errorMessage}`);
      throw new Error(`Échec du scraping: ${errorMessage}`);
    }
  },
};

/**
 * Extrait les offres à partir des balises JSON-LD (fallback générique)
 */
function extractJsonLdJobs(html: string, url: string): JobOffer[] {
  const jobs: JobOffer[] = [];
  
  try {
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    
    if (!jsonLdMatches) return jobs;
    
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<script type="application\/ld\+json">|<\/script>/g, "");
        const data = JSON.parse(jsonStr);
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          if (item["@type"] && item["@type"].toString().includes("JobPosting")) {
            jobs.push({
              id: item.identifier ?? item.url ?? `${url}-${Math.random().toString(36).slice(2, 9)}`,
              source: new URL(url).hostname,
              title: item.title ?? "(sans titre)",
              company: item.hiringOrganization?.name ?? null,
              location: item.jobLocation?.address?.addressLocality ?? item.jobLocation?.name ?? null,
              url: item.url ?? url,
              description: item.description ? String(item.description).slice(0, 2000) : null,
              contractType: Array.isArray(item.employmentType) 
                ? item.employmentType.join(", ") 
                : (item.employmentType ?? null),
              salary: item.baseSalary?.value?.value ?? item.baseSalary?.value?.minValue ?? null,
              publishedAt: item.datePosted ?? null,
              rawFetchedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Ignorer les erreurs de parsing
      }
    }
  } catch {
    // Ignorer
  }
  
  return jobs;
}
