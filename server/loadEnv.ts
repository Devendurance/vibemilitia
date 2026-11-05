import { existsSync } from "node:fs";

// Local development convenience. Production platforms inject environment
// variables directly and do not ship this file.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
