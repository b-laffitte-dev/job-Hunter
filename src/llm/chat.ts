import { chat, extractJson } from "./client.js";
import type {
  AppConfig,
  CriteriaConfig,
  SearchConfig,
} from "../types/index.js";

import type { AgentConfig } from "../agent/types.js";

export interface ChatState {
  search: SearchConfig;
  criteria: CriteriaConfig;
  // Paramètres de l'agent pour contrôler les limites
  agent?: Partial<AgentConfig>;
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
  // Paramètres de l'agent
  maxLlmCalls?: number | null;
  maxTokens?: number | null;
  maxSteps?: number | null;
  satisfactionThreshold?: number | null;
  autoExtract?: boolean | null;
  maxUrlsPerSearch?: number | null;
}

const SYSTEM = `Tu es l'assistant d'une interface de recherche d'emploi française nommée "Job Hunter AI".
L'utilisateur discute en langage naturel pour affiner sa recherche d'emploi.
À chaque message, tu dois :
1. Déterminer l'action à effectuer parmi : "update" (modifier les critères de recherche), "search" (lancer la recherche maintenant), "reset" (réinitialiser les critères), "answer" (répondre à une question sans modifier l'état).
2. Répondre de façon courte et friendly en français (champ "reply").
3. Si l'action est "update" ou "search", fournir les champs modifiés (laisser null les champs inchangés).

Champs disponibles pour la recherche :
- query: l'intitulé/requête principale (ex: "secrétariat médico social")
- location: le lieu (ville, département ou "France")
- maxResultsPerSource: nombre max de résultats par source
- minScore: score minimum pour retenir une offre
- keywords: liste des mots-clés à inclure
- excludeKeywords: liste des mots à exclure
- experience: niveau d'expérience requis
- contractTypes: types de contrats acceptés (CDI, CDD, etc.)
- remoteOk: accepte le télétravail (true/false)
- maxSalary: salaire maximum souhaité

Champs disponibles pour les limites de l'agent (optionnels) :
- maxLlmCalls: nombre max d'appels LLM (défaut: 20)
- maxTokens: nombre max de tokens (défaut: 50000)
- maxSteps: nombre max d'étapes (défaut: 10)
- autoExtract: activer l'extraction automatique (true/false, défaut: true)
- maxUrlsPerSearch: nombre max d'URLs à scraper par recherche (défaut: 2)
- satisfactionThreshold: seuil de satisfaction pour arrêter (0-100, défaut: 80)

Renvoie UNIQUEMENT un JSON valide avec UNIQUEMENT les champs explicitement mentionnés par l'utilisateur.
Format:
{"action":"update|search|reset|answer","reply":"texte","query":null,"location":null,"maxLlmCalls":null,"maxTokens":null,"maxSteps":null,"autoExtract":null,"maxUrlsPerSearch":null,"maxResultsPerSource":null,"minScore":null,"keywords":null,"excludeKeywords":null,"experience":null,"contractTypes":null,"remoteOk":null,"maxSalary":null}

Règles:
- Ne modifie UNIQUEMENT les champs explicitement demandés par l'utilisateur
- Laisse null les champs non modifiés
- Pour les nombres, utilise des entiers
- Pour les booléens, utilise true/false
- Sois précis et ne devine pas les intentions de l'utilisateur`;

function stateToText(state: ChatState): string {
  const s = state.search;
  const c = state.criteria;
  const a = state.agent || {};
  const lines = [
    `État courant de la recherche:`,
    `- query: "${s.query}"`,
    `- location: "${s.location}"`,
    `- maxResultsPerSource: ${s.maxResultsPerSource}`,
    `- minScore: ${s.minScore}`,
    `- keywords: ${JSON.stringify(c.keywords)}`,
    `- excludeKeywords: ${JSON.stringify(c.excludeKeywords)}`,
    `- experience: "${c.experience}"`,
    `- contractTypes: ${JSON.stringify(c.contractTypes)}`,
    `- remoteOk: ${c.remoteOk}`,
    `- maxSalary: ${c.maxSalary}`,
  ];
  
  // Ajouter les paramètres de l'agent s'ils existent
  if (Object.keys(a).length > 0) {
    lines.push("", `Paramètres de l'agent:`);
    if (a.maxLlmCalls != null) lines.push(`- maxLlmCalls: ${a.maxLlmCalls}`);
    if (a.maxTokens != null) lines.push(`- maxTokens: ${a.maxTokens}`);
    if (a.maxSteps != null) lines.push(`- maxSteps: ${a.maxSteps}`);
    if (a.satisfactionThreshold != null) lines.push(`- satisfactionThreshold: ${a.satisfactionThreshold}`);
    if (a.autoExtract != null) lines.push(`- autoExtract: ${a.autoExtract}`);
    if (a.maxUrlsPerSearch != null) lines.push(`- maxUrlsPerSearch: ${a.maxUrlsPerSearch}`);
  }
  
  return lines.join("\n");
}

export function stateFromConfig(config: AppConfig & { agent?: Partial<import("../agent/types.js").AgentConfig> }): ChatState {
  return {
    search: { ...config.search },
    criteria: { ...config.criteria },
    agent: config.agent ? { ...config.agent } : {
      // Valeurs par défaut
      maxLlmCalls: 20,
      maxTokens: 50000,
      maxSteps: 10,
      satisfactionThreshold: 80,
      autoExtract: true,
      maxUrlsPerSearch: 2,
    },
  };
}

export function applyInterpretation(
  state: ChatState,
  interp: LLMInterpretation,
): ChatState {
  const next: ChatState = {
    search: { ...state.search },
    criteria: { ...state.criteria },
    // Conserver les paramètres de l'agent existants
    agent: state.agent ? { ...state.agent } : undefined,
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
  
  // Paramètres de l'agent
  if (interp.maxLlmCalls != null) {
    next.agent = next.agent || {};
    next.agent.maxLlmCalls = interp.maxLlmCalls;
  }
  if (interp.maxTokens != null) {
    next.agent = next.agent || {};
    next.agent.maxTokens = interp.maxTokens;
  }
  if (interp.maxSteps != null) {
    next.agent = next.agent || {};
    next.agent.maxSteps = interp.maxSteps;
  }
  if (interp.satisfactionThreshold != null) {
    next.agent = next.agent || {};
    next.agent.satisfactionThreshold = interp.satisfactionThreshold;
  }
  if (interp.autoExtract != null) {
    next.agent = next.agent || {};
    next.agent.autoExtract = interp.autoExtract;
  }
  if (interp.maxUrlsPerSearch != null) {
    next.agent = next.agent || {};
    next.agent.maxUrlsPerSearch = interp.maxUrlsPerSearch;
  }
  
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
