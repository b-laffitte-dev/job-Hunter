import type { JobOffer, ScoredJob, AppConfig } from "../types/index.js";

// ============================================================================
// Types pour l'Agent IA
// ============================================================================

/**
 * Action que l'agent peut exécuter
 */
export interface AgentAction {
  type: "search" | "extract" | "score" | "refine" | "stop";
  // Pour l'action "search"
  query?: string;
  site?: string;
  location?: string;
  maxResults?: number;
  // Pour l'action "extract"
  url?: string;
  html?: string; // Alternative: passer le HTML directement
  // Pour l'action "refine"
  refinement?: string;
  // Métadonnées
  reason?: string; // Explication de l'action
  priority?: number; // 0-100
}

/**
 * Résultat d'une action exécutée
 */
export interface ActionResult {
  success: boolean;
  action: AgentAction;
  data?: {
    jobs?: JobOffer[];
    html?: string;
    urls?: string[];
    scoredJobs?: ScoredJob[];
  };
  error?: string;
  tokensUsed?: number; // Tokens LLM consommés
  executionTime?: number; // Temps d'exécution en ms
}

/**
 * État de l'agent pendant une recherche
 */
export interface AgentState {
  // Objectif de la recherche
  goal: string;
  config: AppConfig;
  
  // Progression
  currentStep: number;
  totalSteps: number;
  status: "idle" | "planning" | "searching" | "extracting" | "scoring" | "refining" | "stopped";
  
  // Résultats
  results: ScoredJob[];
  rawResults: JobOffer[];
  
  // Historique
  triedQueries: Array<{ query: string; site: string; results: number }>;
  triedUrls: string[];
  
  // Métriques
  llmCalls: number;
  totalTokensUsed: number;
  satisfaction: number; // 0-100, quand > 80 on peut s'arrêter
  
  // Limites
  maxLlmCalls?: number;
  maxTokens?: number;
  maxSteps?: number;
  
  // Erreurs
  errors: string[];
}

/**
 * Plan généré par l'agent
 */
export interface AgentPlan {
  steps: AgentAction[];
  estimatedCost: {
    llmCalls: number;
    tokens: number;
  };
  rationale: string; // Explication du plan
}

/**
 * Contexte passé à l'LLM pour la prise de décision
 */
export interface AgentContext {
  goal: string;
  currentResults: ScoredJob[];
  triedQueries: Array<{ query: string; site: string; results: number }>;
  llmCallsUsed: number;
  maxLlmCalls: number;
  tokensUsed: number;
  maxTokens: number;
  availableSites: string[];
}

/**
 * Réponse de l'LLM pour la planification
 */
export interface LLMPlanResponse {
  nextAction: AgentAction;
  rationale: string; // Pourquoi cette action
  confidence: number; // 0-100
  estimatedRemainingSteps: number;
}

/**
 * Configuration spécifique à l'agent
 */
export interface AgentConfig {
  // Limites de ressources
  maxLlmCalls: number; // Default: 20
  maxTokens: number; // Default: 50000
  maxSteps: number; // Default: 10
  maxResultsPerSource: number; // Default: 30
  
  // Comportement
  satisfactionThreshold: number; // 0-100, default: 80
  minScoreThreshold: number; // 0-100, default: 60
  
  // Sites autorisés
  allowedSites: string[]; // ex: ["indeed", "francetravail", "leboncoin"]
  
  // Optimisations
  useCache: boolean; // Mettre en cache les extractions
  parallelRequests: number; // Nombre de requêtes parallèles
}

/**
 * Résultat final de l'exécution de l'agent
 */
export interface AgentResult {
  runId: string;
  goal: string;
  state: AgentState;
  jobs: ScoredJob[];
  totalTokensUsed: number;
  totalLlmCalls: number;
  executionTime: number;
  plan?: AgentPlan; // Plan initial si généré
  summary: string; // Résumé généré par LLM
}

// ============================================================================
// Types pour les outils
// ============================================================================

/**
 * Outil générique avec schéma
 */
