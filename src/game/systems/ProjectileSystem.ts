import Phaser from "phaser";
import type { PlayerWeapon } from "@/game/config/gameplay";
import {
  DRONE_WEAPON,
  PROJECTILE_LIFETIME_MS,
} from "@/game/config/gameplay";
import type { EffectsSystem } from "@/game/systems/EffectsSystem";

export type ProjectileOwnerKind = "player" | "bot";

export interface BulletData {
  damage: number;
  expiresAt: number;
  ownerId: string;
  ownerKind: ProjectileOwnerKind;
  weaponId: string;
  weaponName: string;
  maxRange?: number;
}

const BODY_SIZES: Record<string, { width: number; height: number }> = {
  "bullet-player": { width: 16, height: 7 },
  "bullet-scatter": { width: 9, height: 6 },
  "bullet-precision": { width: 28, height: 4 },
  "bullet-drone": { width: 16, height: 7 },
};

export class ProjectileSystem {
  readonly playerBullets: Phaser.Physics.Arcade.Group;
  readonly droneBullets: Phaser.Physics.Arcade.Group;
  private scene: Phaser.Scene;
  private effects: EffectsSystem;

  constructor(
    scene: Phaser.Scene,
    platforms: Phaser.GameObjects.GameObject[],
    effects: EffectsSystem,
  ) {
    this.scene = scene;
    this.effects = effects;
    this.playerBullets = this.createGroup();
    this.droneBullets = this.createGroup();

    const onPlatformHit = (objectA: unknown, objectB: unknown): void => {
      // Phaser can swap callback arguments when one side is a group. Identify
      // the projectile by its data payload instead of trusting argument order.
      const bullet = this.asBullet(objectA) ?? this.asBullet(objectB);
      if (!bullet) return;
      const data = this.dataOf(bullet);
      this.impact(bullet, data?.ownerKind === "bot" ? "drone" : "world");
    };
    scene.physics.add.collider(this.playerBullets, platforms, onPlatformHit);
    scene.physics.add.collider(this.droneBullets, platforms, onPlatformHit);
  }

  asBullet(object: unknown): Phaser.Physics.Arcade.Image | null {
    if (!object || typeof object !== "object") return null;
    const candidate = object as Phaser.Physics.Arcade.Image;
    if (typeof candidate.getData !== "function") return null;
    return candidate.getData("bullet") ? candidate : null;
  }

  private createGroup(): Phaser.Physics.Arcade.Group {
    return this.scene.physics.add.group({
      allowGravity: false,
      maxSize: 140,
      runChildUpdate: false,
    });
  }

  firePlayer(
    weapon: PlayerWeapon,
    x: number,
    y: number,
    angle: number,
    now: number,
  ): void {
    const pellets = weapon.pellets;
    for (let index = 0; index < pellets; index += 1) {
      let offset: number;
      if (pellets === 1) {
        offset = (Math.random() - 0.5) * 2 * weapon.spreadRadians;
      } else {
        const step = (weapon.spreadRadians * 2) / Math.max(1, pellets - 1);
        offset = -weapon.spreadRadians + step * index;
        offset += (Math.random() - 0.5) * weapon.spreadRadians * 0.18;
      }
      this.spawnBullet({
        group: this.playerBullets,
        texture: weapon.projectileTexture,
        x,
        y,
        angle: angle + offset,
        damage: weapon.damage,
        ownerId: "player",
        ownerKind: "player",
        weaponId: weapon.id,
        weaponName: weapon.name,
        speed: weapon.projectileSpeed,
        lifetimeMs: weapon.projectileLifetimeMs,
        now,
      });
    }
  }

  fireDrone(
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    spread: number,
    damage: number,
    speed: number,
    now: number,
  ): void {
    const offset = (Math.random() - 0.5) * 2 * spread;
    this.spawnBullet({
      group: this.droneBullets,
      texture: "bullet-drone",
      x,
      y,
      angle: angle + offset,
      damage,
      ownerId,
      ownerKind: "bot",
      weaponId: DRONE_WEAPON.id,
      weaponName: DRONE_WEAPON.name,
      speed,
      lifetimeMs: PROJECTILE_LIFETIME_MS,
      now,
    });
  }

