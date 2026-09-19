import { loadEnv } from "../env.js";
import type { ChatMessage, JobResult } from "../types/index.js";

// Configuration de l'API Mistral pour le chat standard
export interface MistralConfig {
  API_KEY: string;
  AGENTS_API_URL: string;
  CONVERSATIONS_API_URL: string;
  MODEL: string;
  BASE_URL: string;
}

// Charge la configuration Mistral
export function loadMistralConfig(): MistralConfig {
  const env = loadEnv();
  return {
    API_KEY: env.MISTRAL_API_KEY || env.LLM_API_KEY || "",
    AGENTS_API_URL: env.MISTRAL_AGENTS_URL || "https://api.mistral.ai/v1/agents",
    CONVERSATIONS_API_URL: env.MISTRAL_CONVERSATIONS_URL || "https://api.mistral.ai/v1/conversations",
    MODEL: env.MISTRAL_MODEL || "mistral-medium-latest",
    BASE_URL: env.LLM_BASE_URL || "https://api.mistral.ai/v1",
  };
}

// Interface pour la réponse du chat standard
interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
}

/**
 * Fonction de chat basique avec l'API Mistral standard (Chat Completions)
 * Utilisée pour l'interprétation des messages utilisateur
 */
export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const config = loadMistralConfig();
  const startTime = Date.now();
  const totalInputTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  
  console.log(`[llm/client] → Appel API chat: model=${config.MODEL}, temp=${options.temperature ?? 0.2}, max_tokens=${options.maxTokens ?? 1024}`);
  console.log(`[llm/client]   Messages: ${messages.length}, Input tokens: ~${totalInputTokens}`);
  
  const res = await fetch(`${config.BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${config.API_KEY}`,
    },
    body: JSON.stringify({
      model: config.MODEL,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
      response_format: { type: "json_object" },
    }),
  });
  
  const duration = Date.now() - startTime;
  
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.log(`[llm/client] ✗ Erreur HTTP ${res.status}: ${txt.slice(0, 100)}`);
    throw new Error(`LLM HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  
  let data: ChatResponse;
  try {
    data = (await res.json()) as ChatResponse;
  } catch (e) {
    const rawText = await res.text().catch(() => "");
    console.log(`[llm/client] ✗ Réponse non-JSON: ${rawText.slice(0, 100)}`);
    throw new Error(`LLM réponse non-JSON: ${rawText.slice(0, 300)}`);
  }
  
  const responseContent = data.choices?.[0]?.message?.content?.trim() ?? "";
  const responseTokens = Math.ceil(responseContent.length / 4);
  const totalTokens = totalInputTokens + responseTokens;
  
  console.log(`[llm/client] ✓ Réponse reçue en ${duration}ms (output: ~${responseTokens} tokens, total: ~${totalTokens})`);
  
  return responseContent;
}

// Types pour Mistral Agents API
export interface MistralAgent {
  id: string;
  name: string;
  model: string;
  instructions: string;
  tools: Array<{ type: string }>;
  createdAt: string;
}

export interface MistralConversation {
  id: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface MistralMessageContent {
  type: string;
  text?: string;
  toolReference?: {
    toolName: string;
    reference: string;
    url?: string;
  };
}

export interface MistralMessage {
  role: string;
  content: MistralMessageContent[];
}

export interface ConversationResponse {
  id: string;
  messages: MistralMessage[];
  status: string;
  agentId: string;
  createdAt: string;
}

// Résultat de l'extraction des offres d'emploi
export interface AgentSearchResult {
  jobs: JobResult[];
  query: string;
  references: string[];
  rawResponse: string;
}

// Variable globale pour stocker l'agent créé
let currentAgent: MistralAgent | null = null;
let currentConversation: MistralConversation | null = null;

/**
 * Crée un agent Mistral avec capacité de recherche web
 */
export async function createAgent(): Promise<MistralAgent> {
  const config = loadMistralConfig();
  
  if (currentAgent) {
    console.log(`[llm/client] → Agent déjà créé: ${currentAgent.id}`);
    return currentAgent;
  }

  console.log(`[llm/client] → Création d'un nouvel agent Mistral...`);
  
  const response = await fetch(config.AGENTS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.API_KEY}`,
    },
    body: JSON.stringify({
      name: "Job Hunter Agent",
      model: config.MODEL,
      instructions: `Tu es un assistant expert en recherche d'emploi en France. 
Ton rôle est de trouver des offres d'emploi actuelles et pertinentes en utilisant l'outil de recherche web.

Règles:
- Utilise TOUJOURS l'outil web_search quand l'utilisateur demande de trouver/chercher/rechercher des offres
- Formule des requêtes de recherche précises incluant le métier, le lieu et les critères
- Pour chaque offre trouvée, extrais: titre, entreprise, lieu, URL, description, type de contrat, salaire si disponible
- Retourne les résultats sous forme de JSON structuré dans un bloc markdown
- Si aucune offre n'est trouvée, explique pourquoi et suggère d'affiner la recherche
- Réponds en français
- Inclus toujours les URLs sources (références)`,
      tools: [{ type: "web_search" }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.log(`[llm/client] ✗ Erreur création agent: ${response.status} - ${errorText.slice(0, 200)}`);
    throw new Error(`Erreur création agent Mistral: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const responseData: any = await response.json();
  const agent: MistralAgent = {
    id: responseData.id,
    name: responseData.name,
    model: responseData.model,
    instructions: responseData.instructions,
    tools: responseData.tools,
    createdAt: responseData.createdAt,
  };
  currentAgent = agent;
  console.log(`[llm/client] ✓ Agent créé: ${agent.id} (${agent.name})`);
  
  return agent;
}

