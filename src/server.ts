import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
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
  conversationId?: string; // ID de la conversation Mistral en cours
}

const sessions = new Map<string, Session>();

function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = {
      state: getDefaultState(),
      history: [],
      running: false,
    };
    sessions.set(id, s);
  }
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
  for await (const chunk of req) data += chunk;
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
  console.log(`[chat] Message utilisateur: "${userMessage}"`);
  
  // Ajouter le message à l'historique
  session.history.push({ role: "user", content: userMessage });

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
  session.history.push({ role: "assistant", content: result.reply });

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
    res.setHeader("access-control-allow-origin", "*");
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

      // API: obtenir les derniers résultats (plus utilisé dans cette version)
      if (url === "/api/latest" && req.method === "GET") {
        sendJson(res, 200, { jobs: [] });
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
      console.log(`[server] ← Message reçu (session: ${sessionId}, taille: ${data.toString().length} bytes)`);
      let msg: { type: string; message?: string };
      try {
        msg = JSON.parse(data.toString());
        console.log(`[server] ← Type: ${msg.type}, Message: ${msg.message?.slice(0, 100) || '(vide)'}`);
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
