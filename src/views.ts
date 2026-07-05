// ---------------------------------------------------------------------------
// Three-view system: full-scale AR, miniature diorama, camera view — plus
// point-teleport (implemented as a content offset: in passthrough AR the
// user physically exists in the room, so "teleporting" shifts the virtual
// scene so the aimed point comes to them; Re-align restores registration).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

export type ViewMode = 'full' | 'mini' | 'camera';

const MINI_SCALE = 1 / 25; // a 10 m set becomes a 0.4 m diorama
const FADE_MS = 150;

export class ViewManager {
  mode: ViewMode = 'full';
  onModeChange: (mode: ViewMode) => void = () => {};

  /** Non-zero while teleported away from true AR registration. */
  readonly teleportOffset = new THREE.Vector3();

  /** Diorama table visuals (platform disc + rim); child of scene root. */
  readonly platform: THREE.Group;

  private contentRoot: THREE.Group;
  readonly fadeSphere: THREE.Mesh;
  private fadeStart = 0;
  private fadeAction: (() => void) | null = null;
  private miniRotY = 0;
  private miniCenter = new THREE.Vector3();
  private platformPos = new THREE.Vector3();
  private grabLastPos: THREE.Vector3 | null = null;

  constructor(contentRoot: THREE.Group, userCamera: THREE.Camera) {
    this.contentRoot = contentRoot;

    this.platform = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 48).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1c212b, transparent: true, opacity: 0.92 }),
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.008, 8, 48).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x66ccff }),
    );
    const grid = new THREE.GridHelper(0.64, 8, 0x33405a, 0x232b3a);
    grid.position.y = 0.001;
    this.platform.add(disc, rim, grid);
    this.platform.visible = false;

    this.fadeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.fadeSphere.renderOrder = 100;
    this.fadeSphere.visible = false;
    userCamera.add(this.fadeSphere);
  }

  cycle(headPos: THREE.Vector3, headQuat: THREE.Quaternion, sceneBounds: THREE.Box3 | null): ViewMode {
    const order: ViewMode[] = ['full', 'mini', 'camera'];
    const next = order[(order.indexOf(this.mode) + 1) % order.length];
    this.set(next, headPos, headQuat, sceneBounds);
    return next;
  }

  set(mode: ViewMode, headPos: THREE.Vector3, headQuat: THREE.Quaternion, sceneBounds: THREE.Box3 | null): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'mini') {
      // Park the diorama at waist height, 0.6 m ahead of the user (yaw only).
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      fwd.y = 0;
      fwd.normalize();
      this.platformPos.copy(headPos).addScaledVector(fwd, 0.6);
      this.platformPos.y = Math.max(0.6, headPos.y - 0.55);
      this.miniRotY = 0;
      const b = sceneBounds;
      if (b && !b.isEmpty()) {
        b.getCenter(this.miniCenter);
        this.miniCenter.y = 0; // keep the scene floor on the platform
      } else {
        this.miniCenter.set(0, 0, 0);
      }
      this.platform.position.copy(this.platformPos);
      this.platform.visible = true;
      this.applyMiniTransform();
    } else {
      this.platform.visible = false;
      this.applyFullTransform();
    }
    this.onModeChange(mode);
  }

  /** Restores full-scale transform (also camera view — life-size content). */
  private applyFullTransform(): void {
    this.contentRoot.scale.setScalar(1);
    this.contentRoot.rotation.set(0, 0, 0);
    this.contentRoot.position.copy(this.teleportOffset);
  }

  private applyMiniTransform(): void {
    const s = MINI_SCALE;
    this.contentRoot.scale.setScalar(s);
    this.contentRoot.rotation.set(0, this.miniRotY, 0);
    // position = platform - R * (center * s)
    const rc = this.miniCenter
      .clone()
      .multiplyScalar(s)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.miniRotY);
    this.contentRoot.position.copy(this.platformPos).sub(rc);
  }

  // --- miniature grab ---------------------------------------------------------

  /** Begin dragging the diorama with the controller at worldPos. */
  miniGrabStart(worldPos: THREE.Vector3): void {
    this.grabLastPos = worldPos.clone();
  }

  miniGrabMove(worldPos: THREE.Vector3, stickX: number, dt: number): void {
    if (this.mode !== 'mini') return;
    if (this.grabLastPos) {
      const delta = worldPos.clone().sub(this.grabLastPos);
      this.platformPos.add(delta);
      this.grabLastPos.copy(worldPos);
      this.platform.position.copy(this.platformPos);
    }
    if (Math.abs(stickX) > 0.15) this.miniRotY -= stickX * dt * 2.2;
    this.applyMiniTransform();
  }

  miniGrabEnd(): void {
    this.grabLastPos = null;
  }

  /** Thumbstick rotation without grabbing (orbit the table). */
  miniRotate(stickX: number, dt: number): void {
    if (this.mode !== 'mini' || Math.abs(stickX) < 0.15) return;
    this.miniRotY -= stickX * dt * 2.2;
    this.applyMiniTransform();
  }

  // --- teleport ------------------------------------------------------------------

  /**
   * Shift the content so the aimed WORLD point lands under the user's feet.
   * Comfort: instant snap hidden inside a 150 ms fade.
   */
  teleportTo(targetWorld: THREE.Vector3, headPos: THREE.Vector3): void {
    if (this.mode !== 'full') return;
    const delta = new THREE.Vector3(headPos.x - targetWorld.x, 0, headPos.z - targetWorld.z);
    this.startFade(() => {
      this.teleportOffset.add(delta);
      this.applyFullTransform();
    });
  }

  /** Clears the teleport offset — content snaps back to true AR alignment. */
  realign(): void {
    this.startFade(() => {
      this.teleportOffset.set(0, 0, 0);
      if (this.mode !== 'mini') this.applyFullTransform();
    });
  }

  get isShifted(): boolean {
    return this.teleportOffset.lengthSq() > 1e-6;
  }

  private startFade(action: () => void): void {
    this.fadeStart = performance.now();
    this.fadeAction = action;
    this.fadeSphere.visible = true;
  }

  /** Drive the fade animation. Call every frame. */
  update(time: number): void {
    if (!this.fadeSphere.visible) return;
    const mat = this.fadeSphere.material as THREE.MeshBasicMaterial;
    const elapsed = time - this.fadeStart;
    const half = FADE_MS / 2;
    if (elapsed < half) {
      mat.opacity = elapsed / half;
    } else {
      if (this.fadeAction) {
        this.fadeAction();
        this.fadeAction = null;
      }
      mat.opacity = Math.max(0, 1 - (elapsed - half) / half);
      if (elapsed >= FADE_MS) this.fadeSphere.visible = false;
    }
  }
}
