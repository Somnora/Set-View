// ---------------------------------------------------------------------------
// WebXR session lifecycle: feature detection, session start, reference space,
// hit-test sources (controller ray with gaze fallback), anchor creation, and
// pose-reset logging. Everything is feature-detected and degrades gracefully.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeLabel, type Label } from './ui.ts';
import type { PlaceArm } from './wheel.ts';

export interface SupportReport {
  secureContext: boolean;
  hasXR: boolean;
  immersiveAR: boolean;
  messages: string[];
}

export async function checkSupport(): Promise<SupportReport> {
  const messages: string[] = [];
  const secureContext = window.isSecureContext;
  if (!secureContext) messages.push('Page is not a secure context — WebXR needs HTTPS (or localhost).');
  const hasXR = 'xr' in navigator && !!navigator.xr;
  if (!hasXR) messages.push('navigator.xr is missing — this browser has no WebXR support.');
  let immersiveAR = false;
  if (hasXR) {
    try {
      immersiveAR = (await navigator.xr!.isSessionSupported('immersive-ar')) === true;
    } catch (e) {
      messages.push(`isSessionSupported threw: ${(e as Error).message}`);
    }
    if (!immersiveAR) messages.push("'immersive-ar' sessions are not supported on this device/browser.");
  }
  return { secureContext, hasXR, immersiveAR, messages };
}

export interface XRFeatureFlags {
  hitTest: boolean;
  anchors: boolean;
  handTracking: boolean;
  domOverlay: boolean;
  meshDetection: boolean;
  referenceSpace: 'local-floor' | 'local';
}

export interface HitInfo {
  /** Hit point in world (base reference) space. */
  point: THREE.Vector3;
  /** Which input produced it. */
  source: 'controller' | 'viewer';
}

type LogFn = (msg: string) => void;

export class SessionManager {
  session: XRSession | null = null;
  features: XRFeatureFlags = {
    hitTest: false,
    anchors: false,
    handTracking: false,
    domOverlay: false,
    meshDetection: false,
    referenceSpace: 'local',
  };

  /** Reticle object lives in true world space (scene root, not contentRoot). */
  readonly reticle: THREE.Group;
  /** Latest floor hit this frame, or null. */
  lastHit: HitInfo | null = null;

  private renderer: THREE.WebGLRenderer;
  private viewerHitSource: XRHitTestSource | null = null;
  private controllerHitSources = new Map<XRInputSource, XRHitTestSource>();
  private log: LogFn;
  private anchorsBroken = false;
  readonly hitPoint = new THREE.Vector3();
  private ringMesh!: THREE.Mesh;
  private dotMesh!: THREE.Mesh;
  private reticleLabel: Label | null = null;
  private currentReticleMode: PlaceArm | null = null;

  constructor(renderer: THREE.WebGLRenderer, log: LogFn) {
    this.renderer = renderer;
    this.log = log;
    this.reticle = this.buildReticle();
    this.reticle.visible = false;
  }

  async start(overlayRoot: HTMLElement, onEnd: () => void): Promise<void> {
    const init: XRSessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['anchors', 'hand-tracking', 'dom-overlay', 'local-floor', 'mesh-detection'],
      domOverlay: { root: overlayRoot },
    };
    const session = await navigator.xr!.requestSession('immersive-ar', init);
    this.session = session;
    // Fresh session: clear a stuck anchor-failure latch from a prior session.
    // features.anchors is set optimistically below; without this reset, one
    // transient createAnchor failure would disable anchoring for the lifetime
    // of this SessionManager (it's reused across sessions), silently killing
    // drift resistance on every later session until a page reload.
    this.anchorsBroken = false;

    const enabled: string[] = (session as unknown as { enabledFeatures?: string[] }).enabledFeatures ?? [];
    const has = (f: string) => enabled.includes(f);
    this.features = {
      hitTest: enabled.length ? has('hit-test') : true, // required, so present if session started
      anchors: enabled.length ? has('anchors') : true, // optimistic; first failure flips anchorsBroken
      handTracking: has('hand-tracking'),
      domOverlay: enabled.length ? has('dom-overlay') : !!session.domOverlayState,
      meshDetection: has('mesh-detection'),
      referenceSpace: 'local',
    };

