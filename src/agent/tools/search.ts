/**
 * Outil : Recherche web pour trouver des URLs de pages d'offres d'emploi
 * Utilise une approche simple basée sur des requêtes construites
 * (Alternative : pourrait utiliser une API de recherche comme Google Custom Search)
 */
import type { ToolParams, ToolResults } from "../types.js";
import { DEFAULT_SITES, type SiteConfig } from "../types.js";

/**
 * Configuration des sites avec leurs templates de recherche
 */
const SITE_CONFIGS: Record<string, SiteConfig> = DEFAULT_SITES.reduce(
  (acc, site) => {
    acc[site.name.toLowerCase()] = site;
    return acc;
  },
  {} as Record<string, SiteConfig>
);

/**
 * Construit une URL de recherche pour un site donné
 */
function buildSearchUrl(
  site: string | SiteConfig,
  query: string,
  location: string
): string {
  const siteConfig = typeof site === "string" 
    ? SITE_CONFIGS[site.toLowerCase()] 
    : site;
  
  if (!siteConfig) {
    // Site inconnu, utiliser une URL générique
    return `https://www.google.com/search?q=${encodeURIComponent(query)} ${location || "France"}`;
  }

  // Remplacer les placeholders dans le template
  return siteConfig.searchUrlTemplate
    .replace("{query}", encodeURIComponent(query))
    .replace("{location}", encodeURIComponent(location || "France"))
    .replace("{domain}", siteConfig.domain);
}

/**
 * Génère des URLs de recherche pour différents sites
 */
function generateSearchUrls(
  query: string,
  location: string,
  sites?: string[]
): Array<{ site: string; url: string }> {
  const targetSites = sites || ["Indeed", "France Travail", "Leboncoin", "LinkedIn"];
  
  return targetSites.map((site) => ({
    site,
    url: buildSearchUrl(site, query, location),
  }));
}

export const searchWebTool = {
  name: "search_web",
  description: "Génère des URLs de recherche pour trouver des offres d'emploi sur différents sites. Renvoie une liste d'URLs à scrapper.",
  
  async execute(params: ToolParams["search_web"]): Promise<ToolResults["search_web"]> {
    const { query, site, location = "France", maxResults = 30 } = params;
    const startTime = Date.now();

    try {
      // Si un site spécifique est demandé
      if (site) {
        const url = buildSearchUrl(site, query, location);
        console.log(`[search_web] ✓ 1 URL générée pour ${site}: ${url}`);
        
        return {
          urls: [url],
          query,
          site,
        };
      }

      // Sinon, générer des URLs pour plusieurs sites
      const searchUrls = generateSearchUrls(query, location);
      
      console.log(
        `[search_web] ✓ ${searchUrls.length} URLs générées pour "${query}" à ${location}`
      );
      
      // Retourner la première URL par défaut, ou toutes si demandé
      return {
        urls: searchUrls.map(s => s.url),
        query,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[search_web] ✗: ${errorMessage}`);
      throw new Error(`Échec de génération d'URLs: ${errorMessage}`);
    }
  },

  /**
   * Génère un plan de recherche complet
   */
  generateSearchPlan(
    query: string,
    location: string,
    keywords: string[]
  ): Array<{ site: string; query: string; url: string }> {
    // Utiliser la requête principale + les mots-clés étendus
    const allQueries = [query, ...keywords.slice(0, 3)];
    const sites = ["Indeed", "France Travail", "Leboncoin"];
    
    const plan: Array<{ site: string; query: string; url: string }> = [];
    
    for (const site of sites) {
      for (const q of allQueries) {
        plan.push({
          site,
          query: q,
          url: buildSearchUrl(site, q, location),
        });
      }
    }
    
    return plan;
  },
};
