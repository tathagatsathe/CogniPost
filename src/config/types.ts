import { z } from "zod";

export const ConfigSchema = z.object({
  topic: z.object({
    mode: z.enum(["trending", "manual", "hybrid"]),
    manualTopic: z.string(),
    hybridPrefer: z.enum(["trending", "manual"]),
    sources: z.array(z.enum(["x", "google"])),
    woeid: z.number().optional(),
    xSearch: z.object({
      query: z.string(),
      maxResults: z.number().min(10).max(100),
      minLikes: z.number().min(0),
      langFilter: z.boolean(),
    }),
    filter: z.object({
      includeKeywords: z.array(z.string()),
      excludeKeywords: z.array(z.string()),
      maxHashtagsFromTrend: z.number().min(0).max(5),
    }),
    fallbackTopics: z.array(z.string()).min(1),
  }),
  schedule: z.object({
    timezone: z.string(),
    preferredHourLocal: z.number().min(0).max(23),
  }),
  content: z.object({
    drafts: z.number().min(1).max(10),
    style: z.string(),
  }),
  posting: z.object({
    allowUrls: z.boolean(),
    dryRun: z.boolean(),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export interface EnvConfig {
  xClientId: string;
  xClientSecret: string;
  xAccessToken: string;
  xRefreshToken: string;
  xApiKey?: string;
  xApiSecret?: string;
  xAccessTokenOAuth1?: string;
  xAccessSecret?: string;
  llmProvider: "openai" | "anthropic";
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openaiModel: string;
  anthropicModel: string;
}
