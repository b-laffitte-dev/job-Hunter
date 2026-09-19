import { chat, extractJson } from "./client.js";
import type { AppConfig, JobOffer, ScoredJob } from "../types/index.js";

interface ScoreLLMResponse {
  scores: Array<{
    index: number;
    score: number;
    reasons: string[];
  }>;
}

export async function scoreJobs(
  config: AppConfig,
  offers: JobOffer[],
  expandedKeywords: string[],
): Promise<ScoredJob[]> {
  if (offers.length === 0) return [];

  const crit = config.criteria;
  const system =
    "Tu es un assistant qui évalue la pertinence d'offres d'emploi. Réponds UNIQUEMENT en JSON valide avec le schema: {\"scores\":[{\"index\":number,\"score\":number,\"reasons\":string[]}]}";

  // On batche par 10 pour rester dans les limites de tokens
  const BATCH = 10;
  const scored: ScoredJob[] = [];

  for (let i = 0; i < offers.length; i += BATCH) {
    const batch = offers.slice(i, i + BATCH);
    const payload = batch.map((o, idx) => ({
      index: idx,
      title: o.title,
      company: o.company,
      location: o.location,
      contractType: o.contractType,
      salary: o.salary,
      description: o.description?.slice(0, 200) ?? null,
    }));

    const user = `Recherche: "${config.search.query}" à ${config.search.location}.
Mots-clés: ${crit.keywords.slice(0, 5).join(", ")}${crit.keywords.length > 5 ? "..." : ""}.
Exclure: ${crit.excludeKeywords.join(", ") || "aucun"}.

Évalue ces ${batch.length} offres avec un score 0-100. Pénalise les mots exclus. Renvoie UNIQUEMENT:
{"scores":[{"index":0,"score":85,"reasons":["raison courte en français"]},...]}

Offres:
${JSON.stringify(payload)}`;

    let parsed: ScoreLLMResponse;
    try {
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: 0.0, maxTokens: 2000 },
      );
      parsed = extractJson<ScoreLLMResponse>(raw);
    } catch (e) {
      console.warn(`[llm] scoring batch ${i} échoué: ${(e as Error).message}`);
      // Fallback: score heuristique simple
      for (const o of batch) {
        scored.push(heuristicScore(o, config, expandedKeywords));
      }
      continue;
    }
    for (const o of batch) {
      const idx = batch.indexOf(o);
      const s = parsed.scores?.find((x) => x.index === idx);
      const score = Math.max(0, Math.min(100, s?.score ?? 0));
      // Normaliser reasons pour être toujours un tableau
      const reasons = Array.isArray(s?.reasons)
        ? s.reasons
        : s?.reasons
          ? [s.reasons]
          : [];
      scored.push({
        ...o,
        score,
        scoreReasons: reasons,
        expandedKeywords,
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

function heuristicScore(
  o: JobOffer,
  config: AppConfig,
  expandedKeywords: string[],
): ScoredJob {
  let score = 50;
  const reasons: string[] = [];
  const text =
    `${o.title} ${o.description ?? ""} ${o.company ?? ""}`.toLowerCase();
  for (const k of expandedKeywords) {
    if (text.includes(k)) {
      score += 5;
      reasons.push(`contient "${k}"`);
    }
  }
  for (const k of config.criteria.excludeKeywords) {
    if (text.includes(k.toLowerCase())) {
      score -= 25;
      reasons.push(`exclu: "${k}"`);
    }
  }
  score = Math.max(0, Math.min(100, score));
  return { ...o, score, scoreReasons: reasons, expandedKeywords };
}
