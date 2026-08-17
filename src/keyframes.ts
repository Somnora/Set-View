// ---------------------------------------------------------------------------
// Keyframe capture, ghost-footprint/path visuals, 3D dolly rails, and playback.
// Pure timeline math lives in timeline.ts; this file drives the visuals.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { ActorData, CameraSetupData, SceneData } from './model.ts';
import {
  addCameraKeyframe,
  addKeyframe,
  DEFAULT_DOLLY_SPEED_MS,
  MAX_CAMERA_KEYFRAMES,
  MAX_KEYFRAMES,
} from './model.ts';
import {
  buildCameraTimeline,
  buildTimeline,
  generateDollyRail,
  lerpAngle,
  sampleCameraTimeline,
  sampleTimeline,
  type CameraTimeline,
  type Timeline,
} from './timeline.ts';
import { poseFor } from './pose.ts';
import {
  advanceTransport,
  cyclePlaybackRate,
  secondsToSmpte,
  stepTransportFrames,
  type TransportState,
} from './timecode.ts';
import type { ActorManager, ActorObject } from './actors.ts';
import type { CameraSystem, CamObject } from './cameraView.ts';
import { disposeTree, makeLabel } from './ui.ts';
import { globalSpatialSoundEngine } from './soundEngine.ts';
import {
  CUE_TYPE_COLORS,
  evaluateCueSpatialPosition,
} from './audioCues.ts';

export class KeyframeSystem {
  /** Footprints, actor paths, and 3D camera dolly rails; child of contentRoot. */
  readonly vizGroup = new THREE.Group();

  playing = false;
  /** Playhead in seconds. */
  t = 0;
  duration = 0;
  playbackRate = 1.0;
  loopInS: number | null = null;
  loopOutS: number | null = null;
  isLooping = false;

  private scene: SceneData;
  private actors: ActorManager;
  private cams: CameraSystem | null = null;
  private actorTimelines = new Map<string, Timeline>();
  private cameraTimelines = new Map<string, CameraTimeline>();
  private vizPerActor = new Map<string, THREE.Group>();
  private vizPerCamera = new Map<string, THREE.Group>();
  private vizAudioCues = new THREE.Group();

  /** True once playback poses have been applied (until stop()). */
  private posesApplied = false;
  private smoothedRotY = new Map<string, number>();
  onChange: () => void = () => {};

  constructor(scene: SceneData, actors: ActorManager, cams: CameraSystem | null = null) {
    this.scene = scene;
    this.actors = actors;
    this.cams = cams;
    this.vizGroup.add(this.vizAudioCues);
  }

  setCameras(cams: CameraSystem): void {
    this.cams = cams;
    for (const c of this.scene.cameras) this.rebuildForCamera(c);
    this.recomputeDuration();
  }

  setScene(scene: SceneData): void {
    this.scene = scene;
    this.stop();
    for (const g of this.vizPerActor.values()) {
      this.vizGroup.remove(g);
      disposeTree(g);
    }
    this.vizPerActor.clear();
    for (const g of this.vizPerCamera.values()) {
      this.vizGroup.remove(g);
      disposeTree(g);
    }
    this.vizPerCamera.clear();
    this.actorTimelines.clear();
    this.cameraTimelines.clear();

    for (const a of scene.actors) this.rebuildForActor(a);
    for (const c of scene.cameras) this.rebuildForCamera(c);
    this.rebuildAudioCues();
    this.recomputeDuration();
  }

  // --- Actor Keyframe Capture ------------------------------------------------

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

  /**
   * Re-syncs one actor after its marks were edited externally (the desktop
   * blocking editor). Stops playback first so a held pose can't be stranded
   * on marks that no longer exist (same reasoning as clear()).
   */
  refreshActor(data: ActorData): void {
    if (this.active) this.stop();
    this.rebuildForActor(data);
    this.recomputeDuration();
  }

  clear(actorId: string): void {
    const data = this.scene.actors.find((a) => a.id === actorId);
    if (!data) return;
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
    this.actorTimelines.delete(actorId);
    this.recomputeDuration();
    if (this.posesApplied && this.duration <= 0) this.stop();
  }

  // --- Camera Keyframe & Dolly Rail Capture ----------------------------------

  /**
   * Stores the camera's current pose, focal length, and focus distance as a keyframe mark.
   */
  captureCamera(camObj: CamObject): 'ok' | 'full' {
    const ok = addCameraKeyframe(
      camObj.data,
      camObj.data.position,
      camObj.data.rotation,
      camObj.data.lensFocalLength,
      camObj.data.focusDistanceM,
      camObj.data.focusTargetActorId,
      1.0,
    );
    if (!ok) return 'full';
    this.rebuildForCamera(camObj.data);
    this.recomputeDuration();
    this.onChange();
    return 'ok';
  }

