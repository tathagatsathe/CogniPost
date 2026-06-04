import { TwitterApi } from "twitter-api-v2";
import type { TweetV2 } from "twitter-api-v2";
import type { AppConfig } from "../config/types.js";
import type { EnvConfig } from "../config/types.js";
import type { TrendCandidate } from "./types.js";
import { log } from "../utils/logger.js";

const DEFAULT_QUERY = "(AI OR tech OR science OR news)";
const HASHTAG_REGEX = /#(\w{2,50})/g;

/** Operators that work on x.com but return 400 from API v2 search */
const UNSUPPORTED_QUERY_OPERATORS = [
  /min_faves:\d+/i,
  /min_retweets:\d+/i,
  /min_replies:\d+/i,
  /lang:\w+/i,
  /-?is:retweet/i,
  /has:hashtags/i,
];

function getAccessToken(env: EnvConfig): string | undefined {
  return env.xAccessToken || env.xAccessTokenOAuth1;
}

function sanitizeQuery(query: string): string {
  let sanitized = query;
  for (const pattern of UNSUPPORTED_QUERY_OPERATORS) {
    if (pattern.test(sanitized)) {
      log("warn", "Removed unsupported X search operator (use topic.xSearch.minLikes instead)", {
        operator: pattern.source,
      });
      sanitized = sanitized.replace(pattern, "").trim();
    }
  }
  return sanitized.replace(/\s+/g, " ").trim() || DEFAULT_QUERY;
}

function extractHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_REGEX)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function topicFromTweetText(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 80) return cleaned;
  const slice = cleaned.slice(0, 80);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim();
}

function tweetsToCandidates(
  tweets: TweetV2[],
  query: string,
  maxResults: number
): TrendCandidate[] {
  const tagScores = new Map<string, { score: number; maxLikes: number }>();
  const textTopics: Array<{ name: string; score: number; maxLikes: number }> =
    [];

  for (const tweet of tweets) {
    const text = tweet.text ?? "";
    const likes = tweet.public_metrics?.like_count ?? 0;
    const retweets = tweet.public_metrics?.retweet_count ?? 0;
    const engagement = likes + retweets * 2;

    for (const tag of extractHashtags(text)) {
      const prev = tagScores.get(tag) ?? { score: 0, maxLikes: 0 };
      tagScores.set(tag, {
        score: prev.score + engagement,
        maxLikes: Math.max(prev.maxLikes, likes),
      });
    }

    const topicName = topicFromTweetText(text);
    if (topicName.length >= 12) {
      textTopics.push({ name: topicName, score: engagement, maxLikes: likes });
    }
  }

  const fromHashtags: TrendCandidate[] = [...tagScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 25)
    .map(([tag, meta]) => ({
      name: tag,
      source: "x" as const,
      hashtags: [`#${tag}`],
      tweetVolume: meta.maxLikes,
    }));

  if (fromHashtags.length > 0) {
    log("info", "Fetched X trends via v2 search", {
      query,
      count: fromHashtags.length,
      tweetsAnalyzed: tweets.length,
      maxResults,
    });
    return fromHashtags;
  }

  const fromText: TrendCandidate[] = textTopics
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((t) => ({
      name: t.name,
      source: "x" as const,
      hashtags: [],
      tweetVolume: t.maxLikes,
    }));

  if (fromText.length > 0) {
    log("info", "Fetched X topics from tweet text (no hashtags)", {
      query,
      count: fromText.length,
      tweetsAnalyzed: tweets.length,
    });
    return fromText;
  }

  return [];
}

/**
 * Discovers trending topics via X API v2 recent search.
 * Engagement filters (min_faves, etc.) must be applied client-side — not in the query string.
 * @see https://api.x.com/2/tweets/search/recent
 */
export async function fetchXTrends(
  env: EnvConfig,
  config: AppConfig
): Promise<TrendCandidate[]> {
  const token = getAccessToken(env);
  if (!token) {
    log("warn", "X trends skipped: no access token (set X_ACCESS_TOKEN)");
    return [];
  }

  const rawQuery = config.topic.xSearch.query.trim() || DEFAULT_QUERY;
  const query = sanitizeQuery(rawQuery);
  const maxResults = Math.min(Math.max(config.topic.xSearch.maxResults, 10), 100);
  const minLikes = config.topic.xSearch.minLikes;
  const langFilter = config.topic.xSearch.langFilter;

  try {
    const client = new TwitterApi(token);
    const search = await client.v2.search(query, {
      max_results: maxResults,
      sort_order: "relevancy",
      "tweet.fields": ["public_metrics", "lang"],
    });

    const fetched: TweetV2[] = [];
    for await (const tweet of search) {
      fetched.push(tweet);
    }

    let filtered = fetched;
    if (langFilter) {
      filtered = filtered.filter((t) => !t.lang || t.lang === "en");
    }
    if (minLikes > 0) {
      filtered = filtered.filter(
        (t) => (t.public_metrics?.like_count ?? 0) >= minLikes
      );
    }

    log("info", "X v2 search results", {
      query,
      fetched: fetched.length,
      afterMinLikesFilter: filtered.length,
      minLikes,
    });

    const candidates = tweetsToCandidates(filtered, query, maxResults);

    if (candidates.length === 0 && fetched.length > 0 && minLikes > 0) {
      log("warn", "No tweets met minLikes threshold; retrying without like filter", {
        minLikes,
      });
      return tweetsToCandidates(fetched, query, maxResults);
    }

    if (candidates.length === 0) {
      log("warn", "X v2 search returned no usable topics", { query });
    }

    return candidates;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let hint: string | undefined;
    if (message.includes("402")) {
      hint = "X API returned 402 Payment Required — add credits at developer.x.com";
    } else if (message.includes("400")) {
      hint =
        "Invalid search query. Do not use min_faves/min_retweets in the query — set topic.xSearch.minLikes instead.";
    }
    log("warn", "X v2 search failed", { query, error: message, hint });
    return [];
  }
}
