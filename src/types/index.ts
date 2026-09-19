// Types simplifiés pour le chat IA de recherche d'emploi

// Message de chat
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Requête de recherche
export interface SearchRequest {
  query: string;
  location?: string;
  maxResults?: number;
}

// Résultat d'une offre d'emploi
export interface JobResult {
  title: string;
  company?: string;
  location?: string;
  url: string;
  description?: string;
  source?: string;
  contractType?: string;
  salary?: string;
  publishedAt?: string;
}

// Résultat de la recherche
export interface SearchResult {
  jobs: JobResult[];
  query: string;
  totalResults: number;
  references?: string[]; // URLs des sources utilisées
}

// État de la session de chat
export interface ChatState {
  search: SearchRequest;
}

// Action à effectuer après l'interprétation d'un message
export type ChatActionType = 'update' | 'search' | 'reset' | 'answer';

export interface ChatAction {
  type: ChatActionType;
  message: string;
  state?: ChatState;
}

// Réponse de l'interprétation LLM
export interface InterpretationResult {
  action: ChatAction;
  reply: string;
}

// Résultat d'une conversation avec l'agent
export interface ConversationResult {
  messages: ChatMessage[];
  jobResults?: JobResult[];
  references?: string[]; // URLs sources
}
