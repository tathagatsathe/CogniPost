export type LogLevel = "info" | "warn" | "error" | "debug";

export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
