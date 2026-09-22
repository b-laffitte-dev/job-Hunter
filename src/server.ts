import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { loadEnv } from "./env.js";
import {
  interpretMessage,
  getDefaultState,
  isSearchRequest,
  type ChatState,
  type InterpretationResult,
} from "./llm/chat.js";

// Ré-exporter ChatState pour l'utiliser dans Session
export type { ChatState };
import {
  searchJobs,
  createAgent,
  startConversation,
  getConversationMessages,
  resetAgent,
  deleteAgent,
  type AgentSearchResult,
} from "./llm/client.js";
import type { JobResult, ChatMessage } from "./types/index.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Interface pour une session
export interface Session {
  state: ChatState;
  history: { role: "user" | "assistant"; content: string }[];
  running: boolean;
  lastUsed: number;
  conversationId?: string; // ID de la conversation Mistral en cours
}

const MAX_HISTORY_LENGTH = 50;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 10_000;

const sessions = new Map<string, Session>();
let lastSweep = Date.now();

function sweepSessions(): void {
  const now = Date.now();
  if (now - lastSweep < SESSION_SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [id, s] of sessions) {
    if (!s.running && now - s.lastUsed > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}

function touchSession(s: Session): void {
  s.lastUsed = Date.now();
}

function pushHistory(session: Session, entry: { role: "user" | "assistant"; content: string }): void {
  session.history.push(entry);
  if (session.history.length > MAX_HISTORY_LENGTH) {
    session.history.splice(0, session.history.length - MAX_HISTORY_LENGTH);
  }
}

function getSession(id: string): Session {
  sweepSessions();
  let s = sessions.get(id);
  if (!s) {
    s = {
      state: getDefaultState(),
      history: [],
      running: false,
      lastUsed: Date.now(),
    };
    sessions.set(id, s);
  }
  touchSession(s);
  return s;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function serveStatic(res: ServerResponse, urlPath: string): boolean {
  const route = urlPath === "/" ? "/" : urlPath.split("?")[0];
  if (route.includes("..")) return false;

  // Fallback système de fichiers (mode dev avec public/)
  const publicDir = resolve("public");
  const rel = route === "/" ? "/index.html" : route;
  const filePath = resolve(publicDir, rel.replace(/^\//, ""));
  if (!filePath.startsWith(publicDir + sep)) return false;
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath);
  const mime = MIME[ext] ?? "application/octet-stream";
  const data = readFileSync(filePath);
  res.writeHead(200, { "content-type": mime });
  res.end(data);
  return true;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let data = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Corps de requête trop volumineux");
    }
    data += chunk;
  }
  return data;
}

/**
 * Gère un message de chat de l'utilisateur
 */
async function handleChatMessage(
  ws: WebSocket,
  sessionId: string,
  userMessage: string,
): Promise<void> {
  const session = getSession(sessionId);
  console.log(`[chat] Message utilisateur (session: ${sessionId.slice(0, 8)}, taille: ${userMessage.length})`);
  
  // Ajouter le message à l'historique
  pushHistory(session, { role: "user", content: userMessage });

  let result: InterpretationResult;
  
  try {
    console.log(`[chat] → Appel interpretMessage...`);
    result = await interpretMessage(
      session.state,
      userMessage,
      session.history,
    );
    console.log(`[chat] ✓ Action interprétée: ${result.action.type}`);
  } catch (e) {
    console.log(`[chat] ✗ Erreur interpretMessage: ${(e as Error).message}`);
    ws.send(JSON.stringify({ type: "error", error: (e as Error).message }));
    return;
  }

  // Ajouter la réponse à l'historique
  pushHistory(session, { role: "assistant", content: result.reply });

  // Envoyer la réponse immédiate
  ws.send(
    JSON.stringify({
      type: "message",
      reply: result.reply,
    }),
  );

  // Mettre à jour l'état si nécessaire
  if (result.action.state) {
    session.state = result.action.state;
    console.log(`[chat] → État mis à jour: query="${session.state.search.query}", location="${session.state.search.location}"`);
  }

  // Si l'action est "update" ou "reset", envoyer la mise à jour de l'état
  if (result.action.type === "update" || result.action.type === "reset") {
    ws.send(
      JSON.stringify({
        type: "update",
        state: session.state,
      }),
    );
    return;
  }

  // Si l'action est "answer", on a déjà envoyé la réponse, rien de plus à faire
  if (result.action.type === "answer") {
    return;
  }

  // Si l'action est "search", lancer la recherche via Mistral Agents API
  if (result.action.type === "search") {
    if (session.running) {
      console.log(`[chat] ⚠ Recherche déjà en cours`);
      ws.send(
        JSON.stringify({
          type: "status",
          status: "Une recherche est déjà en cours.",
        }),
      );
      return;
    }

    session.running = true;
    const searchQuery = session.state.search.query;
    const searchLocation = session.state.search.location;
    
    console.log(`[chat] → Démarrage de la recherche (query: "${searchQuery}", location: "${searchLocation}")`);
    ws.send(JSON.stringify({ type: "status", status: "Recherche lancée..." }));

    try {
      // Effectuer la recherche via l'API Mistral
      console.log(`[chat] → Appel searchJobs...`);
      const searchResult: AgentSearchResult = await searchJobs(
        searchQuery,
        searchLocation,
      );

      console.log(`[chat] ✓ Recherche terminée: ${searchResult.jobs.length} offre(s) trouvée(s)`);
      console.log(`[chat]   Références: ${searchResult.references.length} URL(s)`);

      // Envoyer les résultats au client
      ws.send(
        JSON.stringify({
          type: "results",
          jobs: searchResult.jobs,
          query: searchResult.query,
          totalResults: searchResult.jobs.length,
          references: searchResult.references,
          rawResponse: searchResult.rawResponse,
        }),
      );
    } catch (e) {
      console.log(`[chat] ✗ Erreur recherche: ${(e as Error).message}`);
      ws.send(JSON.stringify({
        type: "error",
        error: `Erreur lors de la recherche: ${(e as Error).message}`,
      }));
    } finally {
      session.running = false;
      console.log(`[chat] → Recherche terminée, session libre`);
    }
  }
}

export function startServer(): { url: string; close: () => void } {
  const env = loadEnv();
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const allowedOrigin = `http://${env.SERVE_HOST === "0.0.0.0" ? "localhost" : env.SERVE_HOST}:${env.SERVE_PORT}`;
    res.setHeader("access-control-allow-origin", allowedOrigin);
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Servir les fichiers statiques
      if (serveStatic(res, url)) return;

      // API: obtenir l'état actuel
      if (url === "/api/state" && req.method === "GET") {
        const session = getSession("default");
        sendJson(res, 200, session.state);
        return;
      }

      // API: démarrer une recherche (pour compatibilité)
      if (url === "/api/search" && req.method === "POST") {
        const raw = await readBody(req);
        let body: { query: string; location?: string } | null = null;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: "JSON invalide" });
            return;
          }
        }

        if (!body?.query) {
          sendJson(res, 400, { error: "La requête (query) est requise" });
          return;
        }

        try {
          const searchResult = await searchJobs(body.query, body.location);
          sendJson(res, 200, {
            jobs: searchResult.jobs,
            query: searchResult.query,
            totalResults: searchResult.jobs.length,
            references: searchResult.references,
          });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  const wss = new WebSocketServer({ server, path: "/chat" });
  
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/chat", "http://localhost");
    const sessionId = url.searchParams.get("sessionId") ?? "default";
    const session = getSession(sessionId);
    
    console.log(`[server] ✓ Nouvelle connexion WebSocket (session: ${sessionId})`);
    
    // Envoyer l'état initial
    ws.send(
      JSON.stringify({
        type: "ready",
        state: session.state,
        history: session.history.slice(-20),
      }),
    );

    ws.on("message", (data) => {
      console.log(`[server] ← Message reçu (session: ${sessionId.slice(0, 8)}, taille: ${data.toString().length} bytes)`);
      let msg: { type: string; message?: string };
      try {
        msg = JSON.parse(data.toString());
        console.log(`[server] ← Type: ${msg.type}`);
      } catch {
        console.log(`[server] ✗ Message JSON invalide`);
        ws.send(
          JSON.stringify({ type: "error", error: "Message JSON invalide" }),
        );
        return;
      }
      
      if (msg.type === "chat" && msg.message) {
        console.log(`[server] → Traitement du message utilisateur...`);
        handleChatMessage(ws, sessionId, msg.message).catch((e) =>
          ws.send(
            JSON.stringify({ type: "error", error: (e as Error).message }),
          ),
        );
      }
    });

    ws.on("close", () => {
      console.log(`[server] ✗ Connexion WebSocket fermée (session: ${sessionId})`);
    });

    ws.on("error", (error) => {
      console.log(`[server] ✗ Erreur WebSocket (session: ${sessionId}): ${(error as Error).message}`);
    });
  });

  const port = env.SERVE_PORT;
  const host = env.SERVE_HOST;
  
  server.listen(port, host, () => {
    console.log(
      `\n💬 Job Hunter AI - Interface de chat:\n` +
      `   Web: http://${host}:${port}\n` +
      `   WebSocket: ws://${host}:${port}/chat\n` +
      `   (Utilise Mistral Agents API + Conversations API)`,
    );
  });

  return {
    url: `http://${host}:${port}`,
    close: () => {
      wss.close();
      server.close();
      // Supprimer l'agent Mistral côté API pour éviter l'accumulation d'agents orphelins
      void deleteAgent();
    },
  };
}
