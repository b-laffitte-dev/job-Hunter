/**
 * Module Agent IA - Pilote de recherche d'emploi
 * 
 * Ce module fournit une architecture où l'IA Mistral pilote entièrement
 * la recherche d'emploi, y compris la décision de stratégie et l'extraction
 * des données via LLM.
 * 
 * @module agent
 */

// Types
export * from "./types.js";

// Composants
export { AgentPlanner } from "./planner.js";
export { LLMCounter, getGlobalLLMCounter, resetGlobalLLMCounter } from "./llmCounter.js";
export { AgentOrchestrator, agent } from "./orchestrator.js";

// Outils
export * from "./tools/index.js";

// Réexport pour compatibilité
export type { JobOffer, ScoredJob } from "../types/index.js";
