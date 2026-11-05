import path from "node:path";
import { ProfileStore } from "./persistence/ProfileStore";

const databasePath =
  process.env.DATABASE_PATH ??
  path.join(process.cwd(), "data", "vibe-militia.sqlite");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target =
  process.argv[2] ??
  path.join(process.cwd(), "backups", `vibe-militia-${stamp}.sqlite`);

const store = new ProfileStore(databasePath);
try {
  store.backup(target);
  console.log(`Backup written to ${path.resolve(target)}`);
} finally {
  store.close();
}
