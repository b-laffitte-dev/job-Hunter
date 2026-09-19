import { chat, extractJson } from "../../llm/client.js";
import { LLMCounter, getGlobalLLMCounter } from "../llmCounter.js";
import type { JobOffer } from "../../types/index.js";
import type { ToolParams, ToolResults } from "../types.js";

interface ExtractionResult {
  jobs: any[];
  confidence: number;
}

function estimateExtractionTokens(html: string): number {
  const htmlTokens = Math.ceil(html.length / 4);
  const promptTokens = 500;
  const responseTokens = 2000;
  return htmlTokens + promptTokens + responseTokens;
}

function normalizeJobs(jobs: any[], url: string, source: string): JobOffer[] {
  return jobs.map((job: any, index: number) => ({
    id: job.id || `${source}-${index}-${Date.now()}`,
    source: job.source || source,
    title: job.title || "(sans titre)",
    company: job.company === null || job.company === undefined ? null : String(job.company),
    location: job.location === null || job.location === undefined ? null : String(job.location),
    url: job.url || url,
    description: job.description === null || job.description === undefined ? null : String(job.description).slice(0, 2000),
    contractType: job.contractType === null || job.contractType === undefined ? null : String(job.contractType),
    salary: job.salary === null || job.salary === undefined ? null : String(job.salary),
    publishedAt: job.publishedAt === null || job.publishedAt === undefined ? null : String(job.publishedAt),
    rawFetchedAt: new Date().toISOString(),
  }));
}

function estimateActualTokens(html: string, response: string): number {
  const inputTokens = Math.ceil(html.length / 4) + 500;
  const outputTokens = Math.ceil(response.length / 4);
  return inputTokens + outputTokens;
}

function heuristicExtract(html: string, url: string, siteHint: string): JobOffer[] {
  try {
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      const jobs: JobOffer[] = [];
      for (const match of jsonLdMatches) {
        try {
          const jsonStr = match.replace(/<script type="application\/ld\+json">|<\/script>/g, "");
          const data = JSON.parse(jsonStr);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item["@type"] && item["@type"].toString().includes("JobPosting")) {
              jobs.push({
                id: item.identifier ?? item.url ?? `${url}-${Math.random().toString(36).slice(2, 9)}`,
                source: siteHint,
                title: item.title ?? "(sans titre)",
                company: item.hiringOrganization?.name ?? null,
                location: item.jobLocation?.address?.addressLocality ?? item.jobLocation?.name ?? null,
                url: item.url ?? url,
                description: item.description ? String(item.description).slice(0, 2000) : null,
                contractType: Array.isArray(item.employmentType) ? item.employmentType.join(", ") : (item.employmentType ?? null),
                salary: item.baseSalary?.value?.value ?? item.baseSalary?.value?.minValue ?? null,
                publishedAt: item.datePosted ?? null,
                rawFetchedAt: new Date().toISOString(),
              });
            }
          }
        } catch {
          // Ignore
        }
      }
      if (jobs.length > 0) return jobs;
    }
    return [];
  } catch {
    return [];
  }
}

function buildExtractionPrompt(html: string, url: string, siteHint: string, queryContext: string): string {
  const maxHtmlLength = 15000;
  const truncatedHtml = html.length > maxHtmlLength ? html.slice(0, maxHtmlLength) + "\n\n[... HTML tronqué ...]" : html;
  return `Extrait TOUTES les offres d'emploi de cette page.

Contexte:
- URL: ${url}
- Site: ${siteHint}
- Requête: "${queryContext}"

Instructions:
- Analyse le HTML et extrais TOUTES les offres
- Pour CHAQUE offre, extrais: id, title, company, location, url, description, contractType, salary, publishedAt
- Si un champ n'est pas disponible, mets null
- Renvoie UNIQUEMENT du JSON valide

Format:
{"jobs":[{"id":"...","source":"${siteHint}","title":"...","company":null,"location":null,"url":"...","description":null,"contractType":null,"salary":null,"publishedAt":null,"rawFetchedAt":"${new Date().toISOString()}"}],"confidence":0-100}

HTML:
${truncatedHtml}`;
}

export const extractJobsTool = {
  name: "extract_jobs",
  description: "Extrait les offres d'emploi du HTML en utilisant LLM.",
  
  async execute(
    params: ToolParams["extract_jobs"],
    llmCounter?: LLMCounter
  ): Promise<ToolResults["extract_jobs"]> {
    const counter = llmCounter || getGlobalLLMCounter();
    const { html, url, siteHint = "inconnu", queryContext = "" } = params;
    const startTime = Date.now();
    const estimatedTokens = estimateExtractionTokens(html);
    const maxCalls = 20;
    const maxTokens = 50000;
    
    console.log(`[extract_jobs] → Début extraction (site: ${siteHint}, HTML: ${html.length} caractères)`);
    console.log(`[extract_jobs]   Tokens estimés: ~${estimatedTokens}`);
    
    if (!counter.canMakeCall(estimatedTokens, maxCalls, maxTokens)) {
      console.log(`[extract_jobs] ❌ Limite LLM atteinte: ${counter.calls}/${maxCalls} appels, ${counter.tokens}/${maxTokens} tokens`);
      throw new Error(`Limite LLM atteinte: ${counter.calls}/${maxCalls} appels, ${counter.tokens}/${maxTokens} tokens.`);
    }

    try {
      console.log(`[extract_jobs] → Construction du prompt d'extraction...`);
      const prompt = buildExtractionPrompt(html, url, siteHint, queryContext);
      const messages = [
        { role: "system" as const, content: "Tu es un expert en extraction. Renvoie UNIQUEMENT du JSON valide." },
        { role: "user" as const, content: prompt },
      ];

      console.log(`[extract_jobs] → Appel LLM pour extraction...`);
      const rawResponse = await chat(messages, { temperature: 0.0, maxTokens: 4000 });
      console.log(`[extract_jobs] ✓ Réponse LLM reçue`);
      
      const result = extractJson<ExtractionResult>(rawResponse);
      const jobs = normalizeJobs(result.jobs, url, siteHint);
      const actualTokens = estimateActualTokens(html, rawResponse);
      counter.addCall(actualTokens);

      const executionTime = Date.now() - startTime;
      console.log(`[extract_jobs] ✓ ${jobs.length} offres extraites (${executionTime}ms, ${actualTokens} tokens)`);
      return { jobs, confidence: result.confidence || 80 };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`[extract_jobs] ✗ Erreur: ${errorMessage}`);
      if (errorMessage.includes("Limite LLM")) {
        console.log(`[extract_jobs] ❌ Limite LLM atteinte, arrêt`);
        throw error;
      }
      console.log(`[extract_jobs] ⚠️  Tentative de fallback heuristique...`);
      const fallbackJobs = heuristicExtract(html, url, siteHint);
      if (fallbackJobs.length > 0) {
        console.log(`[extract_jobs] ✓ Fallback: ${fallbackJobs.length} offres extraites via JSON-LD`);
        return { jobs: fallbackJobs, confidence: 50 };
      }
      console.log(`[extract_jobs] ✗ Fallback échoué`);
      throw new Error(`Échec d'extraction: ${errorMessage}`);
    }
  },
};
