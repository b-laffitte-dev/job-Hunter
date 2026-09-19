import { chat, extractJson } from "./client.js";
import type { ChatState, ChatAction, InterpretationResult } from "../types/index.js";

// Ré-exporter les types pour server.ts
export type { ChatState, ChatAction, InterpretationResult };

// État par défaut pour une nouvelle session
export function getDefaultState(): ChatState {
  return {
    search: {
      query: "",
      location: "France",
      maxResults: 10,
    },
  };
}

// Interface pour l'interprétation LLM
interface LLMInterpretation {
  action: "update" | "search" | "reset" | "answer";
  reply: string;
  // Champs optionnels pour la recherche
  query?: string | null;
  location?: string | null;
  maxResults?: number | null;
}

const SYSTEM = `Tu es l'assistant d'une interface de recherche d'emploi française nommée "Job Hunter AI".
L'utilisateur discute en langage naturel pour affiner sa recherche d'emploi.

À chaque message, tu dois :
1. Déterminer l'action à effectuer parmi : 
   - "update" : modifier les critères de recherche (query, location, maxResults)
   - "search" : lancer la recherche d'offres d'emploi avec les critères actuels
   - "reset" : réinitialiser tous les critères de recherche
   - "answer" : répondre à une question sans modifier l'état ni lancer de recherche

2. Répondre de façon courte et amicale en français (champ "reply").

Champs disponibles pour la recherche :
- query: l'intitulé/requête principale (ex: "développeur full stack", "secrétariat médico social")
- location: le lieu (ville, département ou région, ex: "Paris", "Lyon", "Île-de-France")
- maxResults: nombre maximum d'offres à retourner (défaut: 10)

Règles:
- NE MODIFIE que les champs explicitement mentionnés par l'utilisateur
- Laisse null les champs non modifiés
- Pour les nombres, utilise des entiers
- Sois précis et ne devine pas les intentions de l'utilisateur
- Si l'utilisateur demande directement de chercher/trouver/lancer une recherche, utilise "search"
- Si l'utilisateur modifie des critères sans demander de recherche, utilise "update"

Format de la réponse (UNIQUEMENT JSON) :
{
  "action": "update|search|reset|answer",
  "reply": "texte de réponse",
  "query": null,
  "location": null,
  "maxResults": null
}`;

function stateToText(state: ChatState): string {
  const s = state.search;
  const lines = [
    `État courant de la recherche:`,
    `- Requête : "${s.query}"`,
    `- Lieu : "${s.location}"`,
    `- Nombre max d'offres : ${s.maxResults}`,
  ];
  return lines.join("\n");
}

/**
 * Applique l'interprétation LLM à l'état actuel
 */
export function applyInterpretation(
  state: ChatState,
  interp: LLMInterpretation,
): ChatState {
  const next: ChatState = {
    search: { ...state.search },
  };
  
  if (interp.query != null) next.search.query = interp.query;
  if (interp.location != null) next.search.location = interp.location;
  if (interp.maxResults != null) next.search.maxResults = interp.maxResults;
  
  return next;
}

/**
 * Interprète un message utilisateur et détermine l'action à effectuer
 */
export async function interpretMessage(
  state: ChatState,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<InterpretationResult> {
  console.log(`[llm/chat] Interprétation du message: "${userMessage}"`);
  
  const messages = [
    { role: "system" as const, content: SYSTEM },
    // Ajouter un historique court pour le contexte
    ...history.slice(-12).map((m) => ({ 
      role: m.role as "system" | "user" | "assistant", 
      content: m.content 
    })),
    {
      role: "user" as const,
      content: `${stateToText(state)}\n\nMessage de l'utilisateur: """${userMessage}"""`,
    },
  ];

  try {
    console.log(`[llm/chat] → Appel LLM pour interprétation...`);
    const raw = await chat(messages, { temperature: 0.2, maxTokens: 600 });
    const interp = extractJson<LLMInterpretation>(raw);
    console.log(`[llm/chat] ✓ Action déterminée: ${interp.action}`);

    const reply = interp.reply?.trim() || "Compris.";
    
    // Appliquer les modifications à l'état
    let nextState: ChatState | undefined;
    if (interp.action === "reset") {
      nextState = getDefaultState();
    } else if (interp.action === "update" || interp.action === "search") {
      nextState = applyInterpretation(state, interp);
    }

    const action: ChatAction = {
      type: interp.action,
      message: userMessage,
      state: nextState,
    };

    return { action, reply };
  } catch (e) {
    console.log(`[llm/chat] ✗ Erreur interprétation: ${(e as Error).message}`);
    
    // Repli : détecter si l'utilisateur veut lancer une recherche
    const trigger = /\b(lance|cherche|recherche|go|lancer|trouve|trouver|offre|offres|emploi|job)\b/i.test(userMessage);
    
    const reply = "Désolé, je n'ai pas pu interpréter votre message (service IA indisponible). Réessayez ou reformulez.";
    
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
}

/**
 * Vérifie si un message est une demande de recherche directe
 */
export function isSearchRequest(message: string): boolean {
  const searchTriggers = [
    /\bcherche\b/i,
    /\brecherche\b/i,
    /\btrouve\b/i,
    /\btrouver\b/i,
    /\blance\b/i,
    /\blancer\b/i,
    /\bgo\b/i,
    /\boffre\b/i,
    /\bemploi\b/i,
    /\bjob\b/i,
  ];
  
  return searchTriggers.some((trigger) => trigger.test(message));
}

