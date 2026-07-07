// ---------------------------------------------------------------------------
// Actor visuals + floor-locking.
//  - A stylized ~1.7 m humanoid built from flat-shaded primitives.
//  - Root origin is at the FEET so actors sit exactly on the hit-test floor.
//  - Position drift resistance: one XR anchor per actor when the session
//    supports anchors; each frame the anchor's world position is written
//    back into the actor's content-space position. Orientation always comes
//    from data.rotationY (anchors are position-only by design).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { ActorData, SceneData, Vec3 } from './model.ts';
import { createActor } from './model.ts';
import { poseFor, type StanceId } from './pose.ts';
import type { SessionManager } from './session.ts';
import { disposeSprite, disposeTree, makeLabel, type Label } from './ui.ts';

/** Reused each frame by updateFromAnchors to avoid per-actor allocations. */
const _scratchAnchor = new THREE.Vector3();

export interface ActorObject {
  data: ActorData;
  root: THREE.Group;
  label: Label;
  ring: THREE.Mesh;
  hoverRing: THREE.Mesh;
  noteGroup: THREE.Group;
  /** Hip pivots (thigh + knee child). */
  legL: THREE.Group;
  legR: THREE.Group;
  /** Knee pivots (children of the hips). */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  body: THREE.Group;
  anchor: XRAnchor | null;
  /** True while grabbed or driven by playback — anchor updates pause. */
  overridden: boolean;
  walkPhase: number;
  labelFlashUntil: number;
}

export class ActorManager {
  /** Parent for all actor roots; child of contentRoot. */
  readonly group = new THREE.Group();

  private objects = new Map<string, ActorObject>();
  private session: SessionManager;
  private scene: SceneData;
  private notesVisible = true;

  constructor(session: SessionManager, scene: SceneData) {
    this.session = session;
    this.scene = scene;
  }

  setScene(scene: SceneData): void {
    this.scene = scene;
    for (const obj of this.objects.values()) {
      obj.anchor?.delete?.();
      this.group.remove(obj.root);
      disposeTree(obj.root);
    }
    this.objects.clear();
    for (const a of scene.actors) this.buildObject(a);
  }

  all(): ActorObject[] {
    return Array.from(this.objects.values());
  }

  get(id: string): ActorObject | undefined {
    return this.objects.get(id);
  }

  /** Spawns a new actor (content-space position), facing `rotationY`. */
  spawn(position: Vec3, rotationY: number): ActorObject {
    const data = createActor(this.scene, position, rotationY);
    return this.buildObject(data);
  }

  /** Builds the visual for actor data already added to the scene (duplicate). */
  adopt(data: ActorData): ActorObject {
    return this.buildObject(data);
  }

  remove(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.anchor?.delete?.();
    this.group.remove(obj.root);
    disposeTree(obj.root);
    this.objects.delete(id);
    this.scene.actors = this.scene.actors.filter((a) => a.id !== id);
  }

  /** Writes a pose to both the data model and the visual. */
  applyPose(obj: ActorObject, position: Vec3, rotationY: number): void {
    obj.data.position = { ...position };
    obj.data.rotationY = rotationY;
    obj.root.position.set(position.x, position.y, position.z);
    obj.root.rotation.y = rotationY;
  }

  /** Restores rest transform + the authored stance (used when playback stops). */
  restoreRest(obj: ActorObject): void {
    obj.root.position.set(obj.data.position.x, obj.data.position.y, obj.data.position.z);
    obj.root.rotation.y = obj.data.rotationY;
    this.applyStance(obj);
  }

  /**
   * Poses the rig into the actor's rest stance (see pose.ts): whole-body tilt/
   * recline/lie via the body group Euler + lift, plus hip/knee/shoulder joint
   * rotations. This is the "not walking" pose; the walk cycle overrides the
   * limbs (and resets the body upright) during a moving playback segment.
   */
  applyStance(obj: ActorObject): void {
    const p = poseFor(obj.data.stance);
    obj.walkPhase = 0;
    obj.body.rotation.set(p.bodyRot.x, p.bodyRot.y, p.bodyRot.z);
    obj.body.position.y = p.bodyLift;
    obj.legL.rotation.set(0, 0, p.legSplay);
    obj.legR.rotation.set(0, 0, -p.legSplay);
    obj.legL.rotation.x = p.hip;
    obj.legR.rotation.x = p.hip;
    obj.kneeL.rotation.x = p.knee;
    obj.kneeR.rotation.x = p.knee;
    obj.armL.rotation.set(p.shoulder, 0, 0);
    obj.armR.rotation.set(p.shoulder, 0, 0);
  }

