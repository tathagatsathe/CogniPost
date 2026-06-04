import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getProjectRoot } from "../config/load-config.js";
import { log } from "../utils/logger.js";

export interface HistoryEntry {
  id: string;
  text: string;
  topic: string;
  postedAt: string;
  score?: number;
}

const HISTORY_FILE = "post-history.json";

function historyPath(): string {
  const dataDir = resolve(getProjectRoot(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return resolve(dataDir, HISTORY_FILE);
}

export function loadLocalHistory(): HistoryEntry[] {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: HistoryEntry): void {
  const path = historyPath();
  const existing = loadLocalHistory();
  existing.unshift(entry);
  const trimmed = existing.slice(0, 100);
  writeFileSync(path, JSON.stringify(trimmed, null, 2));
  log("info", "Saved to local post history", { path });
}

export function getRecentTextsFromHistory(limit = 30): string[] {
  return loadLocalHistory()
    .slice(0, limit)
    .map((e) => e.text);
}
