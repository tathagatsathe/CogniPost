import type { AppConfig } from "../config/types.js";
import type { TrendCandidate } from "./types.js";

function matchesKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function filterTrends(
  candidates: TrendCandidate[],
  config: AppConfig
): TrendCandidate[] {
  const { includeKeywords, excludeKeywords } = config.topic.filter;

  return candidates.filter((c) => {
    const name = c.name;
    if (excludeKeywords.length > 0 && matchesKeyword(name, excludeKeywords)) {
      return false;
    }
    if (includeKeywords.length > 0 && !matchesKeyword(name, includeKeywords)) {
      return false;
    }
    return true;
  });
}
