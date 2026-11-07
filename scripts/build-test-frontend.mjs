/** Builds the frontend so the browser reaches the game server through the test latency proxy. */
import { spawnSync } from "node:child_process";
import { TEST_PORTS } from "./lib/test-stack.mjs";

const result = spawnSync("npx", ["next", "build"], {
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_GAME_SERVER_URL: `http://localhost:${TEST_PORTS.proxy}`,
  },
});
process.exit(result.status ?? 1);
