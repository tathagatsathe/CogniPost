import type { AppConfig } from "../config/types.js";
import { log } from "./logger.js";

export function checkPreferredHour(config: AppConfig): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.schedule.timezone,
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);
  const preferred = config.schedule.preferredHourLocal;
  const inWindow = Math.abs(hour - preferred) <= 1;

  if (!inWindow) {
    log("warn", "Outside preferred posting window", {
      currentHourLocal: hour,
      preferredHour: preferred,
      timezone: config.schedule.timezone,
    });
  }

  return inWindow;
}

export function todaySeed(): string {
  return new Date().toISOString().slice(0, 10);
}
