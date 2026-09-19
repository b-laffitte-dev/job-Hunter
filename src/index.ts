#!/usr/bin/env node
import { Command } from "commander";
import { runOnce } from "./runner.js";
import { startServer } from "./server.js";
import { loadEnv } from "./config/index.js";

const program = new Command();

program
  .name("job-hunter-ai")
  .description("Agent IA de recherche d'emploi - 100% interactif")
  .option("--once", "Exécute une seule recherche puis quitte")
  .option("--config <path>", "Chemin vers le fichier de configuration")
  .option("--serve", "Démarre l'interface de chat web interactive")
  .action(async (opts) => {
    try {
      loadEnv();
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }

    if (opts.serve) {
      try {
        const srv = startServer();
        console.log(
          `Interface de chat démarrée: ${srv.url} (Ctrl+C pour arrêter).`,
        );
        const shutdown = () => {
          srv.close();
          process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      } catch (e) {
        console.error(`Démarrage serveur échoué: ${(e as Error).message}`);
        process.exit(1);
      }
      return;
    }

    // Mode par défaut : une seule exécution
    try {
      const res = await runOnce(opts.config);
      console.log(
        `Run terminé: ${res.retainedAfterScore} offre(s) retenue(s) sur ${res.totalScraped} scrapées (${res.newOffers} nouvelles).`,
      );
    } catch (e) {
      console.error(`Run échoué: ${(e as Error).message}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
