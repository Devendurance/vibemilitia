import Phaser from "phaser";
import { consumeTouchFrame } from "@/game/input/touchInput";

/**
 * The one frame-shaped input contract the simulation consumes. Keyboard and
 * pointer write into it today; a future virtual joystick can write into the
 * exact same fields without touching movement, weapons or physics code.
 */
export interface ControlFrame {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  fire: boolean;
  reloadPressed: boolean;
  weaponSlotPressed: number | null;
  medkitPressed: boolean;
  grenadeSlotPressed: number | null;
  grenadeThrowPressed: boolean;
  swapPressed: boolean;
  aimWorld: Phaser.Math.Vector2;
  /** Direct stick angle on touch. Null means aim from `aimWorld`. */
  aimAngle: number | null;
}

export class InputController {
  private readonly scene: Phaser.Scene;
  private readonly keys: Record<
    | "left"
    | "right"
    | "space"
    | "reload"
    | "debug"
    | "weapon1"
    | "weapon2"
    | "weapon3"
    | "medkit"
    | "grenade4"
    | "grenade5"
    | "grenade6"
    | "grenadeThrow"
    | "swapWeapon"
    | "leftArrow"
    | "rightArrow",
    Phaser.Input.Keyboard.Key
  >;
  private readonly aim = new Phaser.Math.Vector2(0, 0);
  private readonly cameraPoint = new Phaser.Math.Vector2();
  private hasPointer = false;
  private lastPointer = new Phaser.Math.Vector2();
  private bufferedJump = false;
  private bufferedReload = false;
  private bufferedDebug = false;
  private bufferedWeaponSlot: number | null = null;
  private bufferedMedkit = false;
  private bufferedGrenadeSlot: number | null = null;
  private bufferedGrenadeThrow = false;
  private bufferedSwap = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is unavailable");
    }
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      leftArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      rightArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      reload: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      debug: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1),
      weapon1: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      weapon2: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      weapon3: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      medkit: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      grenade4: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      grenade5: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
      grenade6: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX),
      grenadeThrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      swapWeapon: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.R,
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.H,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.G,
      Phaser.Input.Keyboard.KeyCodes.E,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.F1,
    ]);

    // Buffer one-shot actions on keydown. A fast tap can begin and end between
    // two rendered frames, so polling JustDown alone can drop it.
    this.keys.space.on("down", () => {
      this.bufferedJump = true;
    });
    this.keys.reload.on("down", () => {
      this.bufferedReload = true;
    });
    this.keys.debug.on("down", () => {
      this.bufferedDebug = true;
    });
    this.keys.weapon1.on("down", () => {
      this.bufferedWeaponSlot = 0;
    });
    this.keys.weapon2.on("down", () => {
      this.bufferedWeaponSlot = 1;
    });
    this.keys.weapon3.on("down", () => {
      this.bufferedWeaponSlot = 2;
    });
    this.keys.medkit.on("down", () => {
      this.bufferedMedkit = true;
    });
    this.keys.grenade4.on("down", () => {
      this.bufferedGrenadeSlot = 0;
    });
    this.keys.grenade5.on("down", () => {
      this.bufferedGrenadeSlot = 1;
    });
    this.keys.grenade6.on("down", () => {
      this.bufferedGrenadeSlot = 2;
    });
    this.keys.grenadeThrow.on("down", () => {
      this.bufferedGrenadeThrow = true;
    });
    this.keys.swapWeapon.on("down", () => {
      this.bufferedSwap = true;
    });

    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.hasPointer = true;
      this.lastPointer.set(pointer.x, pointer.y);
    });
    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.hasPointer = true;
      this.lastPointer.set(pointer.x, pointer.y);
    });
  }

  sample(camera: Phaser.Cameras.Scene2D.Camera, fallbackX: number, fallbackY: number): ControlFrame {
    const touch = consumeTouchFrame();
    const keyboardMoveX =
      (this.keys.right.isDown || this.keys.rightArrow.isDown ? 1 : 0) -
      (this.keys.left.isDown || this.keys.leftArrow.isDown ? 1 : 0);
    const moveX = keyboardMoveX !== 0 ? keyboardMoveX : touch?.moveX ?? 0;

    const pointer = this.scene.input.activePointer;
    const touchAim = touch?.aimAngle ?? null;
    if (touchAim !== null) {
      this.aim.set(
        fallbackX + Math.cos(touchAim) * 240,
        fallbackY - 56 + Math.sin(touchAim) * 240,
      );
    } else if (this.hasPointer) {
      camera.getWorldPoint(this.lastPointer.x, this.lastPointer.y, this.cameraPoint);
      this.aim.copy(this.cameraPoint);
    } else {
      this.aim.set(fallbackX + 200, fallbackY - 56);
    }

    const jumpPressed = this.bufferedJump || Boolean(touch?.jumpPressed);
    const reloadPressed = this.bufferedReload || Boolean(touch?.reloadPressed);
    const weaponSlotPressed =
      this.bufferedWeaponSlot ?? touch?.weaponSlotPressed ?? null;
    const medkitPressed = this.bufferedMedkit || Boolean(touch?.medkitPressed);
    const grenadeSlotPressed =
      this.bufferedGrenadeSlot ?? touch?.grenadeSlotPressed ?? null;
    const grenadeThrowPressed =
      this.bufferedGrenadeThrow || Boolean(touch?.grenadeThrowPressed);
    const swapPressed = this.bufferedSwap || Boolean(touch?.swapPressed);
    this.bufferedJump = false;
    this.bufferedReload = false;
    this.bufferedWeaponSlot = null;
    this.bufferedMedkit = false;
    this.bufferedGrenadeSlot = null;
    this.bufferedGrenadeThrow = false;
    this.bufferedSwap = false;

    return {
      moveX,
      jumpPressed,
      jumpHeld: this.keys.space.isDown || Boolean(touch?.jumpHeld),
      fire: touch ? Boolean(touch.fire) : pointer.primaryDown,
      reloadPressed,
      weaponSlotPressed,
      medkitPressed,
      grenadeSlotPressed,
      grenadeThrowPressed,
      swapPressed,
      aimWorld: this.aim.clone(),
      aimAngle: touchAim,
    };
  }

  debugPressed(): boolean {
    const pressed = this.bufferedDebug;
    this.bufferedDebug = false;
    return pressed;
  }

  aimPointer(): Phaser.Math.Vector2 {
    return this.aim.clone();
  }
}
