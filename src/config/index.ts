import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import type { AppConfig } from "../types/index.js";

dotenv.config();

const EnvSchema = z.object({
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY est requis"),
  LLM_BASE_URL: z.string().default("https://api.mistral.ai/v1"),
  LLM_MODEL: z.string().default("mistral-small-latest"),
  FT_CLIENT_ID: z.string().optional(),
  FT_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.boolean({ coerce: true }).default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TO: z.string().optional(),
  CRON_SCHEDULE: z.string().default("0 8 * * *"),
  ENABLE_PUPPETEER: z.boolean({ coerce: true }).default(false),
  CONFIG_PATH: z.string().default("config/config.json"),
  SERVE_PORT: z.coerce.number().default(3000),
  SERVE_HOST: z.string().default("127.0.0.1"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables d'environnement invalides:\n${messages}`);
  }
  return parsed.data;
}

const ConfigSchema = z.object({
  search: z.object({
    query: z.string(),
    location: z.string(),
    maxResultsPerSource: z.number().int().positive().default(30),
    minScore: z.number().min(0).max(100).default(60),
  }),
  criteria: z.object({
    keywords: z.array(z.string()),
    excludeKeywords: z.array(z.string()).default([]),
    experience: z.string().default(""),
    contractTypes: z.array(z.string()).default([]),
    remoteOk: z.boolean().default(true),
    maxSalary: z.number().nullable().default(null),
  }),
  sources: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["francetravail", "indeed", "leboncoin", "generic"]),
      enabled: z.boolean(),
      baseUrl: z.string().optional(),
      needsPuppeteer: z.boolean().optional(),
    }),
  ),
});

export function loadConfig(path?: string): AppConfig {
  const env = loadEnv();
  const cfgPath = resolve(path ?? env.CONFIG_PATH);
  let raw: string;
  try {
    raw = readFileSync(cfgPath, "utf-8");
  } catch {
    throw new Error(
      `Configuration introuvable: ${cfgPath}. Copiez config/config.example.json vers ${cfgPath}.`,
    );
  }
  const json = JSON.parse(raw);
  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration invalide:\n${messages}`);
  }
  return parsed.data as AppConfig;
}
