import googleTrends from "google-trends-api";
import type { TrendCandidate } from "./types.js";
import { log } from "../utils/logger.js";

const RSS_GEO: Record<string, string> = {
  US: "US",
  GB: "GB",
  IN: "IN",
  AU: "AU",
  CA: "CA",
};

function parseRssTitles(xml: string): string[] {
  const titles: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch?.[1]?.trim();
    if (title && title.toLowerCase() !== "daily search trends") {
      titles.push(title);
    }
  }

  return titles;
}

async function fetchGoogleTrendsRss(geo = "US"): Promise<TrendCandidate[]> {
  const geoCode = RSS_GEO[geo] ?? geo;
  const url = `https://trends.google.com/trending/rss?geo=${geoCode}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CogniPost/1.0",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Google Trends RSS HTTP ${res.status}`);
  }

  const xml = await res.text();
  if (xml.trimStart().startsWith("<!")) {
    throw new Error("Google Trends RSS returned HTML instead of XML");
  }

  return parseRssTitles(xml).slice(0, 20).map((name) => {
    const tag = name.replace(/[^a-zA-Z0-9]/g, "");
    return {
      name,
      source: "google" as const,
      hashtags: tag ? [`#${tag}`] : [],
    };
  });
}

async function fetchGoogleTrendsApi(geo = "US"): Promise<TrendCandidate[]> {
  const raw = await googleTrends.dailyTrends({ geo });
  const parsed = JSON.parse(raw) as {
    default?: {
      trendingSearchesDays?: Array<{
        trendingSearches?: Array<{
          title?: { query?: string };
        }>;
      }>;
    };
  };

  const days = parsed.default?.trendingSearchesDays ?? [];
  const today = days[0]?.trendingSearches ?? [];

  return today.slice(0, 20).map((item) => {
    const name = item.title?.query ?? "unknown";
    const tag = name.replace(/\s+/g, "");
    return {
      name,
      source: "google" as const,
      hashtags: [`#${tag}`],
    };
  });
}

export async function fetchGoogleTrends(
  geo = "US"
): Promise<TrendCandidate[]> {
  try {
    const rss = await fetchGoogleTrendsRss(geo);
    if (rss.length > 0) {
      log("info", "Fetched Google Trends via RSS", { count: rss.length });
      return rss;
    }
  } catch (err) {
    log("warn", "Google Trends RSS failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const api = await fetchGoogleTrendsApi(geo);
    if (api.length > 0) {
      log("info", "Fetched Google Trends via API package", { count: api.length });
      return api;
    }
  } catch (err) {
    log("warn", "Google Trends API package failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return [];
}
