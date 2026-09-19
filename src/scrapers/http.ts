import { request, Agent } from "undici";

// User-Agent moderne pour éviter les blocages (Chrome 131 sur macOS)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Headers communs pour toutes les requêtes (éviter la détection bot)
const DEFAULT_HEADERS = {
  "user-agent": UA,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  connection: "keep-alive",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

const dispatcher = new Agent({
  connectTimeout: 15_000,
  keepAliveTimeout: 4_000,
});

export interface FetchOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchJson<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const u = new URL(url);
  if (opts.query)
    for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: {
      ...DEFAULT_HEADERS,
      accept: "application/json",
      ...opts.headers,
    },
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text().catch(() => "");
    throw new Error(
      `HTTP ${res.statusCode} sur ${u.toString()}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.body.json()) as T;
}

export async function fetchText(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  const u = new URL(url);
  if (opts.query)
    for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: { ...DEFAULT_HEADERS, accept: "text/html,*/*", ...opts.headers },
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text().catch(() => "");
    throw new Error(
      `HTTP ${res.statusCode} sur ${u.toString()}: ${body.slice(0, 200)}`,
    );
  }
  return res.body.text();
}

export async function postForm<T>(
  url: string,
  form: Record<string, string>,
  opts: FetchOptions = {},
): Promise<T> {
  const body = new URLSearchParams(form).toString();
  const res = await request(url, {
    method: "POST",
    dispatcher,
    headers: {
      ...DEFAULT_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...opts.headers,
    },
    body,
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });
  if (res.statusCode >= 400) {
    const txt = await res.body.text().catch(() => "");
    throw new Error(`HTTP ${res.statusCode} sur ${url}: ${txt.slice(0, 200)}`);
  }
  return (await res.body.json()) as T;
}
