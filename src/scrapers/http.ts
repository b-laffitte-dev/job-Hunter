import { request, Agent } from "undici";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: { "user-agent": UA, accept: "application/json", ...opts.headers },
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text().catch(() => "");
    throw new Error(`HTTP ${res.statusCode} sur ${u.toString()}: ${body.slice(0, 200)}`);
  }
  return (await res.body.json()) as T;
}

export async function fetchText(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  const u = new URL(url);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);
  const res = await request(u.toString(), {
    method: "GET",
    dispatcher,
    headers: { "user-agent": UA, accept: "text/html,*/*", ...opts.headers },
    headersTimeout: opts.timeoutMs ?? 20_000,
    bodyTimeout: opts.timeoutMs ?? 30_000,
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text().catch(() => "");
    throw new Error(`HTTP ${res.statusCode} sur ${u.toString()}: ${body.slice(0, 200)}`);
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
      "user-agent": UA,
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