  private spawnBullet(options: {
    group: Phaser.Physics.Arcade.Group;
    texture: string;
    x: number;
    y: number;
    angle: number;
    damage: number;
    ownerId: string;
    ownerKind: ProjectileOwnerKind;
    weaponId: string;
    weaponName: string;
    speed: number;
    lifetimeMs: number;
    now: number;
  }): void {
    const bullet = options.group.get(options.x, options.y, options.texture) as
      | Phaser.Physics.Arcade.Image
      | null;
    if (!bullet) return;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    bullet
      .setActive(true)
      .setVisible(true)
      .setDepth(options.ownerKind === "player" ? 37 : 36);
    bullet.setPosition(options.x, options.y);
    bullet.setRotation(options.angle);
    bullet.setTexture(options.texture);
    body.enable = true;
    body.setAllowGravity(false);
    const size = BODY_SIZES[options.texture] ?? { width: 16, height: 7 };
    body.setSize(size.width, size.height);
    body.setVelocity(
      Math.cos(options.angle) * options.speed,
      Math.sin(options.angle) * options.speed,
    );

    const data: BulletData = {
      damage: options.damage,
      expiresAt: options.now + options.lifetimeMs,
      ownerId: options.ownerId,
      ownerKind: options.ownerKind,
      weaponId: options.weaponId,
      weaponName: options.weaponName,
    };
    bullet.setData("bullet", data);
  }

  update(now: number, worldWidth: number, worldHeight: number): void {
    for (const group of [this.playerBullets, this.droneBullets]) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (!bullet.active) continue;
        const data = this.dataOf(bullet);
        if (
          !data ||
          now >= data.expiresAt ||
          bullet.x < -80 ||
          bullet.x > worldWidth + 80 ||
          bullet.y < -80 ||
          bullet.y > worldHeight + 80
        ) {
          this.deactivate(bullet);
        }
      }
    }
  }

  dataOf(bullet: Phaser.Physics.Arcade.Image): BulletData | null {
    return (bullet.getData("bullet") as BulletData | undefined) ?? null;
  }

  damageOf(bullet: Phaser.Physics.Arcade.Image): number {
    return this.dataOf(bullet)?.damage ?? 0;
  }

  ownerIdOf(bullet: Phaser.Physics.Arcade.Image): string | null {
    return this.dataOf(bullet)?.ownerId ?? null;
  }

  ownerKindOf(bullet: Phaser.Physics.Arcade.Image): ProjectileOwnerKind | null {
    return this.dataOf(bullet)?.ownerKind ?? null;
  }

  weaponNameOf(bullet: Phaser.Physics.Arcade.Image): string {
    return this.dataOf(bullet)?.weaponName ?? "UNKNOWN";
  }

  consumePlayerHit(bullet: Phaser.Physics.Arcade.Image, x: number, y: number): void {
    if (!bullet.active) return;
    this.effects.bulletImpact(x, y, "player");
    this.deactivate(bullet);
  }

  consumeBotHit(bullet: Phaser.Physics.Arcade.Image, x: number, y: number): void {
    if (!bullet.active) return;
    this.effects.droneHit(x, y);
    this.deactivate(bullet);
  }

  private impact(bullet: Phaser.Physics.Arcade.Image, kind: "world" | "drone"): void {
    if (!bullet.active) return;
    this.effects.bulletImpact(bullet.x, bullet.y, kind);
    this.deactivate(bullet);
  }

  private deactivate(bullet: Phaser.Physics.Arcade.Image): void {
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;
    bullet.setActive(false);
    bullet.setVisible(false);
  }

  clearAll(): void {
    for (const group of [this.playerBullets, this.droneBullets]) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (bullet.active) this.deactivate(bullet);
      }
    }
  }

  activeCount(ownerKind: ProjectileOwnerKind): number {
    const group = ownerKind === "player" ? this.playerBullets : this.droneBullets;
    return group.getChildren().filter((child) => child.active).length;
  }

  listActive(): Array<{
    x: number;
    y: number;
    ownerId: string;
    ownerKind: ProjectileOwnerKind;
    weaponId: string;
  }> {
    const output: Array<{
      x: number;
      y: number;
      ownerId: string;
      ownerKind: ProjectileOwnerKind;
      weaponId: string;
    }> = [];
    for (const group of [this.playerBullets, this.droneBullets]) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (!bullet.active) continue;
        const data = this.dataOf(bullet);
        if (!data) continue;
        output.push({
          x: bullet.x,
          y: bullet.y,
          ownerId: data.ownerId,
          ownerKind: data.ownerKind,
          weaponId: data.weaponId,
        });
      }
    }
    return output;
  }
}
