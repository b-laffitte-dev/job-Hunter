import { loadEnv } from "../config/index.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
}

export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const env = loadEnv();
  const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as ChatResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export function extractJson<T>(text: string): T {
  // Récupère le premier bloc JSON (avec ou sans markdown ```json)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Trouve la première accolade ouvrante jusqu'à la fermante équilibrée
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
        return JSON.parse(slice) as T;
      }
    }
  }
  throw new Error("JSON incomplet dans la réponse LLM");
}
