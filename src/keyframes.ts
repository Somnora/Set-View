// ---------------------------------------------------------------------------
// Keyframe capture, ghost-footprint/path visuals, and playback.
// Pure timeline math lives in timeline.ts; this file drives the visuals.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { ActorData, SceneData } from './model.ts';
import { addKeyframe, MAX_KEYFRAMES } from './model.ts';
import { buildTimeline, lerpAngle, sampleTimeline, type Timeline } from './timeline.ts';
import { poseFor } from './pose.ts';
import type { ActorManager, ActorObject } from './actors.ts';
import { disposeTree, makeLabel } from './ui.ts';

export class KeyframeSystem {
  /** Footprints + dotted paths; child of contentRoot. */
  readonly vizGroup = new THREE.Group();

  playing = false;
  /** Playhead in seconds. */
  t = 0;
  duration = 0;

  private scene: SceneData;
  private actors: ActorManager;
  private timelines = new Map<string, Timeline>();
  private vizPerActor = new Map<string, THREE.Group>();
  /** True once playback poses have been applied (until stop()). */
  private posesApplied = false;
  private smoothedRotY = new Map<string, number>();
  onChange: () => void = () => {};

  constructor(scene: SceneData, actors: ActorManager) {
    this.scene = scene;
    this.actors = actors;
  }

  setScene(scene: SceneData): void {
    this.scene = scene;
    this.stop();
    for (const g of this.vizPerActor.values()) {
      this.vizGroup.remove(g);
      disposeTree(g);
    }
    this.vizPerActor.clear();
    this.timelines.clear();
    for (const a of scene.actors) this.rebuildForActor(a);
    this.recomputeDuration();
  }

  /**
   * Stores the actor's current transform AND stance as its next keyframe —
   * set the pose first, then capture, and the mark holds it on playback
   * ("walk to the chair and sit" = a second same-spot mark captured seated).
   */
  capture(obj: ActorObject): 'ok' | 'full' {
    if (!addKeyframe(obj.data, obj.data.position, obj.data.rotationY, obj.data.stance)) return 'full';
    this.rebuildForActor(obj.data);
    this.recomputeDuration();
    this.onChange();
    return 'ok';
  }

  /** Registers a newly added actor (e.g. a duplicate) for viz + playback. */
  addActor(data: ActorData): void {
    this.rebuildForActor(data);
    this.recomputeDuration();
  }

  clear(actorId: string): void {
    const data = this.scene.actors.find((a) => a.id === actorId);
    if (!data) return;
    // Stop BEFORE emptying keyframes: stop() only un-freezes + restores actors
    // that still have keyframes, so clearing first would strand this actor at a
    // scrubbed/played pose with overridden stuck true (it would then be skipped
    // by anchor drift correction for the rest of the session).
    this.stop();
    data.keyframes = [];
    this.rebuildForActor(data);
    this.recomputeDuration();
    this.onChange();
  }

  removeActor(actorId: string): void {
    const g = this.vizPerActor.get(actorId);
    if (g) {
      this.vizGroup.remove(g);
      disposeTree(g);
      this.vizPerActor.delete(actorId);
    }
    this.timelines.delete(actorId);
    this.recomputeDuration();
    // If removing this actor leaves nothing playable while a held pose is still
    // applied (e.g. Play ran to the end, then the last keyframed actor is
    // deleted without pressing Stop), `active` would stay true forever and
    // globally suppress anchor drift correction. Clear the held-pose state so
    // remaining actors resume tracking their anchors.
    if (this.posesApplied && this.duration <= 0) this.stop();
  }

