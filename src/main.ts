// ---------------------------------------------------------------------------
// SetView entry point: builds the renderer/scene, wires every subsystem, and
// owns the per-frame loop and the input → action routing table.
// ---------------------------------------------------------------------------

import './style.css';
import * as THREE from 'three';
import {
  addNote,
  createScene,
  duplicateActor,
  duplicateCameraSetup,
  normalizeScene,
  type CameraSetupData,
  type SceneData,
} from './model.ts';
import { History } from './history.ts';
import { checkSupport, SessionManager } from './session.ts';
import { InputManager, type Hand } from './input.ts';
import { ActorManager, findActorId, type ActorObject } from './actors.ts';
import { KeyframeSystem } from './keyframes.ts';
import { CameraSystem, type CamObject } from './cameraView.ts';
import { ViewManager } from './views.ts';
import { Persistence } from './persistence.ts';
import { buildWristPanel, DebugLog, DriftMarker, Landing, NoteEditor, type UIPanel } from './ui.ts';

// Wrist-panel mount relative to the LEFT controller grip space.
// Tune on-headset if the panel sits awkwardly (see TESTING.md).
const WRIST_POS = new THREE.Vector3(0.0, 0.05, 0.16);
const WRIST_ROT_X = -1.05; // radians, tilt toward the face

// Reused each frame while dragging to avoid a Vector3 clone per frame.
const _pt = new THREE.Vector3();

type PlaceMode = 'actor' | 'camera';

