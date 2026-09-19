import { chat, extractJson } from "./client.js";
import type { AppConfig, KeywordExpansion } from "../types/index.js";

interface ExpansionLLMResponse {
  expanded: string[];
  synonyms: string[];
  relatedTerms: string[];
}

export async function expandKeywords(
  config: AppConfig,
): Promise<KeywordExpansion> {
  const { query, location } = config.search;
  const baseKeywords = config.criteria.keywords;

  const system =
    "Tu es un expert en recrutement français. Tu génères des synonymes et termes liés pour élargir une recherche d'emploi, sans inventer de termes hors-sujet.";
  const user = `Requête de recherche: "${query}"
Lieu: ${location}
Mots-clés déjà fournis: ${baseKeywords.join(", ")}

Génère des variantes de recherche pertinentes (synonymes du métier, appellations alternatives, abréviations courantes en France). Renvoie UNIQUEMENT un JSON de la forme:
{"expanded": ["..."], "synonyms": ["..."], "relatedTerms": ["..."]}
- "expanded": requêtes de recherche combinées prêtes à l'emploi (max 6)
- "synonyms": synonymes du métier principal (max 8)
- "relatedTerms": termes liés / compétences clés (max 10)
Tout en français, minuscules, sans guillemets superflus.`;

  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, maxTokens: 2000 },
  );
  
  const parsed = extractJson<ExpansionLLMResponse>(raw);

  // Fusion et dédoublonnage avec les mots-clés d'origine
  const all = new Set<string>([
    query.toLowerCase(),
    ...baseKeywords.map((k) => k.toLowerCase()),
  ]);
  for (const arr of [parsed.expanded, parsed.synonyms, parsed.relatedTerms]) {
    for (const k of arr ?? []) {
      const t = k.trim().toLowerCase();
      if (t && t.length > 1 && t.length < 60) all.add(t);
    }
  }
  return {
    original: query,
    expanded: Array.from(all),
    synonyms: parsed.synonyms ?? [],
    relatedTerms: parsed.relatedTerms ?? [],
  };
}
