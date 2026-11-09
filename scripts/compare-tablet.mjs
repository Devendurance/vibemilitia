/**
 * Prints tablet benchmark results as medians per device, mode and GPU, and a
 * before/after comparison when two labels are given.
 *
 *   node scripts/compare-tablet.mjs tablet-before tablet-after
 *
 * scripts/ab-tablet.sh alternates two builds round by round, so load from other
 * programs on the machine lands on both sides equally.
 */
import { existsSync, readFileSync } from "node:fs";

/** A label can be a comma list, so interleaved rounds pool into one median. */
const load = (labels) =>
  (labels ?? "").split(",").filter(Boolean).flatMap((label) => {
    const path = `artifacts/playability/${label}.json`;
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).runs.filter((run) => !run.failed) : [];
  });
const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const group = (runs) => {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.tablet} ${run.mode} ${run.gpu} cpu${run.cpuThrottle}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return groups;
};
const summarize = (runs) => ({
  n: runs.length,
  fps: median(runs.map((run) => run.fps)),
  low: median(runs.map((run) => run.onePercentLowFps)),
  p95: median(runs.map((run) => run.p95Ms)),
  p99: median(runs.map((run) => run.p99Ms)),
  task: median(runs.map((run) => run.mainThreadMsPerSecond.task)),
  script: median(runs.map((run) => run.mainThreadMsPerSecond.script)),
  scale: median(runs.map((run) => run.renderScale)),
  changes: median(runs.map((run) => Math.max(0, (run.scaleEvents?.length ?? 1) - 1))),
  particles: median(runs.map((run) => run.load.particlesPeak)),
});
const cell = (entry) =>
  entry
    ? `${entry.fps}fps low ${entry.low} p95 ${entry.p95} p99 ${entry.p99} task ${entry.task} x${entry.scale} ${entry.changes}chg ${entry.particles}pt (n${entry.n})`
    : "-";

const [firstLabel, secondLabel] = process.argv.slice(2);
const first = group(load(firstLabel));
const second = secondLabel ? group(load(secondLabel)) : new Map();
for (const key of new Set([...first.keys(), ...second.keys()])) {
  const before = first.has(key) ? summarize(first.get(key)) : null;
  const after = second.has(key) ? summarize(second.get(key)) : null;
  console.log(key.padEnd(34), cell(before));
  if (secondLabel) console.log("".padEnd(34), cell(after));
}
