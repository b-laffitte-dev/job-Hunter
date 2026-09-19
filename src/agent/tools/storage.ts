import {
  saveLatest,
  archiveRun,
  toCSV,
  loadSeen,
  saveSeen,
  markSeen,
  isNewOffer,
  loadLatest,
  type SeenStore,
} from "../../storage/store.js";
import { ensureDir } from "../../storage/fs.js";
import { resolveDataDir, ensureHomeDir } from "../../paths.js";
import { resolve } from "node:path";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import type { JobOffer, ScoredJob } from "../../types/index.js";
import type { ToolParams, ToolResults } from "../types.js";

/**
 * Outil : Sauvegarde les résultats
 */
export const saveResultsTool = {
  name: "save_results",
  description: "Sauvegarde les résultats d'une recherche (JSON + CSV) et met à jour l'historique.",
  
  async execute(params: ToolParams["save_results"]): Promise<ToolResults["save_results"]> {
    const { jobs, runId } = params;
    const startTime = Date.now();

    try {
      ensureHomeDir();
      const dataDir = resolveDataDir();
      ensureDir(dataDir);

      // Sauvegarder les dernières offres
      if (jobs.length > 0) {
        saveLatest(jobs);
        const archivePath = archiveRun(jobs, runId);
        
        // Export CSV
        const csvPath = resolve(dataDir, `run-${runId}.csv`);
        writeFileSync(csvPath, toCSV(jobs), "utf-8");
        
        console.log(`[save_results] ✓ ${jobs.length} offres sauvegardées: ${archivePath}`);
        
        return {
          saved: true,
          path: archivePath,
        };
      } else {
        // Même sans résultats, archiver le run vide
        const archivePath = archiveRun([], runId);
        console.log(`[save_results] ✓ Aucune offre, archivé: ${archivePath}`);
        
        return {
          saved: true,
          path: archivePath,
        };
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[save_results] ✗: ${errorMessage}`);
      throw new Error(`Échec de sauvegarde: ${errorMessage}`);
    }
  },
};

/**
 * Outil : Charge l'historique des offres
 */
export const loadHistoryTool = {
  name: "load_history",
  description: "Charge l'historique des offres déjà vues pour éviter les doublons.",
  
  async execute(params: ToolParams["load_history"]): Promise<ToolResults["load_history"]> {
    const { limit = 100 } = params;
    
    try {
      const jobs = loadLatest();
      return {
        jobs: jobs.slice(0, limit),
      };
    } catch (error) {
      console.error(`[load_history] ✗: ${(error as Error).message}`);
      return { jobs: [] };
    }
  },
};

/**
 * Outil : Vérifie et marque les offres comme vues
 */
export const markSeenTool = {
  name: "mark_seen",
  description: "Marque une liste d'offres comme déjà vues pour éviter les doublons dans les futures recherches.",
  
  async execute(params: { jobs: JobOffer[] }): Promise<{ marked: number }> {
    try {
      const seen = loadSeen();
      const fresh = params.jobs.filter((o) => isNewOffer(o, seen));
      markSeen(fresh, seen);
      saveSeen(seen);
      
      return {
        marked: fresh.length,
      };
    } catch (error) {
      console.error(`[mark_seen] ✗: ${(error as Error).message}`);
      throw new Error(`Échec de marquage: ${(error as Error).message}`);
    }
  },
};

/**
 * Outil : Charge les offres déjà vues
 */
export const loadSeenTool = {
  name: "load_seen",
  description: "Charge la liste des offres déjà vues.",
  
  async execute(): Promise<{ seen: SeenStore }> {
    try {
      const seen = loadSeen();
      return { seen };
    } catch (error) {
      console.error(`[load_seen] ✗: ${(error as Error).message}`);
      return { seen: { seenIds: [], seenUrls: [] } };
    }
  },
};