  /** Registers a newly added camera for viz + playback. */
  addCamera(data: CameraSetupData): void {
    this.rebuildForCamera(data);
    this.recomputeDuration();
  }

  /** Re-syncs one camera after its keyframes or optics were modified. */
  refreshCamera(data: CameraSetupData): void {
    if (this.active) this.stop();
    this.rebuildForCamera(data);
    this.recomputeDuration();
  }

  clearCamera(cameraId: string): void {
    const data = this.scene.cameras.find((c) => c.id === cameraId);
    if (!data) return;
    this.stop();
    data.keyframes = [];
    this.rebuildForCamera(data);
    this.recomputeDuration();
    this.onChange();
  }

  removeCamera(cameraId: string): void {
    const g = this.vizPerCamera.get(cameraId);
    if (g) {
      this.vizGroup.remove(g);
      disposeTree(g);
      this.vizPerCamera.delete(cameraId);
    }
    this.cameraTimelines.delete(cameraId);
    this.recomputeDuration();
    if (this.posesApplied && this.duration <= 0) this.stop();
  }

  // --- Playback Controls -----------------------------------------------------

  get smpteTimecode(): string {
    return secondsToSmpte(this.t, 24).formatted;
  }

  get smpteDuration(): string {
    return secondsToSmpte(this.duration, 24).formatted;
  }

