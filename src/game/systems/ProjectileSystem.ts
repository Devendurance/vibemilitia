import Phaser from "phaser";
import { PLAYER_WEAPON, PROJECTILE_LIFETIME_MS } from "@/game/config/gameplay";
import type { EffectsSystem } from "@/game/systems/EffectsSystem";

export type ProjectileOwner = "player" | "drone";

interface BulletData {
  damage: number;
  expiresAt: number;
  owner: ProjectileOwner;
}

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
      this.impact(bullet, this.ownerOf(bullet) === "player" ? "world" : "drone");
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
      maxSize: 80,
      runChildUpdate: false,
    });
  }

  firePlayer(x: number, y: number, angle: number, now: number): void {
    const spread = (Math.random() - 0.5) * 2 * PLAYER_WEAPON.spreadRadians;
    this.fire(this.playerBullets, "bullet-player", x, y, angle + spread, PLAYER_WEAPON.damage, "player", now);
  }

  fireDrone(x: number, y: number, angle: number, spread: number, damage: number, speed: number, now: number): void {
    const offset = (Math.random() - 0.5) * 2 * spread;
    this.fire(this.droneBullets, "bullet-drone", x, y, angle + offset, damage, "drone", now, speed);
  }

  private fire(
    group: Phaser.Physics.Arcade.Group,
    texture: string,
    x: number,
    y: number,
    angle: number,
    damage: number,
    owner: ProjectileOwner,
    now: number,
    speedOverride?: number,
  ): void {
    const bullet = group.get(x, y, texture) as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    bullet.setActive(true).setVisible(true).setDepth(owner === "player" ? 37 : 36);
    bullet.setPosition(x, y);
    bullet.setRotation(angle);
    bullet.setTexture(texture);
    body.enable = true;
    body.setAllowGravity(false);
    body.setSize(16, 7);
    body.setVelocity(
      Math.cos(angle) * (speedOverride ?? PLAYER_WEAPON.projectileSpeed),
      Math.sin(angle) * (speedOverride ?? PLAYER_WEAPON.projectileSpeed),
    );

    const data: BulletData = {
      damage,
      expiresAt: now + PROJECTILE_LIFETIME_MS,
      owner,
    };
    bullet.setData("bullet", data);
  }

  update(now: number, worldWidth: number, worldHeight: number): void {
    for (const group of [this.playerBullets, this.droneBullets]) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (!bullet.active) continue;
        const data = bullet.getData("bullet") as BulletData | undefined;
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

  damageOf(bullet: Phaser.Physics.Arcade.Image): number {
    return (bullet.getData("bullet") as BulletData | undefined)?.damage ?? 0;
  }

  ownerOf(bullet: Phaser.Physics.Arcade.Image): ProjectileOwner | null {
    return (bullet.getData("bullet") as BulletData | undefined)?.owner ?? null;
  }

  consumePlayerHit(bullet: Phaser.Physics.Arcade.Image, x: number, y: number): void {
    if (!bullet.active) return;
    this.effects.bulletImpact(x, y, "player");
    this.deactivate(bullet);
  }

  consumeDroneHit(bullet: Phaser.Physics.Arcade.Image, x: number, y: number): void {
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

  activeCount(owner: ProjectileOwner): number {
    const group = owner === "player" ? this.playerBullets : this.droneBullets;
    return group.getChildren().filter((child) => child.active).length;
  }

  listActive(): Array<{ x: number; y: number; owner: ProjectileOwner }> {
    const output: Array<{ x: number; y: number; owner: ProjectileOwner }> = [];
    for (const group of [this.playerBullets, this.droneBullets]) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (!bullet.active) continue;
        output.push({
          x: bullet.x,
          y: bullet.y,
          owner: this.ownerOf(bullet) ?? "player",
        });
      }
    }
    return output;
  }
}
