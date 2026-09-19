#!/usr/bin/env node
import { Command } from "commander";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";

const program = new Command();

program
  .name("job-hunter-ai")
  .description("Chat IA de recherche d'emploi avec Mistral Agents API - 100% interactif")
  .option("--serve", "Démarre l'interface de chat web interactive")
  .action(async (opts) => {
    // Charger les variables d'environnement
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
          console.log("\nFermeture du serveur...");
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

    // Si aucune option n'est spécifiée, démarrer le serveur par défaut
    console.log("Aucune option spécifiée. Utilisez --serve pour démarrer l'interface de chat.");
    console.log("Exemple: npm run serve");
    process.exit(0);
  });

program.parseAsync(process.argv);
