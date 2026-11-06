/**
 * Measures the real public WSS path without a browser: RTT, jitter, snapshot
 * cadence and size, and socket closes.
 *
 * Joins a private room with no guest token, so there is no profile, no XP and
 * no leaderboard entry, then leaves cleanly.
 *
 *   SERVER=https://vibemilitia-game.endyos.xyz SECONDS=30 node scripts/probe-public-network.mjs
 */
import { Client } from "@colyseus/sdk";

const server = process.env.SERVER ?? "https://vibemilitia-game.endyos.xyz";
const seconds = Number(process.env.SECONDS ?? 30);
const netProtocol = process.env.PROTOCOL ? Number(process.env.PROTOCOL) : undefined;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const round = (value) => Number(value.toFixed(1));

const client = new Client(server);
const room = await client.create("ffa", {
  name: "NET-PROBE",
  roomName: "NET PROBE",
  open: false,
  netProtocol,
});
const arrivals = [];
let closes = 0;
for (const type of ["snapshot", "s1", "s2", "s3", "events", "resume-ready", "profile-update"]) {
  room.onMessage(type, () => {
    if (type === "snapshot" || type === "s1") arrivals.push(performance.now());
  });
}
room.onLeave(() => {
  closes += 1;
});
const pings = [];
const started = Date.now();
while (Date.now() - started < seconds * 1000) {
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    room.ping((ms) => {
      clearTimeout(timeout);
      pings.push(ms);
      resolve();
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}
const gaps = arrivals.slice(1).map((t, index) => t - arrivals[index]);
const deltas = pings.slice(1).map((value, index) => Math.abs(value - pings[index]));
const closesBeforeLeave = closes;
await room.leave();
console.log(
  JSON.stringify({
    server,
    netProtocol: netProtocol ?? 1,
    rtt: {
      samples: pings.length,
      p50: round(percentile(pings, 0.5)),
      p95: round(percentile(pings, 0.95)),
      min: round(Math.min(...pings)),
      max: round(Math.max(...pings)),
      jitterMean: round(mean(deltas)),
    },
    snapshots: {
      perSecond: round(arrivals.length / seconds),
      gapP50: round(percentile(gaps, 0.5)),
      gapP95: round(percentile(gaps, 0.95)),
      gapP99: round(percentile(gaps, 0.99)),
      gapMax: round(Math.max(...gaps)),
    },
    socketClosesDuringProbe: closesBeforeLeave,
  }),
);
process.exit(0);
