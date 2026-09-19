// AUTO-GÉNÉRÉ par scripts/gen-ui-assets.mjs — NE PAS ÉDITER À LA MAIN
// Contenu de l'UI web embarqué dans le binaire (SEA) pour servir sans fichiers externes.

export interface UiAsset {
  mime: string;
  body: string;
}

export const UI_ASSETS: Record<string, UiAsset> = {
  "/app.js": {
    mime: "text/javascript; charset=utf-8",
    body: `const chatEl = document.getElementById("chat");
const formEl = document.getElementById("composer");
const inputEl = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");
const stateEl = document.getElementById("state");
const jobsEl = document.getElementById("jobs");
const countEl = document.getElementById("count");

let ws = null;
let ready = false;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addBubble(text, who) {
  const div = document.createElement("div");
  div.className = \`bubble \${who}\`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(text, cls) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (cls ? " " + cls : "");
}

function renderState(state) {
  const s = state.search;
  const c = state.criteria;
  const lines = [
    \`Requête : \${s.query}\`,
    \`Lieu : \${s.location}\`,
    \`Offres max/source : \${s.maxResultsPerSource}\`,
    \`Score min : \${s.minScore}\`,
    \`\`,
    \`Mots-clés : \${(c.keywords || []).join(", ")}\`,
    \`Exclusions : \${(c.excludeKeywords || []).join(", ") || "—"}\`,
    \`Expérience : \${c.experience || "—"}\`,
    \`Contrats : \${(c.contractTypes || []).join(", ") || "tous"}\`,
    \`Télétravail : \${c.remoteOk ? "oui" : "non"}\`,
    \`Salaire max : \${c.maxSalary ?? "—"}\`,
  ];
  stateEl.textContent = lines.join("\\n");
}

function scoreClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function renderJobs(jobs) {
  jobs = Array.isArray(jobs) ? jobs : [];
  countEl.textContent = String(jobs.length);
  if (jobs.length === 0) {
    jobsEl.innerHTML = \`<div class="empty">Aucune offre pour l'instant. Lancez une recherche via le chat.</div>\`;
    return;
  }
  jobsEl.innerHTML = jobs
    .map((j) => {
      const meta = [j.company, j.location, j.contractType, j.source]
        .filter(Boolean)
        .join(" · ");
      const salary = j.salary ? \` · \${esc(j.salary)}\` : "";
      const reasons = j.scoreReasons && j.scoreReasons.length
        ? \`<div class="job-reasons">\${esc(j.scoreReasons.join(" ; "))}</div>\`
        : "";
      return \`<div class="job">
        <div class="job-head">
          <a class="job-title" href="\${esc(j.url)}" target="_blank" rel="noopener">\${esc(j.title)}</a>
          <span class="score \${scoreClass(j.score)}">\${j.score}/100</span>
        </div>
        <div class="job-meta">\${esc(meta)}\${salary}</div>
        \${reasons}
      </div>\`;
    })
    .join("");
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(\`\${proto}//\${location.host}/chat\`);

  ws.onopen = () => {
    ready = true;
    setStatus("Connecté", "");
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "ready":
        if (msg.state) renderState(msg.state);
        if (Array.isArray(msg.history)) {
          for (const m of msg.history) addBubble(m.content, m.role === "user" ? "user" : "bot");
        }
        break;
      case "message":
        addBubble(msg.reply, "bot");
        break;
      case "update":
        addBubble(msg.reply, "bot");
        if (msg.state) renderState(msg.state);
        break;
      case "status":
        addBubble(msg.status, "system");
        if (/lancée|cours/i.test(msg.status)) setStatus(msg.status, "running");
        break;
      case "results":
        if (msg.jobs) renderJobs(msg.jobs);
        setStatus(
          \`✓ \${msg.run?.retainedAfterScore ?? 0} offre(s) retenue(s) sur \${msg.run?.totalScraped ?? 0} scrapées\`,
          "",
        );
        break;
      case "error":
        addBubble(\`Erreur : \${msg.error}\`, "bot");
        setStatus("Erreur", "error");
        break;
    }
  };

  ws.onclose = () => {
    ready = false;
    setStatus("Déconnecté — reconnexion dans 2s…", "error");
    setTimeout(connect, 2000);
  };

  ws.onerror = () => setStatus("Erreur de connexion", "error");
}

function send(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setStatus("Socket non connectée", "error");
    return;
  }
  ws.send(JSON.stringify({ type: "chat", message: text }));
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  addBubble(text, "user");
  send(text);
  inputEl.value = "";
});

connect();

// Charge les derniers résultats connus au démarrage
fetch("/api/latest")
  .then((r) => r.json())
  .then((d) => {
    if (d && Array.isArray(d.jobs)) renderJobs(d.jobs);
  })
  .catch(() => {});
`,
  },
  "/": {
    mime: "text/html; charset=utf-8",
    body: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Job Hunter AI — Chat</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="app">
    <header>
      <h1>🤖 Job Hunter AI</h1>
      <p class="subtitle">Affinez votre recherche d'emploi par la conversation</p>
    </header>

    <main>
      <section class="panel chat-panel">
        <div id="chat" class="chat" aria-live="polite"></div>
        <form id="composer" class="composer">
          <input
            id="msg"
            type="text"
            placeholder="Ex : cherche secrétariat médico social à Lyon en CDI"
            autocomplete="off"
            autofocus
          />
          <button type="submit" id="send">Envoyer</button>
        </form>
        <div id="status" class="status"></div>
      </section>

      <aside class="panel side-panel">
        <details open>
          <summary>📋 Critères de recherche</summary>
          <pre id="state" class="state"></pre>
        </details>
        <details open>
          <summary>💼 Offres trouvées (<span id="count">0</span>)</summary>
          <div id="jobs" class="jobs"></div>
        </details>
      </aside>
    </main>

    <footer>
      <small>Job Hunter AI — interface de chat · WebSocket <code>/chat</code> · REST <code>/api/run</code></small>
    </footer>
  </div>

  <script src="/app.js"></script>
</body>
</html>
`,
  },
  "/style.css": {
    mime: "text/css; charset=utf-8",
    body: `:root {
  --bg: #0f172a;
  --bg-panel: #1e293b;
  --bg-input: #0f172a;
  --fg: #e2e8f0;
  --muted: #94a3b8;
  --accent: #6366f1;
  --accent-2: #818cf8;
  --user: #6366f1;
  --bot: #334155;
  --border: #334155;
  --ok: #22c55e;
  --warn: #f59e0b;
  --err: #ef4444;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 1400px;
  margin: 0 auto;
}

header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
header h1 { margin: 0; font-size: 18px; }
.subtitle { margin: 4px 0 0; color: var(--muted); font-size: 12px; }

main {
  flex: 1;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-panel { min-height: 0; }

.chat {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
}
.bubble.user {
  align-self: flex-end;
  background: var(--user);
  color: white;
  border-bottom-right-radius: 4px;
}
.bubble.bot {
  align-self: flex-start;
  background: var(--bot);
  color: var(--fg);
  border-bottom-left-radius: 4px;
}
.bubble.system {
  align-self: center;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-style: italic;
}

.composer {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border);
}
.composer input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.composer input:focus { border-color: var(--accent); }
.composer button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.composer button:hover { background: var(--accent-2); }
.composer button:disabled { opacity: 0.5; cursor: default; }

.status {
  padding: 4px 14px 10px;
  color: var(--muted);
  font-size: 12px;
  min-height: 18px;
}
.status.running { color: var(--warn); }
.status.error { color: var(--err); }

.side-panel { min-height: 0; overflow-y: auto; }
.side-panel details {
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
}
.side-panel summary {
  cursor: pointer;
  font-weight: 600;
  padding: 4px 0;
}
.state {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  overflow-x: auto;
  color: var(--fg);
}

.jobs { display: flex; flex-direction: column; gap: 8px; }
.job {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.job-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.job-title { font-weight: 600; color: var(--fg); text-decoration: none; }
.job-title:hover { color: var(--accent-2); }
.score {
  font-weight: 700;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.score.high { background: rgba(34,197,94,0.2); color: #4ade80; }
.score.mid { background: rgba(245,158,11,0.2); color: #fbbf24; }
.score.low { background: rgba(239,68,68,0.2); color: #f87171; }
.job-meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
.job-reasons { color: var(--muted); font-size: 11px; font-style: italic; margin-top: 4px; }
.empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

footer {
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}
footer code { color: var(--accent-2); }

@media (max-width: 760px) {
  main { grid-template-columns: 1fr; grid-template-rows: 1.2fr 1fr; }
}
`,
  },
};
