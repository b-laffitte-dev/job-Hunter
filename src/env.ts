import { config } from "dotenv";

// Charger les variables d'environnement depuis .env
config();

// Interface pour les variables d'environnement
export interface EnvConfig {
  MISTRAL_API_KEY?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  MISTRAL_AGENTS_URL?: string;
  MISTRAL_CONVERSATIONS_URL?: string;
  MISTRAL_MODEL?: string;
  SERVE_PORT?: number;
  SERVE_HOST?: string;
}

// Valeurs par défaut
export const DEFAULT_ENV: EnvConfig = {
  SERVE_PORT: 3000,
  SERVE_HOST: "localhost",
  LLM_BASE_URL: "https://api.mistral.ai/v1",
  MISTRAL_AGENTS_URL: "https://api.mistral.ai/v1/agents",
  MISTRAL_CONVERSATIONS_URL: "https://api.mistral.ai/v1/conversations",
  MISTRAL_MODEL: "mistral-medium-latest",
};

/**
 * Charge les variables d'environnement
 * Lance une erreur si MISTRAL_API_KEY ou LLM_API_KEY n'est pas défini
 */
export function loadEnv(): EnvConfig {
  const env: EnvConfig = {
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    LLM_API_KEY: process.env.LLM_API_KEY,
    MISTRAL_AGENTS_URL: process.env.MISTRAL_AGENTS_URL,
    MISTRAL_CONVERSATIONS_URL: process.env.MISTRAL_CONVERSATIONS_URL,
    MISTRAL_MODEL: process.env.MISTRAL_MODEL,
    SERVE_PORT: process.env.SERVE_PORT ? parseInt(process.env.SERVE_PORT) : DEFAULT_ENV.SERVE_PORT,
    SERVE_HOST: process.env.SERVE_HOST || DEFAULT_ENV.SERVE_HOST,
  };

  // Vérifier qu'une clé API est disponible
  if (!env.MISTRAL_API_KEY && !env.LLM_API_KEY) {
    throw new Error(
      "Une clé API Mistral est requise. " +
      "Veuillez définir MISTRAL_API_KEY ou LLM_API_KEY dans votre fichier .env ou dans les variables d'environnement."
    );
  }

  return { ...DEFAULT_ENV, ...env };
}
