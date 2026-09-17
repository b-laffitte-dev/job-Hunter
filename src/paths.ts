import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const HOME_DIR = resolve(homedir(), ".job-hunter-ai");

export function ensureHomeDir(): void {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true });
}

/**
 * Résout un chemin de ressource (config, .env, data) selon l'ordre :
 * 1. chemin explicite fourni par l'utilisateur (ex: --config)
 * 2. $HOME/.job-hunter-ai/<name>  (priorité, pour l'usage binaire autonome)
 * 3. <cwd>/<name>                (fallback développement)
 * Retourne le premier chemin qui existe, ou le chemin $HOME par défaut à créer.
 */
export function resolveResource(name: string, explicit?: string): string {
  if (explicit) return resolve(explicit);
  const homePath = resolve(HOME_DIR, name);
  if (existsSync(homePath)) return homePath;
  const cwdPath = resolve(name);
  if (existsSync(cwdPath)) return cwdPath;
  // Par défaut on renvoie le chemin home (pour création/écriture)
  return homePath;
}

export function resolveDataDir(): string {
  const homeData = resolve(HOME_DIR, "data");
  if (existsSync(homeData) || !existsSync(resolve("data"))) {
    return homeData;
  }
  return resolve("data");
}
