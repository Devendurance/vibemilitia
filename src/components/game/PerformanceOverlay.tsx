"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { APP_VERSION } from "@/lib/betaTelemetry";
import { getOverlayShown, subscribeQuality } from "@/game/online/qualityPreference";

interface Summary {
  build: string;
  mode: "online" | "practice";
  fps: number;
  onePercentLowFps: number;
  p95Ms: number;
  p99Ms: number;
  renderScale: number;
  css: string;
  backing: string;
  worldZoom: number;
  quality: string;
  effects: string;
  changes: number;
  mainThreadMs: number | null;
  sprites: number;
  particles: number;
  pingMs: number | null;
  snapshotGapMs: number | null;
  renderer: string;
  devicePixelRatio: number;
  screen: string;
  cores: number | null;
  phase: string;
}

/** Built only from render and network numbers. No names, IDs or tokens. Fits the 600 character feedback box. */
function readSummary(mode: Summary["mode"], pingMs: number | null): Summary | null {
  const probe = window.__VIBE_MILITIA_ONLINE__?.getProbe();
  if (!probe) return null;
  const frames = probe.frames.filter((ms) => ms > 0);
  if (frames.length < 30) return null;
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const mean = frames.reduce((sum, ms) => sum + ms, 0) / frames.length;
  const slowest = sorted.slice(-Math.max(1, Math.floor(sorted.length / 100)));
  const low = slowest.reduce((sum, ms) => sum + ms, 0) / slowest.length;
  const viewport = probe.viewport;
  const load = probe.renderLoad();
  return {
    build: APP_VERSION,
    mode,
    fps: Math.round(1000 / mean),
    onePercentLowFps: Math.round(1000 / low),
    p95Ms: Math.round(at(0.95)),
    p99Ms: Math.round(at(0.99)),
    renderScale: viewport.renderScale,
    css: `${Math.round(viewport.canvasCss.width)}x${Math.round(viewport.canvasCss.height)}`,
    backing: `${viewport.canvasBacking.width}x${viewport.canvasBacking.height}`,
    worldZoom: Number(viewport.worldZoom.toFixed(3)),
    quality: probe.render.preference,
    effects: probe.render.effects,
    changes: viewport.history.filter((event) => event.reason !== "boot").length,
    mainThreadMs: probe.render.adaptive ? Math.round(probe.render.adaptive.workMs) : null,
    sprites: load.sprites,
    particles: load.particles,
    pingMs,
    snapshotGapMs: mode === "online" ? Math.round(probe.net?.snapshotGapMs ?? 0) : null,
    renderer: (probe.render.renderer || "unknown").slice(0, 48),
    devicePixelRatio: window.devicePixelRatio,
    screen: `${window.screen.width}x${window.screen.height}`,
    cores: navigator.hardwareConcurrency ?? null,
    phase: probe.snapshot?.phase ?? "none",
  };
}

export function PerformanceOverlay({
  mode,
  pingMs,
}: {
  mode: Summary["mode"];
  pingMs: number | null;
}) {
  const shown = useSyncExternalStore(subscribeQuality, getOverlayShown, () => false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const sample = () => setSummary(readSummary(mode, pingMs));
    sample();
    const timer = window.setInterval(sample, 1000);
    return () => window.clearInterval(timer);
  }, [shown, mode, pingMs]);

  if (!shown || !summary) return null;
  const copy = () => {
    void navigator.clipboard
      ?.writeText(JSON.stringify(summary))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
  };
  return (
    <aside className="perf-overlay" data-testid="perf-overlay" aria-label="Performance">
      <dl>
        <dt>FPS</dt>
        <dd>
          {summary.fps} / {summary.onePercentLowFps} LOW
        </dd>
        <dt>P95 P99</dt>
        <dd>
          {summary.p95Ms} / {summary.p99Ms} MS
        </dd>
        <dt>RENDER</dt>
        <dd>
          {summary.backing} x{summary.renderScale}
        </dd>
        <dt>QUALITY</dt>
        <dd>
          {summary.quality} {summary.effects} {summary.changes}Δ
        </dd>
        {summary.pingMs !== null ? (
          <>
            <dt>PING</dt>
            <dd>{summary.pingMs} MS</dd>
          </>
        ) : null}
      </dl>
      <button type="button" className="perf-overlay__copy" onClick={copy} data-testid="perf-overlay-copy">
        {copied ? "COPIED" : "COPY SUMMARY"}
      </button>
    </aside>
  );
}
