import type { PickupDefinition } from "@/game/core/pickups";

export type PlatformStyle = "ground" | "grass" | "stone" | "copper" | "crate";

export interface PlatformDefinition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: PlatformStyle;
}

export interface PointDefinition {
  x: number;
  y: number;
}

export interface DroneSpawn extends PointDefinition {
  id: string;
  name: string;
  orbitRadius: number;
}

export interface ArenaSpawnPoint extends PointDefinition {
  id: string;
}

export interface ArenaDefinition {
  width: number;
  height: number;
  groundY: number;
  playerSpawn: PointDefinition;
  platforms: PlatformDefinition[];
  droneSpawns: DroneSpawn[];
  spawnPoints: ArenaSpawnPoint[];
  pickupSpawns: PickupDefinition[];
}

export const ARENA: ArenaDefinition = {
  width: 3600,
  height: 1500,
  groundY: 1340,
  playerSpawn: { x: 640, y: 1340 },
  platforms: [
    { id: "ground", x: 0, y: 1340, width: 3600, height: 160, style: "ground" },
    { id: "left-ledge", x: 200, y: 1180, width: 320, height: 40, style: "grass" },
    { id: "left-high", x: 260, y: 960, width: 280, height: 40, style: "stone" },
    { id: "left-perch", x: 170, y: 760, width: 230, height: 36, style: "copper" },
    { id: "mid-step", x: 900, y: 1160, width: 300, height: 40, style: "stone" },
    { id: "center-bridge", x: 1270, y: 960, width: 520, height: 44, style: "grass" },
    { id: "center-perch", x: 1520, y: 720, width: 260, height: 40, style: "copper" },
    { id: "top-shelf", x: 840, y: 560, width: 230, height: 36, style: "stone" },
    { id: "right-low", x: 2140, y: 1160, width: 360, height: 40, style: "grass" },
    { id: "right-mid", x: 2520, y: 940, width: 340, height: 40, style: "stone" },
    { id: "right-perch", x: 2140, y: 720, width: 170, height: 32, style: "copper" },
    { id: "right-high", x: 3020, y: 740, width: 360, height: 40, style: "stone" },
    { id: "far-low", x: 3180, y: 1040, width: 260, height: 40, style: "copper" },
    { id: "crate-a", x: 1090, y: 1240, width: 100, height: 100, style: "crate" },
    { id: "crate-b", x: 2280, y: 1248, width: 92, height: 92, style: "crate" },
    { id: "crate-c", x: 1660, y: 1250, width: 82, height: 90, style: "crate" },
  ],
  droneSpawns: [
    { id: "drone-a", name: "NULL-7", x: 1040, y: 880, orbitRadius: 190 },
    { id: "drone-b", name: "GLITCH-3", x: 2440, y: 760, orbitRadius: 265 },
    { id: "drone-c", name: "SCRAP-9", x: 3180, y: 980, orbitRadius: 205 },
  ],
  spawnPoints: [
    { id: "pad-left", x: 420, y: 1340 },
    { id: "pad-spawn", x: 640, y: 1340 },
    { id: "pad-mid", x: 1350, y: 1340 },
    { id: "pad-right", x: 2150, y: 1340 },
    { id: "pad-far", x: 3150, y: 1340 },
    { id: "left-ledge", x: 330, y: 1180 },
    { id: "left-high", x: 360, y: 960 },
    { id: "bridge", x: 1450, y: 960 },
    { id: "center-perch", x: 1600, y: 720 },
    { id: "top-shelf", x: 960, y: 560 },
    { id: "right-mid", x: 2650, y: 940 },
    { id: "right-perch", x: 2200, y: 720 },
    { id: "right-high", x: 3150, y: 740 },
    { id: "far-low", x: 3300, y: 1040 },
  ],
  pickupSpawns: [
    { id: "medkit-ground-left", type: "medkit", x: 300, y: 1324 },
    { id: "medkit-ground-spawn", type: "medkit", x: 760, y: 1324 },
    { id: "medkit-ground-mid", type: "medkit", x: 1220, y: 1324 },
    { id: "medkit-ground-right", type: "medkit", x: 2000, y: 1324 },
    { id: "medkit-ground-far", type: "medkit", x: 3000, y: 1324 },
    { id: "medkit-left-ledge", type: "medkit", x: 430, y: 1164 },
    { id: "medkit-left-high", type: "medkit", x: 460, y: 944 },
    { id: "medkit-bridge", type: "medkit", x: 1360, y: 944 },
    { id: "medkit-center-perch", type: "medkit", x: 1700, y: 704 },
    { id: "medkit-top-shelf", type: "medkit", x: 880, y: 544 },
    { id: "medkit-right-mid", type: "medkit", x: 2750, y: 924 },
    { id: "medkit-right-perch", type: "medkit", x: 2280, y: 704 },
    { id: "medkit-right-high", type: "medkit", x: 3250, y: 724 },
    { id: "medkit-far-low", type: "medkit", x: 3380, y: 1024 },
    { id: "contact-mid-step", type: "contact-grenade", x: 940, y: 1144 },
    { id: "contact-left-perch", type: "contact-grenade", x: 260, y: 744 },
    { id: "contact-right-low", type: "contact-grenade", x: 2350, y: 1144 },
    { id: "frag-center-bridge", type: "frag-grenade", x: 1680, y: 944 },
    { id: "frag-right-high", type: "frag-grenade", x: 3350, y: 724 },
    { id: "frag-crate-c", type: "frag-grenade", x: 1700, y: 1234 },
    { id: "stinking-mid-step", type: "stinking-grenade", x: 1140, y: 1144 },
    { id: "stinking-right-low", type: "stinking-grenade", x: 2200, y: 1144 },
    { id: "stinking-crate-b", type: "stinking-grenade", x: 2326, y: 1232 },
  ],
};
