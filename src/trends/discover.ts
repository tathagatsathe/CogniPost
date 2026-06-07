import type { AppConfig } from "../config/types.js";
import type { EnvConfig } from "../config/types.js";
import { filterTrends } from "./filter.js";
import { fetchXTrends } from "./x-trends.js";
import { fetchGoogleTrends } from "./google-trends.js";
import { pickDeterministic } from "../utils/hash.js";
import { todaySeed } from "../utils/schedule.js";
import { log } from "../utils/logger.js";
import type { TrendCandidate } from "./types.js";

export interface SelectedTopic {
  topic: string;
  hashtags: string[];
  source: TrendCandidate["source"] | "manual" | "fallback";
}

function fallbackCandidates(config: AppConfig): TrendCandidate[] {
  return config.topic.fallbackTopics.map((name) => ({
    name,
    source: "google" as const,
    hashtags: [],
  }));
}

function selectFromPool(
  pool: TrendCandidate[],
  config: AppConfig,
  seed: string
): TrendCandidate | undefined {
  const filtered = filterTrends(pool, config);
  if (filtered.length > 0) {
    return pickDeterministic(filtered, seed);
  }

  const hasFilters =
    config.topic.filter.includeKeywords.length > 0 ||
    config.topic.filter.excludeKeywords.length > 0;

  if (pool.length > 0 && hasFilters) {
    log("warn", "No topics matched filters; using fallbackTopics", {
      poolSize: pool.length,
      includeKeywords: config.topic.filter.includeKeywords,
      excludeKeywords: config.topic.filter.excludeKeywords,
    });
    return undefined;
  }

  return pickDeterministic(pool, seed);
}

export async function discoverTopic(
  config: AppConfig,
  env: EnvConfig,
  options?: { force?: boolean }
): Promise<SelectedTopic> {
  if (config.topic.mode === "manual") {
    const topic = config.topic.manualTopic.trim();
    if (!topic) throw new Error("manualTopic is empty but mode is manual");
    return { topic, hashtags: [], source: "manual" };
  }

  const allCandidates: TrendCandidate[] = [];

  for (const source of config.topic.sources) {
    if (source === "x") {
      const xTrends = await fetchXTrends(env, config);
      allCandidates.push(...xTrends);
    }
    if (source === "google") {
      const googleTrends = await fetchGoogleTrends();
      allCandidates.push(...googleTrends);
    }
  }

  const seed = options?.force
    ? `${todaySeed()}-${Date.now()}`
    : todaySeed();

  let pool = allCandidates;
  let sourceLabel: SelectedTopic["source"] = "google";

  if (pool.length === 0) {
    log("warn", "All trend sources returned empty; using fallbackTopics");
    pool = fallbackCandidates(config);
    sourceLabel = "fallback";
  }

  let picked = selectFromPool(pool, config, seed);

  if (!picked && config.topic.mode === "hybrid") {
    const manual = config.topic.manualTopic.trim();
    if (manual) {
      log("warn", "No trending topic matched filter; using manualTopic");
      return { topic: manual, hashtags: [], source: "manual" };
    }
  }

  if (!picked) {
    const manual = config.topic.manualTopic.trim();
    if (manual) {
      log("warn", "Using manualTopic as last resort");
      return { topic: manual, hashtags: [], source: "manual" };
    }

    picked = pickDeterministic(fallbackCandidates(config), seed);
    sourceLabel = "fallback";
  }

  if (!picked) {
    throw new Error(
      "No trending topics available. Check network, config/local.yaml, or set topic.mode: manual"
    );
  }

  const maxTags = config.topic.filter.maxHashtagsFromTrend;
  const hashtags = (picked.hashtags ?? []).slice(0, maxTags);
  const resolvedSource =
    sourceLabel === "fallback"
      ? "fallback"
      : picked.source;

  log("info", "Selected topic", {
    topic: picked.name,
    source: resolvedSource,
    hashtags,
  });

  return {
    topic: picked.name,
    hashtags,
    source: resolvedSource,
  };
}
