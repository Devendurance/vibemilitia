type LogValue = string | number | boolean | null | undefined;

function serialize(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, LogValue>,
): string {
  return JSON.stringify({
    at: new Date().toISOString(),
    level,
    service: "vibe-militia-server",
    message,
    ...fields,
  });
}

export const log = {
  info(message: string, fields: Record<string, LogValue> = {}): void {
    console.log(serialize("info", message, fields));
  },
  warn(message: string, fields: Record<string, LogValue> = {}): void {
    console.warn(serialize("warn", message, fields));
  },
  error(message: string, fields: Record<string, LogValue> = {}): void {
    console.error(serialize("error", message, fields));
  },
};
