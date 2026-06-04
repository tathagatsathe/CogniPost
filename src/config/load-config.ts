import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import { ConfigSchema, type AppConfig, type EnvConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

const RETIRED_ANTHROPIC_MODELS: Record<string, string> = {
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "claude-3-7-sonnet-20250219": "claude-sonnet-4-6",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-20250514": "claude-opus-4-6",
};

function resolveAnthropicModel(requested?: string): string {
  const model = requested?.trim() || "claude-haiku-4-5";
  return RETIRED_ANTHROPIC_MODELS[model] ?? model;
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>
): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key];
    if (
      val !== undefined &&
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val) &&
      typeof base[key] === "object" &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(
        base[key] as Record<string, unknown>,
        val as Record<string, unknown>
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}

export function loadAppConfig(overrides?: {
  dryRun?: boolean;
}): AppConfig {
  loadDotenv({ path: resolve(projectRoot, ".env") });

  const defaultPath = resolve(projectRoot, "config/default.yaml");
  const localPath =
    process.env.CONFIG_PATH ?? resolve(projectRoot, "config/local.yaml");

  const defaultRaw = parseYaml(readFileSync(defaultPath, "utf8")) as Record<
    string,
    unknown
  >;
  let merged = defaultRaw;

  if (existsSync(localPath)) {
    const localRaw = parseYaml(readFileSync(localPath, "utf8")) as Record<
      string,
      unknown
    >;
    merged = deepMerge(defaultRaw, localRaw);
  }

  if (overrides?.dryRun !== undefined) {
    merged = deepMerge(merged, {
      posting: { ...(merged.posting as object), dryRun: overrides.dryRun },
    });
  }

  return ConfigSchema.parse(merged);
}

export function loadEnvConfig(): EnvConfig {
  loadDotenv({ path: resolve(projectRoot, ".env") });

  const rawProvider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase().trim();
  const provider = (rawProvider === "anthropic" ? "anthropic" : "openai") as
    | "openai"
    | "anthropic";

  return {
    xClientId: process.env.X_CLIENT_ID ?? "",
    xClientSecret: process.env.X_CLIENT_SECRET ?? "",
    xAccessToken: process.env.X_ACCESS_TOKEN ?? "",
    xRefreshToken: process.env.X_REFRESH_TOKEN ?? "",
    xApiKey: process.env.X_API_KEY,
    xApiSecret: process.env.X_API_SECRET,
    xAccessTokenOAuth1: process.env.X_ACCESS_TOKEN_OAUTH1,
    xAccessSecret: process.env.X_ACCESS_SECRET,
    llmProvider: provider,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    anthropicModel: resolveAnthropicModel(process.env.ANTHROPIC_MODEL),
  };
}

export function getProjectRoot(): string {
  return projectRoot;
}
