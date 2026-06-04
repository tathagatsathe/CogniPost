import type { AppConfig } from "../config/types.js";

const URL_REGEX = /https?:\/\/\S+/i;

export interface RuleResult {
  passed: boolean;
  score: number;
  reasons: string[];
}

export function checkHardRules(
  text: string,
  config: AppConfig,
  recentPosts: string[]
): RuleResult {
  const reasons: string[] = [];
  let passed = true;

  if (text.length > 280) {
    passed = false;
    reasons.push(`Too long: ${text.length}/280 chars`);
  }

  if (!config.posting.allowUrls && URL_REGEX.test(text)) {
    passed = false;
    reasons.push("Contains URL but allowUrls is false");
  }

  const blocklist = config.topic.filter.excludeKeywords;
  const lower = text.toLowerCase();
  for (const word of blocklist) {
    if (word && lower.includes(word.toLowerCase())) {
      passed = false;
      reasons.push(`Contains blocklisted word: ${word}`);
    }
  }

  for (const recent of recentPosts) {
    const na = normalize(recent);
    const nb = normalize(text);
    if (na === nb) {
      passed = false;
      reasons.push("Duplicate of a recent post");
      break;
    }
    if (jaccardSimilarity(na, nb) > 0.75) {
      passed = false;
      reasons.push("Too similar to a recent post");
      break;
    }
  }

  return { passed, score: passed ? 0 : -1000, reasons };
}

export function scoreSoftRules(text: string): RuleResult {
  const reasons: string[] = [];
  let score = 0;

  const len = text.length;
  if (len >= 180 && len <= 260) {
    score += 15;
    reasons.push("Length in sweet spot (180-260)");
  } else if (len >= 100 && len < 180) {
    score += 5;
    reasons.push("Acceptable length");
  } else if (len > 260 && len <= 280) {
    score += 3;
    reasons.push("Near max length");
  }

  const hashtagCount = (text.match(/#\w+/g) ?? []).length;
  if (hashtagCount >= 1 && hashtagCount <= 2) {
    score += 10;
    reasons.push("Hashtag count optimal (1-2)");
  } else if (hashtagCount > 2) {
    score -= 10;
    reasons.push("Too many hashtags");
  }

  const hook = text.slice(0, 50);
  if (hook.length >= 20 && !hook.endsWith("?")) {
    score += 8;
    reasons.push("Strong hook opener");
  }

  const sentences = text.split(/[.!?]+/).filter(Boolean);
  if (sentences.length <= 2) {
    score += 5;
    reasons.push("Concise structure");
  }

  if (!text.toLowerCase().includes("thread")) {
    score += 3;
  }

  const mentionCount = (text.match(/@\w+/g) ?? []).length;
  if (mentionCount > 2) {
    score -= 8;
    reasons.push("Too many @mentions");
  }

  return { passed: true, score, reasons };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function appendHashtags(
  body: string,
  hashtags: string[],
  maxLen = 280
): string {
  if (hashtags.length === 0) return body.trim();

  const unique = [...new Set(hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)))];
  let result = body.trim();

  for (const tag of unique) {
    const candidate = `${result} ${tag}`.trim();
    if (candidate.length <= maxLen) {
      result = candidate;
    }
  }

  return result;
}