  /** Sets an actor's rest stance and re-poses it (when not being played back). */
  setStance(obj: ActorObject, stance: StanceId): void {
    obj.data.stance = stance;
    if (!obj.overridden) this.applyStance(obj);
  }

  /**
   * Re-anchors an actor at its current pose. Fire-and-forget: until the
   * promise resolves the plain content-space transform keeps it in place.
   */
  reanchor(obj: ActorObject, frame: XRFrame): void {
    obj.anchor?.delete?.();
    obj.anchor = null;
    const p = obj.data.position;
    void this.session.createAnchor(frame, new THREE.Vector3(p.x, p.y, p.z)).then((anchor) => {
      // The object may have been deleted, replaced by setScene, or re-anchored
      // again while createAnchor was in flight. If it's no longer the live
      // object for its id, delete the fresh anchor instead of leaking it.
      if (this.objects.get(obj.data.id) !== obj) {
        anchor?.delete?.();
        return;
      }
      obj.anchor = anchor;
    });
  }

  /**
   * Per-frame anchor refresh: snap each anchored, non-overridden actor to its
   * anchor's tracked position. This is what keeps feet planted as the
   * runtime refines its world map.
   */
  updateFromAnchors(frame: XRFrame): void {
    for (const obj of this.objects.values()) {
      if (!obj.anchor || obj.overridden) continue;
      const p = this.session.anchorPosition(frame, obj.anchor, _scratchAnchor);
      if (!p) continue; // tracking lost this frame — hold last pose
      obj.data.position.x = p.x;
      obj.data.position.y = p.y;
      obj.data.position.z = p.z;
      obj.root.position.copy(p);
    }
  }

  setSelected(id: string | null): void {
    for (const obj of this.objects.values()) obj.ring.visible = obj.data.id === id;
  }

  setHovered(id: string | null): void {
    for (const obj of this.objects.values()) obj.hoverRing.visible = obj.data.id === id;
  }

  setNotesVisible(v: boolean): void {
    this.notesVisible = v;
    for (const obj of this.objects.values()) obj.noteGroup.visible = v;
  }

  /** Rebuilds the floating note cards beside an actor. */
  refreshNotes(obj: ActorObject): void {
    // Free the previous cards' textures/materials — clear() only detaches them.
    for (const child of obj.noteGroup.children) disposeSprite(child as THREE.Sprite);
    obj.noteGroup.clear();
    obj.data.notes.forEach((note, i) => {
      const text = note.kind === 'dialogue' ? `“${note.text}”` : note.text;
      const card = makeLabel(text, 0.045, {
        fontPx: 34,
        maxWidthPx: 420,
        bg: note.kind === 'dialogue' ? 'rgba(20, 34, 58, 0.88)' : 'rgba(40, 32, 14, 0.88)',
        fg: note.kind === 'dialogue' ? '#cfe0ff' : '#ffe1a8',
      });
      card.sprite.position.set(0, 1.28 - i * 0.16, 0);
      card.sprite.center.set(-0.15, 0.5); // hang to the actor's right
      obj.noteGroup.add(card.sprite);
    });
    obj.noteGroup.visible = this.notesVisible;
  }

  /** Briefly flashes a message on the name label (e.g. "KF 3 ✓"). */
  flashLabel(obj: ActorObject, msg: string): void {
    obj.label.setText(msg, { fontPx: 44, bg: 'rgba(46, 91, 215, 0.95)' });
    obj.labelFlashUntil = performance.now() + 900;
  }

  /** Call each frame: restores flashed labels. */
  updateLabels(time: number): void {
    for (const obj of this.objects.values()) {
      if (obj.labelFlashUntil && time > obj.labelFlashUntil) {
        obj.labelFlashUntil = 0;
        obj.label.setText(obj.data.name);
      }
    }
  }