export interface AgentTool<TParams = unknown, TResult = unknown> {
  name: string;
  description: string;
  paramsSchema?: unknown; // Pour validation (optionnel)
  execute: (params: TParams) => Promise<TResult>;
}

/**
 * Définition des outils disponibles
 */
export type ToolName = "search_web" | "fetch_page" | "extract_jobs" | "score_jobs" | "save_results" | "load_history";

/**
 * Paramètres pour chaque outil
 */
export interface ToolParams {
  search_web: {
    query: string;
    site?: string;
    location?: string;
    maxResults?: number;
  };
  fetch_page: {
    url: string;
    usePuppeteer?: boolean; // Pour les sites qui bloquent
  };
  extract_jobs: {
    html: string;
    url: string; // Pour le contexte
    siteHint?: string; // Indice sur le site pour aider l'extraction
    queryContext?: string; // Contexte de la requête
  };
  score_jobs: {
    jobs: JobOffer[];
    criteria: {
      query: string;
      location: string;
      keywords: string[];
      excludeKeywords: string[];
      minScore: number;
    };
  };
  save_results: {
    jobs: ScoredJob[];
    runId: string;
  };
  load_history: {
    limit?: number;
  };
}

/**
 * Résultat pour chaque outil
 */
export interface ToolResults {
  search_web: {
    urls: string[];
    query: string;
    site?: string;
  };
  fetch_page: {
    url: string;
    html: string;
    statusCode: number;
  };
  extract_jobs: {
    jobs: JobOffer[];
    confidence: number; // 0-100, confiance de l'extraction
  };
  score_jobs: {
    scoredJobs: ScoredJob[];
  };
  save_results: {
    saved: boolean;
    path: string;
  };
  load_history: {
    jobs: ScoredJob[];
  };
}

// ============================================================================
// Types pour la gestion des limites
// ============================================================================

/**
 * Compteur d'utilisation LLM
 */
export interface LLMCounter {
  calls: number;
  tokens: number;
  lastCall: Date | null;
  
  // Méthodes
  addCall: (tokens: number) => void;
  reset: () => void;
  checkLimit: (maxCalls: number, maxTokens: number) => boolean;
}

/**
 * Limites de l'agent
 */
export interface AgentLimits {
  maxLlmCalls: number;
  maxTokens: number;
  maxConcurrentRequests: number;
  timeoutPerRequest: number; // en ms
}

// ============================================================================
// Types pour la configuration des sites
// ============================================================================

/**
 * Configuration d'un site pour l'agent
 */
export interface SiteConfig {
  name: string;
  domain: string;
  searchUrlTemplate: string; // ex: "https://{domain}/jobs?q={query}&l={location}"
  needsPuppeteer: boolean; // Si le site bloque les requêtes HTTP simples
  apiAvailable: boolean; // Si le site a une API publique
  apiConfig?: {
    endpoint: string;
    authRequired: boolean;
  };
}

/**
 * Liste des sites supportés
 */
export const DEFAULT_SITES: SiteConfig[] = [
  {
    name: "Indeed",
    domain: "fr.indeed.com",
    searchUrlTemplate: "https://fr.indeed.com/jobs?q={query}&l={location}",
    needsPuppeteer: true,
    apiAvailable: false,
  },
  {
    name: "France Travail",
    domain: "francetravail.fr",
    searchUrlTemplate: "https://candidat.francetravail.fr/offres/recherche?motsCles={query}&lieu={location}",
    needsPuppeteer: false,
    apiAvailable: true,
    apiConfig: {
      endpoint: "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search",
      authRequired: true,
    },
  },
  {
    name: "Leboncoin",
    domain: "www.leboncoin.fr",
    searchUrlTemplate: "https://www.leboncoin.fr/recherche?q={query}&location={location}&category=33",
    needsPuppeteer: false,
    apiAvailable: false,
  },
  {
    name: "LinkedIn",
    domain: "www.linkedin.com",
    searchUrlTemplate: "https://www.linkedin.com/jobs/search/?keywords={query}&location={location}",
    needsPuppeteer: true,
    apiAvailable: false,
  },
];
