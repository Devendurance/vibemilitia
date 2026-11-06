/** Prints before/after from artifacts/playability/{before,after}.json. */
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(`artifacts/playability/${name}.json`, "utf8"));
const before = read("before");
const after = read("after");
const row = (name, value) =>
  console.log(
    name.padEnd(24),
    ...before.network.map(
      (_, index) =>
        `${String(value(before.network[index])).padStart(8)} > ${String(value(after.network[index])).padEnd(8)}`,
    ),
  );
console.log("RTT/jitter".padEnd(24), ...before.network.map((n) => `${n.profile.rttMs}/${n.profile.jitterMs}`.padEnd(19)));
row("backward frames %", (n) => n.motion.backwardFramePct);
row("run speed mean", (n) => n.motion.runSpeedMean);
row("run speed std", (n) => n.motion.runSpeedStd);
row("run speed p05", (n) => n.motion.runSpeedP05);
row("max frame step px", (n) => n.motion.maxFrameStepPx);
row("stop backtrack max px", (n) => n.motion.stopBacktrackPxMax);
row("input to motion ms", (n) => n.motion.inputToMotionMs);
row("camera backward frames", (n) => n.motion.cameraBackwardFrames);
row("remote speed CV", (n) => n.remotes.remoteSpeedCvMedian);
row("snapshot bytes p50", (n) => n.socket.snapshotBytesP50);
row("down KB/s", (n) => n.socket.downKBps);
row("snapshots/s", (n) => n.socket.snapshotsPerSecond);
row("main script ms/s", (n) => n.mainThreadMsPerSecond.script);
row("fps", (n) => n.frames.fps);
row("frame p99 ms", (n) => n.frames.p99Ms);
row("socket closes", (n) => n.socket.closes);
for (const [index, load] of before.loads.entries()) {
  const next = after.loads[index];
  console.log(
    load.name.padEnd(24),
    `fps ${load.fps} > ${next.fps}  p95 ${load.p95Ms} > ${next.p95Ms}  long ${load.longFrames} > ${next.longFrames}  script ${load.mainThreadMsPerSecond.script} > ${next.mainThreadMsPerSecond.script}  canvas ${load.canvas.width} > ${next.canvas.width}`,
  );
}
