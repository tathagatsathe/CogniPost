import type { AppConfig } from "../config/types.js";
import { LlmClient } from "../llm/client.js";
import { log } from "../utils/logger.js";
import { parseJsonFromLlm } from "../llm/parse-json.js";

export interface FactDraft {
  text: string;
  confidence: number;
}

interface GenerateResponse {
  drafts: Array<{ text: string; confidence: number }>;
}

export async function generateFactDrafts(
  llm: LlmClient,
  config: AppConfig,
  topic: string
): Promise<FactDraft[]> {
  const count = config.content.drafts;

  const system = `You write engaging, accurate one-line facts for X (Twitter).
Rules:
- Each fact must be about the given topic: "${topic}"
- Style: ${config.content.style}
- No hashtags in the body text
- No URLs
- Max 240 characters per draft (hashtags added later)
- Facts should sound verifiable and widely cited; avoid obscure claims
- Assign confidence 0-1: how confident you are the fact is accurate and not fabricated
- Return JSON only: { "drafts": [{ "text": string, "confidence": number }] }`;

  const user = `Generate exactly ${count} unique fact tweet drafts about: ${topic}`;

  const raw = await llm.complete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.8, json: true }
  );

  let parsed: GenerateResponse;
  try {
    parsed = parseJsonFromLlm<GenerateResponse>(raw);
  } catch {
    log("error", "Failed to parse LLM JSON", { raw: raw.slice(0, 200) });
    throw new Error("LLM returned invalid JSON for fact drafts");
  }

  const drafts = (parsed.drafts ?? [])
    .filter((d) => d.text && d.text.trim().length > 0)
    .map((d) => ({
      text: d.text.trim(),
      confidence: typeof d.confidence === "number" ? d.confidence : 0.5,
    }));

  if (drafts.length === 0) {
    throw new Error("LLM produced no valid drafts");
  }

  log("info", "Generated fact drafts", { count: drafts.length });
  return drafts;
}

export async function verifyFactPlausibility(
  llm: LlmClient,
  text: string,
  topic: string
): Promise<{ ok: boolean; confidence: number; reason: string }> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content: `You verify tweet facts. Return JSON only: { "ok": boolean, "confidence": number, "reason": string }
Reject (ok:false) if the fact seems fabricated, unverifiable, or off-topic for "${topic}".`,
      },
      { role: "user", content: `Verify this fact tweet: "${text}"` },
    ],
    { temperature: 0.2, json: true }
  );

  try {
    const result = parseJsonFromLlm<{
      ok?: boolean;
      confidence?: number;
      reason?: string;
    }>(raw);
    return {
      ok: Boolean(result.ok),
      confidence: result.confidence ?? 0,
      reason: result.reason ?? "",
    };
  } catch {
    return { ok: true, confidence: 0.5, reason: "parse fallback" };
  }
}
