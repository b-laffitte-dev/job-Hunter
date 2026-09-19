import { scoreJobs as originalScoreJobs } from "../../llm/scoring.js";
import { getGlobalLLMCounter } from "../llmCounter.js";
import type { JobOffer, ScoredJob } from "../../types/index.js";
import type { ToolParams, ToolResults } from "../types.js";

function estimateScoringTokens(jobs: JobOffer[]): number {
  const tokensPerJob = 200;
  const overheadTokens = 500;
  return jobs.length * tokensPerJob + overheadTokens;
}

function heuristicScore(jobs: JobOffer[], criteria: any): ScoredJob[] {
  const { query, location, keywords, excludeKeywords, minScore = 60 } = criteria;
  return jobs.map((job) => {
    let score = 50;
    const reasons: string[] = [];
    const text = `${job.title} ${job.description ?? ""} ${job.company ?? ""} ${job.location ?? ""}`.toLowerCase();
    for (const keyword of [...keywords, query?.toLowerCase()]) {
      if (keyword && text.includes(keyword)) {
        score += 10;
        reasons.push(`contient "${keyword}"`);
      }
    }
    for (const exclude of excludeKeywords || []) {
      if (exclude && text.includes(exclude.toLowerCase())) {
        score -= 25;
        reasons.push(`exclu: "${exclude}"`);
      }
    }
    if (location && location !== "France" && job.location && job.location.toLowerCase().includes(location.toLowerCase())) {
      score += 10;
      reasons.push(`localisation correspondante`);
    }
    score = Math.max(0, Math.min(100, score));
    return { ...job, score, scoreReasons: reasons, expandedKeywords: [] };
  }).filter(j => j.score >= minScore).sort((a, b) => b.score - a.score);
}

export const scoreJobsTool = {
  name: "score_jobs",
  description: "Score les offres d'emploi en utilisant LLM.",
  
  async execute(params: ToolParams["score_jobs"]): Promise<ToolResults["score_jobs"]> {
    const counter = getGlobalLLMCounter();
    const { jobs, criteria } = params;
    const startTime = Date.now();

    if (jobs.length === 0) return { scoredJobs: [] };

    const estimatedTokens = estimateScoringTokens(jobs);
    const maxCalls = 20;
    const maxTokens = 50000;
    
    if (!counter.canMakeCall(estimatedTokens, maxCalls, maxTokens)) {
      throw new Error(`Limite LLM atteinte pour le scoring: ${counter.calls}/${maxCalls}, ${counter.tokens}/${maxTokens}`);
    }

    try {
      const config: any = {
        search: { query: criteria.query, location: criteria.location, maxResultsPerSource: 30, minScore: criteria.minScore },
        criteria: { keywords: criteria.keywords, excludeKeywords: criteria.excludeKeywords, experience: "", contractTypes: [], remoteOk: true, maxSalary: null },
        sources: [],
      };
      const scoredJobs = await originalScoreJobs(config, jobs, []);
      counter.addCall(estimatedTokens);
      console.log(`[score_jobs] ✓ ${scoredJobs.length} offres scorées (${estimatedTokens} tokens)`);
      return { scoredJobs };
    } catch (error) {
      console.error(`[score_jobs] ✗: ${(error as Error).message}`);
      const fallbackJobs = heuristicScore(jobs, criteria);
      console.log(`[score_jobs] Fallback: scoring heuristique`);
      return { scoredJobs: fallbackJobs };
    }
  },
};
