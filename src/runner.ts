import { loadConfig } from "./config/index.js";
import { expandKeywords } from "./llm/keywords.js";
import { scoreJobs } from "./llm/scoring.js";
import { scrapeAll } from "./scrapers/index.js";
import { sendEmailAlert } from "./notifier/email.js";
import {
  loadSeen,
  saveSeen,
  isNewOffer,
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

  console.log(`\n=== Job Hunter AI - run ${runId} ===`);
  console.log(
    `Requête: "${config.search.query}" | Lieu: ${config.search.location}`,
  );

  // 1. Génération de mots-clés par le LLM
  let expanded: string[] = config.criteria.keywords.slice();
  try {
    const expansion = await expandKeywords(config);
    expanded = expansion.expanded;
    console.log(
      `[llm] ${expanded.length} mots-clés étendus: ${expanded.slice(0, 8).join(", ")}...`,
    );
  } catch (e) {
    console.warn(
      `[llm] expansion échouée, utilisation des mots-clés de base: ${(e as Error).message}`,
    );
  }

  // 2. Scraping de toutes les sources
  const offers = await scrapeAll(config, expanded);
  console.log(`[scrape] ${offers.length} offres brutes récupérées`);

  // 3. Filtrage des nouvelles offres (vs historique)
  const seen = loadSeen();
  const fresh = offers.filter((o) => isNewOffer(o, seen));
  console.log(
    `[store] ${fresh.length} nouvelles offres (sur ${offers.length})`,
  );

  // 4. Scoring LLM des nouvelles offres
  let scored: ScoredJob[] = [];
  if (fresh.length > 0) {
    scored = await scoreJobs(config, fresh, expanded);
    const retained = scored.filter((o) => o.score >= config.search.minScore);
    console.log(
      `[llm] ${retained.length} offres retenues (score >= ${config.search.minScore})`,
    );
    scored = retained;
  }

  // 5. Persistance
  markSeen(fresh, seen);
  saveSeen(seen);
  if (scored.length > 0) {
    saveLatest(scored);
    const archivePath = archiveRun(scored, runId);
    // Export CSV du run (dans $HOME/.job-hunter-ai/data)
    ensureHomeDir();
    const dataDir = resolveDataDir();
    ensureDir(dataDir);
    const csvPath = resolve(dataDir, `run-${runId}.csv`);
    writeFileSync(csvPath, toCSV(scored), "utf-8");
    console.log(`[store] archivé: ${archivePath} (csv: ${csvPath})`);

    // 6. Alerte email (ne pas bloquer la recherche si l'email échoue)
    try {
      await sendEmailAlert(scored, runId);
    } catch (e) {
      console.warn(`[notifier] email échoué: ${(e as Error).message}`);
    }
  } else {
    archiveRun([], runId);
    console.log("[store] aucune offre retenue, pas d'alerte email envoyée");
  }

  return {
    runId,
    expandedKeywords: expanded,
    totalScraped: offers.length,
    newOffers: fresh.length,
    retainedAfterScore: scored.length,
    archivePath: resolve("data", "history", `run-${runId}.json`),
    jobs: scored,
  };
}

export type { JobOffer, ScoredJob };