class App {
  private renderer: THREE.WebGLRenderer;
  private scene3 = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 60);
  /** All authored content (actors, cameras, paths). View modes transform it. */
  private contentRoot = new THREE.Group();

  private debug = new DebugLog();
  private persistence = new Persistence();
  private history = new History();
  private sceneData: SceneData;

  private session: SessionManager;
  private input: InputManager;
  private actors: ActorManager;
  private keyframes: KeyframeSystem;
  private cams: CameraSystem;
  private views: ViewManager;
  private wrist: UIPanel;
  private wristMount = new THREE.Group();
  private landing: Landing;
  private noteEditor: NoteEditor;
  private driftMarker: DriftMarker;

  // interaction state
  private placeMode: PlaceMode = 'actor';
  private selectedActorId: string | null = null;
  private hover: { kind: 'actor' | 'camera'; id: string } | null = null;
  private draggedActor: ActorObject | null = null;
  private draggedCamera: CamObject | null = null;
  private miniGrabbing = false;
  private notesVisible = true;
  private pendingReanchorActors: ActorObject[] = [];
  private pendingReanchorCams: CamObject[] = [];
  private lastViewerPos = new THREE.Vector3(0, 1.6, 0);
  private lastViewerQuat = new THREE.Quaternion();

  private raycaster = new THREE.Raycaster();
  private lastTime = 0;
  private fpsFrames = 0;
  private fpsLast = 0;
  private wristRefreshLast = 0;

  // Bumped on any add/remove of an actor or camera; caches below key off it so
  // per-frame hover/hidden lists rebuild only when the scene structure changes.
  private contentVersion = 0;
  private hiddenCache: THREE.Object3D[] | null = null;
  private hiddenCacheVersion = -1;
  private hoverTargets: THREE.Object3D[] = [];
  private hoverTargetsVersion = -1;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setFoveation(1);
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.inset = '0';
    document.body.appendChild(this.renderer.domElement);

    // Cheap lighting: hemisphere + one directional, no shadows (perf budget).
    this.scene3.add(new THREE.HemisphereLight(0xffffff, 0x3a4152, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(1.5, 3, 1);
    this.scene3.add(sun);
    this.scene3.add(this.camera); // so head-attached children render
    this.scene3.add(this.contentRoot);

    this.sceneData = this.persistence.loadCurrentOrCreate();
    // Sprite raycasting (name labels, note cards) requires raycaster.camera.
    this.raycaster.camera = this.camera;

    this.session = new SessionManager(this.renderer, (m) => this.debug.log(m));
    this.scene3.add(this.session.reticle);

    this.input = new InputManager(this.renderer, this.scene3);
    this.actors = new ActorManager(this.session, this.sceneData);
    this.contentRoot.add(this.actors.group);
    this.keyframes = new KeyframeSystem(this.sceneData, this.actors);
    this.contentRoot.add(this.keyframes.vizGroup);
    this.cams = new CameraSystem(this.sceneData, this.session, this.contentRoot);
    this.scene3.add(this.cams.monitor);
    this.camera.add(this.cams.frameLines);
    this.views = new ViewManager(this.contentRoot, this.camera);
    this.scene3.add(this.views.platform);
    this.driftMarker = new DriftMarker(this.debug);
    this.scene3.add(this.driftMarker.group);

    const overlayRoot = document.getElementById('overlay')!;
    this.noteEditor = new NoteEditor(overlayRoot);

    this.wrist = buildWristPanel();
    this.wristMount.add(this.wrist.group);
    this.wrist.group.position.copy(WRIST_POS);
    this.wrist.group.rotation.x = WRIST_ROT_X;

    this.landing = new Landing(document.getElementById('landing')!, {
      onEnter: () => void this.startAR(),
      onNew: () => {
        this.persistence.saveNow(this.sceneData);
        this.newScene(`Scene ${this.persistence.listScenes().length + 1}`);
      },
      onSelect: (id) => {
        const data = this.persistence.loadScene(id);
        if (data) this.loadScene(data);
      },
      onDuplicate: (id) => {
        const copy = this.persistence.duplicateScene(id);
        if (copy) this.loadScene(copy);
      },
      onDelete: (id) => {
        this.persistence.deleteScene(id);
        if (this.sceneData.id === id) this.newScene('Scene 1');
        this.refreshLanding();
      },
      onExport: (id) => this.persistence.exportScene(id),
      onImport: (file) => {
        void this.persistence.importScene(file).then((data) => {
          if (data) this.loadScene(data);
          else this.debug.log('import failed: not a SetView scene JSON');
        });
      },
      onRename: (id, name) => {
        this.persistence.renameScene(id, name);
        if (this.sceneData.id === id) this.sceneData.name = name;
        this.refreshLanding();
      },
      onExportFloorplan: (id) => this.persistence.exportFloorplan(id),
      onExportShotList: (id) => this.persistence.exportShotList(id),
      getScene: (id) =>
        id === this.sceneData.id ? this.sceneData : this.persistence.loadScene(id),
      onUpdateCamera: (sceneId, cameraId, patch) => this.updateCamera(sceneId, cameraId, patch),
      onSetPace: (sceneId, walkSpeed) => this.setScenePace(sceneId, walkSpeed),
    });

    this.persistence.onError = (m) => {
      this.debug.log(m);
      this.wrist.setStatus(m);
    };

    this.wireSubsystems();
    this.loadScene(this.sceneData);

    void checkSupport().then((report) => this.landing.setDiagnostics(report));
    window.addEventListener('beforeunload', () => this.persistence.saveNow(this.sceneData));
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // --- scene management -------------------------------------------------------

  private newScene(name: string): void {
    const scene = createScene(name);
    this.persistence.saveNow(scene);
    this.loadScene(scene);
  }

  /** Applies a camera edit from the landing-page editor (out-of-session). */
  private updateCamera(sceneId: string, cameraId: string, patch: Partial<CameraSetupData>): void {
    if (sceneId === this.sceneData.id) {
      const cam = this.sceneData.cameras.find((c) => c.id === cameraId);
      if (!cam) return;
      Object.assign(cam, patch);
      normalizeScene(this.sceneData); // repair any out-of-range value before it's used
      this.cams.refreshCamera(cameraId); // targeted visual sync; keeps active camera
      this.persistence.saveNow(this.sceneData);
    } else {
      const scene = this.persistence.loadScene(sceneId);
      const cam = scene?.cameras.find((c) => c.id === cameraId);
      if (!scene || !cam) return;
      Object.assign(cam, patch);
      this.persistence.updateScene(scene); // updateScene normalizes
    }
    this.refreshLanding();
  }

  /** Sets a scene's move pace from the landing-page editor (out-of-session). */
  private setScenePace(sceneId: string, walkSpeed: number): void {
    if (sceneId === this.sceneData.id) {
      this.sceneData.walkSpeed = walkSpeed;
      this.keyframes.setWalkSpeed();
      this.refreshWristState();
      this.persistence.saveNow(this.sceneData);
    } else {
      const scene = this.persistence.loadScene(sceneId);
      if (!scene) return;
      scene.walkSpeed = walkSpeed;
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
  }

  private loadScene(data: SceneData): void {
    this.sceneData = data;
    this.persistence.setCurrent(data.id);
    this.selectedActorId = null;
    this.hover = null;
    this.draggedActor = null;
    this.draggedCamera = null;
    this.actors.setScene(data);
    this.keyframes.setScene(data);
    this.cams.setScene(data);
    this.contentVersion++;
    this.history.reset(data);
    this.refreshLanding();
    this.refreshWristState();
    if (data.actors.length || data.cameras.length) {
      this.debug.log(
        `loaded "${data.name}" (${data.actors.length} actors, ${data.cameras.length} cams) — placed relative to session start`,
      );
    }
  }

  /**
   * Re-loads a scene from an undo/redo snapshot into the live managers without
   * touching the history stacks (mirrors loadScene minus history.reset and the
   * current-id switch, plus re-anchoring if a session is running).
   */
  private restoreScene(data: SceneData): void {
    this.sceneData = data;
    this.selectedActorId = null;
    this.hover = null;
    this.draggedActor = null;
    this.draggedCamera = null;
    this.actors.setScene(data);
    this.keyframes.setScene(data);
    this.cams.setScene(data);
    this.contentVersion++;
    this.persistence.saveNow(data);
    if (this.session.session && !this.views.isShifted) {
      for (const obj of this.actors.all()) this.pendingReanchorActors.push(obj);
      for (const obj of this.cams.all()) this.pendingReanchorCams.push(obj);
    }
    this.refreshLanding();
    this.refreshWristState();
  }

  private undo(): void {
    const data = this.history.undo();
    if (!data) {
      this.debug.log('nothing to undo');
      return;
    }
    this.restoreScene(data);
    this.debug.log('↶ undo');
  }

  private redo(): void {
    const data = this.history.redo();
    if (!data) {
      this.debug.log('nothing to redo');
      return;
    }
    this.restoreScene(data);
    this.debug.log('↷ redo');
  }

  private refreshLanding(): void {
    this.landing.refreshScenes(this.persistence.listScenes(), this.sceneData.id);
  }

  /** Records an undo snapshot and schedules a debounced save. Call after every
   *  committed mutation (this is the single mutation-commit signal). */
  private markDirty(): void {
    this.history.record(this.sceneData);
    this.persistence.markDirty(this.sceneData);
  }

  // --- wiring -------------------------------------------------------------------

  private wireSubsystems(): void {
    this.keyframes.onChange = () => this.markDirty();
    this.cams.onChange = () => this.markDirty();
    this.views.onModeChange = (mode) => {
      this.cams.monitor.visible = mode === 'camera';
      if (mode === 'camera') this.cams.monitor.position.set(0, 0, 0); // snap ahead
      this.debug.log(`view: ${mode}`);
      this.refreshWristState();
    };

    this.input.events = {
      onTriggerDown: (hand) => this.onTriggerDown(hand),
      onSqueezeDown: (hand) => this.onSqueezeDown(hand),
      onSqueezeUp: (hand) => this.onSqueezeUp(hand),
      onButtonDown: (hand, button) => {
        if (this.noteEditor.isOpen) return;
        if (button === 'x') this.setPlaceMode(this.placeMode === 'actor' ? 'camera' : 'actor');
        else if (button === 'y') this.cycleView();
        else if (button === 'b') this.captureKeyframe();
        else if (button === 'a') this.onButtonA();
        else if (button === 'thumbclick' && hand === this.input.pointerHand()) this.tryTeleport();
      },
    };

    this.wrist.onPress = (id) => this.onWristPress(id);
    this.wrist.onSlider = (id, v) => {
      if (id === 'scrub') this.keyframes.scrubTo(v);
    };
  }

  private onWristPress(id: string): void {
    switch (id) {
      case 'mode-actor':
        this.setPlaceMode('actor');
        break;
      case 'mode-camera':
        this.setPlaceMode('camera');
        break;
      case 'view-full':
        this.setView('full');
        break;
      case 'view-mini':
        this.setView('mini');
        break;
      case 'view-camera':
        this.setView('camera');
        break;
      case 'framelines':
        this.cams.setEyesMode(!this.cams.eyesMode);
        this.refreshWristState();
        break;
      case 'aspect': {
        const a = this.cams.cycleAspect();
        this.wrist.setLabel('aspect', a);
        break;
      }
      case 'play':
        if (this.keyframes.playing) this.keyframes.pause();
        else this.keyframes.play();
        this.refreshWristState();
        break;
      case 'stop':
        this.keyframes.stop();
        this.refreshWristState();
        break;
      case 'clearkf':
        if (this.selectedActorId) {
          this.keyframes.clear(this.selectedActorId);
          this.debug.log('keyframes cleared');
        }
        break;
      case 'addnote':
        this.openNoteEditor();
        break;
      case 'notes':
        this.notesVisible = !this.notesVisible;
        this.actors.setNotesVisible(this.notesVisible);
        this.refreshWristState();
        break;
      case 'delete':
        this.deleteTarget();
        break;
      case 'dup':
        this.duplicateTarget();
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'pace-slow':
        this.adjustPace(-0.2);
        break;
      case 'pace-fast':
        this.adjustPace(+0.2);
        break;
      case 'drift': {
        const on = !this.driftMarker.group.visible;
        this.driftMarker.group.visible = on;
        this.debug.log(on ? 'drift test ON — walk a loop around the grid' : 'drift test off');
        this.refreshWristState();
        break;
      }
      case 'resetview':
        this.views.realign();
        this.debug.log('re-aligned to real-world registration');
        break;
      case 'capture':
        this.capturePhoto();
        break;
      case 'exit':
        void this.session.session?.end();
        break;
    }
  }

  // --- session ---------------------------------------------------------------------

  private async startAR(): Promise<void> {
    try {
      const overlayRoot = document.getElementById('overlay')!;
      overlayRoot.hidden = false;
      await this.session.start(overlayRoot, () => this.onSessionEnd());
      this.landing.show(false);
      // Anchors from a previous session are dead objects — drop and re-create
      // them in this session's space on the first frame.
      for (const obj of this.actors.all()) {
        obj.anchor = null;
        this.pendingReanchorActors.push(obj);
      }
      for (const obj of this.cams.all()) {
        obj.anchor = null;
        this.pendingReanchorCams.push(obj);
      }
      this.lastTime = 0;
      this.renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
    } catch (e) {
      this.debug.log(`failed to start AR: ${(e as Error).message}`);
      document.getElementById('overlay')!.hidden = true;
    }
  }

  private onSessionEnd(): void {
    this.renderer.setAnimationLoop(null);
    this.keyframes.stop();
    this.noteEditor.close();
    this.persistence.saveNow(this.sceneData);
    document.getElementById('overlay')!.hidden = true;
    this.landing.show(true);
    this.refreshLanding();
    this.debug.log('session ended — scene saved');
  }

  // --- input actions -----------------------------------------------------------------

  private onTriggerDown(hand: Hand): void {
    if (this.noteEditor.isOpen || hand !== this.input.pointerHand()) return;
    if (this.wrist.handleTriggerDown()) return;

    if (this.hover?.kind === 'actor') {
      this.selectActor(this.hover.id);
      return;
    }
    if (this.hover?.kind === 'camera') {
      this.cams.setActive(this.hover.id);
      this.refreshWristState();
      return;
    }
    if (this.views.mode !== 'full') return;

    if (this.placeMode === 'actor') {
      if (!this.session.lastHit) return;
      const local = this.contentRoot.worldToLocal(this.session.lastHit.point.clone());
      const viewerLocal = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
      const face = Math.atan2(viewerLocal.x - local.x, viewerLocal.z - local.z);
      const obj = this.actors.spawn({ x: local.x, y: local.y, z: local.z }, face);
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
      this.selectActor(obj.data.id);
      this.debug.log(`placed ${obj.data.name}${this.session.features.anchors ? ' (anchoring)' : ''}`);
      this.markDirty();
    } else {
      // Camera placement: drop the gizmo at the user's head pose.
      const obj = this.cams.placeAtPose(this.lastViewerPos.clone(), this.lastViewerQuat.clone());
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
      this.debug.log(`placed ${obj.data.name} at head (${Math.round(obj.data.lensFocalLength)}mm)`);
      this.markDirty();
    }
  }

  private onSqueezeDown(hand: Hand): void {
    if (this.noteEditor.isOpen || hand !== this.input.pointerHand()) return;
    if (this.views.mode === 'mini') {
      const grip = this.input.gripSpace(hand);
      if (grip) {
        this.views.miniGrabStart(new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld));
        this.miniGrabbing = true;
      }
      return;
    }
    if (this.hover?.kind === 'actor') {
      const obj = this.actors.get(this.hover.id);
      if (obj) {
        this.draggedActor = obj;
        obj.overridden = true;
        this.selectActor(obj.data.id);
      }
    } else if (this.hover?.kind === 'camera') {
      const obj = this.cams.get(this.hover.id);
      const ray = this.input.raySpace(hand);
      if (obj && ray) {
        this.draggedCamera = obj;
        ray.attach(obj.root); // free 6-DOF carry; re-parented on release
      }
    }
  }

  private onSqueezeUp(hand: Hand): void {
    if (hand !== this.input.pointerHand()) return;
    if (this.miniGrabbing) {
      this.views.miniGrabEnd();
      this.miniGrabbing = false;
    }
    if (this.draggedActor) {
      const obj = this.draggedActor;
      this.draggedActor = null;
      obj.overridden = this.keyframes.active && obj.data.keyframes.length > 0;
      if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
      this.markDirty();
    }
    if (this.draggedCamera) {
      const obj = this.draggedCamera;
      this.draggedCamera = null;
      this.cams.gizmoGroup.attach(obj.root);
      this.cams.syncFromRoot(obj);
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
    }
  }

  private onButtonA(): void {
    if (this.cams.eyesMode) {
      const obj = this.cams.placeAtPose(this.lastViewerPos.clone(), this.lastViewerQuat.clone());
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
      this.cams.flashFrameLabel(`✓ ${obj.data.name} committed`);
      this.debug.log(`committed ${obj.data.name} (${Math.round(obj.data.lensFocalLength)}mm ${obj.data.aspect})`);
      this.markDirty();
    } else if (this.views.mode === 'camera') {
      this.capturePhoto();
    }
  }

  private captureKeyframe(): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('B: select an actor first (point + trigger)');
      return;
    }
    const result = this.keyframes.capture(obj);
    if (result === 'full') {
      this.actors.flashLabel(obj, `MAX ${this.keyframes.maxKeyframes} KFs`);
    } else {
      this.actors.flashLabel(obj, `KF ${obj.data.keyframes.length} ✓`);
    }
  }

  private tryTeleport(): void {
    if (this.views.mode !== 'full' || !this.session.lastHit) return;
    this.views.teleportTo(this.session.lastHit.point, this.lastViewerPos);
    this.debug.log('teleported (Re-align on wrist menu restores registration)');
  }

  private selectActor(id: string | null): void {
    this.selectedActorId = id;
    this.actors.setSelected(id);
    this.refreshWristState();
  }

  private deleteTarget(): void {
    if (this.hover?.kind === 'camera') {
      this.debug.log(`deleted camera`);
      this.cams.remove(this.hover.id);
      this.contentVersion++;
      this.hover = null;
      this.markDirty();
      return;
    }
    const id = this.hover?.kind === 'actor' ? this.hover.id : this.selectedActorId;
    if (!id) {
      this.debug.log('Delete: point at (or select) an actor or camera first');
      return;
    }
    const obj = this.actors.get(id);
    this.debug.log(`deleted ${obj?.data.name ?? 'actor'}`);
    this.keyframes.removeActor(id);
    this.actors.remove(id);
    this.contentVersion++;
    if (this.selectedActorId === id) this.selectActor(null);
    this.hover = null;
    this.markDirty();
  }

  /** Clones the hovered/selected actor or camera a short step away. */
  private duplicateTarget(): void {
    if (this.hover?.kind === 'camera') {
      const data = duplicateCameraSetup(this.sceneData, this.hover.id);
      if (!data) return;
      const obj = this.cams.adopt(data);
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
      this.debug.log(`duplicated → ${data.name}`);
      this.refreshWristState();
      this.markDirty();
      return;
    }
    const id = this.hover?.kind === 'actor' ? this.hover.id : this.selectedActorId;
    if (!id) {
      this.debug.log('Dup: point at (or select) an actor or camera first');
      return;
    }
    const data = duplicateActor(this.sceneData, id);
    if (!data) return;
    const obj = this.actors.adopt(data);
    this.keyframes.addActor(data);
    this.contentVersion++;
    if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
    this.selectActor(data.id);
    this.debug.log(`duplicated → ${data.name}`);
    this.markDirty();
  }

  /** Steps the scene's playback pace and re-derives move timing. */
  private adjustPace(delta: number): void {
    const next = Math.min(3.0, Math.max(0.4, Math.round((this.sceneData.walkSpeed + delta) * 10) / 10));
    if (next === this.sceneData.walkSpeed) return;
    this.sceneData.walkSpeed = next;
    this.keyframes.setWalkSpeed();
    this.refreshWristState();
    this.markDirty();
  }

  private openNoteEditor(): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('Notes: select an actor first');
      return;
    }
    if (!this.session.features.domOverlay) {
      this.debug.log('Notes need dom-overlay, which this session lacks');
      return;
    }
    this.noteEditor.open(obj.data.name, (kind, text) => {
      addNote(obj.data, kind, text);
      this.actors.refreshNotes(obj);
      this.markDirty();
      this.debug.log(`note added to ${obj.data.name}`);
    });
  }

  private capturePhoto(): void {
    const name = this.cams.capture(this.renderer, this.scene3, this.hiddenForVirtualCamera(), this.sceneData.name);
    this.debug.log(name ? `saved ${name}` : 'capture: no active camera');
  }

  private setPlaceMode(mode: PlaceMode): void {
    this.placeMode = mode;
    this.refreshWristState();
  }

  private setView(mode: 'full' | 'mini' | 'camera'): void {
    this.views.set(mode, this.lastViewerPos, this.lastViewerQuat, this.sceneBounds());
  }

  private cycleView(): void {
    this.views.cycle(this.lastViewerPos, this.lastViewerQuat, this.sceneBounds());
  }

  private sceneBounds(): THREE.Box3 | null {
    const box = new THREE.Box3();
    for (const a of this.sceneData.actors) {
      box.expandByPoint(new THREE.Vector3(a.position.x, a.position.y, a.position.z));
      for (const k of a.keyframes)
        box.expandByPoint(new THREE.Vector3(k.position.x, k.position.y, k.position.z));
    }
    for (const c of this.sceneData.cameras)
      box.expandByPoint(new THREE.Vector3(c.position.x, c.position.y, c.position.z));
    if (box.isEmpty()) return null;
    box.expandByScalar(0.5);
    return box;
  }

  private refreshWristState(): void {
    this.wrist.setToggle('mode-actor', this.placeMode === 'actor');
    this.wrist.setToggle('mode-camera', this.placeMode === 'camera');
    this.wrist.setToggle('view-full', this.views.mode === 'full');
    this.wrist.setToggle('view-mini', this.views.mode === 'mini');
    this.wrist.setToggle('view-camera', this.views.mode === 'camera');
    this.wrist.setToggle('framelines', this.cams.eyesMode);
    this.wrist.setToggle('notes', this.notesVisible);
    this.wrist.setToggle('drift', this.driftMarker.group.visible);
    this.wrist.setLabel('play', this.keyframes.playing ? '⏸ Pause' : '▶ Play');
    this.wrist.setLabel('aspect', this.cams.currentAspect);
    this.wrist.setLabel('pace', `${this.sceneData.walkSpeed.toFixed(1)} m/s`);
    this.wrist.setToggle('undo', this.history.canUndo);
    this.wrist.setToggle('redo', this.history.canRedo);
    const sel = this.selectedActorId
      ? (this.actors.get(this.selectedActorId)?.data.name ?? '—')
      : '—';
    const cam = this.cams.active;
    this.wrist.setStatus(`${sel}${cam ? ` · ${cam.data.name} ${Math.round(cam.data.lensFocalLength)}mm` : ''}`);
  }

  /** Everything that must not appear in the virtual camera's frame. Cached and
   *  rebuilt only when actors/cameras are added or removed. */
  private hiddenForVirtualCamera(): THREE.Object3D[] {
    if (this.hiddenCache && this.hiddenCacheVersion === this.contentVersion) return this.hiddenCache;
    this.hiddenCache = [
      this.session.reticle,
      ...this.input.hudObjects(),
      this.wrist.group,
      this.cams.frameLines,
      this.cams.monitor,
      this.cams.gizmoGroup,
      this.driftMarker.group,
      this.views.platform,
      this.views.fadeSphere,
      this.keyframes.vizGroup,
      ...this.actors.overlayObjects(),
      ...this.cams.overlayObjects(),
    ];
    this.hiddenCacheVersion = this.contentVersion;
    return this.hiddenCache;
  }

  // --- per-frame loop ----------------------------------------------------------------

  private loop(time: number, frame?: XRFrame): void {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = time;
    if (!frame) {
      this.renderer.render(this.scene3, this.camera);
      return;
    }

    this.input.poll();
    const pointer = this.input.pointerHand();

    this.session.viewerPose(frame, this.lastViewerPos, this.lastViewerQuat);

    // Deferred anchor creation (queued from input events, needs a live frame).
    for (const obj of this.pendingReanchorActors.splice(0)) this.actors.reanchor(obj, frame);
    for (const obj of this.pendingReanchorCams.splice(0)) this.cams.reanchor(obj, frame);

    this.session.updateHitTest(frame, pointer);

    // Pointer ray → wrist panel first, then world targets.
    const rc = this.input.raycaster(pointer, this.raycaster);
    const onPanel = this.wrist.update(rc, this.input.triggerHeld(pointer));
    this.updateHover(onPanel ? null : rc);

    const placingAllowed =
      this.views.mode === 'full' && !onPanel && !this.hover && !this.draggedActor && this.placeMode === 'actor';
    this.session.updateReticle(placingAllowed || (this.views.mode === 'full' && !onPanel && !this.hover));

    // Wrist panel follows the left grip; hidden for tracked hands (no grip
    // pose — the panel would freeze at the world origin).
    const leftGrip = this.input.gripSpace('left');
    if (leftGrip && this.wristMount.parent !== leftGrip) leftGrip.add(this.wristMount);
    this.wrist.group.visible = this.input.connected('left') && !this.input.isHand('left');

    // Active drags.
    const axes = this.input.axes(pointer);
    if (this.draggedActor) {
      if (this.session.lastHit) {
        const local = this.contentRoot.worldToLocal(_pt.copy(this.session.lastHit.point));
        this.actors.applyPose(
          this.draggedActor,
          { x: local.x, y: local.y, z: local.z },
          this.draggedActor.data.rotationY,
        );
      }
      if (Math.abs(axes.x) > 0.15) {
        const rotY = this.draggedActor.data.rotationY - axes.x * dt * 3.0;
        this.actors.applyPose(this.draggedActor, this.draggedActor.data.position, rotY);
      }
    } else if (this.miniGrabbing) {
      const grip = this.input.gripSpace(pointer);
      if (grip)
        this.views.miniGrabMove(new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld), axes.x, dt);
    } else if (this.views.mode === 'mini') {
      this.views.miniRotate(axes.x, dt);
    } else {
      // Thumbstick steps focal length in Camera View / frame-lines mode.
      const step = this.input.stickStepX(pointer);
      if (step !== 0) {
        if (this.views.mode === 'camera') {
          this.cams.stepActiveFocal(step);
          this.refreshWristState();
        } else if (this.cams.eyesMode) {
          this.cams.stepEyesFocal(step);
        }
      }
    }

    // Drift resistance: snap anchored content to tracked anchor positions.
    if (!this.keyframes.active) this.actors.updateFromAnchors(frame);
    this.cams.updateFromAnchors(frame, this.draggedCamera?.data.id ?? null);

    this.keyframes.tick(dt);
    this.views.update(time);
    this.cams.update(dt, time, this.lastViewerPos, this.lastViewerQuat);
    this.actors.updateLabels(time);
    this.driftMarker.update(time);

    if (this.views.mode === 'camera') {
      this.cams.renderMonitor(this.renderer, this.scene3, this.hiddenForVirtualCamera());
    }

    // FPS + wrist readouts (throttled).
    this.fpsFrames++;
    if (time - this.fpsLast > 1000) {
      this.debug.fps = (this.fpsFrames * 1000) / (time - this.fpsLast);
      this.fpsFrames = 0;
      this.fpsLast = time;
    }
    if (time - this.wristRefreshLast > 250) {
      this.wristRefreshLast = time;
      this.wrist.setDebug([`fps ${this.debug.fps.toFixed(0)} · ${this.views.mode}`, ...this.debug.tail(2)]);
      if (this.keyframes.active) this.wrist.setSlider('scrub', this.keyframes.normalizedT);
      this.wrist.setLabel('play', this.keyframes.playing ? '⏸ Pause' : '▶ Play');
    }

    this.renderer.render(this.scene3, this.camera);
  }

  private updateHover(rc: THREE.Raycaster | null): void {
    let next: { kind: 'actor' | 'camera'; id: string } | null = null;
    if (rc && !this.draggedActor && !this.draggedCamera && !this.miniGrabbing) {
      if (this.hoverTargetsVersion !== this.contentVersion) {
        this.hoverTargets = [...this.actors.raycastTargets(), ...this.cams.raycastTargets()];
        this.hoverTargetsVersion = this.contentVersion;
      }
      const hits = rc.intersectObjects(this.hoverTargets, true);
      for (const hit of hits) {
        const actorId = findActorId(hit.object);
        if (actorId) {
          next = { kind: 'actor', id: actorId };
          break;
        }
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (typeof o.userData.cameraId === 'string') {
            next = { kind: 'camera', id: o.userData.cameraId };
            break;
          }
          o = o.parent;
        }
        if (next) break;
      }
    }
    if (next?.id !== this.hover?.id || next?.kind !== this.hover?.kind) {
      this.hover = next;
      this.actors.setHovered(next?.kind === 'actor' ? next.id : null);
    }
  }
}

try {
  new App();
} catch (e) {
  // Graceful degradation: even without WebGL, show what's wrong.
  const landing = document.getElementById('landing')!;
  landing.innerHTML = `<div class="wrap"><h1>SetView</h1><div class="diag"><span class="bad">✗ Could not start the 3D renderer</span><ul><li>${(e as Error).message}</li><li>SetView needs a browser with WebGL and WebXR — use the Meta Quest or Android XR browser.</li></ul></div></div>`;
  console.error(e);
}