  /**
   * Procedural walk while moving; the authored stance while at rest. A walking
   * actor always stands upright (the walk overrides any lean/seat/lie), and
   * straight-leg — the knees only bend for static poses.
   */
  setWalk(obj: ActorObject, moving: boolean, speed: number, dt: number): void {
    if (moving) {
      obj.walkPhase += dt * speed * 6.5; // step frequency scales with speed
      const s = Math.sin(obj.walkPhase);
      obj.body.rotation.set(0, 0, 0); // upright while walking
      obj.legL.rotation.set(0, 0, 0);
      obj.legR.rotation.set(0, 0, 0);
      obj.legL.rotation.x = s * 0.45;
      obj.legR.rotation.x = -s * 0.45;
      obj.kneeL.rotation.x = 0;
      obj.kneeR.rotation.x = 0;
      obj.armL.rotation.set(-s * 0.3, 0, 0);
      obj.armR.rotation.set(s * 0.3, 0, 0);
      obj.body.position.y = Math.abs(Math.cos(obj.walkPhase)) * 0.025;
    } else {
      this.applyStance(obj);
    }
  }

  /** Meshes for hover/select raycasting; each carries userData.actorId. */
  raycastTargets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const obj of this.objects.values()) out.push(obj.root);
    return out;
  }

  /** Sprites/rings that must be hidden from the virtual-camera render. */
  overlayObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const obj of this.objects.values())
      out.push(obj.label.sprite, obj.ring, obj.hoverRing, obj.noteGroup);
    return out;
  }

  private buildObject(data: ActorData): ActorObject {
    const color = new THREE.Color(data.color);
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const matDark = new THREE.MeshLambertMaterial({
      color: color.clone().multiplyScalar(0.75),
      flatShading: true,
    });

    const root = new THREE.Group();
    root.userData.actorId = data.id;
    const body = new THREE.Group(); // bobs vertically while walking

    // Legs: hip pivot (y=0.84) -> thigh -> knee pivot (y=0.50) -> shin. The
    // knee lets seated/cross-legged/lying poses bend the shin; the walk cycle
    // only rotates the hip, so straight-leg walking is unchanged. Returns the
    // hip pivot with its knee pivot attached (out-param captures the knee).
    const knees: THREE.Group[] = [];
    const mkLeg = (x: number) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.84, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 8), matDark);
      thigh.position.y = -0.17;
      const knee = new THREE.Group();
      knee.position.y = -0.34; // knee ~y=0.50 in body space
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 3, 8), matDark);
      shin.position.y = -0.17;
      knee.add(shin);
      hip.add(thigh, knee);
      knees.push(knee);
      return hip;
    };
    const legL = mkLeg(-0.09);
    const legR = mkLeg(0.09);
    const [kneeL, kneeR] = knees;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.42, 3, 10), mat);
    torso.position.y = 1.16;

    const mkArm = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.34, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.48, 3, 8), matDark);
      arm.position.y = -0.27;
      pivot.add(arm);
      return pivot;
    };
    const armL = mkArm(-0.23);
    const armR = mkArm(0.23);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), mat);
    head.position.y = 1.56;
    // A small nose so facing direction reads at a glance (faces +Z).
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6).rotateX(Math.PI / 2), matDark);
    nose.position.set(0, 1.56, 0.115);

    body.add(legL, legR, torso, armL, armR, head, nose);
    root.add(body);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.36, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 }),
    );
    ring.position.y = 0.006;
    ring.visible = false;
    const hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.345, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    hoverRing.position.y = 0.005;
    hoverRing.visible = false;

    const label = makeLabel(data.name, 0.07);
    label.sprite.position.y = 1.86;

    const noteGroup = new THREE.Group();

    root.add(ring, hoverRing, label.sprite, noteGroup);
    root.position.set(data.position.x, data.position.y, data.position.z);
    root.rotation.y = data.rotationY;
    this.group.add(root);

    const obj: ActorObject = {
      data,
      root,
      label,
      ring,
      hoverRing,
      noteGroup,
      legL,
      legR,
      kneeL,
      kneeR,
      armL,
      armR,
      body,
      anchor: null,
      overridden: false,
      walkPhase: 0,
      labelFlashUntil: 0,
    };
    this.objects.set(data.id, obj);
    this.applyStance(obj); // pose the rest position from data.stance
    this.refreshNotes(obj);
    return obj;
  }
}

/** Walks up the object tree from a raycast hit to find the owning actor id. */
export function findActorId(hit: THREE.Object3D): string | null {
  let o: THREE.Object3D | null = hit;
  while (o) {
    if (typeof o.userData.actorId === 'string') return o.userData.actorId;
    o = o.parent;
  }
  return null;
}
