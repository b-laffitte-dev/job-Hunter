import { chat, extractJson } from "./client.js";
import type {
  AppConfig,
  CriteriaConfig,
  SearchConfig,
} from "../types/index.js";

export interface ChatState {
  search: SearchConfig;
  criteria: CriteriaConfig;
}

export type ChatAction =
  | { type: "update"; message: string; state: ChatState }
  | { type: "search"; message: string; state: ChatState }
  | { type: "reset"; message: string; state: ChatState }
  | { type: "answer"; message: string };

interface LLMInterpretation {
  action: "update" | "search" | "reset" | "answer";
  reply: string;
  // Champs optionnels à fusionner dans l'état
  query?: string | null;
  location?: string | null;
  maxResultsPerSource?: number | null;
  minScore?: number | null;
  keywords?: string[] | null;
  excludeKeywords?: string[] | null;
  experience?: string | null;
  contractTypes?: string[] | null;
  remoteOk?: boolean | null;
  maxSalary?: number | null;
}

const SYSTEM = `Tu es l'assistant d'une interface de recherche d'emploi française nommée "Job Hunter AI".
L'utilisateur discute en langage naturel pour affiner sa recherche d'emploi.
À chaque message, tu dois :
1. Déterminer l'action à effectuer parmi : "update" (modifier les critères de recherche), "search" (lancer la recherche maintenant), "reset" (réinitialiser les critères), "answer" (répondre à une question sans modifier l'état).
2. Répondre de façon courte et friendly en français (champ "reply").
3. Si l'action est "update" ou "search", fournir les champs modifiés (laisser null les champs inchangés).
Renvoie UNIQUEMENT un JSON de la forme:
{"action": "update|search|reset|answer", "reply": "texte court", "query": null, "location": null, "maxResultsPerSource": null, "minScore": null, "keywords": null, "excludeKeywords": null, "experience": null, "contractTypes": null, "remoteOk": null, "maxSalary": null}
Règles:
- "query" est l'intitulé/requête principale de poste (ex: "secrétariat médico social").
- "location" est le lieu (ville, département ou "France").
- "keywords" remplace la liste entière des mots-clés (ne pas fusionner partiellement).
- "excludeKeywords" remplace la liste entière des exclusions.
- "contractTypes" remplace la liste des contrats acceptés.
- Ne modifie un champ que si l'utilisateur le demande explicitement.`;

function stateToText(state: ChatState): string {
  const s = state.search;
  const c = state.criteria;
  return `État courant de la recherche:
- query: "${s.query}"
- location: "${s.location}"
- maxResultsPerSource: ${s.maxResultsPerSource}
- minScore: ${s.minScore}
- keywords: ${JSON.stringify(c.keywords)}
- excludeKeywords: ${JSON.stringify(c.excludeKeywords)}
- experience: "${c.experience}"
- contractTypes: ${JSON.stringify(c.contractTypes)}
- remoteOk: ${c.remoteOk}
- maxSalary: ${c.maxSalary}`;
}

export function stateFromConfig(config: AppConfig): ChatState {
  return {
    search: { ...config.search },
    criteria: { ...config.criteria },
  };
}

export function applyInterpretation(
  state: ChatState,
  interp: LLMInterpretation,
): ChatState {
  const next: ChatState = {
    search: { ...state.search },
    criteria: { ...state.criteria },
  };
  if (interp.query != null) next.search.query = interp.query;
  if (interp.location != null) next.search.location = interp.location;
  if (interp.maxResultsPerSource != null)
    next.search.maxResultsPerSource = interp.maxResultsPerSource;
  if (interp.minScore != null) next.search.minScore = interp.minScore;
  if (interp.keywords != null) next.criteria.keywords = interp.keywords;
  if (interp.excludeKeywords != null)
    next.criteria.excludeKeywords = interp.excludeKeywords;
  if (interp.experience != null) next.criteria.experience = interp.experience;
  if (interp.contractTypes != null)
    next.criteria.contractTypes = interp.contractTypes;
  if (interp.remoteOk != null) next.criteria.remoteOk = interp.remoteOk;
  if (interp.maxSalary != null) next.criteria.maxSalary = interp.maxSalary;
  return next;
}

export async function interpretMessage(
  state: ChatState,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<{ action: ChatAction; reply: string }> {
  console.log(`[llm/chat] Interprétation du message: "${userMessage}"`);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: SYSTEM }];
  // On injecte un historique court (max 6 échanges) pour le contexte conversationnel
  for (const m of history.slice(-12)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({
    role: "user",
    content: `${stateToText(state)}\n\nMessage de l'utilisateur: """${userMessage}"""`,
  });

  let interp: LLMInterpretation;
  try {
    console.log(`[llm/chat] → Appel LLM pour interprétation...`);
    const raw = await chat(messages, { temperature: 0.2, maxTokens: 600 });
    interp = extractJson<LLMInterpretation>(raw);
    console.log(`[llm/chat] ✓ Action déterminée: ${interp.action}`);
  } catch (e) {
    // Repli : on tente de lancer une recherche si le message contient un déclencheur, sinon on répond
    const trigger = /\b(lance|cherche|recherche|go|lancer|trouve)\b/i.test(
      userMessage,
    );
    const reply =
      "Désolé, je n'ai pas pu interpréter votre message (service IA indisponible). Réessayez ou reformulez.";
    if (trigger) {
      return {
        action: { type: "search", message: userMessage, state },
        reply,
      };
    }
    return {
      action: { type: "answer", message: userMessage },
      reply,
    };
  }

  const reply = interp.reply?.trim() || "Compris.";
  const nextState =
    interp.action === "reset"
      ? stateFromConfig(loadBaseConfig())
      : applyInterpretation(state, interp);

  switch (interp.action) {
    case "update":
      return {
        action: { type: "update", message: userMessage, state: nextState },
        reply,
      };
    case "search":
      return {
        action: { type: "search", message: userMessage, state: nextState },
        reply,
      };
    case "reset":
      return {
        action: { type: "reset", message: userMessage, state: nextState },
        reply,
      };
    case "answer":
    default:
      return { action: { type: "answer", message: userMessage }, reply };
  }
}

// Import tardif pour éviter une dépendance circulaire avec runner/config
import { loadConfig } from "../config/index.js";
function loadBaseConfig(): AppConfig {
  try {
    return loadConfig();
  } catch {
    // Repli minimal si la config n'est pas chargeable
    return {
      search: {
        query: "",
        location: "France",
        maxResultsPerSource: 30,
        minScore: 60,
      },
      criteria: {
        keywords: [],
        excludeKeywords: [],
        experience: "",
        contractTypes: [],
        remoteOk: true,
        maxSalary: null,
      },
      sources: [],
    };
  }
}