    this.renderer.xr.setReferenceSpaceType('local-floor');
    try {
      await this.renderer.xr.setSession(session);
      this.features.referenceSpace = 'local-floor';
    } catch {
      this.log('local-floor unavailable, falling back to local (floor height may be wrong)');
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);
    }

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (refSpace) {
      refSpace.addEventListener('reset', () => {
        this.log('⚠ reference space RESET (pose discontinuity — expect content jump)');
      });
    }
    session.addEventListener('visibilitychange', () => {
      this.log(`session visibility: ${session.visibilityState}`);
    });

    // Gaze fallback hit-test source.
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.viewerHitSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
    } catch {
      this.log('viewer hit-test source unavailable');
    }

    // Per-controller hit-test sources, created/torn down as inputs change.
    session.addEventListener('inputsourceschange', (ev: XRInputSourcesChangeEvent) => {
      for (const src of ev.added) this.addControllerHitSource(src);
      for (const src of ev.removed) {
        this.controllerHitSources.get(src)?.cancel();
        this.controllerHitSources.delete(src);
      }
    });
    for (const src of Array.from(session.inputSources)) this.addControllerHitSource(src);

    session.addEventListener('end', () => {
      this.viewerHitSource = null;
      this.controllerHitSources.clear();
      this.session = null;
      this.reticle.visible = false;
      onEnd();
    });

    this.log(
      `session started · ref=${this.features.referenceSpace}` +
        ` · anchors=${this.features.anchors ? 'yes' : 'no'} · overlay=${this.features.domOverlay ? 'yes' : 'no'}` +
        ` · mesh=${this.features.meshDetection ? 'yes' : 'no'}`,
    );
  }

  /**
   * Asks the OS to (re)run room capture (Space Setup). The platform may only
   * honor this once per session and may ignore it if the room is already set
   * up. Resolves false when unavailable.
   */
  async requestRoomCapture(): Promise<boolean> {
    const s = this.session;
    if (!s || typeof s.initiateRoomCapture !== 'function') return false;
    try {
      await s.initiateRoomCapture();
      return true;
    } catch (e) {
      this.log(`room capture request failed: ${(e as Error).message}`);
      return false;
    }
  }

  private async addControllerHitSource(src: XRInputSource): Promise<void> {
    if (!this.session || !src.targetRaySpace || this.controllerHitSources.has(src)) return;
    try {
      const hts = await this.session.requestHitTestSource?.({ space: src.targetRaySpace });
      if (hts) this.controllerHitSources.set(src, hts);
    } catch {
      /* transient input or unsupported — gaze fallback covers it */
    }
  }

  /**
   * Updates this.lastHit and the reticle from the preferred hand's controller
   * ray, any other controller, then viewer gaze. Call once per frame.
   */
  updateHitTest(frame: XRFrame, preferredHand: XRHandedness): void {
    this.lastHit = null;
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return;

    // Preferred hand first, then any other controller, then viewer gaze — no
    // array/closure/sort allocations per frame (a plain two-pass loop).
    let hit = false;
    for (const [src, hts] of this.controllerHitSources) {
      if (src.handedness !== preferredHand) continue;
      if (this.trySource(frame, refSpace, hts, 'controller')) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const [src, hts] of this.controllerHitSources) {
        if (src.handedness === preferredHand) continue;
        if (this.trySource(frame, refSpace, hts, 'controller')) {
          hit = true;
          break;
        }
      }
    }
    if (!hit && this.viewerHitSource) this.trySource(frame, refSpace, this.viewerHitSource, 'viewer');
  }

  private trySource(
    frame: XRFrame,
    refSpace: XRReferenceSpace,
    source: XRHitTestSource,
    kind: HitInfo['source'],
  ): boolean {
    const results = frame.getHitTestResults(source);
    if (!results.length) return false;
    const pose = results[0].getPose(refSpace);
    if (!pose) return false;
    const p = pose.transform.position;
    this.hitPoint.set(p.x, p.y, p.z);
    this.lastHit = { point: this.hitPoint, source: kind };
    return true;
  }

  /** Positions the reticle at the last hit (flat on the floor) with mode-specific visuals. */
  updateReticle(visible: boolean, mode: PlaceArm = 'none'): void {
    if (visible && this.lastHit) {
      this.reticle.visible = true;
      this.reticle.position.copy(this.lastHit.point);
      this.reticle.position.y += 0.005;

      if (this.currentReticleMode !== mode) {
        this.currentReticleMode = mode;
        this.applyReticleMode(mode);
      }
    } else {
      this.reticle.visible = false;
    }
  }

  private applyReticleMode(mode: PlaceArm): void {
    if (!this.ringMesh || !this.dotMesh) return;
    const ringMat = this.ringMesh.material as THREE.MeshBasicMaterial;
    const dotMat = this.dotMesh.material as THREE.MeshBasicMaterial;

    switch (mode) {
      case 'actor':
        ringMat.color.setHex(0x00ffcc);
        ringMat.opacity = 0.95;
        dotMat.color.setHex(0x00ffcc);
        this.reticleLabel?.setText('PLACE ACTOR', {
          fontPx: 32,
          bg: 'rgba(12, 14, 18, 0.9)',
          fg: '#00ffcc',
        });
        break;
      case 'camera':
        ringMat.color.setHex(0xffaa00);
        ringMat.opacity = 0.95;
        dotMat.color.setHex(0xffaa00);
        this.reticleLabel?.setText('PLACE CAMERA', {
          fontPx: 32,
          bg: 'rgba(12, 14, 18, 0.9)',
          fg: '#ffaa00',
        });
        break;
      case 'none':
      default:
        ringMat.color.setHex(0x8ab4ff);
        ringMat.opacity = 0.7;
        dotMat.color.setHex(0xffffff);
        this.reticleLabel?.setText('SELECT', {
          fontPx: 32,
          bg: 'rgba(12, 14, 18, 0.85)',
          fg: '#ffffff',
        });
        break;
    }
  }

  /**
   * Creates an anchor at a world-space position (identity-ish orientation).
   * Resolves null when anchors are unsupported or creation fails — callers
   * always keep the plain world-space transform as fallback.
   */
  async createAnchor(frame: XRFrame, position: THREE.Vector3): Promise<XRAnchor | null> {
    if (!this.features.anchors || this.anchorsBroken || !this.session) return null;
    const refSpace = this.renderer.xr.getReferenceSpace();
    const createAnchor = (frame as XRFrame & {
      createAnchor?: (pose: XRRigidTransform, space: XRSpace) => Promise<XRAnchor>;
    }).createAnchor;
    if (!refSpace || !createAnchor) {
      this.anchorsBroken = true;
      this.log('anchors: frame.createAnchor missing — using world-space fallback');
      return null;
    }
    try {
      const pose = new XRRigidTransform({ x: position.x, y: position.y, z: position.z });
      return await createAnchor.call(frame, pose, refSpace);
    } catch (e) {
      this.anchorsBroken = true;
      this.log(`anchors failed (${(e as Error).message}) — using world-space fallback`);
      return null;
    }
  }

  /**
   * World-space anchor position this frame, written into `out`, or null if not
   * tracked. `out` avoids a per-anchor allocation in the per-frame loop.
   */
  anchorPosition(frame: XRFrame, anchor: XRAnchor, out: THREE.Vector3): THREE.Vector3 | null {
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return null;
    try {
      const pose = frame.getPose(anchor.anchorSpace, refSpace);
      if (!pose) return null;
      const p = pose.transform.position;
      return out.set(p.x, p.y, p.z);
    } catch {
      return null;
    }
  }

  /**
   * Writes the fresh head pose into `outPos`/`outQuat`. Returns true on
   * success. Out-params avoid two throwaway allocations every frame.
   */
  viewerPose(frame: XRFrame, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return false;
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return false;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    outPos.set(p.x, p.y, p.z);
    outQuat.set(o.x, o.y, o.z, o.w);
    return true;
  }
  private buildReticle(): THREE.Group {
    const g = new THREE.Group();
    this.ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.075, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8ab4ff, transparent: true, opacity: 0.7 }),
    );
    this.dotMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.dotMesh.position.y = 0.001;

    this.reticleLabel = makeLabel('SELECT', 0.035, {
      fontPx: 32,
      bg: 'rgba(12, 14, 18, 0.85)',
      fg: '#ffffff',
    });
    this.reticleLabel.sprite.position.set(0, 0.12, 0);

    g.add(this.ringMesh, this.dotMesh, this.reticleLabel.sprite);
    g.renderOrder = 10;
    return g;
  }
}
