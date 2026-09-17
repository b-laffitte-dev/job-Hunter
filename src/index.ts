#!/usr/bin/env node
import { Command } from "commander";
import { runOnce } from "./runner.js";
import { startScheduler } from "./scheduler/index.js";
import { loadEnv } from "./config/index.js";

const program = new Command();

program
  .name("job-hunter-ai")
  .description("Agent IA autonome de recherche d'emploi")
  .option("--once", "Exécute une seule recherche puis quitte")
  .option("--config <path>", "Chemin vers le fichier de configuration")
  .option("--schedule", "Lance en mode planificateur (cron)")
  .action(async (opts) => {
    try {
      loadEnv();
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }

    if (opts.once) {
      try {
        const res = await runOnce(opts.config);
        console.log(
          `\n✓ Run terminé: ${res.retainedAfterScore} offre(s) retenue(s) sur ${res.totalScraped} scrapées (${res.newOffers} nouvelles).`,
        );
      } catch (e) {
        console.error(`Run échoué: ${(e as Error).message}`);
        process.exit(1);
      }
      return;
    }

    // Mode planifié par défaut
    try {
      startScheduler();
      console.log("Planificateur actif. Ctrl+C pour arrêter.");
    } catch (e) {
      console.error(`Démarrage planificateur échoué: ${(e as Error).message}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
