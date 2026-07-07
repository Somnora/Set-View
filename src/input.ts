// ---------------------------------------------------------------------------
// Controller / hand input abstraction.
//  - select (trigger / hand pinch) and squeeze (grip) come from three.js
//    controller events, so hand-tracking pinch works for free.
//  - A/B/X/Y, thumbstick axes and thumbstick click are polled from the
//    xr-standard gamepad mapping each frame with edge detection.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

export type Hand = 'left' | 'right';
export type Button = 'a' | 'b' | 'x' | 'y' | 'thumbclick';

// Reused each frame by raycaster() so pointing costs zero allocations.
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();

// xr-standard gamepad button indices.
const BTN_THUMBSTICK = 3;
const BTN_AX = 4; // A on right controller, X on left
const BTN_BY = 5; // B on right, Y on left
const AXIS_X = 2;
const AXIS_Y = 3;

export interface InputEvents {
  onTriggerDown?: (hand: Hand) => void;
  onTriggerUp?: (hand: Hand) => void;
  onSqueezeDown?: (hand: Hand) => void;
  onSqueezeUp?: (hand: Hand) => void;
  onButtonDown?: (hand: Hand, button: Button) => void;
}

interface HandState {
  triggerHeld: boolean;
  squeezeHeld: boolean;
  buttons: Record<string, boolean>;
  axes: { x: number; y: number };
  /** Edge-latch for thumbstick-as-stepper (focal length etc.). */
  stickLatchedX: number;
  connected: boolean;
  isHand: boolean;
}

function freshHandState(): HandState {
  return {
    triggerHeld: false,
    squeezeHeld: false,
    buttons: {},
    axes: { x: 0, y: 0 },
    stickLatchedX: 0,
    connected: false,
    isHand: false,
  };
}

export class InputManager {
  events: InputEvents = {};

  private renderer: THREE.WebGLRenderer;
  private controllers: THREE.Object3D[] = [];
  private grips: THREE.Object3D[] = [];
  /** index -> handedness, filled from 'connected' events */
  private handedness: (Hand | null)[] = [null, null];
  private state: Record<Hand, HandState> = { left: freshHandState(), right: freshHandState() };
  private rays: THREE.Object3D[] = [];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const ray = buildRay();
      ray.visible = false;
      controller.add(ray);
      this.rays.push(ray);

      controller.addEventListener('connected', (ev) => {
        const src = (ev as unknown as { data: XRInputSource }).data;
        const hand: Hand = src.handedness === 'left' ? 'left' : 'right';
        this.handedness[i] = hand;
        this.state[hand].connected = true;
        this.state[hand].isHand = !!src.hand;
        ray.visible = !src.hand; // ray line only for controllers, not hands
      });
      controller.addEventListener('disconnected', () => {
        const hand = this.handedness[i];
        if (hand) this.state[hand] = freshHandState();
        this.handedness[i] = null;
        ray.visible = false;
      });

      const handOf = (): Hand | null => this.handedness[i];
      controller.addEventListener('selectstart', () => {
        const h = handOf();
        if (h) {
          this.state[h].triggerHeld = true;
          this.events.onTriggerDown?.(h);
        }
      });
      controller.addEventListener('selectend', () => {
        const h = handOf();
        if (h) {
          this.state[h].triggerHeld = false;
          this.events.onTriggerUp?.(h);
        }
      });
      controller.addEventListener('squeezestart', () => {
        const h = handOf();
        if (h) {
          this.state[h].squeezeHeld = true;
          this.events.onSqueezeDown?.(h);
        }
      });
      controller.addEventListener('squeezeend', () => {
        const h = handOf();
        if (h) {
          this.state[h].squeezeHeld = false;
          this.events.onSqueezeUp?.(h);
        }
      });

      scene.add(controller);
      scene.add(grip);
      this.controllers.push(controller);
      this.grips.push(grip);
    }
  }

  /** Poll gamepad buttons/axes with edge detection. Call once per frame. */
  poll(): void {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (!src.gamepad || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
      const hand = src.handedness as Hand;
      const st = this.state[hand];
      const gp = src.gamepad;
      this.checkButton(hand, st, gp, BTN_THUMBSTICK, 'thumbclick');
      this.checkButton(hand, st, gp, BTN_AX, hand === 'right' ? 'a' : 'x');
      this.checkButton(hand, st, gp, BTN_BY, hand === 'right' ? 'b' : 'y');
      st.axes.x = gp.axes[AXIS_X] ?? 0;
      st.axes.y = gp.axes[AXIS_Y] ?? 0;
    }
  }

  private checkButton(hand: Hand, st: HandState, gp: Gamepad, index: number, name: Button): void {
    const pressed = gp.buttons[index]?.pressed ?? false;
    if (pressed && !st.buttons[index]) this.events.onButtonDown?.(hand, name);
    st.buttons[index] = pressed;
  }

  axes(hand: Hand): { x: number; y: number } {
    return this.state[hand].axes;
  }

  /**
   * Turns held thumbstick-X into discrete steps (-1/0/+1) with a latch:
   * one step per push past ±0.7, re-armed when the stick returns to center.
   */
  stickStepX(hand: Hand): -1 | 0 | 1 {
    const st = this.state[hand];
    const x = st.axes.x;
    if (Math.abs(x) < 0.35) {
      st.stickLatchedX = 0;
      return 0;
    }
    if (Math.abs(x) > 0.7 && st.stickLatchedX === 0) {
      st.stickLatchedX = Math.sign(x);
      return x > 0 ? 1 : -1;
    }
    return 0;
  }

  triggerHeld(hand: Hand): boolean {
    return this.state[hand].triggerHeld;
  }

  squeezeHeld(hand: Hand): boolean {
    return this.state[hand].squeezeHeld;
  }

  connected(hand: Hand): boolean {
    return this.state[hand].connected;
  }

  /** True when this hand is tracked-hands input (no grip pose, no buttons). */
  isHand(hand: Hand): boolean {
    return this.state[hand].isHand;
  }

  /** The hand used for pointing/placing: right when available, else left. */
  pointerHand(): Hand {
    return this.state.right.connected || !this.state.left.connected ? 'right' : 'left';
  }

  /** Target-ray space Object3D for a hand (for raycasting), or null. */
  raySpace(hand: Hand): THREE.Object3D | null {
    const i = this.handedness.indexOf(hand);
    return i >= 0 ? this.controllers[i] : null;
  }

  /** Grip space Object3D (wrist menu mounts here), or null. */
  gripSpace(hand: Hand): THREE.Object3D | null {
    const i = this.handedness.indexOf(hand);
    return i >= 0 ? this.grips[i] : null;
  }

  /** Objects that must be hidden from the virtual-camera render pass. */
  hudObjects(): THREE.Object3D[] {
    return this.rays;
  }

  /** Builds a Raycaster along a hand's pointing ray. Returns null if absent. */
  raycaster(hand: Hand, out: THREE.Raycaster): THREE.Raycaster | null {
    const space = this.raySpace(hand);
    if (!space || !this.state[hand].connected) return null;
    space.updateMatrixWorld();
    _origin.setFromMatrixPosition(space.matrixWorld);
    _dir.set(0, 0, -1).applyMatrix4(_rotMat.extractRotation(space.matrixWorld));
    out.set(_origin, _dir.normalize());
    return out;
  }
}

function buildRay(): THREE.Object3D {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -2.5),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  return new THREE.Line(geo, mat);
}
