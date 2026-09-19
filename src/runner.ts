import { loadConfig } from "./config/index.js";
import { agent } from "./agent/index.js";
import { resetGlobalLLMCounter } from "./agent/llmCounter.js";
import {
  loadSeen,
  saveSeen,
  markSeen,
  saveLatest,
  archiveRun,
  toCSV,
} from "./storage/store.js";
import { ensureDir } from "./storage/fs.js";
import { resolveDataDir, ensureHomeDir } from "./paths.js";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import type { AppConfig, JobOffer, ScoredJob } from "./types/index.js";
import type { AgentResult } from "./agent/types.js";

export interface RunResult {
  runId: string;
  expandedKeywords: string[];
  totalScraped: number;
  newOffers: number;
  retainedAfterScore: number;
  archivePath: string;
  jobs?: ScoredJob[]; // Ajout pour retourner les offres directement
}

export async function runOnce(configPath?: string): Promise<RunResult> {
  const config = loadConfig(configPath);
  return runWithConfig(config);
}

export async function runWithConfig(config: AppConfig): Promise<RunResult> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  // Réinitialiser le compteur LLM pour cette exécution
  resetGlobalLLMCounter();

  // Construire l'objectif de recherche à partir de la config
  const goal = `${config.search.query} ${config.search.location}`.trim();

  console.log(`\n=== Job Hunter AI (Agent Mode) - run ${runId} ===`);
  console.log(`Objectif: "${goal}"`);
  console.log(`Limites: ${config.search.maxResultsPerSource} résultats max par source`);

  try {
    // Exécuter la recherche pilotée par l'Agent IA
    const agentResult: AgentResult = await agent.run(goal);

    // Traiter les résultats
    const scored = agentResult.jobs;
    const totalScraped = agentResult.state.rawResults.length;
    const newOffers = scored.length;
    const retainedAfterScore = scored.filter(j => j.score >= config.search.minScore).length;

    console.log(`[agent] ${totalScraped} offres brutes récupérées`);
    console.log(`[agent] ${newOffers} nouvelles offres (score >= ${config.search.minScore})`);
    console.log(`[agent] Utilisation: ${agentResult.totalLlmCalls} appels LLM, ~${agentResult.totalTokensUsed} tokens`);

    // Persistance supplémentaire (archivage)
    ensureHomeDir();
    const dataDir = resolveDataDir();
    ensureDir(dataDir);
    
    if (scored.length > 0) {
      saveLatest(scored);
      const archivePath = archiveRun(scored, runId);
      const csvPath = resolve(dataDir, `run-${runId}.csv`);
      writeFileSync(csvPath, toCSV(scored), "utf-8");
      console.log(`[store] archivé: ${archivePath} (csv: ${csvPath})`);
    } else {
      archiveRun([], runId);
      console.log("[store] aucune offre retenue");
    }

    return {
      runId,
      expandedKeywords: [], // Plus utilisé dans le mode agent
      totalScraped,
      newOffers,
      retainedAfterScore,
      archivePath: resolve("data", "history", `run-${runId}.json`),
      jobs: scored,
    };
  } catch (error) {
    console.error(`[agent] Erreur lors de l'exécution: ${(error as Error).message}`);
    
    // Fallback: archiver un run vide
    archiveRun([], runId);
    
    return {
      runId,
      expandedKeywords: [],
      totalScraped: 0,
      newOffers: 0,
      retainedAfterScore: 0,
      archivePath: resolve("data", "history", `run-${runId}.json`),
      jobs: [],
    };
  }
}

export type { JobOffer, ScoredJob };
