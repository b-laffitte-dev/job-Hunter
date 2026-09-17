import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDir } from "./fs.js";
import type { JobOffer, ScoredJob } from "../types/index.js";

const DATA_DIR = resolve("data");
const SEEN_PATH = resolve(DATA_DIR, "seen.json");
const LATEST_PATH = resolve(DATA_DIR, "latest.json");
const HISTORY_DIR = resolve(DATA_DIR, "history");

export interface SeenStore {
  seenIds: string[];
  seenUrls: string[];
}

export function loadSeen(): SeenStore {
  ensureDir(DATA_DIR);
  if (!existsSync(SEEN_PATH)) return { seenIds: [], seenUrls: [] };
  try {
    return JSON.parse(readFileSync(SEEN_PATH, "utf-8")) as SeenStore;
  } catch {
    return { seenIds: [], seenUrls: [] };
  }
}

export function saveSeen(store: SeenStore): void {
  ensureDir(DATA_DIR);
  writeFileSync(SEEN_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function isNewOffer(offer: JobOffer, store: SeenStore): boolean {
  if (store.seenIds.includes(offer.id)) return false;
  if (offer.url && store.seenUrls.includes(offer.url)) return false;
  return true;
}

export function markSeen(offers: JobOffer[], store: SeenStore): void {
  for (const o of offers) {
    if (!store.seenIds.includes(o.id)) store.seenIds.push(o.id);
    if (o.url && !store.seenUrls.includes(o.url)) store.seenUrls.push(o.url);
  }
  // Limite pour éviter une croissance infinie : on garde les 10 000 derniers
  if (store.seenIds.length > 10000) store.seenIds = store.seenIds.slice(-10000);
  if (store.seenUrls.length > 10000) store.seenUrls = store.seenUrls.slice(-10000);
}

export function saveLatest(offers: ScoredJob[]): void {
  ensureDir(DATA_DIR);
  writeFileSync(LATEST_PATH, JSON.stringify(offers, null, 2), "utf-8");
}

export function loadLatest(): ScoredJob[] {
  ensureDir(DATA_DIR);
  if (!existsSync(LATEST_PATH)) return [];
  try {
    return JSON.parse(readFileSync(LATEST_PATH, "utf-8")) as ScoredJob[];
  } catch {
    return [];
  }
}

export function archiveRun(offers: ScoredJob[], runId: string): string {
  ensureDir(HISTORY_DIR);
  const path = resolve(HISTORY_DIR, `run-${runId}.json`);
  writeFileSync(path, JSON.stringify(offers, null, 2), "utf-8");
  return path;
}

export function toCSV(offers: ScoredJob[]): string {
  const headers = [
    "score",
    "source",
    "title",
    "company",
    "location",
    "contractType",
    "salary",
    "publishedAt",
    "url",
  ];
  const escape = (v: string | null | undefined) =>
    `"${(v ?? "").replace(/"/g, '""')}"`;
  const rows = offers.map((o) =>
    [
      String(o.score),
      o.source,
      o.title,
      o.company,
      o.location,
      o.contractType,
      o.salary,
      o.publishedAt,
      o.url,
    ]
      .map(escape)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
