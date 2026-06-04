import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { EnvConfig } from "../config/types.js";
import { log } from "../utils/logger.js";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export class LlmClient {
  private openai?: OpenAI;
  private anthropic?: Anthropic;

  constructor(private env: EnvConfig) {
    if (env.llmProvider === "openai") {
      if (!env.openaiApiKey) {
        throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
      }
      this.openai = new OpenAI({ apiKey: env.openaiApiKey });
    } else {
      if (!env.anthropicApiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic"
        );
      }
      this.anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
      const requested = process.env.ANTHROPIC_MODEL?.trim();
      if (requested && env.anthropicModel !== requested) {
        log("warn", "Anthropic model was retired; using replacement", {
          requested,
          using: env.anthropicModel,
        });
      }
    }
  }

  async complete(
    messages: LlmMessage[],
    options?: { temperature?: number; json?: boolean }
  ): Promise<string> {
    const temperature = options?.temperature ?? 0.7;

    if (this.env.llmProvider === "openai" && this.openai) {
      const response = await this.openai.chat.completions.create({
        model: this.env.openaiModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature,
        ...(options?.json
          ? { response_format: { type: "json_object" as const } }
          : {}),
      });
      return response.choices[0]?.message?.content ?? "";
    }

    if (this.anthropic) {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const userMessages = messages.filter((m) => m.role === "user");
      const response = await this.anthropic.messages.create({
        model: this.env.anthropicModel,
        max_tokens: 2048,
        system,
        messages: userMessages.map((m) => ({
          role: "user" as const,
          content: m.content,
        })),
        temperature,
      });
      const block = response.content[0];
      return block?.type === "text" ? block.text : "";
    }

    throw new Error("No LLM client configured");
  }
}

export function hasLlmCredentials(env: EnvConfig): boolean {
  if (env.llmProvider === "openai") return Boolean(env.openaiApiKey);
  return Boolean(env.anthropicApiKey);
}