  play(): void {
    if (this.duration <= 0) return;
    if (this.t >= this.duration) this.t = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  /** Stops playback and returns actors to their rest (placed) positions. */
  stop(): void {
    this.playing = false;
    this.t = 0;
    if (this.posesApplied) {
      for (const obj of this.actors.all()) {
        if (obj.data.keyframes.length > 0) {
          obj.overridden = false;
          this.actors.restoreRest(obj);
        }
      }
      this.posesApplied = false;
    }
    this.smoothedRotY.clear();
  }

  /** Scrubs the playhead to a normalized position (pauses playback). */
  scrubTo(u: number): void {
    if (this.duration <= 0) return;
    this.playing = false;
    this.t = u * this.duration;
    this.applyPoses(0);
  }

  get normalizedT(): number {
    return this.duration > 0 ? this.t / this.duration : 0;
  }

  get active(): boolean {
    return this.posesApplied || this.playing;
  }

  /** Advance and pose actors. Call once per frame. */
  tick(dt: number): void {
    if (this.playing) {
      this.t += dt;
      if (this.t >= this.duration) {
        this.t = this.duration;
        this.playing = false;
      }
      this.applyPoses(dt);
    }
  }

  private applyPoses(dt: number): void {
    this.posesApplied = true;
    for (const obj of this.actors.all()) {
      const kfs = obj.data.keyframes;
      if (kfs.length === 0) continue;
      const tl = this.timelines.get(obj.data.id) ?? buildTimeline(kfs, this.scene.walkSpeed);
      const s = sampleTimeline(kfs, tl, this.t);
      if (!s) continue;
      obj.overridden = true;
      // Damp facing so heading changes at marks don't snap.
      const prev = this.smoothedRotY.get(obj.data.id) ?? s.rotationY;
      const rotY = dt > 0 ? lerpAngle(prev, s.rotationY, Math.min(1, dt * 8)) : s.rotationY;
      this.smoothedRotY.set(obj.data.id, rotY);
      obj.root.position.set(s.position.x, s.position.y, s.position.z);
      obj.root.rotation.y = rotY;
      this.actors.setWalk(obj, s.moving && this.playing, Math.max(s.speed, 0.6), dt, s.stance);
    }
  }

  private recomputeDuration(): void {
    this.duration = 0;
    for (const a of this.scene.actors) {
      const tl = buildTimeline(a.keyframes, this.scene.walkSpeed);
      this.timelines.set(a.id, tl);
      this.duration = Math.max(this.duration, tl.duration);
    }
  }

  /** Re-derive timings after the scene's move pace changes. */
  setWalkSpeed(): void {
    const wasPlaying = this.playing;
    const u = this.normalizedT;
    this.recomputeDuration();
    this.t = u * this.duration; // keep the playhead's relative position
    this.playing = wasPlaying;
  }

  /** Numbered ghost footprints + dotted path for one actor. */
  rebuildForActor(data: ActorData): void {
    const old = this.vizPerActor.get(data.id);
    if (old) {
      this.vizGroup.remove(old);
      disposeTree(old);
    }
    const g = new THREE.Group();
    const color = new THREE.Color(data.color);

    data.keyframes.forEach((kf, i) => {
      const marker = new THREE.Group();
      marker.position.set(kf.position.x, kf.position.y + 0.004, kf.position.z);
      marker.rotation.y = kf.rotationY;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      );
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.135, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      // Facing tick on the rim so each mark shows its direction.
      const tick = new THREE.Mesh(
        new THREE.PlaneGeometry(0.02, 0.08).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      tick.position.z = 0.16;
      // Non-standing marks show their pose on the footprint ("3 · Seated").
      const tag = kf.stance && kf.stance !== 'standing' ? ` · ${poseFor(kf.stance).short}` : '';
      const num = makeLabel(String(i + 1) + tag, 0.055, { fontPx: 40, bg: 'rgba(12,14,18,0.75)' });
      num.sprite.position.y = 0.09;
      marker.add(disc, rim, tick, num.sprite);
      g.add(marker);
    });

    if (data.keyframes.length >= 2) {
      const pts = data.keyframes.map(
        (k) => new THREE.Vector3(k.position.x, k.position.y + 0.01, k.position.z),
      );
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geo,
        new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.85 }),
      );
      line.computeLineDistances();
      g.add(line);
    }

    this.vizGroup.add(g);
    this.vizPerActor.set(data.id, g);
  }

  keyframeCount(actorId: string): number {
    return this.scene.actors.find((a) => a.id === actorId)?.keyframes.length ?? 0;
  }

  get maxKeyframes(): number {
    return MAX_KEYFRAMES;
  }
}
