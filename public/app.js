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
  const a = state.agent || {};
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
  
  // Ajouter les paramètres de l'agent s'ils existent
  if (Object.keys(a).length > 0) {
    lines.push("", `Paramètres de l'agent:`);
    if (a.maxLlmCalls != null) lines.push(`- Appels LLM max: ${a.maxLlmCalls}`);
    if (a.maxTokens != null) lines.push(`- Tokens max: ${a.maxTokens}`);
    if (a.maxSteps != null) lines.push(`- Étapes max: ${a.maxSteps}`);
    if (a.satisfactionThreshold != null) lines.push(`- Seuil satisfaction: ${a.satisfactionThreshold}%`);
    if (a.autoExtract != null) lines.push(`- Extraction auto: ${a.autoExtract ? "oui" : "non"}`);
    if (a.maxUrlsPerSearch != null) lines.push(`- URLs max/scrap: ${a.maxUrlsPerSearch}`);
    
    // Mettre à jour les valeurs des inputs de configuration
    updateAgentConfigInputs(a);
  }
  
  stateEl.textContent = lines.join("\n");
}

function updateAgentConfigInputs(agentConfig) {
  const inputs = {
    maxLlmCalls: document.getElementById("maxLlmCalls"),
    maxTokens: document.getElementById("maxTokens"),
    maxSteps: document.getElementById("maxSteps"),
    satisfactionThreshold: document.getElementById("satisfactionThreshold"),
    autoExtract: document.getElementById("autoExtract"),
    maxUrlsPerSearch: document.getElementById("maxUrlsPerSearch"),
  };
  
  if (inputs.maxLlmCalls) inputs.maxLlmCalls.value = agentConfig.maxLlmCalls ?? 20;
  if (inputs.maxTokens) inputs.maxTokens.value = agentConfig.maxTokens ?? 50000;
  if (inputs.maxSteps) inputs.maxSteps.value = agentConfig.maxSteps ?? 10;
  if (inputs.satisfactionThreshold) inputs.satisfactionThreshold.value = agentConfig.satisfactionThreshold ?? 80;
  if (inputs.autoExtract) inputs.autoExtract.value = String(agentConfig.autoExtract ?? true);
  if (inputs.maxUrlsPerSearch) inputs.maxUrlsPerSearch.value = agentConfig.maxUrlsPerSearch ?? 2;
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

// Sauvegarder les paramètres de l'agent
const saveAgentConfigBtn = document.getElementById("saveAgentConfig");
if (saveAgentConfigBtn) {
  saveAgentConfigBtn.addEventListener("click", () => {
    const agentConfig = {
      maxLlmCalls: parseInt(document.getElementById("maxLlmCalls")?.value) || 20,
      maxTokens: parseInt(document.getElementById("maxTokens")?.value) || 50000,
      maxSteps: parseInt(document.getElementById("maxSteps")?.value) || 10,
      satisfactionThreshold: parseInt(document.getElementById("satisfactionThreshold")?.value) || 80,
      autoExtract: document.getElementById("autoExtract")?.value === "true",
      maxUrlsPerSearch: parseInt(document.getElementById("maxUrlsPerSearch")?.value) || 2,
    };
    
    // Envoyer au serveur via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "update",
        message: "Mise à jour des paramètres de l'agent",
        state: { agent: agentConfig }
      }));
      addBubble("Paramètres de l'agent mis à jour", "system");
      setStatus("Paramètres sauvegardés", "ok");
    } else {
      setStatus("Impossible de sauvegarder : socket non connectée", "error");
    }
  });
}

connect();

// Charge les derniers résultats connus au démarrage
fetch("/api/latest")
  .then((r) => r.json())
  .then((d) => {
    if (d && Array.isArray(d.jobs)) renderJobs(d.jobs);
  })
  .catch(() => {});
