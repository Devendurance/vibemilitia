import { existsSync } from "node:fs";

// Local development convenience. Production platforms inject environment
// variables directly and do not ship this file. Shell-provided values win over
// .env.local so a command such as DATABASE_URL='' DATABASE_PATH=... can never
// silently target the production database.
if (existsSync(".env.local")) {
  const preserved = new Map(Object.entries(process.env));
  process.loadEnvFile(".env.local");
  for (const [key, value] of preserved) {
    if (value !== undefined) process.env[key] = value;
  }
}
