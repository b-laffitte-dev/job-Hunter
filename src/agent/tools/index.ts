/**
 * Index des outils disponibles pour l'agent IA
 */

export { fetchPageTool } from "./fetch.js";
export { extractJobsTool } from "./extract.js";
export { scrapePageTool } from "./scrape.js";
export { scoreJobsTool } from "./score.js";
export { searchWebTool } from "./search.js";
export { saveResultsTool, loadHistoryTool, markSeenTool, loadSeenTool } from "./storage.js";

import { fetchPageTool } from "./fetch.js";
import { extractJobsTool } from "./extract.js";
import { scrapePageTool } from "./scrape.js";
import { scoreJobsTool } from "./score.js";
import { searchWebTool } from "./search.js";
import { saveResultsTool, loadHistoryTool } from "./storage.js";
import type { ToolName } from "../types.js";

/**
 * Exécute un outil par son nom
 * Utilise any pour simplifier le typage des outils hétérogènes
 */
export async function executeTool<T extends ToolName>(
  toolName: T,
  params: any
): Promise<any> {
  switch (toolName) {
    case "search_web":
      return searchWebTool.execute(params);
    case "fetch_page":
      return fetchPageTool.execute(params);
    case "extract_jobs":
      return extractJobsTool.execute(params);
    case "scrape_page":
      return scrapePageTool.execute(params);
    case "score_jobs":
      return scoreJobsTool.execute(params);
    case "save_results":
      return saveResultsTool.execute(params);
    case "load_history":
      return loadHistoryTool.execute(params);
    default:
      throw new Error(`Outil inconnu: ${toolName}`);
  }
}

/**
 * Vérifie si un outil existe
 */
export function hasTool(toolName: string): boolean {
  const tools = ["search_web", "fetch_page", "extract_jobs", "scrape_page", "score_jobs", "save_results", "load_history"];
  return tools.includes(toolName);
}

/**
 * Obtient la description d'un outil
 */
export function getToolDescription(toolName: string): string | undefined {
  const descriptions: Record<string, string> = {
    search_web: searchWebTool.description,
    fetch_page: fetchPageTool.description,
    extract_jobs: extractJobsTool.description,
    scrape_page: scrapePageTool.description,
    score_jobs: scoreJobsTool.description,
    save_results: saveResultsTool.description,
    load_history: loadHistoryTool.description,
  };
  return descriptions[toolName];
}

/**
 * Liste tous les outils disponibles
 */
export function listTools(): Array<{ name: string; description: string }> {
  return [
    { name: "search_web", description: searchWebTool.description },
    { name: "fetch_page", description: fetchPageTool.description },
    { name: "extract_jobs", description: extractJobsTool.description },
    { name: "scrape_page", description: scrapePageTool.description },
    { name: "score_jobs", description: scoreJobsTool.description },
    { name: "save_results", description: saveResultsTool.description },
    { name: "load_history", description: loadHistoryTool.description },
  ];
}