/**
 * Démarre une nouvelle conversation avec l'agent
 */
export async function startConversation(userMessage: string): Promise<MistralConversation> {
  const config = loadMistralConfig();
  const agent = await createAgent();
  
  console.log(`[llm/client] → Démarrage d'une conversation avec l'agent...`);
  
  const response = await fetch(config.CONVERSATIONS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: agent.id,
      inputs: userMessage,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.log(`[llm/client] ✗ Erreur démarrage conversation: ${response.status} - ${errorText.slice(0, 200)}`);
    throw new Error(`Erreur démarrage conversation: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const responseData: any = await response.json();
  console.log(`[llm/client] API response:`, responseData);
  const conversation: MistralConversation = {
    id: responseData.conversation_id || responseData.id,
    agentId: agent.id,
    createdAt: responseData.created_at || responseData.createdAt || new Date().toISOString(),
    updatedAt: responseData.updated_at || responseData.updatedAt || new Date().toISOString(),
    status: responseData.status || "active",
  };
  currentConversation = conversation;
  console.log(`[llm/client] ✓ Conversation démarrée: ${conversation.id}`);
  
  return conversation;
}

/**
 * Récupère les messages d'une conversation
 */
export async function getConversationMessages(conversationId: string): Promise<MistralMessage[]> {
  const config = loadMistralConfig();
  
  const response = await fetch(`${config.CONVERSATIONS_API_URL}/${conversationId}/messages`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.log(`[llm/client] ✗ Erreur récupération messages: ${response.status} - ${errorText.slice(0, 200)}`);
    throw new Error(`Erreur récupération messages: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const responseData: any = await response.json();
  console.log(`[llm/client] Messages API response:`, JSON.stringify(responseData, null, 2));
  
  // Transform Mistral Conversations API response to our MistralMessage format
  const messages: MistralMessage[] = (responseData.messages || []).map((msg: any) => {
    const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return {
      role: msg.role || "assistant",
      content: [{
        type: "text",
        text: contentText,
        // Mistral Conversations API may include tool references in a different format
        // We'll extract them from the content text if needed
      }],
    };
  });
  
  return messages;
}

/**
 * Effectue une recherche via l'agent Mistral avec capacité web_search
 */
export async function searchJobs(query: string, location?: string): Promise<AgentSearchResult> {
  const searchQuery = location ? `${query} ${location}` : query;
  console.log(`[llm/client] → Recherche d'offres: "${searchQuery}"`);
  
  try {
    const conversation = await startConversation(
      `Trouve des offres d'emploi pour: ${searchQuery}. ` +
      `Formate les résultats en JSON avec les champs: titre, entreprise, lieu, url, description, typeContrat, salaire. ` +
      `Inclus toutes les références/URLs sources. Réponds en français.`
    );

    console.log(`[llm/client] Attente de 5 secondes pour le traitement Mistral...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`[llm/client] Récupération des messages pour conversation: ${conversation.id}`);
    const messages = await getConversationMessages(conversation.id);
    const assistantMessage = messages.find((m) => m.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error("Aucune réponse de l'assistant trouvée");
    }

    const textContent = assistantMessage.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    // Extract references from the JSON content (Mistral Conversations API doesn't provide toolReference)
    let references: string[] = [];
    try {
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        let jsonContent = jsonMatch[1];
        // The API response has escaped quotes (\" -> "), we need to unescape them
        // Replace escaped quotes first
        jsonContent = jsonContent.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n');
        const parsed = JSON.parse(jsonContent);
        // Extract sources from the JSON (can be 'sources' or 'references' field)
        references = parsed.sources || parsed.references || [];
      }
    } catch (e) {
      console.log(`[llm/client] ⚠ Extraction des références échouée: ${e}`);
      console.log(`[llm/client] Contenu analysé (premier 1000 chars):`, textContent.slice(0, 1000));
    }
    console.log(`[llm/client] References extraites:`, references);

    let jobs: JobResult[] = [];
    try {
      jobs = extractJobResults(textContent, query, references);
    } catch (e) {
      console.log(`[llm/client] ⚠ Extraction JSON échouée: ${e}`);
      jobs = [{
        title: `Résultats pour: ${query}`,
        url: references[0] || "",
        description: textContent,
        source: "Mistral Web Search",
      }];
    }

    return {
      jobs,
      query: searchQuery,
      references,
      rawResponse: textContent,
    };
  } catch (error) {
    console.log(`[llm/client] ✗ Erreur recherche: ${(error as Error).message}`);
    return {
      jobs: [],
      query: searchQuery,
      references: [],
      rawResponse: `Erreur lors de la recherche: ${(error as Error).message}`,
    };
  }
}

function extractJobResults(text: string, query: string, references: string[]): JobResult[] {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonContent = jsonMatch ? jsonMatch[1] : text;

  // Clean up escaped characters from the API response
  jsonContent = jsonContent.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n');

  try {
    const parsed = JSON.parse(jsonContent);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || item.titre || query,
        company: item.company || item.entreprise,
        location: item.location || item.lieu,
        url: item.url || "",
        description: item.description || "",
        contractType: item.contractType || item.typeContrat || undefined,
        salary: item.salary || item.salaire || undefined,
        source: item.source || "Mistral Web Search",
      }));
    }
    if (parsed.jobs && Array.isArray(parsed.jobs)) {
      return parsed.jobs.map((item: any) => ({
        title: item.title || item.titre || query,
        company: item.company || item.entreprise,
        location: item.location || item.lieu,
        url: item.url || "",
        description: item.description || "",
        contractType: item.contractType || item.typeContrat || undefined,
        salary: item.salary || item.salaire || undefined,
        source: item.source || "Mistral Web Search",
      }));
    }
    return [{
      title: query,
      url: references[0] || "",
      description: text,
      source: "Mistral Web Search",
    }];
  } catch (e) {
    console.log(`[llm/client] ⚠ JSON invalide, parsing manuel...`);
    return parseJobResultsManually(text, query, references);
  }
}

function parseJobResultsManually(text: string, query: string, references: string[]): JobResult[] {
  const results: JobResult[] = [];
  const offerPattern = /(?:Titre|Title|Poste|Intitulé):\s*(.+?)(?:\n|\.|,)\s*(?:Entreprise|Company|Société):\s*(.+?)(?:\n|\.|,)\s*(?:URL|Lien|Link):\s*(https?:\/\/[^\s]+)/gi;
  
  let match;
  while ((match = offerPattern.exec(text)) !== null) {
    results.push({
      title: match[1].trim(),
      company: match[2].trim(),
      url: match[3].trim(),
      description: "",
      source: "Mistral Web Search",
    });
  }
  
  if (results.length === 0 && references.length > 0) {
    return [{
      title: query,
      url: references[0] || "",
      description: text,
      source: "Mistral Web Search",
    }];
  }
  
  return results;
}

/**
 * Fonction utilitaire pour extraire du JSON d'une chaîne de texte
 */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let s = -1;
  if (start === -1) s = startArr;
  else if (startArr === -1) s = start;
  else s = Math.min(start, startArr);
  
  if (s === -1) throw new Error("Aucun JSON trouvé dans la réponse LLM");
  
  let depth = 0;
  let inStr = false;
  let esc = false;
  
  for (let i = s; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(s, i + 1);
        try {
          return JSON.parse(slice) as T;
        } catch {
          const corrected = fixJsonStrings(slice);
          return JSON.parse(corrected) as T;
        }
      }
    }
  }
  throw new Error("JSON incomplet dans la réponse LLM");
}

function fixJsonStrings(json: string): string {
  return json.replace(
    /(\[[^\]]*?)(\s*)([a-zA-Zà-üÀ-Ü0-9\-_]+)(\s*,?\s*)/g,
    (match, prefix, spaces, word, suffix) => {
      if (!word.startsWith('"') && !word.endsWith('"')) {
        return `${prefix}${spaces}"${word}"${suffix}`;
      }
      return match;
    }
  );
}

/**
 * Réinitialise l'agent et la conversation courants
 */
export function resetAgent(): void {
  currentAgent = null;
  currentConversation = null;
}
