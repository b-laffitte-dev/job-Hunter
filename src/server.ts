import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { loadEnv, loadConfig } from "./config/index.js";
import {
  interpretMessage,
  stateFromConfig,
  type ChatState,
} from "./llm/chat.js";
import { runWithConfig } from "./runner.js";
import { loadLatest } from "./storage/store.js";
import { UI_ASSETS } from "./ui-assets.generated.js";
import type { AppConfig, ScoredJob } from "./types/index.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function buildConfigFromState(state: ChatState): AppConfig {
  const base = loadConfig();
  return {
    search: state.search,
    criteria: state.criteria,
    sources: base.sources,
  };
}

interface Session {
  state: ChatState;
  history: { role: "user" | "assistant"; content: string }[];
  running: boolean;
}

const sessions = new Map<string, Session>();

function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    const base = loadConfig();
    s = {
      state: stateFromConfig(base),
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
  // 1. UI embarquée dans le binaire (priorité — fonctionne sans fichiers externes)
  const asset = UI_ASSETS[route];
  if (asset) {
    res.writeHead(200, { "content-type": asset.mime });
    res.end(asset.body);
    return true;
  }
  // 2. Fallback système de fichiers (mode dev avec public/)
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

async function handleRun(
  res: ServerResponse,
  body: { sessionId?: string; state?: ChatState } | null,
): Promise<void> {
  const sessionId = body?.sessionId ?? "default";
  const session = getSession(sessionId);
  if (session.running) {
    sendJson(res, 409, {
      error: "Une recherche est déjà en cours sur cette session.",
    });
    return;
  }
  if (body?.state) session.state = body.state;
  const config = buildConfigFromState(session.state);
  session.running = true;
  try {
    const result = await runWithConfig(config);
    sendJson(res, 200, {
      ...result,
      jobs: result.jobs ?? loadLatest(),
    });
  } catch (e) {
    sendJson(res, 500, { error: (e as Error).message });
  } finally {
    session.running = false;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

async function handleChatMessage(
  ws: WebSocket,
  sessionId: string,
  userMessage: string,
): Promise<void> {
  const session = getSession(sessionId);
  console.log(`[chat] Message utilisateur: "${userMessage}"`);
  session.history.push({ role: "user", content: userMessage });

  let result;
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

  session.history.push({ role: "assistant", content: result.reply });

  if (result.action.type === "answer") {
    console.log(`[chat] → Réponse simple: "${result.reply}"`);
    ws.send(
      JSON.stringify({
        type: "message",
        reply: result.reply,
        state: session.state,
      }),
    );
    return;
  }

  // update / reset / search : on met à jour l'état
  console.log(`[chat] → Mise à jour de l'état (action: ${result.action.type})`);
  session.state = result.action.state;
  ws.send(
    JSON.stringify({
      type: "update",
      reply: result.reply,
      action: result.action.type,
      state: session.state,
    }),
  );

  // Si l'action est "search", on lance le pipeline
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
    console.log(`[chat] → Démarrage de la recherche (query: "${session.state.search.query}", location: "${session.state.search.location}")`);
    ws.send(JSON.stringify({ type: "status", status: "Recherche lancée..." }));
    try {
      const config = buildConfigFromState(session.state);
      console.log(`[chat] → runWithConfig démarre...`);
      const runResult = await runWithConfig(config);
      console.log(`[chat] ✓ Recherche terminée: ${runResult.retainedAfterScore} offres retenues sur ${runResult.totalScraped} scrapées`);
      const jobs = runResult.jobs ?? loadLatest();
      ws.send(
        JSON.stringify({
          type: "results",
          run: runResult,
          jobs,
        }),
      );
    } catch (e) {
      console.log(`[chat] ✗ Erreur recherche: ${(e as Error).message}`);
      ws.send(JSON.stringify({ type: "error", error: (e as Error).message }));
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
      // Sert l'UI embarquée (ou le fallback public/ en dev)
      if (serveStatic(res, url)) return;

      if (url === "/api/state" && req.method === "GET") {
        const session = getSession("default");
        sendJson(res, 200, session.state);
        return;
      }

      if (url === "/api/latest" && req.method === "GET") {
        const jobs: ScoredJob[] = loadLatest();
        sendJson(res, 200, { jobs });
        return;
      }

      if (url === "/api/run" && req.method === "POST") {
        const raw = await readBody(req);
        let body: { sessionId?: string; state?: ChatState } | null = null;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: "JSON invalide" });
            return;
          }
        }
        await handleRun(res, body);
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
  });

  const port = env.SERVE_PORT;
  const host = env.SERVE_HOST;
  server.listen(port, host, () => {
    console.log(
      `\n💬 Interface de chat Job Hunter AI : http://${host}:${port}`,
    );
    console.log(`   WebSocket: ws://${host}:${port}/chat`);
  });

  return {
    url: `http://${host}:${port}`,
    close: () => {
      wss.close();
      server.close();
    },
  };
}
