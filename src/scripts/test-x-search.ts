#!/usr/bin/env node
/**
 * Quick test for X v2 search trends (same query as: xurl search "min_faves:100 lang:en" -n)
 * Usage: npm run test:x-search
 */
import { loadAppConfig, loadEnvConfig } from "../config/load-config.js";
import { fetchXTrends } from "../trends/x-trends.js";

const config = loadAppConfig();
const env = loadEnvConfig();

console.log("Query:", config.topic.xSearch.query);
console.log("Min likes (client-side):", config.topic.xSearch.minLikes);
console.log("Lang filter (en):", config.topic.xSearch.langFilter);
console.log("Max results:", config.topic.xSearch.maxResults);
const trends = await fetchXTrends(env, config);
console.log(`Found ${trends.length} topics:\n`);
for (const t of trends.slice(0, 10)) {
  console.log(
    `- ${t.name} (likes peak: ${t.tweetVolume ?? "n/a"}) ${t.hashtags?.join(" ") ?? ""}`
  );
}
process.exit(trends.length > 0 ? 0 : 1);
