import type { AppConfig } from "../config/types.js";
import type { FactDraft } from "../content/generate-facts.js";
import { LlmClient } from "../llm/client.js";
import { verifyFactPlausibility } from "../content/generate-facts.js";
import {
  checkHardRules,
  scoreSoftRules,
  appendHashtags,
} from "./rules.js";
import { log } from "../utils/logger.js";
import { parseJsonFromLlm } from "../llm/parse-json.js";

export interface ScoredTweet {
  text: string;
  totalScore: number;
  reasons: string[];
}

interface JudgeResponse {
  rankings: Array<{
    index: number;
    score: number;
    reason: string;
  }>;
}

const MIN_CONFIDENCE = 0.6;

export async function selectBestTweet(
  llm: LlmClient,
  config: AppConfig,
  drafts: FactDraft[],
  hashtags: string[],
  recentPosts: string[],
  topic: string
): Promise<ScoredTweet> {
  const survivors: Array<{
    text: string;
    ruleScore: number;
    reasons: string[];
    draftConfidence: number;
  }> = [];

  for (const draft of drafts) {
    const withTags = appendHashtags(draft.text, hashtags);
    const hard = checkHardRules(withTags, config, recentPosts);

    if (!hard.passed) {
      log("debug", "Draft failed hard rules", {
        text: withTags.slice(0, 80),
        reasons: hard.reasons,
      });
      continue;
    }

    if (draft.confidence < MIN_CONFIDENCE) {
      const verify = await verifyFactPlausibility(llm, draft.text, topic);
      if (!verify.ok || verify.confidence < MIN_CONFIDENCE) {
        log("debug", "Draft failed plausibility", {
          text: draft.text.slice(0, 80),
          reason: verify.reason,
        });
        continue;
      }
    }

    const soft = scoreSoftRules(withTags);
    survivors.push({
      text: withTags,
      ruleScore: soft.score,
      reasons: [...hard.reasons, ...soft.reasons],
      draftConfidence: draft.confidence,
    });
  }

  if (survivors.length === 0) {
    throw new Error("No drafts passed optimization gates");
  }

  survivors.sort(
    (a, b) =>
      b.ruleScore +
      b.draftConfidence * 10 -
      (a.ruleScore + a.draftConfidence * 10)
  );

  const top = survivors.slice(0, 3);

  if (top.length === 1) {
    return {
      text: top[0].text,
      totalScore: top[0].ruleScore,
      reasons: top[0].reasons,
    };
  }

  const judgePrompt = top
    .map((t, i) => `${i}: "${t.text}"`)
    .join("\n");

  const raw = await llm.complete(
    [
      {
        role: "system",
        content: `You judge X tweets for maximum engagement (views). Score 0-100 per tweet.
Criteria: hook strength in first 50 chars, curiosity, specificity, readability, no spam.
Return JSON: { "rankings": [{ "index": number, "score": number, "reason": string }] }`,
      },
      {
        role: "user",
        content: `Rank these tweets for engagement:\n${judgePrompt}`,
      },
    ],
    { temperature: 0.3, json: true }
  );

  let judge: JudgeResponse = { rankings: [] };
  try {
    judge = parseJsonFromLlm<JudgeResponse>(raw);
  } catch {
    log("warn", "LLM judge parse failed; using rule scores only");
  }

  let bestIdx = 0;
  let bestCombined = -Infinity;

  for (let i = 0; i < top.length; i++) {
    const judgeScore =
      judge.rankings.find((r) => r.index === i)?.score ?? 50;
    const combined = top[i].ruleScore + judgeScore + top[i].draftConfidence * 10;
    if (combined > bestCombined) {
      bestCombined = combined;
      bestIdx = i;
    }
  }

  const winner = top[bestIdx];
  const judgeReason =
    judge.rankings.find((r) => r.index === bestIdx)?.reason ?? "";

  return {
    text: winner.text,
    totalScore: bestCombined,
    reasons: [...winner.reasons, judgeReason].filter(Boolean),
  };
}
