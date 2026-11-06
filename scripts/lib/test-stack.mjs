/**
 * Boots a disposable local stack for browser suites: the Colyseus server on an
 * internal port, a latency proxy in front of it, and `next start`.
 *
 * The frontend must be built with NEXT_PUBLIC_GAME_SERVER_URL pointing at the
 * proxy port (see scripts/build-test-frontend.mjs). SQLite is forced so that
 * no suite can write synthetic data into a Neon database by accident.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startLatencyProxy } from "./latency-proxy.mjs";

export const TEST_PORTS = { web: 3211, proxy: 3212, game: 3213 };

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function launch(command, args, env) {
  const child = spawn(command, args, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    windowsHide: true,
  });
  child.logs = [];
  const keep = (data) => {
    child.logs.push(String(data));
    if (child.logs.length > 400) child.logs.shift();
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  return child;
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
}

export async function startStack({
  rttMs = 0,
  jitterMs = 0,
  countdownMs = 1500,
  reconnectGraceSeconds = 30,
  testHooks = true,
} = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "vibe-militia-stack-"));
  const baseEnv = { ...process.env };
  delete baseEnv.TEST_DATABASE_URL;
  const gameEnv = {
    ...baseEnv,
    NODE_ENV: "development",
    PORT: String(TEST_PORTS.game),
    HOST: "127.0.0.1",
    // Blank overrides .env.local so the suite can never reach Neon.
    DATABASE_URL: "",
    DATABASE_PATH: path.join(dataDir, "suite.sqlite"),
    MATCH_COUNTDOWN_MS: String(countdownMs),
    RECONNECT_GRACE_SECONDS: String(reconnectGraceSeconds),
    XP_MIN_PARTICIPATION_MS: "1000",
    ALLOWED_ORIGINS: `http://localhost:${TEST_PORTS.web},http://127.0.0.1:${TEST_PORTS.web}`,
    ...(testHooks ? { VIBE_MILITIA_TEST_HOOKS: "1" } : {}),
  };
  const game = launch("npx", ["tsx", "server/index.ts"], gameEnv);
  const proxy = await startLatencyProxy({
    listenPort: TEST_PORTS.proxy,
    targetPort: TEST_PORTS.game,
    rttMs,
    jitterMs,
  });
  const web = launch("npx", ["next", "start", "-p", String(TEST_PORTS.web)], {
    ...baseEnv,
    NODE_ENV: "production",
  });
  try {
    await waitForUrl(`http://127.0.0.1:${TEST_PORTS.game}/health`);
    await waitForUrl(`http://localhost:${TEST_PORTS.web}/`);
  } catch (error) {
    console.error("GAME LOG", game.logs.join("").slice(-2000));
    console.error("WEB LOG", web.logs.join("").slice(-2000));
    killTree(game);
    killTree(web);
    await proxy.close();
    throw error;
  }
  return {
    baseUrl: `http://localhost:${TEST_PORTS.web}`,
    proxy,
    game,
    web,
    async stop() {
      killTree(game);
      killTree(web);
      await proxy.close();
      await new Promise((resolve) => setTimeout(resolve, 600));
      try {
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Windows can hold the SQLite handle briefly. The folder is in temp.
      }
    },
  };
}