  play(): void {
    if (this.duration <= 0) return;
    if (this.t >= this.duration && this.playbackRate > 0) this.t = 0;
    if (this.t <= 0 && this.playbackRate < 0) this.t = this.duration;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  togglePlay(): boolean {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
    return this.playing;
  }

  /** Steps playhead by delta frames (24fps SMPTE). */
  stepFrames(deltaFrames: number, fps = 24): void {
    if (this.duration <= 0) return;
    const st: TransportState = {
      currentTimeS: this.t,
      durationS: this.duration,
      isPlaying: this.playing,
      playbackRate: this.playbackRate,
      loopInS: this.loopInS,
      loopOutS: this.loopOutS,
      isLooping: this.isLooping,
    };
    const nextSt = stepTransportFrames(st, deltaFrames, fps);
    this.t = nextSt.currentTimeS;
    this.playing = false;
    this.applyPoses(0);
  }

  setInPoint(timeS?: number): void {
    const mark = timeS !== undefined ? timeS : this.t;
    this.loopInS = Math.max(0, Math.min(this.duration, mark));
    if (this.loopOutS !== null && this.loopOutS < this.loopInS) {
      this.loopOutS = null;
    }
    this.isLooping = this.loopOutS !== null;
  }

  setOutPoint(timeS?: number): void {
    const mark = timeS !== undefined ? timeS : this.t;
    this.loopOutS = Math.max(0, Math.min(this.duration, mark));
    if (this.loopInS !== null && this.loopInS > this.loopOutS) {
      this.loopInS = null;
    }
    this.isLooping = this.loopInS !== null;
  }

  clearLoop(): void {
    this.loopInS = null;
    this.loopOutS = null;
    this.isLooping = false;
  }

  toggleLoop(enable?: boolean): boolean {
    this.isLooping = enable !== undefined ? enable : !this.isLooping;
    return this.isLooping;
  }

  cycleRate(reverse = false): number {
    this.playbackRate = cyclePlaybackRate(this.playbackRate, reverse);
    return this.playbackRate;
  }

  /** Stops playback and returns actors and cameras to their rest positions. */
  stop(): void {
    this.playing = false;
    this.t = 0;
    globalSpatialSoundEngine.stopAll();
    if (this.posesApplied) {
      // Restore actors
      for (const obj of this.actors.all()) {
        if (obj.data.keyframes.length > 0) {
          obj.overridden = false;
          this.actors.restoreRest(obj);
        }
      }
      // Restore cameras
      if (this.cams) {
        for (const cam of this.cams.all()) {
          const kfs = cam.data.keyframes;
          if (kfs && kfs.length > 0) {
            const firstKf = kfs[0];
            cam.root.position.set(firstKf.position.x, firstKf.position.y, firstKf.position.z);
            cam.root.quaternion.set(firstKf.rotation.x, firstKf.rotation.y, firstKf.rotation.z, firstKf.rotation.w);
            cam.data.lensFocalLength = firstKf.lensFocalLength;
            cam.currentFocusDistanceM = firstKf.focusDistanceM;
            this.cams.refreshCamera(cam.data.id);
          }
        }
      }
      this.posesApplied = false;
    }
    this.smoothedRotY.clear();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Scrubs the playhead to a normalized position (pauses playback). */
  scrubTo(u: number): void {
    if (this.duration <= 0) return;
    this.playing = false;
    const clamped = Math.max(0, Math.min(1, u));
    this.t = clamped * this.duration;
    this.applyPoses(0);
    this.syncAudio();
  }

  /** Alias for scrubTo. */
  scrub(u: number): void {
    this.scrubTo(u);
  }

  get normalizedT(): number {
    return this.duration > 0 ? this.t / this.duration : 0;
  }

  get active(): boolean {
    return this.posesApplied || this.playing;
  }

  /** Advance and pose actors and cameras. Call once per frame. */
  tick(dt: number): void {
    if (this.playing) {
      const st: TransportState = {
        currentTimeS: this.t,
        durationS: this.duration,
        isPlaying: this.playing,
        playbackRate: this.playbackRate,
        loopInS: this.loopInS,
        loopOutS: this.loopOutS,
        isLooping: this.isLooping,
      };
      const nextSt = advanceTransport(st, dt);
      this.t = nextSt.currentTimeS;
      this.playing = nextSt.isPlaying;
      this.applyPoses(dt);
      this.syncAudio();
    }
  }

  private syncAudio(): void {
    if (!this.scene.audioCues || this.scene.audioCues.length === 0) {
      globalSpatialSoundEngine.stopAll();
      return;
    }
    const actorPosMap = new Map<string, { x: number; y: number; z: number }>();
    for (const a of this.actors.all()) {
      actorPosMap.set(a.data.id, {
        x: a.root.position.x,
        y: a.root.position.y,
        z: a.root.position.z,
      });
    }
    const camPosMap = new Map<string, { x: number; y: number; z: number }>();
    if (this.cams) {
      for (const c of this.cams.all()) {
        camPosMap.set(c.data.id, {
          x: c.root.position.x,
          y: c.root.position.y,
          z: c.root.position.z,
        });
      }
    }
    globalSpatialSoundEngine.syncTimeline(
      this.scene.audioCues,
      this.t,
      this.playing,
      this.playbackRate,
      actorPosMap,
      camPosMap,
    );
  }

  private applyPoses(dt: number): void {
    this.posesApplied = true;

    // 1. Pose Actors
    for (const obj of this.actors.all()) {
      const kfs = obj.data.keyframes;
      if (kfs.length === 0) continue;
      const tl = this.actorTimelines.get(obj.data.id) ?? buildTimeline(kfs, this.scene.walkSpeed);
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

    // 2. Pose Cameras
    if (this.cams) {
      for (const cam of this.cams.all()) {
        const kfs = cam.data.keyframes;
        if (!kfs || kfs.length < 2) continue;
        const camTl = this.cameraTimelines.get(cam.data.id) ?? buildCameraTimeline(kfs, DEFAULT_DOLLY_SPEED_MS);

        // Resolve look-at target position if dynamic actor lock is enabled
        let lookAtTargetPos: { x: number; y: number; z: number } | undefined;
        if (cam.data.lookAtTargetActorId) {
          const targetActorObj = this.actors.get(cam.data.lookAtTargetActorId);
          if (targetActorObj) {
            lookAtTargetPos = {
              x: targetActorObj.root.position.x,
              y: targetActorObj.root.position.y + 1.4, // chest/face height
              z: targetActorObj.root.position.z,
            };
          }
        }

        const s = sampleCameraTimeline(kfs, camTl, this.t, lookAtTargetPos);
        if (!s) continue;

        cam.root.position.set(s.position.x, s.position.y, s.position.z);
        cam.root.quaternion.set(s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w);
        cam.data.lensFocalLength = s.lensFocalLength;
        cam.currentFocusDistanceM = s.focusDistanceM;
      }
    }
  }

  private recomputeDuration(): void {
    this.duration = 0;
    // Actor timelines
    for (const a of this.scene.actors) {
      const tl = buildTimeline(a.keyframes, this.scene.walkSpeed);
      this.actorTimelines.set(a.id, tl);
      this.duration = Math.max(this.duration, tl.duration);
    }
    // Camera timelines
    for (const c of this.scene.cameras) {
      if (c.keyframes && c.keyframes.length >= 2) {
        const tl = buildCameraTimeline(c.keyframes, DEFAULT_DOLLY_SPEED_MS);
        this.cameraTimelines.set(c.id, tl);
        this.duration = Math.max(this.duration, tl.duration);
      } else {
        this.cameraTimelines.delete(c.id);
      }
    }
    // Audio cue timelines
    if (this.scene.audioCues) {
      for (const cue of this.scene.audioCues) {
        this.duration = Math.max(this.duration, cue.timestampS + cue.durationS);
      }
    }
  }

  /** Rebuilds 3D in-VR audio cue visualization emitters. */
  rebuildAudioCues(): void {
    disposeTree(this.vizAudioCues);
    while (this.vizAudioCues.children.length > 0) {
      this.vizAudioCues.remove(this.vizAudioCues.children[0]);
    }

    if (!this.scene.audioCues) return;

    const actorPosMap = new Map<string, { x: number; y: number; z: number }>();
    for (const a of this.scene.actors) {
      actorPosMap.set(a.id, a.position);
    }
    const camPosMap = new Map<string, { x: number; y: number; z: number }>();
    for (const c of this.scene.cameras) {
      camPosMap.set(c.id, c.position);
    }

    for (const cue of this.scene.audioCues) {
      const pos = evaluateCueSpatialPosition(cue, actorPosMap, camPosMap);
      const colorHex = cue.color || (CUE_TYPE_COLORS as Record<string, string>)[cue.type] || '#46a758';
      const color = new THREE.Color(colorHex);

      const marker = new THREE.Group();
      marker.position.set(pos.x, pos.y, pos.z);

      // Pulsing emitter sphere
      const sphereGeo = new THREE.SphereGeometry(0.06, 12, 12);
      const sphereMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.8 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);

      // Sound propagation range ring
      const ringGeo = new THREE.RingGeometry(cue.refDistanceM ?? 1.0, (cue.refDistanceM ?? 1.0) + 0.02, 32).rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);

      // Floating badge
      const smpteIn = secondsToSmpte(cue.timestampS, 24).formatted;
      const label = makeLabel(`🔊 ${cue.name} (${smpteIn})`, 0.045, {
        fontPx: 30,
        bg: 'rgba(15,23,42,0.85)',
      });
      label.sprite.position.y = 0.12;

      marker.add(sphere, ring, label.sprite);
      this.vizAudioCues.add(marker);
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

  // --- Visuals: Actor Footprints & Camera Dolly Rails -----------------------

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

  /**
   * 3D Dolly Rail Gizmo + Keyframe Mark Diamonds & Optics Badges for one camera.
   */
  rebuildForCamera(data: CameraSetupData): void {
    const old = this.vizPerCamera.get(data.id);
    if (old) {
      this.vizGroup.remove(old);
      disposeTree(old);
    }
    const kfs = data.keyframes;
    if (!kfs || kfs.length < 2) return;

    const g = new THREE.Group();
    const railColor = new THREE.Color(0x38bdf8); // Sky blue dolly track

    // 1. Generate smooth 3D Catmull-Rom spline trajectory
    const railData = generateDollyRail(kfs, 16);
    const pts = railData.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const splineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const splineMat = new THREE.LineBasicMaterial({
      color: railColor,
      transparent: true,
      opacity: 0.9,
    });
    const splineLine = new THREE.Line(splineGeo, splineMat);
    g.add(splineLine);

    // 2. Mark badges and orientation cones at each keyframe
    kfs.forEach((kf, i) => {
      const marker = new THREE.Group();
      marker.position.set(kf.position.x, kf.position.y, kf.position.z);
      marker.quaternion.set(kf.rotation.x, kf.rotation.y, kf.rotation.z, kf.rotation.w);

      // Keyframe Diamond / Cone Gizmo
      const diamondGeo = new THREE.ConeGeometry(0.04, 0.08, 4).rotateX(-Math.PI / 2);
      const diamondMat = new THREE.MeshBasicMaterial({ color: railColor, wireframe: true });
      const diamond = new THREE.Mesh(diamondGeo, diamondMat);
      diamond.position.z = -0.04;

      // Mark readout label e.g. "CAM A#1 · 35mm"
      const markLabel = makeLabel(`${data.name}#${i + 1} · ${Math.round(kf.lensFocalLength)}mm`, 0.045, {
        fontPx: 32,
        bg: 'rgba(15,23,42,0.85)',
      });
      markLabel.sprite.position.y = 0.12;

      marker.add(diamond, markLabel.sprite);
      g.add(marker);
    });

    this.vizGroup.add(g);
    this.vizPerCamera.set(data.id, g);
  }

  keyframeCount(actorId: string): number {
    return this.scene.actors.find((a) => a.id === actorId)?.keyframes.length ?? 0;
  }

  cameraKeyframeCount(cameraId: string): number {
    return this.scene.cameras.find((c) => c.id === cameraId)?.keyframes?.length ?? 0;
  }

  get maxKeyframes(): number {
    return MAX_KEYFRAMES;
  }

  get maxCameraKeyframes(): number {
    return MAX_CAMERA_KEYFRAMES;
  }
}
