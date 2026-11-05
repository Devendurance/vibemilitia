"use client";

export type SoundId =
  | "rifle"
  | "scatter"
  | "lance"
  | "akimbo"
  | "smg"
  | "cannon"
  | "rocketLaunch"
  | "rocketImpact"
  | "grenadeContact"
  | "grenadeFrag"
  | "stinkActivate"
  | "toxicTick"
  | "damage"
  | "elimination"
  | "weaponPickup"
  | "medkitPickup"
  | "medkitUse"
  | "countdown"
  | "victory"
  | "defeat"
  | "uiSelect"
  | "uiConfirm";

export interface AudioPreferences {
  master: number;
  effects: number;
  muted: boolean;
}

const STORAGE_KEY = "vibe-militia-audio";
const MAX_VOICES = 14;
const DEFAULT_PREFS: AudioPreferences = {
  master: 0.85,
  effects: 0.8,
  muted: false,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function readPreferences(): AudioPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      master: clamp(parsed.master ?? DEFAULT_PREFS.master),
      effects: clamp(parsed.effects ?? DEFAULT_PREFS.effects),
      muted: Boolean(parsed.muted ?? DEFAULT_PREFS.muted),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

interface ToneOptions {
  type?: OscillatorType;
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  attack?: number;
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
  delay?: number;
}

interface NoiseOptions {
  duration: number;
  gain: number;
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
  delay?: number;
  playbackRate?: number;
}

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private prefs: AudioPreferences = { ...DEFAULT_PREFS };
  private voices = 0;
  private noise: AudioBuffer | null = null;
  private jetpack: {
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null = null;
  private lastToxicAt = 0;
  private listeners = new Set<(prefs: AudioPreferences) => void>();
  private loaded = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.prefs = readPreferences();
    }
  }

  load(): AudioPreferences {
    if (!this.loaded && typeof window !== "undefined") {
      this.prefs = readPreferences();
      this.loaded = true;
    }
    return { ...this.prefs };
  }

  getPreferences(): AudioPreferences {
    return this.load();
  }

  debugState(): {
    contextState: string;
    muted: boolean;
    master: number;
    effects: number;
    voices: number;
  } {
    return {
      contextState: this.context?.state ?? "uninitialized",
      muted: this.prefs.muted,
      master: this.prefs.master,
      effects: this.prefs.effects,
      voices: this.voices,
    };
  }

  subscribe(listener: (prefs: AudioPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const value = { ...this.prefs };
    for (const listener of this.listeners) listener(value);
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      // Settings remain for this session.
    }
  }

  setMaster(value: number): AudioPreferences {
    this.prefs.master = clamp(value);
    this.applyGains();
    this.persist();
    this.notify();
    return { ...this.prefs };
  }

  setEffects(value: number): AudioPreferences {
    this.prefs.effects = clamp(value);
    this.applyGains();
    this.persist();
    this.notify();
    return { ...this.prefs };
  }

  setMuted(value: boolean): AudioPreferences {
    this.prefs.muted = Boolean(value);
    this.applyGains();
    this.persist();
    this.notify();
    return { ...this.prefs };
  }

  async unlock(): Promise<void> {
    if (typeof window === "undefined" || this.prefs.muted) return;
    try {
      if (!this.context) {
        const AudioContextCtor =
          window.AudioContext ??
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextCtor) return;
        this.context = new AudioContextCtor();
        this.masterGain = this.context.createGain();
        this.effectsGain = this.context.createGain();
        this.effectsGain.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
        this.applyGains();
        this.createNoiseBuffer();
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
    } catch {
      // Audio is optional. Never block gameplay on a failed context.
    }
  }

  private applyGains(): void {
    if (!this.context || !this.masterGain || !this.effectsGain) return;
    const now = this.context.currentTime;
    const master = this.prefs.muted ? 0 : this.prefs.master;
    this.masterGain.gain.setTargetAtTime(master, now, 0.02);
    this.effectsGain.gain.setTargetAtTime(this.prefs.effects, now, 0.02);
  }

  private createNoiseBuffer(): void {
    if (!this.context) return;
    const length = Math.floor(this.context.sampleRate * 1.2);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let index = 0; index < length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[index] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    this.noise = buffer;
  }

  private reserveVoice(): boolean {
    if (!this.context || this.prefs.muted) return false;
    const now = this.context.currentTime;
    if (now - this.lastToxicAt < 90 && this.voices >= 4) return false;
    if (this.voices >= MAX_VOICES) return false;
    this.voices += 1;
    window.setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
    }, 420);
    return true;
  }

  private tone(options: ToneOptions): void {
    if (!this.context || !this.effectsGain) return;
    const ctx = this.context;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? "sine";
    osc.frequency.setValueAtTime(Math.max(20, options.frequency), start);
    if (options.endFrequency) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.endFrequency),
        start + options.duration,
      );
    }
    let node: AudioNode = osc;
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.setValueAtTime(options.filter.frequency, start);
      filter.Q.setValueAtTime(options.filter.q ?? 0.8, start);
      node.connect(filter);
      node = filter;
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, options.gain),
      start + (options.attack ?? 0.006),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
    node.connect(gain);
    gain.connect(this.effectsGain);
    osc.start(start);
    osc.stop(start + options.duration + 0.02);
  }

  private burst(options: NoiseOptions): void {
    if (!this.context || !this.effectsGain || !this.noise) return;
    const ctx = this.context;
    const start = ctx.currentTime + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.setValueAtTime(options.playbackRate ?? 1, start);
    let node: AudioNode = source;
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.setValueAtTime(options.filter.frequency, start);
      filter.Q.setValueAtTime(options.filter.q ?? 0.7, start);
      node.connect(filter);
      node = filter;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, options.gain),
      start + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
    node.connect(gain);
    gain.connect(this.effectsGain);
    source.start(start);
    source.stop(start + options.duration + 0.02);
  }

  play(id: SoundId, intensity = 1): void {
    if (typeof window === "undefined") return;
    this.load();
    if (this.prefs.muted) return;
    if (!this.context) {
      void this.unlock().then(() => this.play(id, intensity));
      return;
    }
    if (!this.reserveVoice()) return;
    const gain = Math.max(0.05, Math.min(1.4, intensity));
    switch (id) {
      case "rifle":
        this.burst({ duration: 0.07, gain: 0.14 * gain, filter: { type: "bandpass", frequency: 1700, q: 1.1 } });
        this.tone({ type: "square", frequency: 230, endFrequency: 110, duration: 0.06, gain: 0.05 * gain });
        break;
      case "scatter":
        this.burst({ duration: 0.16, gain: 0.2 * gain, filter: { type: "lowpass", frequency: 1200, q: 0.8 } });
        this.tone({ type: "sawtooth", frequency: 150, endFrequency: 55, duration: 0.16, gain: 0.09 * gain });
        break;
      case "lance":
        this.tone({ type: "triangle", frequency: 1300, endFrequency: 240, duration: 0.2, gain: 0.12 * gain, filter: { type: "bandpass", frequency: 900, q: 2 } });
        this.burst({ duration: 0.08, gain: 0.06 * gain, filter: { type: "highpass", frequency: 2200 } });
        break;
      case "akimbo":
        this.burst({ duration: 0.06, gain: 0.11 * gain, filter: { type: "bandpass", frequency: 1900, q: 1.4 } });
        this.tone({ type: "square", frequency: 280, endFrequency: 150, duration: 0.05, gain: 0.04 * gain });
        break;
      case "smg":
        this.burst({ duration: 0.045, gain: 0.09 * gain, filter: { type: "highpass", frequency: 1100 } });
        this.tone({ type: "square", frequency: 340, endFrequency: 200, duration: 0.04, gain: 0.03 * gain });
        break;
      case "cannon":
        this.burst({ duration: 0.3, gain: 0.28 * gain, filter: { type: "lowpass", frequency: 520, q: 1.1 } });
        this.tone({ type: "sawtooth", frequency: 95, endFrequency: 36, duration: 0.34, gain: 0.16 * gain });
        break;
      case "rocketLaunch":
        this.burst({ duration: 0.34, gain: 0.16 * gain, filter: { type: "bandpass", frequency: 800, q: 0.7 }, playbackRate: 0.6 });
        this.tone({ type: "sawtooth", frequency: 180, endFrequency: 520, duration: 0.32, gain: 0.08 * gain });
        break;
      case "rocketImpact":
        this.burst({ duration: 0.55, gain: 0.34 * gain, filter: { type: "lowpass", frequency: 680, q: 0.9 } });
        this.tone({ type: "sine", frequency: 82, endFrequency: 28, duration: 0.6, gain: 0.2 * gain });
        break;
      case "grenadeContact":
      case "grenadeFrag":
        this.burst({ duration: id === "grenadeContact" ? 0.5 : 0.38, gain: 0.26 * gain, filter: { type: "lowpass", frequency: id === "grenadeContact" ? 900 : 1200 } });
        this.tone({ type: "triangle", frequency: id === "grenadeContact" ? 110 : 150, endFrequency: 42, duration: 0.45, gain: 0.12 * gain });
        break;
      case "stinkActivate":
        this.tone({ type: "sine", frequency: 320, endFrequency: 640, duration: 0.4, gain: 0.07 * gain });
        this.burst({ duration: 0.5, gain: 0.05 * gain, filter: { type: "bandpass", frequency: 600, q: 0.5 } });
        break;
      case "toxicTick":
        this.lastToxicAt = this.context.currentTime;
        this.tone({ type: "square", frequency: 120, endFrequency: 90, duration: 0.05, gain: 0.04 * gain });
        break;
      case "damage":
        this.tone({ type: "sawtooth", frequency: 180, endFrequency: 70, duration: 0.14, gain: 0.09 * gain });
        break;
      case "elimination":
        this.tone({ type: "triangle", frequency: 520, endFrequency: 780, duration: 0.16, gain: 0.12 * gain });
        this.tone({ type: "triangle", frequency: 780, endFrequency: 1160, duration: 0.2, gain: 0.08 * gain, delay: 0.1 });
        this.burst({ duration: 0.2, gain: 0.07 * gain, filter: { type: "highpass", frequency: 1600 } });
        break;
      case "weaponPickup":
        [440, 660, 880].forEach((frequency, index) =>
          this.tone({ type: "square", frequency, duration: 0.1, gain: 0.06 * gain, delay: index * 0.055 }),
        );
        break;
      case "medkitPickup":
        [520, 780].forEach((frequency, index) =>
          this.tone({ type: "sine", frequency, duration: 0.12, gain: 0.07 * gain, delay: index * 0.08 }),
        );
        break;
      case "medkitUse":
        this.tone({ type: "sine", frequency: 620, endFrequency: 930, duration: 0.26, gain: 0.08 * gain });
        break;
      case "countdown":
        this.tone({ type: "square", frequency: 660, duration: 0.1, gain: 0.07 * gain });
        break;
      case "victory":
        [523, 659, 784, 1046].forEach((frequency, index) =>
          this.tone({ type: "triangle", frequency, duration: 0.24, gain: 0.1 * gain, delay: index * 0.11 }),
        );
        break;
      case "defeat":
        [392, 330, 262].forEach((frequency, index) =>
          this.tone({ type: "triangle", frequency, duration: 0.3, gain: 0.09 * gain, delay: index * 0.13 }),
        );
        break;
      case "uiSelect":
        this.tone({ type: "square", frequency: 880, duration: 0.035, gain: 0.035 * gain });
        break;
      case "uiConfirm":
        this.tone({ type: "square", frequency: 620, endFrequency: 980, duration: 0.1, gain: 0.05 * gain });
        break;
      default:
        break;
    }
  }

  setJetpackActive(active: boolean, intensity = 1): void {
    if (typeof window === "undefined") return;
    this.load();
    if (!active) {
      if (this.jetpack && this.context) {
        const now = this.context.currentTime;
        this.jetpack.gain.gain.setTargetAtTime(0.0001, now, 0.05);
        const source = this.jetpack.source;
        window.setTimeout(() => {
          try {
            source.stop();
          } catch {
            // Already stopped.
          }
        }, 220);
        this.jetpack = null;
      }
      return;
    }
    if (this.prefs.muted || !this.context || this.jetpack) return;
    const ctx = this.context;
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 480;
    filter.Q.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(
      0.05 * Math.max(0.2, Math.min(1, intensity)),
      ctx.currentTime,
      0.06,
    );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsGain!);
    source.start();
    this.jetpack = { source, gain };
  }

  dispose(): void {
    this.setJetpackActive(false);
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.masterGain = null;
      this.effectsGain = null;
    }
  }
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}

export const audio = getAudioEngine();
