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
  orbitRadius: number;
}

export interface ArenaDefinition {
  width: number;
  height: number;
  groundY: number;
  playerSpawn: PointDefinition;
  platforms: PlatformDefinition[];
  droneSpawns: DroneSpawn[];
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
    { id: "drone-a", x: 1040, y: 880, orbitRadius: 190 },
    { id: "drone-b", x: 2440, y: 760, orbitRadius: 265 },
    { id: "drone-c", x: 3180, y: 980, orbitRadius: 205 },
  ],
};
