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
  aimWorld: Phaser.Math.Vector2;
}

export class InputController {
  private readonly scene: Phaser.Scene;
  private readonly keys: Record<"left" | "right" | "space" | "reload" | "debug" | "leftArrow" | "rightArrow", Phaser.Input.Keyboard.Key>;
  private readonly aim = new Phaser.Math.Vector2(0, 0);
  private readonly cameraPoint = new Phaser.Math.Vector2();
  private hasPointer = false;
  private lastPointer = new Phaser.Math.Vector2();

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
    };
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.R,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.F1,
    ]);

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

    return {
      moveX,
      jumpPressed: Phaser.Input.Keyboard.JustDown(this.keys.space),
      jumpHeld: this.keys.space.isDown,
      fire: pointer.primaryDown,
      reloadPressed: Phaser.Input.Keyboard.JustDown(this.keys.reload),
      aimWorld: this.aim.clone(),
    };
  }

  debugPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.debug);
  }

  aimPointer(): Phaser.Math.Vector2 {
    return this.aim.clone();
  }
}
