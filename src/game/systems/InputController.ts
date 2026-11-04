import Phaser from "phaser";

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
  aimWorld: Phaser.Math.Vector2;
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
    const moveX =
      (this.keys.right.isDown || this.keys.rightArrow.isDown ? 1 : 0) -
      (this.keys.left.isDown || this.keys.leftArrow.isDown ? 1 : 0);

    const pointer = this.scene.input.activePointer;
    if (this.hasPointer) {
      camera.getWorldPoint(this.lastPointer.x, this.lastPointer.y, this.cameraPoint);
      this.aim.copy(this.cameraPoint);
    } else {
      this.aim.set(fallbackX + 200, fallbackY - 56);
    }

    const jumpPressed = this.bufferedJump;
    const reloadPressed = this.bufferedReload;
    const weaponSlotPressed = this.bufferedWeaponSlot;
    const medkitPressed = this.bufferedMedkit;
    this.bufferedJump = false;
    this.bufferedReload = false;
    this.bufferedWeaponSlot = null;
    this.bufferedMedkit = false;

    return {
      moveX,
      jumpPressed,
      jumpHeld: this.keys.space.isDown,
      fire: pointer.primaryDown,
      reloadPressed,
      weaponSlotPressed,
      medkitPressed,
      aimWorld: this.aim.clone(),
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
