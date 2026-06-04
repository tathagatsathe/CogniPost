import { loadAppConfig, loadEnvConfig } from "../config/load-config.js";
import { discoverTopic } from "../trends/discover.js";
import { LlmClient, hasLlmCredentials } from "../llm/client.js";
import { generateFactDrafts } from "../content/generate-facts.js";
import { selectBestTweet } from "../optimize/score-tweet.js";
import { XClient, hasXCredentials } from "../x/client.js";
import {
  getRecentTextsFromHistory,
  saveToHistory,
} from "../storage/post-history.js";
import { checkPreferredHour } from "../utils/schedule.js";
import { log } from "../utils/logger.js";

export interface PostOptions {
  dryRun?: boolean;
  force?: boolean;
}

export async function runPostPipeline(options: PostOptions = {}): Promise<void> {
  const config = loadAppConfig({ dryRun: options.dryRun });
  const env = loadEnvConfig();
  const dryRun = options.dryRun ?? config.posting.dryRun;

  if (!hasLlmCredentials(env)) {
    throw new Error("LLM API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY");
  }

  checkPreferredHour(config);

  const { topic, hashtags, source } = await discoverTopic(config, env, {
    force: options.force,
  });

  const llm = new LlmClient(env);
  const drafts = await generateFactDrafts(llm, config, topic);

  let recentPosts = getRecentTextsFromHistory(30);

  if (!dryRun && hasXCredentials(env)) {
    try {
      const xClient = new XClient(env);
      const fromX = await xClient.getRecentTweets(30);
      recentPosts = [...new Set([...fromX, ...recentPosts])];
    } catch (err) {
      log("warn", "Could not fetch recent tweets from X for dedup", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const winner = await selectBestTweet(
    llm,
    config,
    drafts,
    hashtags,
    recentPosts,
    topic
  );

  log("info", "Selected winning tweet", {
    topic,
    source,
    score: winner.totalScore,
    reasons: winner.reasons,
    text: winner.text,
    dryRun,
  });

  if (dryRun) {
    console.log("\n--- DRY RUN: Would post ---\n");
    console.log(winner.text);
    console.log("\n---------------------------\n");
    return;
  }

  if (!hasXCredentials(env)) {
    throw new Error("X credentials not configured for live posting");
  }

  const xClient = new XClient(env);
  const posted = await xClient.postTweet(winner.text);

  saveToHistory({
    id: posted.id,
    text: posted.text,
    topic,
    postedAt: new Date().toISOString(),
    score: winner.totalScore,
  });

  log("info", "Pipeline complete", { tweetId: posted.id });
}
