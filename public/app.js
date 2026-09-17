const chatEl = document.getElementById("chat");
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
  div.className = `bubble ${who}`;
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
    `Requête : ${s.query}`,
    `Lieu : ${s.location}`,
    `Offres max/source : ${s.maxResultsPerSource}`,
    `Score min : ${s.minScore}`,
    ``,
    `Mots-clés : ${(c.keywords || []).join(", ")}`,
    `Exclusions : ${(c.excludeKeywords || []).join(", ") || "—"}`,
    `Expérience : ${c.experience || "—"}`,
    `Contrats : ${(c.contractTypes || []).join(", ") || "tous"}`,
    `Télétravail : ${c.remoteOk ? "oui" : "non"}`,
    `Salaire max : ${c.maxSalary ?? "—"}`,
  ];
  stateEl.textContent = lines.join("\n");
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
    jobsEl.innerHTML = `<div class="empty">Aucune offre pour l'instant. Lancez une recherche via le chat.</div>`;
    return;
  }
  jobsEl.innerHTML = jobs
    .map((j) => {
      const meta = [j.company, j.location, j.contractType, j.source]
        .filter(Boolean)
        .join(" · ");
      const salary = j.salary ? ` · ${esc(j.salary)}` : "";
      const reasons = j.scoreReasons && j.scoreReasons.length
        ? `<div class="job-reasons">${esc(j.scoreReasons.join(" ; "))}</div>`
        : "";
      return `<div class="job">
        <div class="job-head">
          <a class="job-title" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a>
          <span class="score ${scoreClass(j.score)}">${j.score}/100</span>
        </div>
        <div class="job-meta">${esc(meta)}${salary}</div>
        ${reasons}
      </div>`;
    })
    .join("");
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/chat`);

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
          `✓ ${msg.run?.retainedAfterScore ?? 0} offre(s) retenue(s) sur ${msg.run?.totalScraped ?? 0} scrapées`,
          "",
        );
        break;
      case "error":
        addBubble(`Erreur : ${msg.error}`, "bot");
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
