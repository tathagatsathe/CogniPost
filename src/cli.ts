#!/usr/bin/env node
import { Command } from "commander";
import { runPostPipeline } from "./pipeline/post.js";
import { runXAuth } from "./x/auth.js";
import { log } from "./utils/logger.js";

const program = new Command();

program
  .name("cognipost")
  .description("Automated daily AI fact tweets on X with reach optimization")
  .version("1.0.0");

program
  .command("post")
  .description("Run the full post pipeline (trend → generate → optimize → post)")
  .option("--dry-run", "Generate and score without posting to X")
  .option("--force", "Use non-deterministic topic selection (new topic on rerun)")
  .action(async (opts: { dryRun?: boolean; force?: boolean }) => {
    try {
      await runPostPipeline({
        dryRun: opts.dryRun,
        force: opts.force,
      });
      process.exit(0);
    } catch (err) {
      log("error", "Pipeline failed", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      process.exit(1);
    }
  });

program
  .command("auth:x")
  .description("Run OAuth 2.0 PKCE flow to obtain X access tokens")
  .action(async () => {
    try {
      await runXAuth();
      process.exit(0);
    } catch (err) {
      log("error", "X auth failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  });

program.parse();
