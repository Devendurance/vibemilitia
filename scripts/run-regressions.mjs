/**
 * Runs the existing browser regression suites, each against its own disposable
 * stack with the server settings that suite documents. SQLite only.
 *
 *   node scripts/build-test-frontend.mjs
 *   node scripts/run-regressions.mjs [suite,suite]
 *
 * Results: artifacts/playability/regressions.json
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { startStack, TEST_PORTS } from "./lib/test-stack.mjs";

const SUITES = [
  ["verify-browser", { countdownMs: 0 }],
  ["verify-online-match", { countdownMs: 6000, reconnectGraceSeconds: 5 }],
  ["verify-online-pickups", { countdownMs: 0 }],
  ["verify-online-grenades", { countdownMs: 0 }],
  ["verify-online-stinking", { countdownMs: 0 }],
  ["verify-online-loot", { countdownMs: 0 }],
  ["verify-online-arsenal", { countdownMs: 0 }],
  ["verify-online-matchmaking", { countdownMs: 4000 }],
  ["verify-online-bots", { countdownMs: 0, reconnectGraceSeconds: 2 }],
  ["verify-online-characters", { countdownMs: 4000 }],
  ["verify-online-countdown", { countdownMs: 10000 }],
  ["verify-online-rooms", { countdownMs: 4000 }],
  ["verify-online-p4", { countdownMs: 4000, reconnectGraceSeconds: 5 }],
  ["verify-online-p5", { countdownMs: 0, reconnectGraceSeconds: 5 }],
  ["verify-hub-ux", { countdownMs: 4000, reconnectGraceSeconds: 30 }],
  ["verify-online-perf", { countdownMs: 0 }],
];

const wanted = process.argv[2]?.split(",");
mkdirSync("artifacts/playability", { recursive: true });
const summary = [];

const run = (name, baseUrl) =>
  new Promise((resolve) => {
    const child = spawn("node", [`scripts/${name}.mjs`], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        COLYSEUS_URL: `http://localhost:${TEST_PORTS.proxy}`,
        NEXT_PUBLIC_GAME_SERVER_URL: `http://localhost:${TEST_PORTS.proxy}`,
        ARTIFACT_DIR: `artifacts/playability/${name}`,
        SKIP_EXPIRY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const keep = (data) => {
      output += data;
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill(), 420_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

for (const [name, options] of SUITES) {
  if (wanted && !wanted.includes(name)) continue;
  mkdirSync(`artifacts/playability/${name}`, { recursive: true });
  const stack = await startStack(options);
  const started = Date.now();
  const { code, output } = await run(name, stack.baseUrl);
  await stack.stop();
  const lines = output.split("\n");
  const pass = lines.filter((line) => line.startsWith("PASS")).length;
  const fail = lines.filter((line) => line.startsWith("FAIL"));
  const entry = { name, code, pass, fail, seconds: Math.round((Date.now() - started) / 1000) };
  if (code !== 0 && fail.length === 0) entry.tail = lines.slice(-8);
  summary.push(entry);
  console.log(`${name}: ${code === 0 ? "ok" : "FAILED"} ${pass} passed, ${fail.length} failed, ${entry.seconds}s`);
  for (const line of fail) console.log(`   ${line.slice(0, 180)}`);
  if (entry.tail) console.log(entry.tail.join("\n").slice(-500));
  writeFileSync("artifacts/playability/regressions.json", JSON.stringify(summary, null, 2));
}
