export interface HudSnapshot {
  ready: boolean;
  health: number;
  maxHealth: number;
  fuel: number;
  maxFuel: number;
  ammo: number;
  magazineSize: number;
  reloading: boolean;
  reloadProgress: number;
  isDead: boolean;
  respawnIn: number;
  playerX: number;
  playerY: number;
  grounded: boolean;
  thrusting: boolean;
  aimAngle: number;
  dronesDown: number;
  dronesAlive: number;
  droneTotal: number;
  uptimeMs: number;
  debug: boolean;
  damageSeq: number;
}

export const INITIAL_HUD: HudSnapshot = {
  ready: false,
  health: 100,
  maxHealth: 100,
  fuel: 100,
  maxFuel: 100,
  ammo: 20,
  magazineSize: 20,
  reloading: false,
  reloadProgress: 1,
  isDead: false,
  respawnIn: 0,
  playerX: 0,
  playerY: 0,
  grounded: false,
  thrusting: false,
  aimAngle: 0,
  dronesDown: 0,
  dronesAlive: 0,
  droneTotal: 0,
  uptimeMs: 0,
  debug: false,
  damageSeq: 0,
};

export type GameCommand =
  | { type: "toggle-debug" }
  | { type: "set-debug"; value: boolean }
  | { type: "respawn" }
  | { type: "reset-score" };

export interface DebugProbe {
  hud: HudSnapshot;
  player: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    onGround: boolean;
    thrusting: boolean;
    health: number;
    fuel: number;
    ammo: number;
    reloading: boolean;
    dead: boolean;
    aimAngle: number;
    visible: boolean;
    alpha: number;
    bodyEnabled: boolean;
    bodyMoves: boolean;
    texture: string;
  };
  drones: Array<{
    id: string;
    x: number;
    y: number;
    health: number;
    alive: boolean;
    sight: boolean;
    shotsFired: number;
    cooldown: number;
  }>;
  projectiles: Array<{ x: number; y: number; owner: "player" | "drone" }>;
  platforms: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  camera: { scrollX: number; scrollY: number; zoom: number };
  counters: { droneBulletHitsPlayer: number; playerBulletHitsDrone: number; droneShots: number };
  debugVisible: boolean;
}

export class GameBridge {
  private latest: HudSnapshot = INITIAL_HUD;
  private snapshotListeners = new Set<(snapshot: HudSnapshot) => void>();
  private commandListeners = new Set<(command: GameCommand) => void>();

  getSnapshot(): HudSnapshot {
    return this.latest;
  }

  publish(snapshot: HudSnapshot): void {
    this.latest = snapshot;
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }
  }

  subscribe(listener: (snapshot: HudSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.latest);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  send(command: GameCommand): void {
    for (const listener of this.commandListeners) {
      listener(command);
    }
  }

  onCommand(listener: (command: GameCommand) => void): () => void {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }
}
