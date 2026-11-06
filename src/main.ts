// ---------------------------------------------------------------------------
// SetView entry point: builds the renderer/scene, wires every subsystem, and
// owns the per-frame loop and the input → action routing table.
// ---------------------------------------------------------------------------

import './style.css';
import * as THREE from 'three';
import {
  addNote,
  applyMarkOp,
  check180LineOfAction,
  computeFocusDistance,
  createAtmosphereConfig,
  createCameraSetup,
  aspectValue,
  createScene,
  duplicateActor,
  duplicateCameraSetup,
  normalizeScene,
  sensorFormat,
  type CameraSetupData,
  type MarkOp,
  type SceneData,
} from './model.ts';
import { VolumetricManager } from './volumetrics.ts';
import { TransformGizmo } from './transformGizmo.ts';
import { classifyShotSize, findCamerasInFrustums, hFovDeg, vFovDeg } from './lens.ts';
import { classifyCameraMove } from './timeline.ts';
import { History } from './history.ts';
import { cycleStance, isStanceId, poseFor, type StanceId } from './pose.ts';
import { locomotionAmount, snapTurnAngle } from './locomotion.ts';
import { roomCaptureMessage, scanFloorY, summarizeScan, translateScanY, type ScanSource } from './scan.ts';
import { captureScanFromFrame } from './scanner.ts';
import { LocationRenderer, type LocationMode } from './location.ts';
import { checkSupport, SessionManager } from './session.ts';
import { InputManager, type Hand } from './input.ts';
import { ActorManager, findActorId, type ActorObject } from './actors.ts';
import { KeyframeSystem } from './keyframes.ts';
import { CameraSystem, type CamObject } from './cameraView.ts';
import { DesktopPreview } from './preview.ts';
import { MonitorRecorder } from './recorder.ts';
import { recordingClock, shouldIncludeAudioTrack } from './recording.ts';
import { ViewManager } from './views.ts';
import { GUIDE_AUTO_SHOW_S, type GuideContext } from './guide.ts';
import { GuideView } from './guideView.ts';
import {
  type InteractionMode,
  nextPlaceMode,
  type PlaceArm,
  wheelMenu,
  type WheelPath,
} from './wheel.ts';
import { WheelPanel } from './wheelView.ts';
import {
  floorCorrection,
  floorCorrectionFromScan,
  floorSettled,
  newFloorEstimate,
  observeFloorHit,
} from './floor.ts';
import { Persistence } from './persistence.ts';
import { formatStorageLine } from './persistence.ts';
import { disposeModel, importLocationBytes, parseModelBytes, type UnitChoice, type UpAxisChoice } from './locationImport.ts';
import type { SceneFileKind } from './sceneImport.ts';
import { sceneDropName } from './dropBox.ts';
import type { ScanSourceFile } from './model.ts';
import {
  buildWristPanel,
  DebugLog,
  DriftMarker,
  Landing,
  NoteEditor,
  openAiAnalysisModal,
  openActorStudioModal,
  openCameraGripModal,
  openDailiesVideoStudioModal,
  openDmxBridgeStudioModal,
  openGaussianSplatStudioModal,
  openIcvfxStudioModal,
  openAcousticsStudioModal,
  openSolarStudioModal,
  openScreenplayBreakdownModal,
  openWebXRProfilerModal,
  openVRComfortModal,
  openSetDressingStudioModal,
  openLiveLinkModal,
  openNleExportModal,
  openUe5ExportModal,
  VcamHudOverlay,
  type UIPanel,
} from './ui.ts';
import { LedVolumeRenderer } from './icvfxRenderer.ts';
import { createLedVolumeConfig } from './icvfxEngine.ts';
import { AcousticsRenderer } from './acousticsRenderer.ts';
import { createAcousticsConfig } from './acousticsEngine.ts';
import { SolarEnvironmentRenderer } from './solarRenderer.ts';
import { createSolarEnvironmentConfig } from './solarEngine.ts';
import { ScreenplayContinuityRenderer } from './screenplayRenderer.ts';
import {
  createScreenplayConfig,
  createVRProfilerConfig,
  createVRComfortConfig,
  createSetDressingConfig,
  detectSemanticRegions,
  generateThemeScatter,
  type SettledPropItem,
  type Vec3,
} from './model.ts';

/** One reach-envelope target handed to the comfort overlay. See comfortReachTargets(). */
interface ComfortReachTarget {
  id: string;
  name: string;
  position: Vec3;
  category: 'prop' | 'camera_grip' | 'actor';
}
import { WebXRProfilerRuntime } from './webxrProfiler.ts';
import { SpatialComfortRenderer } from './comfortRenderer.ts';
import { SetDressingRenderer } from './setDressingRenderer.ts';
import {
  applyAiMutationsToScene,
  migrateEmbeddedGeminiKey,
  normalizeSetDressingConfig,
} from './setDressingEngine.ts';
import { STUDIO_MODAL_ROOT_CLASSES } from './ui.ts';
import { AnimaticVideoRenderer } from './animaticVideoRenderer.ts';

import { ViewfinderRig } from './viewfinder.ts';
import { DirectorSmartwatch } from './smartwatch.ts';
import { TakeLibrary, type TakeRecord } from './dailies.ts';
import type { TakeMetadata } from './recorder.ts';
import { secondsToSmpte } from './timecode.ts';
import { sampleActiveAudioCues } from './audioCues.ts';
import { globalSpatialSoundEngine } from './soundEngine.ts';
import { check30DegreeRule, checkEyelineMatch } from './continuity.ts';
import {
  applyScenePatch,
  EntityLockManager,
  PeerRoster,
  type CollabScenePatch,
} from './collab.ts';
import { WebRtcCollabSession } from './network.ts';
import { CollabAvatarManager } from './avatars.ts';
import { openCollabModal, openPropsLibraryModal } from './ui.ts';
import { PropsManager, type PropObject } from './propsManager.ts';
import { globalPropRenderer } from './propRenderer.ts';
import { getBuiltinPropDefinition, propSpawnHitUsable, settlePropY, snapPropToGrid } from './props.ts';
import { locomotionSuppressed, type LocomotionState } from './locomotion.ts';
import { quatYaw } from './scan.ts';
import { submenuForSector, wheelPropPreset, wheelSectorRoute } from './wheel.ts';
import { globalPropStore } from './propStore.ts';
import { LiveLinkStreamer } from './liveLinkStreamer.ts';
import { DmxStreamer } from './dmxStreamer.ts';
import { GaussianSplatRenderer } from './gaussianRenderer.ts';
import { XRPerformanceGovernor } from './xrPerformance.ts';
import { globalSpatialFeedback } from './spatialFeedback.ts';
import { ContextualRadialView } from './contextualRadialView.ts';
import { openPerformanceSettingsModal, PerformanceHudOverlay } from './ui.ts';
import type { ContextQuickAction } from './spatialInteraction.ts';

// Wrist-panel mount relative to the LEFT controller grip space.
// Tune on-headset if the panel sits awkwardly (see TESTING.md).
const WRIST_POS = new THREE.Vector3(0.0, 0.05, 0.16);
const WRIST_ROT_X = -1.05; // radians, tilt toward the face

// The tool wheel rides the LEFT hand and is shown whenever that hand is
// tracked and this close to the head — no gaze, no summon gesture (repeated
// QA showed gaze-summon left users with NO menu access at all). Beyond this
// the grip is untracked/stuck at the world origin, so we hide the dead wheel.
const WHEEL_MAX_REACH_M = 1.25;
// Where the wheel parks when the menu BUTTON pops it in front of the face
// (camera space: half a meter ahead, a touch low). A hard, hand-free path to
// the menu for controller users.
const WHEEL_FRONT_POS = new THREE.Vector3(0, -0.05, -0.5);

// Reused each frame while dragging to avoid a Vector3 clone per frame.
const _pt = new THREE.Vector3();
// Reused for the world → scene-space re-basing at scan capture.
const _worldToScene = new THREE.Matrix4();
// Reused by the post-reset anchor check (anchorPosition writes into it).
const _anchorProbe = new THREE.Vector3();
// Reused each frame for locomotion basis vectors (no per-frame allocation).
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tip = new THREE.Vector3();
// Reused by the carried-piece stick spin (world up taken into the ray's frame).
const _qParentInv = new THREE.Quaternion();
const _qSpin = new THREE.Quaternion();
const _spinAxis = new THREE.Vector3();
// Reused for the contextual radial's per-frame follow of its target.
const _radialPos = new THREE.Vector3();

/** Wheel / Prop Library props with no live hit land this far ahead of you (m). */
const PROP_SPAWN_AHEAD_M = 1.2;
/** How long a load error or warning holds the wrist status line (ms). */
const STATUS_NOTE_MS = 6000;

/** Smooth-glide speed (m/s) for thumbstick locomotion through the set. */
const LOCOMOTION_SPEED = 1.8;
/** Radial stick deadzone for glide (shared by the hot-path gate and the math). */
const LOCOMOTION_DEADZONE = 0.15;
/** Snap-turn increment (radians) per thumbstick push. */
const SNAP_TURN_RAD = Math.PI / 6; // 30°

/** Give the platform this long to surface tracked meshes before giving up. */
const SCAN_TIMEOUT_MS = 30_000;
/** If nothing is tracked after this long, say what to do about it (once). */
const SCAN_HINT_AFTER_MS = 5_000;
/** Run Space Setup needs a second press within this window (anchor warning). */
const SPACE_SETUP_CONFIRM_MS = 5_000;
/** Longest a scan waits for the floor estimate to settle before capturing anyway. */
const SCAN_FLOOR_WAIT_MS = 5_000;
/** After a tracking reset or Space Setup, anchors get this long to report before re-anchoring. */
const ANCHOR_RECHECK_GRACE_MS = 1_000;

/** What the pointer ray is over ('furniture' id = scan mesh index as string). */
type Hover = { kind: 'actor' | 'camera' | 'furniture' | 'prop'; id: string } | null;

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
  private props: PropsManager;
  private keyframes: KeyframeSystem;
  private cams: CameraSystem;
  private views: ViewManager;
  private preview: DesktopPreview;
  private recorder = new MonitorRecorder();
  private location = new LocationRenderer();
  private splatRenderer = new GaussianSplatRenderer();
  private volumetrics: VolumetricManager;
  private gizmo: TransformGizmo;
  private wrist: UIPanel;
  private wristMount = new THREE.Group();
  private landing: Landing;
  private noteEditor: NoteEditor;
  private driftMarker: DriftMarker;
  private viewfinder = new ViewfinderRig();
  private smartwatch = new DirectorSmartwatch();
  private takeLibrary = new TakeLibrary();
  private liveLinkStreamer: LiveLinkStreamer;
  private vcamHud: VcamHudOverlay;
  private performanceGovernor = new XRPerformanceGovernor();
  private performanceHud: PerformanceHudOverlay;
  private profilerRuntime: WebXRProfilerRuntime;
  private comfortRenderer: SpatialComfortRenderer;
  private contextualRadial = new ContextualRadialView();

  // interaction state
  /** Dress = adjust the physical space; Block = plan the shot. */
  private interactionMode: InteractionMode = 'block';
  private wheel = new WheelPanel();
  /** Current wheel menu level; resets to root whenever the wheel hides. */
  private wheelPath: WheelPath = 'root';
  private wheelShown = false;
  /** Menu button popped the wheel to a head-anchored spot in front of you. */
  private wheelInFront = false;
  /** The pointer (ray or fingertip) is on the wheel this frame — so a pinch/
   *  trigger is a MENU press and must never reach the world (place/select). */
  private pointerOnWheel = false;
  /** Right fingertip is over the wheel disc (freezes the billboard mid-tap). */
  private tipOnWheel = false;
  /** Placement is an ARMED tool, off by default — a bare pinch never places. */
  private placeMode: PlaceArm = 'none';
  /** Catalog id Place: Prop drops: the last Props sub-wheel preset picked. */
  private lastPropPreset = 'directors_chair';
  /**
   * A message the wrist status line keeps showing until `until` (ms,
   * performance.now) instead of the selection summary refreshWristState writes,
   * which otherwise replaced a load error the moment the spawn path selected
   * the prop.
   */
  private statusNote: { text: string; until: number } | null = null;
  /** Reused every frame for the glide gate (no per-frame allocation). */
  private readonly locoState: LocomotionState = {
    viewMode: 'full',
    draggingActor: false,
    draggingCamera: false,
    draggingProp: false,
    draggingFurniture: false,
    miniGrabbing: false,
  };
  private selectedActorId: string | null = null;
  private selectedPropId: string | null = null;
  private hover: Hover = null;
  private draggedActor: ActorObject | null = null;
  private draggedCamera: CamObject | null = null;
  private draggedProp: PropObject | null = null;
  private draggedMonitor = false;
  /** Scanned furniture mesh being grip-carried (Stage 1 movable furniture). */
  private draggedFurniture: THREE.Object3D | null = null;
  /** Per-session floor-height sanity check (see floor.ts). */
  private floorEst = newFloorEstimate();

  private observeFloor(hitY: number, timeMs: number): void {
    observeFloorHit(this.floorEst, hitY, timeMs);
  }
  private miniGrabbing = false;
  /** Controls guide: auto-shows at session start; wrist "?" pins it. */
  private guide = new GuideView();
  private guideAutoUntil = 0;
  private guideSticky = false;
  private notesVisible = true;
  private pendingReanchorActors: ActorObject[] = [];
  private pendingReanchorCams: CamObject[] = [];
  /** Non-null while waiting for the platform's room data to capture. */
  private pendingScan: {
    /** Clock start (loop time), or -1 to (re)start it on the next frame. */
    startedAt: number;
    /** Scan Room re-aligned first; capture waits until that fade has applied. */
    awaitingRealign: boolean;
    sources: ScanSource[];
    floorHinted: boolean;
    hinted: boolean;
  } | null = null;
  /** First 'Run Space Setup' press arms it; a second press before this time runs it. */
  private spaceSetupConfirmUntil = 0;
  /** Session whose Space Setup request is still in flight (OS flow open). */
  private spaceSetupSession: XRSession | null = null;
  /**
   * Armed by a reference-space reset or a finished Space Setup; recheckAnchors
   * re-anchors only what lost its anchor. `due` is loop time, -1 = start the
   * grace window on the next frame.
   */
  private anchorRecheck: { due: number; shiftHinted: boolean } | null = null;
  /** Blob id currently loaded into the location renderer. */
  private displayedScanId: string | null = null;
  /** Invalidates stale async scan-blob loads (scene switches, undo). */
  private locationSyncToken = 0;
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
  /** Reused backing store for comfortReachTargets(); never reallocated per frame. */
  private readonly comfortTargetBuffer: ComfortReachTarget[] = [];
  private hoverTargets: THREE.Object3D[] = [];
  private hoverTargetsVersion = -1;
  /** The mode hoverTargets was built for: Block and Dress grab different things. */
  private hoverTargetsMode: InteractionMode | null = null;
  /** Uploaded prop models already reported as not shown / incomplete in this scene.
   *  Every props.setScene (undo, redo, remote patch, AI edit) rebuilds them and
   *  fails the same way again; each key is reported once until the scene changes. */
  private readonly reportedPropLoadErrors = new Set<string>();
  private readonly reportedPropLoadWarnings = new Set<string>();

  // Multi-user WebRTC collaborative session
  private collabSession: WebRtcCollabSession;
  private collabRoster = new PeerRoster();
  private collabLockManager = new EntityLockManager();
  private collabAvatars = new CollabAvatarManager();
  private lastCollabBroadcast = 0;

  // Soundstage DMX512, Art-Net & sACN bridge streamer
  private dmxStreamer: DmxStreamer;
  // Virtual Production ICVFX LED Volume renderer
  private icvfxRenderer: LedVolumeRenderer;
  // Soundstage Acoustics & Spatial Dialogue renderer
  private acousticsRenderer: AcousticsRenderer;
  // Natural Sky & Physical Solar Ephemeris renderer
  private solarRenderer: SolarEnvironmentRenderer;
  // Screenplay 180-degree Line of Action & Continuity renderer
  private screenplayRenderer: ScreenplayContinuityRenderer;
  // Virtual Set Dressing & Generative Scatter renderer
  private setDressingRenderer: SetDressingRenderer;

  constructor() {

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setFoveation(1);
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.inset = '0';
    // The canvas paints above the landing page (positioned, later in DOM), so
    // it must not hit-test or every button underneath is unclickable. Only the
    // desktop preview needs pointer events (OrbitControls); it toggles this.
    this.renderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(this.renderer.domElement);

    // Cheap lighting: hemisphere + one directional, no shadows (perf budget).
    this.scene3.add(new THREE.HemisphereLight(0xffffff, 0x3a4152, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(1.5, 3, 1);
    this.scene3.add(sun);
    this.scene3.add(this.camera); // so head-attached children render
    this.scene3.add(this.contentRoot);

    this.migrateGeminiKeyOnce();
    this.sceneData = this.persistence.loadCurrentOrCreate();
    // Sprite raycasting (name labels, note cards) requires raycaster.camera.
    this.raycaster.camera = this.camera;

    this.session = new SessionManager(this.renderer, (m) => this.debug.log(m));
    this.session.onReferenceSpaceReset = () => this.onReferenceSpaceReset();
    this.session.onVisibilityChange = (state) => {
      // Back from system UI (Space Setup, the OS menu): the scan's timeout
      // restarts instead of expiring for time spent outside the app.
      if (state === 'visible' && this.pendingScan) this.pendingScan.startedAt = -1;
    };
    this.scene3.add(this.session.reticle);

    this.input = new InputManager(this.renderer, this.scene3);
    this.actors = new ActorManager(this.session, this.sceneData);
    this.contentRoot.add(this.actors.group);
    this.props = new PropsManager(this.session, this.sceneData);
    this.contentRoot.add(this.props.group);
    // An uploaded model can finish loading frames after setScene (undo, redo,
    // remote patch, scene load): refresh the hover and Camera View caches then.
    this.props.onObjectsChanged = () => {
      this.contentVersion++;
    };
    // An uploaded model that can't be shown falls back to a box: say why, once
    // per model and scene. Rebuilds would otherwise bring back a dismissed
    // banner and retake the wrist line after every undo or peer edit.
    globalPropRenderer.onLoadError = (key, err) => {
      if (this.reportedPropLoadErrors.has(key)) return;
      this.reportedPropLoadErrors.add(key);
      const reason = err instanceof Error ? err.message : String(err);
      this.debug.log(`prop model ${key} failed to load, showing a box: ${reason}`);
      this.noteStatus(`Prop model not shown: ${reason}`);
      // The wrist is invisible on the 2D page, where uploads are placed from.
      // One banner for all of them, so they never push the storage and import
      // banners (and their Export button) out of the landing's few slots.
      const n = this.reportedPropLoadErrors.size;
      this.landing.showBanner(
        n === 1
          ? `An uploaded prop model could not be shown (a box stands in): ${reason}`
          : `${n} uploaded prop models could not be shown (boxes stand in). Latest: ${reason}`,
        'warn',
        'prop-load',
      );
    };
    globalPropRenderer.onLoadWarning = (key, message) => {
      if (this.reportedPropLoadWarnings.has(key)) return;
      this.reportedPropLoadWarnings.add(key);
      this.debug.log(`prop model ${key}: ${message}`);
      this.noteStatus(`Prop model: ${message}`);
    };
    this.keyframes = new KeyframeSystem(this.sceneData, this.actors);
    this.contentRoot.add(this.keyframes.vizGroup);
    this.cams = new CameraSystem(this.sceneData, this.session, this.contentRoot);
    this.keyframes.setCameras(this.cams);
    this.scene3.add(this.cams.monitor);
    this.camera.add(this.cams.frameLines);
    // Scanned location lives under contentRoot: teleport walkthrough, the
    // miniature diorama, and camera framing all see the room where the actors are.
    this.contentRoot.add(this.location.group);
    this.contentRoot.add(this.splatRenderer.group);
    this.contentRoot.add(this.collabAvatars.group);
    this.views = new ViewManager(this.contentRoot, this.camera);
    this.scene3.add(this.views.platform);
    this.driftMarker = new DriftMarker(this.debug);
    this.scene3.add(this.driftMarker.group);
    this.volumetrics = new VolumetricManager(this.scene3);
    this.scene3.add(this.contextualRadial.group);
    this.contextualRadial.setOnAction((action, entityId, entityType) =>
      this.handleContextQuickAction(action, entityId, entityType),
    );

    // Parked: TransformGizmo's ray input (onPointerDown/Move/Up) is not wired
    // to any controller yet, so its handles could not be moved. Selection no
    // longer attaches it (no inert handles in the headset); it stays hidden.
    this.gizmo = new TransformGizmo();
    this.scene3.add(this.gizmo.root);
    this.gizmo.events.onTransform = () => {
      this.markDirty();
      this.contentVersion++;
    };
    this.gizmo.events.onDragStart = () => {
      globalSpatialFeedback.triggerHaptic('both', 'grab');
    };
    this.gizmo.events.onDragEnd = () => {
      globalSpatialFeedback.triggerHaptic('both', 'snap');
    };
    this.gizmo.events.onHoverChange = (axis) => {
      if (axis) globalSpatialFeedback.triggerHaptic('both', 'tick');
    };

    this.collabSession = new WebRtcCollabSession({
      onPeerJoined: (peer) => {
        this.collabRoster.addOrUpdatePeer(peer);
        this.collabAvatars.updatePeer(peer);
        this.debug.log(`collab: peer joined ${peer.name} (${peer.role})`);
      },
      onPeerLeft: (peerId) => {
        this.collabRoster.removePeer(peerId);
        this.collabAvatars.removePeer(peerId);
        this.collabLockManager.releaseByPeer(peerId);
        this.debug.log(`collab: peer left ${peerId}`);
      },
      onPresence: (presence) => {
        this.collabRoster.addOrUpdatePeer(presence);
        this.collabAvatars.updatePeer(presence);
      },
      onPatch: (patch) => {
        this.applyRemotePatch(patch);
      },
      onLock: (lock) => {
        this.collabLockManager.acquireLock(
          lock.entityId,
          lock.entityType,
          lock.lockedByPeerId,
          lock.lockedByPeerName,
          lock.expiresAtTs - lock.lockedAtTs,
        );
      },
      onUnlock: (entityId, peerId) => {
        this.collabLockManager.releaseLock(entityId, peerId);
      },
      onSnapshotRequest: (peerId) => {
        this.collabSession.sendSnapshot(peerId, this.sceneData);
      },
      onSnapshotReceived: (scene) => {
        this.loadScene(scene);
        this.debug.log(`collab: synchronized scene snapshot (${scene.name})`);
      },
      onAudioStream: (peerId, stream) => {
        this.collabSession.setupRemoteAudio(peerId, stream);
      },
    });

    // Desktop (non-XR) preview of the current scene: actors/stances/paths and
    // camera gizmos stay visible; AR-session chrome is hidden.
    this.preview = new DesktopPreview(this.renderer, this.scene3, this.contentRoot, this.keyframes, [
      this.session.reticle,
      this.cams.monitor,
      this.cams.frameLines,
      this.views.platform,
      this.views.fadeSphere,
      this.driftMarker.group,
      this.guide.left,
      this.guide.right,
    ]);
    this.preview.onClose = () => {
      this.landing.show(true);
      this.refreshLanding();
    };
    this.preview.onOpenCollab = () => this.openCollabDialog();
    this.preview.onOpenProps = () => void this.openPropsLibrary();
    this.preview.onOpenLiveLink = () => this.openLiveLinkDialog();
    this.preview.onOpenDmxBridge = () => this.openDmxBridgeDialog();
    this.preview.onOpenIcvfx = () => this.openIcvfxStudioDialog();
    this.preview.onOpenAcoustics = () => this.openAcousticsStudioDialog();
    this.preview.onOpenSolar = () => this.openSolarStudioDialog();
    this.preview.onOpenScreenplay = () => this.openScreenplayStudioDialog();
    this.preview.onOpenWebXRProfiler = () => this.openWebXRProfilerDialog();
    this.preview.onOpenVRComfort = () => this.openVRComfortDialog();
    this.preview.onOpenSetDressing = () => this.openSetDressingDialog();
    // Room display toggle (the scan was invisible on desktop: no control, and
    // the mode always came back Hidden).
    this.preview.getLocationMode = () => (this.sceneData.scan ? this.location.mode : null);
    this.preview.onCycleLocationMode = () => void this.cycleLocationMode();

    this.profilerRuntime = new WebXRProfilerRuntime(this.sceneData.profiler);
    this.comfortRenderer = new SpatialComfortRenderer(this.sceneData.comfort);
    this.contentRoot.add(this.comfortRenderer.group);
    this.camera.add(this.comfortRenderer.vignetteMesh);

    this.setDressingRenderer = new SetDressingRenderer(this.sceneData.setDressing);
    this.contentRoot.add(this.setDressingRenderer.group);

    this.icvfxRenderer = new LedVolumeRenderer(this.sceneData.icvfx);
    this.contentRoot.add(this.icvfxRenderer.group);


    this.acousticsRenderer = new AcousticsRenderer(this.sceneData.acoustics);
    this.contentRoot.add(this.acousticsRenderer.group);

    this.solarRenderer = new SolarEnvironmentRenderer(this.sceneData.solar);
    this.contentRoot.add(this.solarRenderer.group);

    this.screenplayRenderer = new ScreenplayContinuityRenderer(this.sceneData.screenplay);
    this.contentRoot.add(this.screenplayRenderer.group);

    this.liveLinkStreamer = new LiveLinkStreamer(this.sceneData.livelink);
    this.dmxStreamer = new DmxStreamer(this.sceneData.dmxBridge);
    this.vcamHud = new VcamHudOverlay(this.liveLinkStreamer, () => this.openLiveLinkDialog());
    this.performanceHud = new PerformanceHudOverlay(this.performanceGovernor, () => this.openPerformanceSettings());

    const overlayRoot = document.getElementById('overlay')!;
    // A trigger or pinch on a DOM overlay control (a studio modal, the note
    // editor, a HUD) should only click it. Without this the same press also
    // fires an XR select, which places or selects in the world behind the
    // dialog (WebXR DOM Overlays 'beforexrselect'). #overlay itself is
    // pointer-events:none, so presses that hit no control still reach the world.
    overlayRoot.addEventListener('beforexrselect', (e) => e.preventDefault());
    this.noteEditor = new NoteEditor(overlayRoot);

    this.wrist = buildWristPanel();
    this.wristMount.add(this.wrist.group);
    this.wrist.group.position.copy(WRIST_POS);
    this.wrist.group.rotation.x = WRIST_ROT_X;
    // The tool wheel floats just above the wrist; the detailed panel hangs
    // below it, shown only while the wheel's "More" is pinned.
    this.wristMount.add(this.wheel.group);
    // In the PALM (just above the grip origin), not up the forearm — hands
    // tap it directly, so it must sit where the fingers naturally reach. It
    // billboards toward the eyes each frame while shown.
    this.wheel.group.position.set(0, 0.05, -0.04);
    this.wheel.onPress = (id) => this.onWheelPress(id);

    this.setupViewfinderAndSmartwatch();

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
        void this.persistence.duplicateScene(id).then((copy) => {
          if (copy) this.loadScene(copy);
        });
      },
      onDelete: (id) => {
        this.persistence.deleteScene(id);
        if (this.sceneData.id === id) this.newScene('Scene 1');
        this.refreshLanding();
      },
      onExport: (id) => this.exportSceneFile(id),
      onImport: (file) => {
        void this.persistence.importScene(file).then((res) => {
          if (!res.ok) {
            this.reportDataIssue(`import failed: ${res.message}`, 'import');
            return;
          }
          this.loadScene(res.scene);
          if (!res.saved) {
            // The scene also gets a "Not saved" row with its own Export button.
            const id = res.scene.id;
            this.reportDataIssue(
              `"${res.scene.name}" is open but could not be saved (storage full), so it will be gone after a reload. Export it now, or delete scenes you no longer need.`,
              'import',
              { label: 'Export', run: () => this.exportSceneFile(id) },
            );
          }
          if (res.heavy) this.requestPersistentStorage();
        });
      },
      onRename: (id, name) => {
        this.persistence.renameScene(id, name);
        if (this.sceneData.id === id) this.sceneData.name = name;
        this.refreshLanding();
      },
      onExportFloorplan: (id) => this.persistence.exportFloorplan(id),
      onExportShotList: (id) => this.persistence.exportShotList(id),
      // Landing entries only run outside a session, where modalHost() is body.
      onExportNleTimeline: (id) =>
        openNleExportModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          this.modalHost() ?? document.body,
        ),
      onExportUe5Bridge: (id) =>
        openUe5ExportModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          this.modalHost() ?? document.body,
        ),
      onAiShotAnalysis: (id) =>
        openAiAnalysisModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          this.modalHost() ?? document.body,
        ),
      onRemoveScan: (id) => this.removeScan(id),
      onExportScanObj: (id) => void this.persistence.exportScanObj(id),
      onExportScanPly: (id) => void this.persistence.exportScanPly(id),
      onExportScanUsd: (id) => void this.persistence.exportScanUsd(id),
      onExportScanGeoJson: (id) => void this.persistence.exportScanGeoJson(id),
      onExportScanPackage: (id) => void this.persistence.exportScanPackage(id),
      onAddSyntheticScan: (id) => {
        // The live scene is looked up after the scan blob is written, so an undo or
        // restore landing during that await is not overwritten by an older object.
        void this.persistence.attachSyntheticScan(id, () => this.sceneData).then((res) => {
          // The scan was attached to the live scene object itself. Replacing
          // this.sceneData with a reloaded copy (as before) left actors, props and
          // cameras editing the old object while autosave wrote the new one.
          // Mirrors removeScan: show it and make it undoable.
          if (res && res.scene === this.sceneData) {
            this.syncLocation();
            this.history.record(res.scene);
          }
          this.refreshLanding();
        });
      },
      onImportLocation: (id, file, opts) => void this.importLocationFile(id, file, opts),
      onAddPropFile: async (file) => !!(await globalPropStore.saveAssetFromFile(file)),
      onSendSceneToComputer: (id) => this.sendSceneToComputer(id),
      getStorageSummary: () => this.persistence.storageReport().then(formatStorageLine),
      onSetLedVolumeEnabled: (sceneId, enabled) => this.setLedVolumeEnabled(sceneId, enabled),
      onPreview: (id) => this.openPreview(id),
      getScene: (id) =>
        id === this.sceneData.id ? this.sceneData : this.persistence.loadScene(id),
      onUpdateCamera: (sceneId, cameraId, patch) => this.updateCamera(sceneId, cameraId, patch),
      onSetPace: (sceneId, walkSpeed) => this.setScenePace(sceneId, walkSpeed),
      onSetStance: (sceneId, actorId, stance) => this.setActorStance(sceneId, actorId, stance),
      onSetScale: (sceneId, actorId, scale) => this.setActorScale(sceneId, actorId, scale),
      onEditMarks: (sceneId, actorId, op) => this.editActorMarks(sceneId, actorId, op),
      onCollab: () => this.openCollabDialog(),
      onPropsLibrary: () => void this.openPropsLibrary(),
      onOpenLiveLink: () => this.openLiveLinkDialog(),
      onGaussianSplatStudio: (sceneId) => {
        const sc = sceneId === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openSplatStudioDialog(sc);
      },
      onOpenDailiesStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        const host = this.studioHost('Dailies Studio');
        if (!host) return;
        openDailiesVideoStudioModal(
          sc,
          async (options, onProgress) => {
            const renderer = new AnimaticVideoRenderer();
            return await renderer.renderAnimaticVideo(
              sc,
              undefined,
              options,
              onProgress,
              sc.id === this.sceneData.id ? this.scene3 : undefined,
              sc.id === this.sceneData.id ? this.contentRoot : undefined,
            );
          },
          host,
        );
      },
      onOpenDmxBridge: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openDmxBridgeDialog(sc);
      },
      onOpenIcvfxStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openIcvfxStudioDialog(sc);
      },
      onOpenAcousticsStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openAcousticsStudioDialog(sc);
      },
      onOpenSolarStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openSolarStudioDialog(sc);
      },
      onOpenScreenplayStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openScreenplayStudioDialog(sc);
      },
      onOpenWebXRProfiler: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openWebXRProfilerDialog(sc);
      },
      onOpenVRComfort: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openVRComfortDialog(sc);
      },
      onOpenSetDressingStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
        this.openSetDressingDialog(sc);
      },
    });


    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (roomParam) {
      setTimeout(() => this.openCollabDialog(), 300);
    }

    // Save, storage and prop-library failures reach the debug log, the 3D wrist and
    // a banner on the 2D landing page (the wrist is invisible there). A failed save
    // also re-lists the scenes, so the scene shows a "Not saved" row with Export
    // (in AR the hidden landing is not rebuilt per failed autosave; session end
    // re-lists it). Failures raised before this point (the first-run save in
    // loadCurrentOrCreate) were held by Persistence and are delivered here.
    this.persistence.onError = (m) => {
      this.reportDataIssue(m);
      if (!this.renderer.xr.isPresenting) this.refreshLanding();
    };
    globalPropStore.onError = (m) => this.reportDataIssue(m);

    // Fires whichever way a take ends (wrist toggle, camera deleted, session
    // end, MAX_RECORD_S cap, encoder error) — the file is already downloading.
    this.recorder.onStopped = (saved) => {
      this.debug.log(saved ? `saved ${saved}` : 'recording discarded (nothing captured)');
      this.refreshWristState();
    };

    this.wireSubsystems();
    this.loadScene(this.sceneData);
    if (import.meta.env.DEV) this.installDevTestHooks();
    // ?preview auto-opens the desktop viewer on the current scene (also the
    // hook for the headless render smoke — see test notes in TESTING.md).
    if (new URLSearchParams(location.search).has('preview')) this.openPreview(this.sceneData.id);
    // Sweep scan blobs no scene references (left behind by re-scans/undo —
    // deliberately deferred to launch so in-session undo can restore them).
    void this.persistence.pruneOrphanScans();

    void checkSupport().then((report) => this.landing.setDiagnostics(report));
    window.addEventListener('beforeunload', () => this.persistence.saveNow(this.sceneData));
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  private setupViewfinderAndSmartwatch(): void {
    this.scene3.add(this.viewfinder.group);
    this.wristMount.add(this.smartwatch.group);

    this.cams.setTakeLibrary(this.takeLibrary);
    this.recorder.onTakeCreated = (take: TakeRecord) => {
      this.takeLibrary.addTake(take);
      this.debug.log(`🎞️ Dailies: Saved Take #${take.takeNumber} (${take.cameraName} ${Math.round(take.focalLengthMm)}mm)`);
    };

    this.viewfinder.onStampCamera = (pos, dir, focalMm) => {
      const rotY = Math.atan2(-dir.x, -dir.z);
      const cam = createCameraSetup(
        this.sceneData,
        { x: pos.x, y: pos.y, z: pos.z },
        { x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) },
        focalMm as any,
        '16:9'
      );
      this.cams.adopt(cam);
      this.cams.setActive(cam.id);
      this.history.record(this.sceneData);
      this.markDirty();
      this.debug.log(`🎥 Stamped ${cam.name} (${focalMm}mm) via Two-Hand Viewfinder`);
    };

    this.smartwatch.onScrub = (ratio) => {
      if (this.cams.dailiesActive) {
        this.cams.scrubDailies(ratio);
      } else {
        this.keyframes.scrub(ratio);
      }
    };

    this.smartwatch.onPress = (id) => {
      if (id === 'cam') {
        if (this.sceneData.cameras.length > 0) {
          const active = this.cams.active;
          const idx = this.sceneData.cameras.findIndex((c) => c.id === active?.data.id);
          const nextCam = this.sceneData.cameras[(idx + 1) % this.sceneData.cameras.length];
          this.cams.setActive(nextCam.id);
          this.debug.log(`🎥 Smartwatch: Selected ${nextCam.name}`);
        }
      } else if (id === 'mark') {
        const activeCam = this.cams.active;
        if (activeCam) {
          const res = this.keyframes.captureCamera(activeCam);
          if (res === 'ok') {
            const count = activeCam.data.keyframes?.length ?? 1;
            this.debug.log(`📍 Smartwatch: Camera Mark #${count} recorded for ${activeCam.data.name}`);
            this.history.record(this.sceneData);
            this.markDirty();
          } else {
            this.debug.log(`⚠️ Max marks (${this.keyframes.maxCameraKeyframes}) reached for camera`);
          }
        }
      } else if (id === 'village') {
        const mode = this.cams.cycleVillageMode();
        this.debug.log(`🎛️ Video Village Mode: ${mode.toUpperCase()}`);
      } else if (id === 'rec') {
        this.toggleRecording();
      } else if (id === 'play') {
        if (this.cams.dailiesActive) {
          const playing = this.cams.togglePlayDailies();
          this.debug.log(playing ? '▶ Dailies: Playing Take' : '⏸ Dailies: Paused Take');
        } else {
          const playing = this.keyframes.togglePlay();
          this.debug.log(playing ? '▶ Timeline: Playing' : '⏸ Timeline: Paused');
        }
      } else if (id === 'dailies') {
        const active = this.cams.toggleDailies();
        this.debug.log(active ? `🎞️ Dailies: Reviewing Take #${this.takeLibrary.activeTake?.takeNumber ?? 1}` : '🎬 Switched to Live Camera');
      } else if (id === 'step-back') {
        if (this.cams.dailiesActive) {
          this.cams.stepDailiesFrames(-1);
        } else {
          this.keyframes.stepFrames(-1);
        }
      } else if (id === 'step-fwd') {
        if (this.cams.dailiesActive) {
          this.cams.stepDailiesFrames(1);
        } else {
          this.keyframes.stepFrames(1);
        }
      } else if (id === 'loop-toggle') {
        const looping = this.keyframes.toggleLoop();
        this.debug.log(looping ? '🔁 Loop: ON' : '➡️ Loop: OFF');
      } else if (id === 'rate-cycle') {
        const rate = this.keyframes.cycleRate();
        this.debug.log(`⚡ Rate: ${rate}x`);
      } else if (id === 'focus') {
        const activeCam = this.cams.active;
        if (activeCam && this.sceneData.actors.length > 0) {
          const nearestDist = computeFocusDistance(activeCam.data, this.sceneData.actors);
          activeCam.data.focusDistanceM = nearestDist;
          this.debug.log(`🎯 Smartwatch: Rack focus set to ${nearestDist.toFixed(2)}m`);
        }
      } else if (id === 'wheel') {
        this.toggleMenuInFront();
      } else if (id === 'ai') {
        const host = this.studioHost('AI Shot Analysis');
        if (host) openAiAnalysisModal(this.sceneData, host);
      } else if (id === 'props') {
        void this.openPropsLibrary();
      }
    };
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

  /** Turns a scene's LED volume on or off from the landing Scene card. */
  private setLedVolumeEnabled(sceneId: string, enabled: boolean): void {
    if (sceneId === this.sceneData.id) {
      const icvfx = this.sceneData.icvfx;
      if (!icvfx) return; // normalizeScene always fills it
      icvfx.enabled = enabled;
      this.icvfxRenderer.setConfig(icvfx);
      this.collabSession.broadcastPatch({ type: 'icvfx_update', config: icvfx });
      this.history.record(this.sceneData);
      this.persistence.saveNow(this.sceneData);
    } else {
      const scene = this.persistence.loadScene(sceneId);
      if (!scene?.icvfx) return;
      scene.icvfx.enabled = enabled;
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
  }

  /**
   * Brings the location renderer in line with sceneData.scan, loading the
   * geometry blob from the store when it isn't already displayed. Async loads
   * are token-guarded so a scene switch or undo mid-load can't apply stale
   * geometry.
   */
  private syncLocation(): void {
    const summary = this.sceneData.scan;
    const token = ++this.locationSyncToken;
    if (!summary) {
      this.displayedScanId = null;
      this.location.setScan(null);
      delete this.sceneData.locationMode; // the next scan starts in Ghost (normalizeScene)
      return;
    }
    if (summary.id === this.displayedScanId) {
      // Same geometry, possibly different furniture placements (undo/redo,
      // scene restore) — re-apply without reloading the blob.
      this.location.applyPlacements(summary.furniture);
      // An Align (or its undo) moves the textured original with the scan.
      this.location.setPhotoTransform(summary.source?.transform);
      // The display mode is a view preference, not an undoable edit: keep what
      // is on screen, and write it back so a snapshot taken before the last
      // mode change doesn't revert it on the next save.
      this.sceneData.locationMode = this.location.mode;
      return;
    }
    // New geometry (scene switch, reload, undo across a rescan): show it in the
    // scene's saved mode, Ghost when it has none (normalizeScene's default).
    this.location.setMode(this.sceneData.locationMode ?? 'ghost');
    void this.persistence.scans.getScan(summary.id).then((scan) => {
      if (token !== this.locationSyncToken) return; // superseded
      // A carry started while the blob loaded holds a mesh setScan disposes.
      if (this.draggedFurniture) this.cancelActiveManipulation();
      if (!scan) {
        this.displayedScanId = null;
        this.location.setScan(null);
        this.debug.log('⚠ scan geometry missing for this scene (Remove scan on the landing page to clear)');
        return;
      }
      this.displayedScanId = scan.id;
      this.location.setScan(scan);
      this.location.applyPlacements(this.sceneData.scan?.furniture);
      this.contentVersion++; // furniture raycast targets changed
      this.refreshWristState();
      this.loadLocationPhoto(token);
    });
  }

  /**
   * Loads the textured original of an imported location for Photo mode (P1.4):
   * the bytes from the blob store, parsed with their textures. Photo draws the
   * scan as Solid until this finishes, and keeps doing so if it fails (the
   * original is not on this device, e.g. after a scene export and import).
   */
  private loadLocationPhoto(token: number): void {
    const source = this.sceneData.scan?.source;
    if (!source?.textured) return;
    this.location.markPhotoLoading();
    void (async () => {
      const bytes = await this.persistence.blobs.getBytes(source.blobId);
      if (token !== this.locationSyncToken) return;
      if (!bytes) {
        this.location.markPhotoFailed();
        this.debug.log('Photo mode unavailable: the original file is not on this device (scene exports do not carry it)');
        return;
      }
      try {
        const model = await parseModelBytes(bytes, source.format as SceneFileKind, { textures: true, renderer: this.renderer });
        if (token !== this.locationSyncToken) {
          disposeModel(model.root);
          return;
        }
        this.location.setPhoto(model.root, this.sceneData.scan?.source?.transform ?? source.transform);
        this.debug.log(`Photo mode ready (${this.location.photoPartCount} part${this.location.photoPartCount === 1 ? '' : 's'})`);
        this.refreshWristState();
      } catch (e) {
        if (token !== this.locationSyncToken) return;
        this.location.markPhotoFailed();
        this.debug.log(`Photo mode unavailable: ${(e as Error)?.message ?? e}`);
      }
    })();
  }

  /** Drops a scene's scan summary (landing page). The geometry blob is kept
   *  until the next launch so an in-session undo can restore it. */
  private removeScan(sceneId: string): void {
    if (sceneId === this.sceneData.id) {
      this.sceneData.scan = null;
      this.syncLocation();
      // Record the undo snapshot, then flush immediately: a debounced save here
      // would be silently cancelled by any other landing op's saveNow (shared
      // timer), leaving the scan on disk for a subsequent export/duplicate to
      // re-embed. Every sibling landing mutation saves immediately; match them.
      this.history.record(this.sceneData);
      this.persistence.saveNow(this.sceneData);
    } else {
      const scene = this.persistence.loadScene(sceneId);
      if (!scene) return;
      scene.scan = null;
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
  }

  /**
   * Sets the scan display mode and remembers it on the scene, so a reload
   * shows the scan the way it was left. A view preference: saved (debounced)
   * but not recorded as an undo step.
   */
  private setLocationMode(mode: LocationMode): void {
    this.location.setMode(mode);
    this.contentVersion++; // hidden scans aren't grabbable: targets change
    if (this.sceneData.locationMode !== mode) {
      this.sceneData.locationMode = mode;
      this.persistence.markDirty(this.sceneData);
    }
    this.refreshWristState();
  }

  /** Hidden, Ghost, Solid, Wireframe (wrist 'Loc:', wheel 'Room:', desktop preview). */
  private cycleLocationMode(): LocationMode {
    const next = this.location.cycleMode();
    this.setLocationMode(next); // remember it on the scene
    return next;
  }

  /** Wrist "Scan Room": starts (or cancels) waiting for the platform's room data. */
  private toggleScan(): void {
    if (this.pendingScan) {
      this.pendingScan = null;
      this.debug.log('scan cancelled');
      this.refreshWristState();
      return;
    }
    if (!this.session.session) return;
    // Meshes (Quest Scene Mesh) or planes (Android XR); unknown when the
    // browser does not report enabledFeatures, in which case both are tried.
    const cap = this.session.scanCapability();
    if (!cap.canScan) {
      this.debug.log(`scan unavailable: ${cap.reason}`);
      return;
    }
    if (this.views.mode !== 'full') {
      this.debug.log('scan needs Full view: switch to Full first');
      return;
    }
    // Capture bakes the content transform into the geometry, so it must run at
    // true registration. Re-align here instead of refusing. realign() applies
    // behind a fade, so isShifted stays true for about half the fade; the scan
    // waits for it in updatePendingScan rather than cancelling itself. A
    // teleport still inside its fade (not applied yet) is replaced the same way.
    const awaitingRealign = this.views.isShifted || this.views.fading;
    if (awaitingRealign) this.views.realign();
    this.pendingScan = {
      startedAt: -1,
      awaitingRealign,
      sources: cap.sources,
      floorHinted: false,
      hinted: false,
    };
    this.debug.log(awaitingRealign ? 'scan: re-aligning first…' : `scanning: reading ${cap.sources.join(' + ')}…`);
    this.refreshWristState();
  }

  /** Per-frame while a scan is pending: snapshot the room data when tracked. */
  private updatePendingScan(frame: XRFrame, time: number): void {
    const pending = this.pendingScan;
    if (!pending) return;
    if (pending.awaitingRealign) {
      if (this.views.fading) return; // realign queued behind the fade, not applied yet
      pending.awaitingRealign = false;
      pending.startedAt = -1;
    }
    // Teleporting or leaving Full view mid-scan would bake that transform into
    // the captured geometry: cancel instead of misregistering the room.
    if (this.views.mode !== 'full' || this.views.isShifted) {
      this.pendingScan = null;
      this.debug.log('scan cancelled: view moved (Re-align, then rescan)');
      this.refreshWristState();
      return;
    }
    // The timeout clock (re)starts on the first frame after the press, a
    // realign, or a return to 'visible', and is held while system UI covers
    // the session (no timing out mid Space Setup).
    const visibility = this.session.session?.visibilityState;
    if (pending.startedAt < 0 || (visibility !== undefined && visibility !== 'visible')) pending.startedAt = time;
    const waited = time - pending.startedAt;
    // Capture in a scene space the floor re-base (floor.ts) is about to move
    // would leave the scan at the wrong height, so give the estimate its
    // settle window first. Capped: without hit-test results it never settles.
    if (!floorSettled(this.floorEst, this.lastViewerPos.y, time) && waited < SCAN_FLOOR_WAIT_MS) {
      if (!pending.floorHinted) {
        pending.floorHinted = true;
        this.debug.log('scan: settling floor height, look at the floor');
      }
      return;
    }
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return;
    this.contentRoot.updateMatrixWorld();
    _worldToScene.copy(this.contentRoot.matrixWorld).invert();
    const scan = captureScanFromFrame(frame, refSpace, _worldToScene);
    if (scan) {
      this.pendingScan = null;
      // The scan's labelled floor is direct evidence of the real floor. If the
      // floor origin is too high and hits have not re-based yet (they only
      // found a desk, or too few landed), re-base now and lift the scan by the
      // same amount, so the room and the blocking land on the real floor
      // together. Uncommitted means the floor offset is still 0, so scene y is
      // reference-space y here.
      const floorFix = floorCorrectionFromScan(this.floorEst, scanFloorY(scan), this.lastViewerPos.y);
      if (floorFix !== null) {
        translateScanY(scan, -floorFix);
        this.views.setFloorOffset(floorFix);
        this.debug.log(`⚠ floor origin was ${(-floorFix).toFixed(2)} m too high: re-based to the scanned floor`);
      }
      // Then freeze the estimate for the rest of the session: a later re-base
      // would shift contentRoot under geometry captured in this scene space.
      this.floorEst.committed = true;
      const summary = summarizeScan(scan);
      void this.persistence.scans.putScan(scan); // fire-and-forget; onError warns
      this.sceneData.scan = summary; // old blob (if any) stays until next-launch prune
      this.displayedScanId = scan.id;
      this.locationSyncToken++; // kill any in-flight stale load
      // The capture can land seconds after the press (realign fade, floor
      // settle) while a piece of the old room is in hand: end that carry
      // before setScan disposes the mesh under it.
      if (this.draggedFurniture) this.cancelActiveManipulation();
      this.location.setScan(scan);
      this.setLocationMode('ghost'); // show alignment over passthrough for confirmation
      this.contentVersion++; // fresh furniture raycast targets
      this.markDirty();
      // Not rebuilt in AR: the landing is hidden (its storage line would read
      // the just-captured scan back to size it); session end re-lists it.
      if (!this.inXRSession()) this.refreshLanding();
      this.refreshWristState();
      this.debug.log(
        `✓ scanned ${scan.meshes.length} mesh${scan.meshes.length === 1 ? '' : 'es'} · ` +
          `${(summary.triangles / 1000).toFixed(1)}k tris · ` +
          `${(summary.boundsMax.x - summary.boundsMin.x).toFixed(1)}×${(summary.boundsMax.z - summary.boundsMin.z).toFixed(1)} m`,
      );
      return;
    }
    // No automatic initiateRoomCapture here: it works once per session, needs
    // plane-detection, can wipe anchors and is a stub in Chrome. Space Setup
    // is the explicit wrist action (runSpaceSetup) instead.
    const meshes = pending.sources.includes('meshes');
    if (!pending.hinted && waited > SCAN_HINT_AFTER_MS) {
      pending.hinted = true;
      this.debug.log(
        !meshes
          ? 'no planes yet: look around at floor, walls and tables'
          : this.session.roomCaptureRefusal() === null
            ? 'no room data yet: Space Setup done? (wrist: Space Setup)'
            : 'no room data yet: run Space Setup in Quest Settings',
      );
    }
    if (waited > SCAN_TIMEOUT_MS) {
      this.pendingScan = null;
      this.debug.log(
        meshes
          ? 'scan timed out: run Space Setup in Quest Settings, then Scan Room again'
          : 'scan timed out: no planes found, look around the room and rescan',
      );
      this.refreshWristState();
    }
  }

  /**
   * Arms a check of every actor and camera anchor (see recheckAnchors). Each
   * new event restarts the grace window.
   */
  private scheduleAnchorRecheck(): void {
    if (!this.session.session) return;
    this.anchorRecheck = { due: -1, shiftHinted: false };
  }

  /**
   * Runs once per frame, right after the anchor refresh, while a recheck is
   * armed. Anchors are world-locked: after a reset a surviving anchor reports
   * its pose in the new origin, and updateFromAnchors has already moved its
   * object there. Re-anchoring it at its pre-reset scene coordinates would
   * throw that away, so only objects whose anchor is gone (wiped by Space
   * Setup, or never made) are re-anchored, where the scene has them. The grace
   * window lets anchors that are only relocalizing report again first. While
   * shifted it waits: anchors are created at scene coordinates read as
   * reference-space ones, which only holds at true registration.
   */
  private recheckAnchors(frame: XRFrame, time: number): void {
    const check = this.anchorRecheck;
    if (!check) return;
    if (check.due < 0) check.due = time + ANCHOR_RECHECK_GRACE_MS;
    if (time < check.due) return;
    if (this.views.isShifted) {
      if (!check.shiftHinted) {
        check.shiftHinted = true;
        this.debug.log('tracking reset: Re-align to re-anchor');
      }
      return;
    }
    this.anchorRecheck = null;
    if (!this.session.features.anchors) {
      this.debug.log('tracking reset: check alignment to the room');
      return;
    }
    let held = 0;
    let lost = 0;
    for (const obj of this.actors.all()) {
      if (obj === this.draggedActor) continue; // its release re-anchors it
      if (obj.anchor && this.session.anchorPosition(frame, obj.anchor, _anchorProbe)) {
        held++;
        continue;
      }
      if (!this.pendingReanchorActors.includes(obj)) this.pendingReanchorActors.push(obj);
      lost++;
    }
    for (const obj of this.cams.all()) {
      if (obj === this.draggedCamera) continue;
      if (obj.anchor && this.session.anchorPosition(frame, obj.anchor, _anchorProbe)) {
        held++;
        continue;
      }
      if (!this.pendingReanchorCams.includes(obj)) this.pendingReanchorCams.push(obj);
      lost++;
    }
    // The scan is not anchored: it stays at scene coordinates while anchored
    // blocking holds to the real room, so alignment is worth a look either way.
    this.debug.log(
      lost > 0
        ? `${lost} re-anchored: check alignment to the room`
        : held > 0
          ? 'anchors held: check scan alignment'
          : 'tracking reset: check alignment to the room',
    );
  }

  /**
   * The tracking origin jumped (reference-space 'reset', for example after
   * Space Setup or a recenter). The event fires before the first frame that
   * uses the new origin, so the anchors are checked after that frame's
   * refresh rather than re-created here (see recheckAnchors).
   */
  private onReferenceSpaceReset(): void {
    this.scheduleAnchorRecheck();
  }

  /**
   * Wrist 'Space Setup': asks the OS to run room capture, once per session
   * and only with plane-detection. The first press only warns (it can reset
   * tracking and wipe anchors); a second press within SPACE_SETUP_CONFIRM_MS
   * runs it. Never called automatically.
   */
  private runSpaceSetup(): void {
    if (!this.session.session) return;
    if (this.spaceSetupSession === this.session.session) {
      this.debug.log('Space Setup is already running');
      return;
    }
    const refusal = this.session.roomCaptureRefusal();
    if (refusal) {
      this.spaceSetupConfirmUntil = 0;
      this.debug.log(roomCaptureMessage(refusal));
      this.refreshWristState();
      return;
    }
    const now = performance.now();
    if (now > this.spaceSetupConfirmUntil) {
      this.spaceSetupConfirmUntil = now + SPACE_SETUP_CONFIRM_MS;
      // The wrist tail shows ~40 characters: the instruction leads.
      this.debug.log('Press again to run Space Setup (may reset anchors)');
      this.refreshWristState();
      return;
    }
    this.spaceSetupConfirmUntil = 0;
    const session = this.session.session;
    this.spaceSetupSession = session;
    this.debug.log('Space Setup: follow the system prompts');
    this.refreshWristState();
    void this.session.requestRoomCapture().then((result) => {
      if (this.spaceSetupSession === session) this.spaceSetupSession = null;
      if (this.session.session !== session) return; // session ended during the OS flow
      if (result.ok) {
        // Room capture may have wiped anchors: re-anchor the ones that are
        // gone once the next frames show which (survivors keep world-lock).
        this.scheduleAnchorRecheck();
        const quick = performance.now() - now < 1000;
        this.debug.log(quick ? 'Space Setup returned at once: maybe nothing ran' : 'Space Setup done: now Scan Room');
      } else {
        this.debug.log(roomCaptureMessage(result.error));
      }
      this.refreshWristState();
    });
  }

  /**
   * Pushes a SceneData into every subsystem that renders or streams part of it.
   *
   * Shared by loadScene and restoreScene because those two had drifted badly: loadScene
   * applied thirteen subsystems and restoreScene applied three, so undoing a change to
   * props, lights, atmosphere, the splat cloud, the floorplan overlay, solar, the LED
   * volume, acoustics, screenplay or set dressing reverted the scene data and autosaved
   * it while the 3D view carried on showing the pre-undo state. The user then acted on
   * what they could see, which no longer matched what was stored.
   *
   * Anything that belongs to scene ENTRY rather than to scene CONTENT stays out of here
   * on purpose: history.reset, persistence.setCurrent, stopRecording and the DRS
   * known-bad ceiling clear must not run on an undo.
   */
  private applySceneToSubsystems(data: SceneData): void {
    this.actors.setScene(data);
    this.props.setScene(data);
    this.keyframes.setScene(data);
    this.cams.setScene(data);
    this.contentVersion++;
    this.pendingScan = null;
    this.syncLocation();

    const activeCloud = (data.gaussianClouds && data.gaussianClouds.length > 0)
      ? (data.gaussianClouds.find((c) => c.id === data.activeSplatCloudId) || data.gaussianClouds[0])
      : null;
    this.splatRenderer.setCloud(activeCloud);
    this.splatRenderer.setFloorplanOverlay(data.architecture ?? null);

    this.volumetrics.update(
      data.atmosphere ?? createAtmosphereConfig('clear'),
      data.lights ?? [],
      this.camera,
    );
    if (data.livelink) {
      this.liveLinkStreamer.updateConfig(data.livelink);
    }
    if (data.dmxBridge) {
      this.dmxStreamer.setConfig(data.dmxBridge);
    }
    this.icvfxRenderer.setConfig(data.icvfx || createLedVolumeConfig('horseshoe_270', { enabled: false }));
    this.acousticsRenderer.setConfig(data.acoustics || createAcousticsConfig());
    this.solarRenderer.setConfig(data.solar || createSolarEnvironmentConfig('golden_hour_sunset'));
    this.screenplayRenderer.setConfig(data.screenplay || createScreenplayConfig());
    this.profilerRuntime.updateConfig(data.profiler || createVRProfilerConfig());
    this.comfortRenderer.setConfig(data.comfort || createVRComfortConfig());
    this.setDressingRenderer.setConfig(data.setDressing || createSetDressingConfig());
  }

  private loadScene(data: SceneData): void {
    const previousSceneId = this.sceneData.id;
    this.sceneData = data;
    this.persistence.setCurrent(data.id);
    if (previousSceneId !== data.id) {
      // DRS remembers the lowest render scale that juddered and never climbs back to it -
      // that memory is what makes it settle instead of cycling. It is evidence about ONE
      // scene's weight, so a different scene must not inherit it, or a light scene loaded
      // after a heavy one would be stuck at the heavy one's resolution forever. Reloading
      // the same scene (undo, restore, re-open) keeps it: the content is the same.
      this.performanceGovernor.clearKnownBadRenderScale();
      // A different scene reports its own missing or broken prop models.
      this.reportedPropLoadErrors.clear();
      this.reportedPropLoadWarnings.clear();
    }
    this.selectedActorId = null;
    this.selectedPropId = null;
    this.hover = null;
    // Its target is about to be disposed with the old scene.
    this.contextualRadial.hide();
    // Reparent (not just null) any in-progress drag before setScene disposes
    // the old objects: a grip-dragged camera root lives under the controller,
    // and disposing it there would orphan a phantom gizmo on the controller.
    // Mirrors restoreScene; handles a load that follows a session ended mid-grip.
    this.cancelActiveManipulation();
    // A take belongs to the scene it was rolling on: finish and save it.
    this.stopRecording(true);
    this.applySceneToSubsystems(data);
    this.history.reset(data);
    this.refreshLanding();

    this.refreshWristState();
    if (data.actors.length || data.cameras.length || (data.props && data.props.length)) {
      this.debug.log(
        `loaded "${data.name}" (${data.actors.length} actors, ${data.cameras.length} cams, ${data.props?.length ?? 0} props): placed relative to session start`,
      );
    }
  }

  /**
   * Ends any in-progress manipulation before the objects under it are torn
   * down (undo/redo can fire mid-drag via the wrist trigger). A grabbed camera
   * root is re-parented back into the gizmo group so setScene can remove +
   * dispose it cleanly instead of orphaning a disposed mesh on the controller
   * ray; the miniature grab is released.
   */
  private cancelActiveManipulation(): void {
    if (this.draggedCamera) this.cams.gizmoGroup.attach(this.draggedCamera.root);
    if (this.draggedProp) {
      // Back into the props group (removeProp / setScene only detach from
      // there), and back to its last committed pose: a cancelled carry writes
      // no data, so the visual must not keep the carried pose either.
      const { root, data } = this.draggedProp;
      this.props.group.attach(root);
      root.position.set(data.position.x, data.position.y, data.position.z);
      root.rotation.set(0, data.rotationY, 0);
      root.scale.set(data.scale.x, data.scale.y, data.scale.z);
    }
    this.draggedActor = null;
    this.draggedCamera = null;
    this.draggedProp = null;
    if (this.draggedMonitor) {
      this.draggedMonitor = false;
      this.scene3.attach(this.cams.monitor);
    }
    if (this.draggedFurniture) {
      // Settle visually but don't write data — the caller is about to reload
      // or restore the scene, which re-applies the persisted placements.
      const mesh = this.draggedFurniture;
      this.draggedFurniture = null;
      // A scan that replaced the room mid-carry already detached and disposed
      // this mesh; attaching it again would leave an ungrabbable ghost.
      if (this.location.ownsFurniture(mesh)) {
        this.location.group.attach(mesh);
        this.location.commitFurniture(mesh);
      }
    }
    if (this.miniGrabbing) {
      this.views.miniGrabEnd();
      this.miniGrabbing = false;
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
    // Cleared for the same reason as selectedActorId: the undone state may not
    // contain the prop that was selected, leaving a dangling id behind.
    this.selectedPropId = null;
    this.hover = null;
    this.contextualRadial.hide();
    this.cancelActiveManipulation();
    // Drop reanchor entries queued for the objects we're about to dispose —
    // otherwise the loop would create (and leak) anchors on detached objects.
    this.pendingReanchorActors.length = 0;
    this.pendingReanchorCams.length = 0;
    // Every subsystem, not just actors/keyframes/cameras. See applySceneToSubsystems.
    this.applySceneToSubsystems(data);
    this.persistence.saveNow(data);
    if (this.session.session && !this.views.isShifted) {
      for (const obj of this.actors.all()) this.pendingReanchorActors.push(obj);
      for (const obj of this.cams.all()) this.pendingReanchorCams.push(obj);
    }
    // The landing is hidden in AR and re-listed when the session ends.
    if (!this.inXRSession()) this.refreshLanding();
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
    // Includes scenes whose save failed (and the live scene if the index lacks it):
    // they exist only in memory, and their row is where Export is.
    this.landing.refreshScenes(this.persistence.listScenesForLanding(this.sceneData), this.sceneData.id);
  }

  /** Downloads a scene as .setview.json. The live scene is passed so Export hands out
   *  what is in memory, not an older localStorage copy (or nothing) after a failed save. */
  private exportSceneFile(id: string): void {
    void this.persistence.exportScene(id, this.sceneData).then((ok) => {
      if (!ok) {
        this.reportDataIssue('export failed: this scene is no longer in storage', 'export');
        return;
      }
      const scene = id === this.sceneData.id ? this.sceneData : this.persistence.loadScene(id);
      if (scene?.scan?.source) {
        this.landing.showBanner(
          'The exported scene carries the location geometry but not its photo textures: the original file stays on this device, so Photo mode is unavailable where the export is opened.',
          'info',
          'export-photo',
        );
      }
    });
  }

  /**
   * Surfaces a save, storage or import problem wherever the user is looking: the
   * debug log (console and drift board), the 3D wrist status, and a landing banner
   * on the 2D page. Banners sharing a key replace each other (default: the text).
   */
  private reportDataIssue(message: string, key?: string, action?: { label: string; run: () => void }): void {
    this.debug.log(message);
    this.wrist.setStatus(message);
    this.landing.showBanner(message, 'error', key, action);
  }

  /**
   * Imports a phone scan or any mesh file as a scene's location (roadmap P1.2).
   * Runs on the 2D page. The file is identified by its bytes, converted to a
   * LocationScan (geometry), and attached to the scene it was opened for, which
   * need not be the current one (review R4). A textured original is kept in
   * the blob store for Photo mode. Results and refusals show as banners.
   */
  private async importLocationFile(
    sceneId: string,
    file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
    opts: { upAxis?: UpAxisChoice; unit?: UnitChoice } = {},
  ): Promise<boolean> {
    const key = 'location-import';
    const name = file.name || 'file';
    let bytes: ArrayBuffer | null = null;
    try {
      bytes = await file.arrayBuffer();
    } catch (e) {
      console.warn('[setview] location read failed', e);
    }
    if (!bytes || bytes.byteLength === 0) {
      this.reportDataIssue(
        `Could not read "${name}": the browser returned no data (it blocked the read, or the file is empty).`,
        key,
      );
      return false;
    }
    this.landing.showBanner(`Importing "${name}" as the location...`, 'info', key);
    const res = await importLocationBytes(bytes, { fileName: name, upAxis: opts.upAxis, unit: opts.unit, renderer: this.renderer });
    if (!res.ok) {
      this.reportDataIssue(`"${name}" was not imported. ${res.message}`, key);
      return false;
    }
    let source: ScanSourceFile | null = null;
    if (res.textured) {
      const blob = await this.persistence.blobs.putBlob({ data: bytes, format: res.kind, name });
      source = {
        blobId: blob.id,
        format: res.kind,
        fileName: name,
        ...(res.app !== 'unknown' ? { app: res.app } : {}),
        transform: res.built.sourceTransform,
        textured: true,
      };
    }
    // A textured import opens in Photo; a plain mesh in Ghost (the default).
    const attached = await this.persistence.attachImportedScan(
      sceneId,
      res.built.scan,
      source,
      () => this.sceneData,
      source ? 'photo' : undefined,
    );
    if (!attached) {
      this.reportDataIssue(`"${name}" was read, but its scene no longer exists.`, key);
      return false;
    }
    if (attached.scene === this.sceneData) {
      this.syncLocation();
      this.history.record(this.sceneData);
      this.contentVersion++;
    }
    this.refreshLanding();
    const s = res.built.stats;
    const lines = [
      `Imported "${name}" as the location: ${s.triangles < 1000 ? s.triangles : `${Math.round(s.triangles / 1000)}k`} triangles in ${s.meshes} mesh${s.meshes === 1 ? '' : 'es'}.`,
      ...res.notes,
    ];
    if (!attached.scanSaved) lines.push('The geometry could not be saved to storage and is lost on reload.');
    this.debug.log(lines.join(' '));
    this.landing.showBanner(lines.join(' '), res.budget.level === 'warn' || !attached.scanSaved ? 'warn' : 'info', key);
    if (bytes.byteLength > 5 * 1024 * 1024) this.requestPersistentStorage();
    return true;
  }

  /**
   * Posts a scene's .setview.json (the same file Export downloads, with no API
   * key inside since P0.15) to the LAN drop box, so another device can open it
   * from "Files on your computer". Dev server only.
   */
  private async sendSceneToComputer(sceneId: string): Promise<boolean> {
    const live = sceneId === this.sceneData.id ? this.sceneData : null;
    const file = await this.persistence.sceneFileText(sceneId, live);
    if (!file) return false;
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const name = sceneDropName(file.name);
    try {
      const r = await fetch(`${base}drop/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: new Blob([file.text], { type: 'application/json' }),
      });
      const body = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
      if (r.status !== 201) throw new Error(body.error ?? `the computer answered ${r.status}`);
      this.landing.showBanner(`Sent "${file.name}" to the computer as ${body.name ?? name}.`, 'info', 'drop');
      return true;
    } catch (e) {
      this.reportDataIssue(`Could not send "${file.name}" to the computer: ${(e as Error).message}`, 'drop');
      return false;
    }
  }

  /** On the first heavy import, asks once for persistent storage and says what the browser decided. */
  private requestPersistentStorage(): void {
    void this.persistence.requestPersistentStorage().then((outcome) => {
      if (outcome === 'granted') {
        this.debug.log('storage: persistent');
        this.landing.showBanner(
          'Browser storage is now persistent: SetView scenes, scans and props will not be cleared to free space.',
          'info',
          'persist',
        );
      } else if (outcome === 'denied') {
        const m =
          'The browser did not make storage persistent, so it may clear SetView data when space runs low. Export scenes you need to keep.';
        this.debug.log(m);
        this.landing.showBanner(m, 'warn', 'persist');
      } else if (outcome === 'unsupported') {
        this.debug.log('storage: persistence request unavailable in this browser');
      }
      if (outcome !== 'already-asked') this.refreshLanding();
    });
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
      // (0,0,0) is the "park me where the user looks" sentinel (cams.update).
      if (mode === 'camera') this.cams.monitor.position.set(0, 0, 0);
      this.guide.refresh(this.guideCtx());
      this.debug.log(`view: ${mode}`);
      this.refreshWristState();
    };

    this.input.events = {
      onTriggerDown: (hand) => this.onTriggerDown(hand),
      onSqueezeDown: (hand) => this.onSqueezeDown(hand),
      onSqueezeUp: (hand) => this.onSqueezeUp(hand),
      onButtonDown: (hand, button) => {
        if (this.noteEditor.isOpen) return;
        // Y (left) is the hard MENU button: pops the tool wheel to a spot in
        // front of your face so the menu is one press away even if you never
        // raise your hand. The wheel ALSO always rides the left hand (below).
        if (button === 'y') this.toggleMenuInFront();
        else if (button === 'x') this.setPlaceMode(nextPlaceMode(this.placeMode));
        else if (button === 'b' && this.interactionMode === 'block') this.captureKeyframe();
        else if (button === 'a') this.onButtonA();
        else if (button === 'thumbclick' && hand === this.input.pointerHand()) this.tryTeleport();
      },
    };

    this.wrist.onPress = (id) => this.onWristPress(id);
    this.wrist.onSlider = (id, v) => {
      if (id === 'scrub') this.keyframes.scrubTo(v);
    };
  }

  /**
   * Palm-wheel presses: menu navigation + actions (wheel.ts defines rings).
   * Routing goes through wheel.ts's WHEEL_SECTOR_HANDLERS, which the domain
   * tests check covers every sector a reachable ring can show.
   */
  private onWheelPress(id: string): void {
    const route = wheelSectorRoute(id);
    if (route === 'nav') {
      this.wheelPath = submenuForSector(id) ?? 'root'; // 'wheel-back' -> root
    } else if (route === 'prop') {
      const assetId = wheelPropPreset(id);
      if (assetId) this.spawnWheelProp(assetId);
    } else if (route === 'wrist') {
      // A wrist-panel action verbatim.
      this.onWristPress(id);
    } else if (route === 'wheel') {
      switch (id) {
        // Root actions.
        case 'wheel-mode':
          this.setInteractionMode(this.interactionMode === 'block' ? 'dress' : 'block');
          break;
        case 'wheel-place':
          this.setPlaceMode(nextPlaceMode(this.placeMode));
          break;
        case 'wheel-view':
          this.cycleView();
          break;
        // Sub-wheel actions with no wrist-panel equivalent.
        case 'focal-down':
          this.cams.stepActiveFocal(-1);
          break;
        case 'focal-up':
          this.cams.stepActiveFocal(1);
          break;
        case 'mark':
          // The B button is unreachable on hand tracking — this is its home.
          if (this.interactionMode === 'block') this.captureKeyframe();
          break;
      }
    } else {
      this.debug.log(`wheel: no handler for "${id}"`);
    }
    this.refreshWristState();
  }

  /**
   * Dress = adjust the physical space (scan, move scanned furniture); Block =
   * plan the shot (actors, cameras, marks, lenses). One mode is active at a
   * time so pointing near a couch while blocking never grabs the couch, and
   * dressing the set never disturbs the blocking.
   */
  private setInteractionMode(mode: InteractionMode): void {
    if (mode === this.interactionMode) return;
    this.cancelActiveManipulation();
    this.interactionMode = mode;
    this.contentVersion++; // grab targets swap between furniture and actors/cams
    if (mode === 'dress' && this.location.hasScan && this.location.mode === 'hidden') {
      // Give the dresser something to grab — ghost the scan in.
      this.setLocationMode('ghost');
    }
    this.guide.refresh(this.guideCtx());
    this.debug.log(mode === 'dress' ? 'DRESS mode — move the set' : 'BLOCK mode — plan the shot');
    this.refreshWristState();
  }

  private onWristPress(id: string): void {
    switch (id) {
      case 'wheel-toggle':
        this.toggleMenuInFront();
        break;
      case 'mode-actor':
        this.setPlaceMode(this.placeMode === 'actor' ? 'none' : 'actor');
        break;
      case 'mode-camera':
        this.setPlaceMode(this.placeMode === 'camera' ? 'none' : 'camera');
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
        this.guide.refresh(this.guideCtx());
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
      case 'stance':
        this.cycleSelectedStance();
        break;
      case 'actor-studio': {
        const actor =
          (this.selectedActorId ? this.sceneData.actors.find((a) => a.id === this.selectedActorId) : undefined) ??
          this.sceneData.actors[0];
        if (actor) {
          const host = this.studioHost('Actor Rig Studio');
          if (!host) break;
          openActorStudioModal(
            actor,
            this.sceneData,
            (updated) => {
              // Re-resolve: an undo while the studio was open replaces the scene's objects.
              const live = this.sceneData.actors.find((a) => a.id === actor.id);
              if (!live) return;
              Object.assign(live, updated);
              this.actors.rebuildVisual(live.id);
              this.persistence.saveNow(this.sceneData);
              this.markDirty();
            },
            host,
          );
        } else {
          this.debug.log('No actor in scene: place an actor first');
        }
        break;
      }
      case 'grip-rig': {
        const cam = this.cams.active?.data ?? this.sceneData.cameras[0];
        if (cam) {
          const host = this.studioHost('Camera Grip Studio');
          if (!host) break;
          openCameraGripModal(
            cam,
            this.sceneData,
            (updated) => {
              // Re-resolve: an undo while the studio was open replaces the scene's objects.
              const live = this.sceneData.cameras.find((c) => c.id === cam.id);
              if (!live) return;
              Object.assign(live, updated);
              this.cams.refreshCamera(live.id);
              this.persistence.saveNow(this.sceneData);
              this.markDirty();
            },
            host,
          );
        } else {
          this.debug.log('No camera in scene: place a camera first');
        }
        break;
      }
      case 'splat-studio': {
        this.openSplatStudioDialog();
        break;
      }
      case 'dailies-studio': {
        const host = this.studioHost('Dailies Studio');
        if (!host) break;
        openDailiesVideoStudioModal(
          this.sceneData,
          async (options, onProgress) => {
            const renderer = new AnimaticVideoRenderer();
            return await renderer.renderAnimaticVideo(
              this.sceneData,
              undefined,
              options,
              onProgress,
              this.scene3,
              this.contentRoot,
            );
          },
          host,
        );
        break;
      }
      case 'perf-settings': {
        this.openPerformanceSettings();
        break;
      }
      case 'dmx-bridge': {
        this.openDmxBridgeDialog();
        break;
      }
      case 'icvfx-studio': {
        this.openIcvfxStudioDialog();
        break;
      }
      case 'acoustics-studio': {
        this.openAcousticsStudioDialog();
        break;
      }
      case 'solar-studio': {
        this.openSolarStudioDialog();
        break;
      }
      case 'screenplay-studio':
      case 'script-breakdown': {
        this.openScreenplayStudioDialog();
        break;
      }
      case 'xr-profiler':
      case 'profiler-studio': {
        this.openWebXRProfilerDialog();
        break;
      }
      case 'comfort-studio':
      case 'vr-comfort': {
        this.openVRComfortDialog();
        break;
      }
      case 'set-dressing-studio':
      case 'dressing':
      case 'set_dressing': {
        this.openSetDressingDialog();
        break;
      }
      case 'format': {

        const fmt = this.cams.cycleFormat();
        this.debug.log(`format: ${fmt.name}`);
        this.refreshWristState();
        break;
      }
      case 'tstop': {
        const t = this.cams.cycleActiveTStop();
        this.debug.log(`T-stop: T${t}`);
        this.refreshWristState();
        break;
      }
      case 'dof':
        this.cams.setDofEnabled(!this.cams.dofEnabled);
        this.debug.log(`depth of field ${this.cams.dofEnabled ? 'ON' : 'off'}`);
        this.refreshWristState();
        break;
      case 'scan':
        this.toggleScan();
        break;
      case 'space-setup':
        this.runSpaceSetup();
        break;
      case 'location': {
        if (!this.location.hasScan) {
          this.debug.log('no location scan in this scene yet — press Scan Room');
          break;
        }
        const mode = this.cycleLocationMode();
        this.debug.log(`location: ${mode}`);
        break;
      }
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
      case 'record':
        this.toggleRecording();
        break;
      case 'aianalysis': {
        const host = this.studioHost('AI Shot Analysis');
        if (host) openAiAnalysisModal(this.sceneData, host);
        break;
      }
      case 'help':
        this.guideSticky = !this.guideSticky;
        this.guideAutoUntil = 0;
        if (this.guideSticky) this.guide.show(this.guideCtx());
        else this.guide.hide();
        this.wrist.setToggle('help', this.guideSticky);
        break;
      case 'height-down':
        this.adjustSelectedActorScale(-0.05);
        break;
      case 'height-up':
        this.adjustSelectedActorScale(+0.05);
        break;
      case 'h-preset-150':
        this.setSelectedActorScale(1.50 / 1.75);
        break;
      case 'h-preset-165':
        this.setSelectedActorScale(1.65 / 1.75);
        break;
      case 'h-preset-175':
        this.setSelectedActorScale(1.0);
        break;
      case 'h-preset-185':
        this.setSelectedActorScale(1.85 / 1.75);
        break;
      case 'h-preset-200':
        this.setSelectedActorScale(2.00 / 1.75);
        break;
      case 'exit':
        void this.session.session?.end();
        break;
      // The Props sub-wheel presets (prop-chair ...) route through
      // onWheelPress -> spawnWheelProp (wheel.ts WHEEL_PROP_PRESETS).
      case 'prop-library':
        void this.openPropsLibrary();
        break;
      case 'stance-cycle-next':
        this.cycleSelectedStance(1);
        break;
      case 'stance-cycle-prev':
        this.cycleSelectedStance(-1);
        break;
      default:
        if (id.startsWith('stance-')) {
          const sId = id.slice(7) as StanceId;
          if (isStanceId(sId)) {
            this.setSelectedStance(sId);
          }
        }
        break;
    }
  }

  // --- session ---------------------------------------------------------------------

  /** Opens the desktop orbit preview for a scene (loading it if needed). */
  private openPreview(id: string): void {
    if (id !== this.sceneData.id) {
      const data = this.persistence.loadScene(id);
      if (!data) return;
      this.loadScene(data);
    }
    this.landing.show(false);
    this.preview.open(this.sceneData, this.sceneBounds());
  }

  private async startAR(): Promise<void> {
    try {
      this.preview.close(); // the XR session owns the animation loop
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
      this.anchorRecheck = null; // everything is re-anchored above
      this.lastTime = 0;
      // Every session opens planning the shot; Dress is an explicit switch.
      this.interactionMode = 'block';
      this.wheelInFront = false; // wheel starts on the hand, Y parks it in front
      this.placeMode = 'none'; // placing is armed per use, never carried over
      // Fresh reference space, fresh floor evidence.
      this.floorEst = newFloorEstimate();
      this.views.setFloorOffset(0);
      // Wrist labels that depend on this session's features (Space Setup).
      this.refreshWristState();
      // Teach the controls up front: chips tethered to the controllers for the
      // first few seconds; the wrist "?" button brings them back anytime.
      this.guideSticky = false;
      this.guideAutoUntil = performance.now() + GUIDE_AUTO_SHOW_S * 1000;
      this.guide.show(this.guideCtx());
      this.vcamHud.mount(document.getElementById('overlay') ?? document.body);
      this.performanceHud.mount(document.getElementById('overlay') ?? document.body);
      this.renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
    } catch (e) {
      this.debug.log(`failed to start AR: ${(e as Error).message}`);
      document.getElementById('overlay')!.hidden = true;
      // The wrist debug board never appears if the session can't start, so
      // put the reason where the user is actually looking.
      this.landing.showStartError((e as Error).message || String(e));
    }
  }

  private onSessionEnd(): void {
    this.renderer.setAnimationLoop(null);
    this.vcamHud.unmount();
    this.performanceHud.unmount();
    this.contextualRadial.hide();
    this.guide.hide();
    this.guideSticky = false;
    this.guideAutoUntil = 0;
    // End an in-flight take and save it — the download lands on the 2D page.
    this.stopRecording(true);
    this.keyframes.stop();
    // A session can end mid-grip (headset removed / OS-ended) with no
    // squeezeend, leaving a dragged camera root parented to the controller.
    // Reparent it now so it isn't orphaned across the next load/session.
    this.cancelActiveManipulation();
    this.pendingScan = null;
    this.noteEditor.close();
    this.persistence.saveNow(this.sceneData);
    this.moveStudiosToPage();
    document.getElementById('overlay')!.hidden = true;
    this.landing.show(true);
    this.refreshLanding();
    this.debug.log('session ended — scene saved');
  }

  // --- input actions -----------------------------------------------------------------

  private onTriggerDown(hand: Hand): void {
    if (this.noteEditor.isOpen || hand !== this.input.pointerHand()) return;
    // Pointer on the wheel (ray hovering a sector, or fingertip on the disc) =
    // MENU intent: press the hovered sector and swallow the rest. Nothing here
    // may reach the world — on hands a palm tap doubles as a pinch, and QA
    // showed each such tap spawning an actor behind the wheel. Gated on
    // actually POINTING at the wheel, not just its being visible (it always
    // is now), so a pinch anywhere else still places/selects.
    if (this.pointerOnWheel) {
      // Fingertip taps already fired inside touchAt; the ray path presses here.
      this.wheel.handleTriggerDown();
      return;
    }
    if (this.wrist.handleTriggerDown()) return;

    const rc = this.input.raycaster(hand, this.raycaster);
    if (rc && this.contextualRadial.handlePointer(rc, true)) return;

    if (this.hover?.kind === 'actor') {
      this.selectActor(this.hover.id);
      return;
    }
    if (this.hover?.kind === 'prop') {
      this.selectProp(this.hover.id);
      return;
    }
    if (this.hover?.kind === 'camera') {
      // Selecting a camera ends any actor or prop selection, as selectActor
      // and selectProp do for each other: Delete / Dup without a hover fall
      // back to the selected prop or actor, which must not be a stale one
      // hidden behind the camera's ring.
      this.selectedPropId = null;
      this.props.setSelected(null);
      this.selectedActorId = null;
      this.actors.setSelected(null);
      this.cams.setActive(this.hover.id);
      const camObj = this.cams.active;
      if (camObj) {
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: camObj.root.position.x,
          y: camObj.root.position.y,
          z: camObj.root.position.z,
        });
        this.contextualRadial.show('camera', camObj.data.id, camObj.root.getWorldPosition(_radialPos), {
          name: camObj.data.name,
          focalLength: camObj.data.lensFocalLength,
        });
      }
      this.refreshWristState();
      return;
    }
    if (this.views.mode !== 'full' || this.interactionMode !== 'block') return;
    // Placement is an armed tool (wheel Place sector / X button), never the
    // default meaning of a pinch — see PlaceArm in wheel.ts.
    if (this.placeMode === 'none') return;

    if (this.placeMode === 'actor') {
      if (!this.session.lastHit) return;
      const local = this.contentRoot.worldToLocal(this.session.lastHit.point.clone());
      const viewerLocal = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
      const face = Math.atan2(viewerLocal.x - local.x, viewerLocal.z - local.z);
      const obj = this.actors.spawn({ x: local.x, y: local.y, z: local.z }, face);
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
      this.selectActor(obj.data.id);
      this.collabSession.broadcastPatch({
        type: 'actor_add',
        actor: obj.data,
      });
      this.debug.log(`placed ${obj.data.name}${this.session.features.anchors ? ' (anchoring)' : ''}`);
      this.markDirty();
    } else if (this.placeMode === 'camera') {
      // Camera placement: drop the gizmo at the user's head pose.
      const obj = this.cams.placeAtPose(this.lastViewerPos.clone(), this.lastViewerQuat.clone());
      this.contentVersion++;
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
      this.collabSession.broadcastPatch({
        type: 'camera_add',
        camera: obj.data,
      });
      this.debug.log(`placed ${obj.data.name} at head (${Math.round(obj.data.lensFocalLength)}mm)`);
      this.markDirty();
    } else if (this.placeMode === 'prop') {
      // Drops the last Props sub-wheel preset (Director's Chair until one is picked).
      if (!this.session.lastHit) return;
      const local = this.contentRoot.worldToLocal(this.session.lastHit.point.clone());
      const pos = { x: local.x, y: local.y, z: local.z };
      void this.props
        .addProp(this.lastPropPreset, pos, { rotationY: this.faceViewerYaw(pos) })
        .then((obj) => {
          if (!obj) return;
          this.contentVersion++;
          this.selectProp(obj.data.id);
          this.collabSession.broadcastPatch({
            type: 'prop_add',
            prop: obj.data,
          });
          this.debug.log(`placed ${obj.data.name}`);
          this.markDirty();
        });
    }
    // Hands place ONE per arm: stray pinches are constant on hand tracking,
    // so the tool disarms after each placement (the wheel is a glance away).
    // A controller trigger pull is deliberate — it stays armed for the next.
    if (this.input.isHand(hand)) this.setPlaceMode('none');
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
    } else if (this.hover?.kind === 'prop') {
      const obj = this.props.get(this.hover.id);
      const ray = this.input.raySpace(hand);
      if (obj && ray) {
        this.draggedProp = obj;
        // Same as the actor path: what you carry is the selection (and no
        // stale actor stays selected behind it).
        this.selectProp(obj.data.id);
        ray.attach(obj.root);
        this.debug.log(`moving ${obj.data.name}`);
      }
    } else if (this.hover?.kind === 'camera') {
      const obj = this.cams.get(this.hover.id);
      const ray = this.input.raySpace(hand);
      if (obj && ray) {
        this.draggedCamera = obj;
        ray.attach(obj.root); // free 6-DOF carry; re-parented on release
      }
    } else if (this.hover?.kind === 'furniture' && this.views.mode === 'full') {
      // Carry a scanned furniture piece; release settles it on the floor.
      const idx = Number(this.hover.id);
      const mesh = this.location.furnitureTargets().find((m) => m.userData.scanMeshIndex === idx);
      const ray = this.input.raySpace(hand);
      if (mesh && ray) {
        this.draggedFurniture = mesh;
        ray.attach(mesh);
        this.debug.log(`moving ${this.location.furnitureLabel(idx)}`);
      }
    } else if (this.views.mode === 'camera' && this.cams.monitor.visible) {
      // Grab the parked director's monitor to re-park it wherever you like.
      const rc = this.input.raycaster(hand, this.raycaster);
      const ray = this.input.raySpace(hand);
      if (rc && ray && rc.intersectObject(this.cams.monitor, true).length > 0) {
        this.draggedMonitor = true;
        ray.attach(this.cams.monitor);
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
      // Reconcile the rig: a stance changed mid-drag was skipped (overridden
      // was true) — re-pose now that the drag is over so the visual matches
      // data.stance. Only touches limb rotations, not the just-set placement.
      if (!obj.overridden) this.actors.applyStance(obj);
      if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
      this.markDirty();
    }
    if (this.draggedProp) {
      const obj = this.draggedProp;
      this.draggedProp = null;
      // Back under the props group (content space), world pose kept.
      this.props.group.attach(obj.root);
      // Settle like released furniture (location.ts commitFurniture): pure
      // yaw, no pitch/roll from the free carry, and down onto the real surface
      // under the prop or the floor (props.ts settlePropY). The ray hit only
      // counts when it is under the prop, not wherever the ray happens to end.
      const q = obj.root.quaternion;
      const rotY = quatYaw(q.x, q.y, q.z, q.w);
      const pos = obj.root.position;
      const hit = this.session.lastHit
        ? this.props.group.worldToLocal(_pt.copy(this.session.lastHit.point))
        : null;
      obj.data.position = { x: pos.x, y: settlePropY(pos, hit), z: pos.z };
      obj.data.rotationY = rotY;
      obj.data.rotationX = 0;
      obj.data.rotationZ = 0;
      obj.root.position.set(obj.data.position.x, obj.data.position.y, obj.data.position.z);
      obj.root.rotation.set(0, rotY, 0);
      obj.root.scale.set(obj.data.scale.x, obj.data.scale.y, obj.data.scale.z);
      this.collabSession.broadcastPatch({
        type: 'prop_move',
        propId: obj.data.id,
        position: obj.data.position,
        rotationY: rotY,
        rotationX: 0,
        rotationZ: 0,
      });
      this.markDirty();
    }
    if (this.draggedCamera) {
      const obj = this.draggedCamera;
      this.draggedCamera = null;
      this.cams.gizmoGroup.attach(obj.root);
      this.cams.syncFromRoot(obj);
      if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
    }
    if (this.draggedMonitor) {
      this.draggedMonitor = false;
      this.scene3.attach(this.cams.monitor); // keeps its carried world pose
    }
    if (this.draggedFurniture) {
      const mesh = this.draggedFurniture;
      this.draggedFurniture = null;
      // Replaced by a new scan mid-carry: clear() already detached and disposed it.
      if (!this.location.ownsFurniture(mesh)) return;
      this.location.group.attach(mesh); // back under contentRoot, world pose kept
      const placement = this.location.commitFurniture(mesh);
      if (placement && this.sceneData.scan) {
        const list = (this.sceneData.scan.furniture ?? []).filter(
          (p) => p.meshIndex !== placement.meshIndex,
        );
        list.push(placement);
        this.sceneData.scan.furniture = list;
        this.markDirty();
      }
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
    if (this.selectedActorId) {
      const obj = this.actors.get(this.selectedActorId);
      if (obj) {
        const result = this.keyframes.capture(obj);
        if (result === 'full') {
          this.actors.flashLabel(obj, `MAX ${this.keyframes.maxKeyframes} KFs`);
        } else {
          this.actors.flashLabel(obj, `KF ${obj.data.keyframes.length} ✓`);
        }
        this.history.record(this.sceneData);
        this.markDirty();
        return;
      }
    }
    const camObj = this.cams.active;
    if (camObj) {
      const result = this.keyframes.captureCamera(camObj);
      if (result === 'full') {
        this.debug.log(`⚠️ MAX ${this.keyframes.maxCameraKeyframes} Camera Marks`);
      } else {
        const count = camObj.data.keyframes?.length ?? 1;
        this.debug.log(`📍 Camera Mark #${count} ✓ (${camObj.data.name})`);
      }
      this.history.record(this.sceneData);
      this.markDirty();
      return;
    }
    this.debug.log('B: select an actor or camera first');
  }

  private tryTeleport(): void {
    if (this.views.mode !== 'full' || !this.session.lastHit) return;
    this.views.teleportTo(this.session.lastHit.point, this.lastViewerPos);
    this.debug.log('teleported (Re-align on wrist menu restores registration)');
  }

  private selectActor(id: string | null): void {
    if (id) {
      // Selecting an actor ends any prop selection; otherwise Delete/Dup
      // (which prefer a selected prop) would act on the stale prop.
      this.selectedPropId = null;
      this.props.setSelected(null);
    }
    this.selectedActorId = id;
    this.actors.setSelected(id);
    if (id) {
      const actor = this.actors.get(id);
      if (actor) {
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: actor.root.position.x,
          y: actor.root.position.y,
          z: actor.root.position.z,
        });
        this.contextualRadial.show('actor', id, actor.root.getWorldPosition(_radialPos), {
          stance: actor.data.stance,
          name: actor.data.name,
        });
      } else {
        this.contextualRadial.hide();
      }
    } else {
      this.contextualRadial.hide();
    }
    this.refreshWristState();
  }

  private selectProp(id: string | null): void {
    if (id) {
      // Selecting a prop ends any actor selection (mirror of selectActor), so
      // Stance, Mark and the Delete / Dup fallback never act on a hidden one.
      this.selectedActorId = null;
      this.actors.setSelected(null);
    }
    this.selectedPropId = id;
    this.props.setSelected(id);
    if (id) {
      const prop = this.props.get(id);
      if (prop) {
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: prop.root.position.x,
          y: prop.root.position.y,
          z: prop.root.position.z,
        });
        this.contextualRadial.show('prop', id, prop.root.getWorldPosition(_radialPos), {
          name: prop.data.name,
          category: prop.data.category,
        });
      } else {
        this.contextualRadial.hide();
      }
    } else {
      this.contextualRadial.hide();
    }
    this.refreshWristState();
  }

  /**
   * The object the contextual radial belongs to, so the loop can keep the ring
   * on it as the set moves (glide, snap-turn, teleport) or the object is
   * carried. Map lookups only: no allocation.
   */
  private radialTargetRoot(): THREE.Object3D | null {
    const id = this.contextualRadial.getActiveEntityId();
    if (!id) return null;
    switch (this.contextualRadial.getActiveEntityType()) {
      case 'actor':
        return this.actors.get(id)?.root ?? null;
      case 'prop':
        return this.props.get(id)?.root ?? null;
      case 'camera':
        return this.cams.get(id)?.root ?? null;
      default:
        return null;
    }
  }

  /**
   * Where a prop from the wheel or the Prop Library lands, in content space:
   * the live hit-test point when it is a plausible surface within reach
   * (props.ts propSpawnHitUsable: not a far wall the ray hit through the
   * wheel), otherwise PROP_SPAWN_AHEAD_M along your horizontal heading, on
   * the floor.
   */
  private propSpawnPoint(): Vec3 {
    const hit = this.session.session ? this.session.lastHit : null;
    if (hit) {
      const p = this.contentRoot.worldToLocal(hit.point.clone());
      const eye = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
      if (propSpawnHitUsable(p, eye)) return { x: p.x, y: p.y, z: p.z };
    }
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(this.lastViewerQuat);
    ahead.y = 0;
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1); // looking straight down
    ahead.normalize().multiplyScalar(PROP_SPAWN_AHEAD_M).add(this.lastViewerPos);
    const p = this.contentRoot.worldToLocal(ahead);
    return { x: p.x, y: 0, z: p.z };
  }

  /** Heading (rotationY) that turns a prop at `pos` (content space) to face the viewer. */
  private faceViewerYaw(pos: Vec3): number {
    const viewerLocal = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
    return Math.atan2(viewerLocal.x - pos.x, viewerLocal.z - pos.z);
  }

  /** Props sub-wheel preset: spawn that catalog prop where you look and select it. */
  private spawnWheelProp(assetId: string): void {
    // Place: Prop drops whatever preset was picked last.
    this.lastPropPreset = assetId;
    if (this.views.mode === 'mini') {
      // The miniature is scaled: "where you look" maps far outside the set.
      // Placing actors and cameras is Full-view only for the same reason.
      this.debug.log('Props: switch to Full view to place one here');
      return;
    }
    const pos = this.propSpawnPoint();
    void this.props.addProp(assetId, pos, { rotationY: this.faceViewerYaw(pos) }).then((obj) => {
      if (!obj) return;
      this.contentVersion++;
      this.selectProp(obj.data.id);
      this.collabSession.broadcastPatch({
        type: 'prop_add',
        prop: obj.data,
      });
      this.debug.log(`spawned ${obj.data.name}`);
      this.markDirty();
    });
  }

  private deleteTarget(): void {
    // End any in-progress drag first: deleting the grabbed object mid-drag
    // would otherwise leave draggedActor/Camera pointing at a disposed root
    // (phantom per-frame applyPose, and a leaked anchor queued on release).
    // Mirrors restoreScene. No-op when nothing is being manipulated.
    this.cancelActiveManipulation();
    if (this.hover?.kind === 'furniture') {
      // Guard: without this the fallthrough would delete the SELECTED actor
      // while the user is pointing at a couch.
      this.debug.log('scanned furniture can\'t be deleted — Remove scan (landing page) clears it all');
      return;
    }
    if (this.hover?.kind === 'prop' || (!this.hover && this.selectedPropId)) {
      const propId = this.hover?.kind === 'prop' ? this.hover.id : this.selectedPropId!;
      this.debug.log('deleted prop');
      this.props.removeProp(propId);
      this.collabSession.broadcastPatch({
        type: 'prop_remove',
        propId,
      });
      this.contentVersion++;
      if (this.selectedPropId === propId) this.selectProp(null);
      this.hover = null;
      this.markDirty();
      return;
    }
    if (this.hover?.kind === 'camera') {
      this.debug.log(`deleted camera`);
      this.cams.remove(this.hover.id);
      this.collabSession.broadcastPatch({
        type: 'camera_remove',
        cameraId: this.hover.id,
      });
      this.contentVersion++;
      this.hover = null;
      this.markDirty();
      return;
    }
    const id = this.hover?.kind === 'actor' ? this.hover.id : this.selectedActorId;
    if (!id) {
      this.debug.log('Delete: point at (or select) an actor, prop, or camera first');
      return;
    }
    const obj = this.actors.get(id);
    this.debug.log(`deleted ${obj?.data.name ?? 'actor'}`);
    this.keyframes.removeActor(id);
    this.actors.remove(id);
    this.collabSession.broadcastPatch({
      type: 'actor_remove',
      actorId: id,
    });
    this.contentVersion++;
    if (this.selectedActorId === id) this.selectActor(null);
    this.hover = null;
    this.markDirty();
  }

  /** Clones the hovered/selected actor, prop, or camera a short step away. */
  private duplicateTarget(): void {
    if (this.hover?.kind === 'furniture') {
      this.debug.log('scanned furniture can\'t be duplicated (yet)');
      return;
    }
    if (this.hover?.kind === 'prop' || (!this.hover && this.selectedPropId)) {
      const propId = this.hover?.kind === 'prop' ? this.hover.id : this.selectedPropId!;
      void this.props.duplicateProp(propId).then((obj) => {
        if (obj) {
          this.contentVersion++;
          // The manager already highlights the copy; make it the selection too,
          // so the next Delete/Dup acts on what is shown selected.
          this.selectProp(obj.data.id);
          this.collabSession.broadcastPatch({
            type: 'prop_add',
            prop: obj.data,
          });
          this.debug.log(`duplicated → ${obj.data.name}`);
          this.markDirty();
        }
      });
      return;
    }
    if (this.hover?.kind === 'camera') {
      this.duplicateCamera(this.hover.id);
      return;
    }
    const id = this.hover?.kind === 'actor' ? this.hover.id : this.selectedActorId;
    if (!id) {
      this.debug.log('Dup: point at (or select) an actor, prop, or camera first');
      return;
    }
    const data = duplicateActor(this.sceneData, id);
    if (!data) return;
    const obj = this.actors.adopt(data);
    this.keyframes.addActor(data);
    this.contentVersion++;
    if (!this.views.isShifted) this.pendingReanchorActors.push(obj);
    this.selectActor(data.id);
    this.collabSession.broadcastPatch({
      type: 'actor_add',
      actor: data,
    });
    this.debug.log(`duplicated → ${data.name}`);
    this.markDirty();
  }

  /** Clones a camera setup a short step away (Dup on a hovered camera, or its radial). */
  private duplicateCamera(id: string): void {
    const data = duplicateCameraSetup(this.sceneData, id);
    if (!data) return;
    const obj = this.cams.adopt(data);
    this.contentVersion++;
    if (!this.views.isShifted) this.pendingReanchorCams.push(obj);
    this.collabSession.broadcastPatch({
      type: 'camera_add',
      camera: data,
    });
    this.debug.log(`duplicated → ${data.name}`);
    this.refreshWristState();
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

  /** Wrist "Stance": cycles the selected actor's rest pose. */
  private cycleSelectedStance(dir: 1 | -1 = 1): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('Stance: select an actor first (point + trigger)');
      return;
    }
    const next = cycleStance(obj.data.stance, dir);
    this.actors.setStance(obj, next);
    this.actors.flashLabel(obj, poseFor(next).short);
    this.refreshWristState();
    this.markDirty();
  }

  private setSelectedStance(stance: StanceId): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('Stance: select an actor first (point + trigger)');
      return;
    }
    this.actors.setStance(obj, stance);
    this.actors.flashLabel(obj, poseFor(stance).short);
    this.refreshWristState();
    this.markDirty();
  }

  private adjustSelectedActorScale(delta: number): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('Height: select an actor first (point + trigger)');
      return;
    }
    const current = obj.data.scale ?? 1.0;
    const next = Math.min(3.0, Math.max(0.2, Math.round((current + delta) * 100) / 100));
    this.setSelectedActorScale(next);
  }

  private setSelectedActorScale(scale: number): void {
    const obj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    if (!obj) {
      this.debug.log('Height: select an actor first (point + trigger)');
      return;
    }
    const clamped = Math.min(3.0, Math.max(0.2, scale));
    this.actors.setScale(obj, clamped);
    const heightM = (1.75 * clamped).toFixed(2);
    this.actors.flashLabel(obj, `${heightM}m`);
    this.refreshWristState();
    this.markDirty();
  }

  /** Applies actor scale from the landing-page editor (in- or out-of-session). */
  private setActorScale(sceneId: string, actorId: string, scale: number): void {
    if (sceneId === this.sceneData.id) {
      const obj = this.actors.get(actorId);
      if (obj) this.actors.setScale(obj, scale);
      else {
        const a = this.sceneData.actors.find((x) => x.id === actorId);
        if (a) a.scale = Math.min(3.0, Math.max(0.2, scale));
      }
      this.persistence.saveNow(this.sceneData);
      this.refreshWristState();
    } else {
      const scene = this.persistence.loadScene(sceneId);
      const a = scene?.actors.find((x) => x.id === actorId);
      if (!scene || !a) return;
      a.scale = Math.min(3.0, Math.max(0.2, scale));
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
  }

  /** Applies a stance from the landing-page editor (in- or out-of-session). */
  private setActorStance(sceneId: string, actorId: string, stance: StanceId): void {
    if (sceneId === this.sceneData.id) {
      const obj = this.actors.get(actorId);
      if (obj) this.actors.setStance(obj, stance);
      else {
        const a = this.sceneData.actors.find((x) => x.id === actorId);
        if (a) a.stance = stance;
      }
      this.persistence.saveNow(this.sceneData);
      this.refreshWristState();
    } else {
      const scene = this.persistence.loadScene(sceneId);
      const a = scene?.actors.find((x) => x.id === actorId);
      if (!scene || !a) return;
      a.stance = stance;
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
  }

  /** Applies a blocking-editor mark op from the landing page (mirrors setActorStance). */
  private editActorMarks(sceneId: string, actorId: string, op: MarkOp): void {
    if (sceneId === this.sceneData.id) {
      const a = this.sceneData.actors.find((x) => x.id === actorId);
      if (!a || !applyMarkOp(a, op)) return;
      this.keyframes.refreshActor(a);
      this.persistence.saveNow(this.sceneData);
      this.refreshWristState();
    } else {
      const scene = this.persistence.loadScene(sceneId);
      const a = scene?.actors.find((x) => x.id === actorId);
      if (!scene || !a || !applyMarkOp(a, op)) return;
      this.persistence.updateScene(scene);
    }
    this.refreshLanding();
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
    this.location.beginCameraPass(); // captures frame the scanned set too
    let name: string | null;
    try {
      name = this.cams.capture(this.renderer, this.scene3, this.hiddenForVirtualCamera(), this.sceneData.name);
    } finally {
      this.location.endCameraPass();
    }
    this.debug.log(name ? `saved ${name}` : 'capture: no active camera');
  }

  /**
   * Starts/stops a video take of the active virtual camera. The take records
   * the monitor feed (virtual content only, DOF included when enabled) in any
   * view mode — walk the set or play blocking while the camera rolls — and
   * saves on device via the browser's download path, like photo capture.
   */
  private async toggleRecording(): Promise<void> {
    if (this.recorder.recording) {
      this.stopRecording(true);
      return;
    }
    const base = this.cams.recordingBaseName(this.sceneData.name);
    const size = this.cams.feedSize();
    if (!base || !size) {
      this.debug.log('record: no active camera — place one first');
      return;
    }
    const activeCam = this.cams.active;
    const meta: TakeMetadata = {
      cameraName: activeCam?.data.name || 'CAM A',
      focalLengthMm: activeCam?.data.lensFocalLength || 35,
      tStop: activeCam?.data.tStop || 2.8,
      aspect: activeCam?.data.aspect || '16:9',
      formatShort: sensorFormat(activeCam?.data.formatId ?? 's35').short,
    };
    const name = await this.recorder.start(this.renderer, size.w, size.h, base, performance.now(), true, meta);
    if (name) {
      globalSpatialFeedback.triggerHaptic('both', 'tally_start');
      globalSpatialFeedback.playSpatialSound('tally_start');
    }
    this.debug.log(name ? `recording ${name}` : 'record: video capture not supported in this browser');
    this.refreshWristState();
  }

  private stopRecording(save: boolean): void {
    if (!this.recorder.recording) return;
    globalSpatialFeedback.triggerHaptic('both', 'tally_stop');
    globalSpatialFeedback.playSpatialSound('tally_stop');
    this.recorder.stop(save);
    this.refreshWristState();
  }

  private setPlaceMode(mode: PlaceArm): void {
    if (mode === this.placeMode) return;
    this.placeMode = mode;
    this.debug.log(
      mode === 'none'
        ? 'placing off'
        : mode === 'actor'
          ? 'ARMED: pinch/trigger on the floor ring places an actor'
          : mode === 'camera'
            ? 'ARMED: pinch/trigger places a camera at your head'
            : mode === 'prop'
              ? `ARMED: pinch/trigger on the floor ring places a ${
                  getBuiltinPropDefinition(this.lastPropPreset)?.name ?? 'prop'
                } (Edit ▸ Props ▸ places another kind and makes it the default)`
              : 'light placing is not available yet',
    );
    this.guide.refresh(this.guideCtx());
    this.refreshWristState();
  }

  private setView(mode: 'full' | 'mini' | 'camera'): void {
    this.views.set(mode, this.lastViewerPos, this.lastViewerQuat, this.sceneBounds());
  }

  private cycleView(): void {
    this.views.cycle(this.lastViewerPos, this.lastViewerQuat, this.sceneBounds());
  }

  /**
   * Hard menu button (Y): parks the tool wheel head-locked in front of you, or
   * sends it back to riding the left hand. A hand-free, always-available path
   * to the menu for controller users — pressed again it tucks away.
   */
  private toggleMenuInFront(): void {
    this.wheelInFront = !this.wheelInFront;
    this.wheelPath = 'root'; // a fresh summon always opens at the root ring
    this.refreshWristState();
    this.debug.log(
      this.wheelInFront
        ? 'menu: parked in front — point and pull the trigger (Y hides it)'
        : 'menu: back on your left hand',
    );
  }

  private guideCtx(): GuideContext {
    return {
      mode: this.views.mode,
      placeMode: this.placeMode,
      eyesMode: this.cams.eyesMode,
      interaction: this.interactionMode,
    };
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
    // A scanned location counts: the miniature centers on the whole room.
    const scan = this.sceneData.scan;
    if (scan && this.location.hasScan) {
      box.expandByPoint(new THREE.Vector3(scan.boundsMin.x, scan.boundsMin.y, scan.boundsMin.z));
      box.expandByPoint(new THREE.Vector3(scan.boundsMax.x, scan.boundsMax.y, scan.boundsMax.z));
    }
    if (box.isEmpty()) return null;
    box.expandByScalar(0.5);
    return box;
  }

  private refreshWristState(): void {
    const activeCam = this.cams.active;
    this.wheel.setMenu(
      wheelMenu(
        {
          mode: this.interactionMode,
          placeMode: this.placeMode,
          viewMode: this.views.mode,
          playing: this.keyframes.playing,
          recording: this.recorder.recording,
          hasScan: this.location.hasScan,
          locationMode: this.location.mode,
          lensFocal: activeCam?.data.lensFocalLength ?? 35,
          tStop: activeCam?.data.tStop ?? this.cams.currentTStop,
          formatShort: sensorFormat(activeCam?.data.formatId ?? this.cams.currentFormat).short,
          aspect: activeCam?.data.aspect ?? this.cams.currentAspect,
          eyesMode: this.cams.eyesMode,
          dofOn: this.cams.dofEnabled,
          pace: this.sceneData.walkSpeed,
        },
        this.wheelPath,
      ),
    );
    this.wrist.setToggle('wheel-toggle', this.wheelInFront);
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
    // Format/T-stop buttons read the ACTIVE camera (what cycling would edit),
    // falling back to the defaults applied to newly committed cameras.
    this.wrist.setLabel('format', sensorFormat(activeCam?.data.formatId ?? this.cams.currentFormat).short);
    this.wrist.setLabel('tstop', `T${activeCam?.data.tStop ?? this.cams.currentTStop}`);
    this.wrist.setLabel('pace', `${this.sceneData.walkSpeed.toFixed(1)} m/s`);
    this.wrist.setToggle('undo', this.history.canUndo);
    this.wrist.setToggle('redo', this.history.canRedo);
    this.wrist.setLabel('scan', this.pendingScan ? 'Scanning…' : 'Scan Room');
    this.wrist.setToggle('scan', this.pendingScan !== null);
    const setupRunning = this.spaceSetupSession !== null && this.spaceSetupSession === this.session.session;
    const setupArmed = performance.now() < this.spaceSetupConfirmUntil;
    const setupRefusal = this.session.session ? this.session.roomCaptureRefusal() : null;
    this.wrist.setLabel(
      'space-setup',
      setupRunning
        ? 'Setting up…'
        : setupRefusal === 'already-used'
          ? 'Setup used'
          : setupRefusal
            ? 'Setup n/a'
            : setupArmed
              ? 'Confirm?'
              : 'Space Setup',
    );
    this.wrist.setToggle('space-setup', setupRunning || setupArmed);
    const loc = this.location.mode;
    this.wrist.setLabel('location', `Loc: ${loc.charAt(0).toUpperCase()}${loc.slice(1)}`);
    this.wrist.setToggle('location', this.location.hasScan && loc !== 'hidden');
    this.wrist.setToggle('dof', this.cams.dofEnabled);
    this.wrist.setToggle('record', this.recorder.recording);
    if (!this.recorder.recording) this.wrist.setLabel('record', '⏺ Rec');
    const selObj = this.selectedActorId ? this.actors.get(this.selectedActorId) : undefined;
    this.wrist.setLabel('stance', selObj ? `Stance ▸ ${poseFor(selObj.data.stance).short}` : 'Stance ▸');
    const sel = selObj?.data.name ?? '—';
    const cam = this.cams.active;
    if (this.statusNote && performance.now() < this.statusNote.until) {
      this.wrist.setStatus(this.statusNote.text);
      return;
    }
    this.statusNote = null;
    this.wrist.setStatus(`${sel}${cam ? ` · ${cam.data.name} ${Math.round(cam.data.lensFocalLength)}mm` : ''}`);
  }

  /**
   * Shows `text` on the wrist status line for STATUS_NOTE_MS, through any
   * refreshWristState in between, then hands the line back to the selection
   * summary.
   */
  private noteStatus(text: string): void {
    const note = { text, until: performance.now() + STATUS_NOTE_MS };
    this.statusNote = note;
    this.wrist.setStatus(text);
    window.setTimeout(() => {
      if (this.statusNote === note) this.refreshWristState();
    }, STATUS_NOTE_MS + 50);
  }

  /** Everything that must not appear in the virtual camera's frame. Cached and
   *  rebuilt only when actors/cameras are added or removed. */
  private hiddenForVirtualCamera(): THREE.Object3D[] {
    if (this.hiddenCache && this.hiddenCacheVersion === this.contentVersion) return this.hiddenCache;
    this.hiddenCache = [
      this.session.reticle,
      ...this.input.hudObjects(),
      this.wrist.group,
      this.wheel.group,
      this.cams.frameLines,
      this.cams.monitor,
      this.cams.gizmoGroup,
      this.driftMarker.group,
      this.views.platform,
      this.views.fadeSphere,
      this.keyframes.vizGroup,
      this.gizmo.root,
      ...this.actors.overlayObjects(),
      ...this.cams.overlayObjects(),
      ...this.props.overlayObjects(),
    ];
    this.hiddenCacheVersion = this.contentVersion;
    return this.hiddenCache;
  }

  /**
   * Reach-envelope targets for the comfort overlay: every prop, camera and actor.
   *
   * Called only while that overlay is visible. Entries are written into a reused
   * array of reused records rather than rebuilt, so showing the overlay does not
   * start allocating per frame either. The array is handed straight to
   * SpatialComfortRenderer.update, which reads it synchronously and keeps no
   * reference, so reusing the backing objects is safe.
   */
  private comfortReachTargets(): ComfortReachTarget[] {
    const out = this.comfortTargetBuffer;
    let n = 0;

    const push = (id: string, name: string, position: Vec3, category: ComfortReachTarget['category']) => {
      let rec = out[n];
      if (!rec) {
        rec = { id, name, position, category };
        out.push(rec);
      } else {
        rec.id = id;
        rec.name = name;
        rec.position = position;
        rec.category = category;
      }
      n++;
    };

    for (const p of this.sceneData.props ?? []) push(p.id, p.name, p.position, 'prop');
    for (const c of this.sceneData.cameras ?? []) push(c.id, c.name, c.position, 'camera_grip');
    for (const a of this.sceneData.actors ?? []) push(a.id, a.name, a.position, 'actor');

    if (out.length > n) out.length = n;
    return out;
  }

  // --- per-frame loop ----------------------------------------------------------------

  private loop(time: number, frame?: XRFrame): void {
    this.performanceGovernor.beginFrame(time);
    this.profilerRuntime.beginFrame(time);
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = time;
    if (!frame) {
      this.renderer.render(this.scene3, this.camera);
      // No timestamp: `time` is the frame *start*, so handing it to endFrame too would
      // report a zero-length CPU span. The governor measures frame time end-to-end.
      this.performanceGovernor.endFrame(this.renderer, this.splatRenderer, this.volumetrics);
      this.profilerRuntime.endFrame(this.renderer, time);
      return;
    }

    this.input.poll();
    globalSpatialFeedback.setXRInputSources(this.session.session?.inputSources ?? []);
    const pointer = this.input.pointerHand();

    this.session.viewerPose(frame, this.lastViewerPos, this.lastViewerQuat);

    // Deferred anchor creation (queued from input events, needs a live frame).
    for (const obj of this.pendingReanchorActors.splice(0)) this.actors.reanchor(obj, frame);
    for (const obj of this.pendingReanchorCams.splice(0)) this.cams.reanchor(obj, frame);

    this.updatePendingScan(frame, time);

    this.session.updateHitTest(frame, pointer);

    // Floor sanity: the lowest real hit over the first seconds IS the floor.
    // If it sits below y=0 the platform's floor origin is too high (bad
    // boundary height / local fallback) and the whole scene would float at
    // head height (first-QA failure, on video) — re-base once, loudly.
    if (!this.floorEst.committed) {
      if (this.session.lastHit) this.observeFloor(this.session.lastHit.point.y, time);
      const fix = floorCorrection(this.floorEst, this.lastViewerPos.y, time);
      if (fix !== null) {
        this.floorEst.committed = true;
        this.views.setFloorOffset(fix);
        this.debug.log(`⚠ floor origin was ${(-fix).toFixed(2)} m too high — scene re-based to the real floor`);
      }
    }

    // Pointer ray → wrist panel first, then world targets. Hands drive the
    // wheel by DIRECT fingertip taps (right index tip on the palm disc), with
    // the ray as a fallback hover so a pinch can press the pointed-at sector
    // even when the occluded tip loses tracking; controllers by ray + trigger.
    const rc = this.input.raycaster(pointer, this.raycaster);
    if (this.contextualRadial.isVisible()) {
      // Keep the ring on its target: the set moves under glide, snap-turn and
      // teleport, and a carried prop moves with the hand.
      const target = this.radialTargetRoot();
      if (target) this.contextualRadial.setAnchor(target.getWorldPosition(_radialPos));
      else this.contextualRadial.hide(); // target gone (deleted, remote patch)
    }
    this.contextualRadial.update(this.camera);
    if (rc) this.contextualRadial.handlePointer(rc, false);

    const tip = this.input.fingertip('right', _tip);
    this.tipOnWheel = tip !== null && this.wheel.touchAt(tip);
    const onWheel = this.tipOnWheel || this.wheel.update(rc);
    // A pinch/trigger is a MENU press only when the pointer is actually on the
    // wheel — NOT merely because the wheel is visible (it almost always is
    // now). This is what lets placement still work with the wheel on-screen.
    this.pointerOnWheel = onWheel;
    const onPanel = this.wrist.update(rc, this.input.triggerHeld(pointer)) || onWheel;
    this.updateHover(onPanel ? null : rc);

    const placingAllowed =
      this.interactionMode === 'block' &&
      this.views.mode === 'full' &&
      !onPanel &&
      !this.hover &&
      !this.draggedActor &&
      this.placeMode !== 'none';
    this.session.updateReticle(
      placingAllowed || (this.views.mode === 'full' && !onPanel && !this.hover),
      this.placeMode,
    );

    // The tool wheel is the menu hub, and it is ALWAYS reachable — no gaze, no
    // summon gesture (three QA sessions in a row, gaze-summon left users with
    // NO way into the menu). It rides the LEFT hand: raise your hand and the
    // wheel is right there; drop your hand and it falls out of frame on its
    // own. The hard Y button ALSO parks it head-locked in front of your face
    // (wheelInFront) so the menu is one press away even hand-free.
    const leftGrip = this.input.gripSpace('left');
    if (leftGrip && this.wristMount.parent !== leftGrip) leftGrip.add(this.wristMount);
    if (this.wheelInFront) {
      // Head-locked, half a meter ahead. Parented to the camera so it stays
      // planted in front of the face; identity rotation already faces you.
      if (this.wheel.group.parent !== this.camera) this.camera.add(this.wheel.group);
      this.wheel.group.position.copy(WHEEL_FRONT_POS);
      this.wheel.group.quaternion.identity();
      this.wheelShown = true;
    } else {
      // Riding the left hand (palm), billboarding to the eyes.
      if (this.wheel.group.parent !== this.wristMount) {
        this.wristMount.add(this.wheel.group);
        this.wheel.group.position.set(0, 0.05, -0.04);
      }
      let reachable = false;
      if (this.input.connected('left')) {
        // Guard an untracked grip stuck at the world origin: a dead wheel far
        // from the head must not float in space (past QA failure mode).
        this.wheel.group.getWorldPosition(_pt);
        reachable = _pt.distanceTo(this.lastViewerPos) < WHEEL_MAX_REACH_M;
      }
      this.wheelShown = reachable;
      // Face the eyes from the palm — but FREEZE while a fingertip is on the
      // disc: re-billboarding under the finger shifts the disc's local depth
      // axis mid-tap and breaks the push-down edge detection.
      if (this.wheelShown && !this.tipOnWheel) this.wheel.group.lookAt(this.lastViewerPos);
    }
    if (!this.wheelShown && this.wheel.group.visible) {
      this.wheelPath = 'root'; // reset to the root ring when it tucks away
      this.refreshWristState();
    }
    this.wheel.group.visible = this.wheelShown;
    // The wrist panel is always accessible on the left wrist when hand is tracked.
    this.wrist.group.visible = this.wheelShown;

    // Update Two-Hand Viewfinder gesture
    this.viewfinder.update(this.input, this.camera, dt);

    // Update Director's Smartwatch Slate
    const activeCam = this.cams.active;
    const focusDist = activeCam ? computeFocusDistance(activeCam.data, this.sceneData.actors) : 2.5;
    const framing = activeCam
      ? classifyShotSize(activeCam.data.lensFocalLength, activeCam.data.aspect, activeCam.data.formatId, focusDist)
      : undefined;

    let lineOfActionCrossing = false;
    if (this.sceneData.actors.length >= 2) {
      const axis = check180LineOfAction(
        this.sceneData.cameras,
        this.sceneData.actors[0].position,
        this.sceneData.actors[1].position,
      );
      lineOfActionCrossing = axis.hasCrossing;
    }

    let cameraInShotWarning: string | null = null;
    if (activeCam) {
      const collisions = findCamerasInFrustums(this.sceneData.cameras).filter(
        (c) => c.observerCamId === activeCam.data.id,
      );
      if (collisions.length > 0) {
        cameraInShotWarning = `In Shot: ${collisions.map((c) => c.observedCamName).join(', ')}`;
      }
    }

    const cameraMove = activeCam?.data.keyframes && activeCam.data.keyframes.length >= 2
      ? classifyCameraMove(activeCam.data.keyframes)
      : undefined;

    let jumpCutWarning = false;
    let eyelineMismatchWarning = false;
    if (activeCam && this.sceneData.cameras.length >= 2) {
      const otherCams = this.sceneData.cameras.filter((c) => c.id !== activeCam.data.id);
      for (const other of otherCams) {
        const jc = check30DegreeRule(activeCam.data, other);
        if (jc.isJumpCut) {
          jumpCutWarning = true;
          break;
        }
      }
      if (this.sceneData.actors.length >= 2) {
        for (const other of otherCams) {
          const em = checkEyelineMatch(
            this.sceneData.actors[0].position,
            this.sceneData.actors[1].position,
            activeCam.data,
            other,
          );
          if (em.status === 'crossing') {
            eyelineMismatchWarning = true;
            break;
          }
        }
      }
    }

    this.smartwatch.update(
      {
        sceneName: this.sceneData.name || 'Untitled Scene',
        activeCamName: activeCam?.data.name || 'CAM A',
        focalLengthMm: activeCam?.data.lensFocalLength || 35,
        tStop: activeCam?.data.tStop || 2.8,
        formatShort: sensorFormat(activeCam?.data.formatId ?? 's35').short,
        focusDistanceM: focusDist,
        focusTargetName: activeCam?.data.focusTargetActorId
          ? this.sceneData.actors.find((a) => a.id === activeCam.data.focusTargetActorId)?.name
          : undefined,
        shotSize: framing?.shotSize,
        shotSizeLabel: framing?.shotSizeLabel,
        cameraMoveType: cameraMove?.moveType,
        cameraMarksCount: activeCam?.data.keyframes?.length ?? 0,
        cameraMoveProgress: this.keyframes.normalizedT,
        lookAtTargetName: activeCam?.data.lookAtTargetActorId
          ? this.sceneData.actors.find((a) => a.id === activeCam.data.lookAtTargetActorId)?.name
          : undefined,
        lineOfActionCrossing,
        jumpCutWarning,
        eyelineMismatchWarning,
        cameraInShotWarning,
        villageMode: this.cams.villageMode,
        recording: this.recorder.recording,
        recordingClock: recordingClock(this.recorder.elapsedS(time)),
        audioActive: shouldIncludeAudioTrack(true, true),
        takeCount: this.takeLibrary.count,

        smpteTimecode: this.cams.dailiesActive && this.cams.dailiesTake
          ? secondsToSmpte(this.cams.dailiesVideoElement?.currentTime ?? 0, 24).formatted
          : this.keyframes.smpteTimecode,
        smpteDuration: this.cams.dailiesActive && this.cams.dailiesTake
          ? secondsToSmpte(this.cams.dailiesTake.durationS, 24).formatted
          : this.keyframes.smpteDuration,
        isPlaying: this.cams.dailiesActive
          ? (this.cams.dailiesVideoElement ? !this.cams.dailiesVideoElement.paused : false)
          : this.keyframes.isPlaying,
        playbackRate: this.keyframes.playbackRate,
        isLooping: this.keyframes.isLooping,
        normalizedT: this.cams.dailiesActive
          ? (this.cams.dailiesTake && this.cams.dailiesTake.durationS > 0
              ? (this.cams.dailiesVideoElement?.currentTime ?? 0) / this.cams.dailiesTake.durationS
              : 0)
          : this.keyframes.normalizedT,
        dailiesActive: this.cams.dailiesActive,
        dailiesTakeNumber: this.takeLibrary.activeTake?.takeNumber,
        dailiesTakeCount: this.takeLibrary.count,

        audioCueCount: this.sceneData.audioCues?.length ?? 0,
        propCount: this.props.all().length,
        activeAudioCueName: sampleActiveAudioCues(this.sceneData.audioCues ?? [], this.keyframes.t)[0]?.cue.name,
        isRecordingScratch: globalSpatialSoundEngine.isRecordingScratch,
        audioCueMarkers: (this.sceneData.audioCues ?? []).map((c) => ({
          normTime: this.keyframes.duration > 0 ? c.timestampS / this.keyframes.duration : 0,
          color: c.color || '#46a758',
        })),

        collabPeerCount: this.collabRoster.count,
        collabRoomCode: this.collabSession.roomCode,
        collabIsConnected: this.collabSession.state === 'connected',
      },
      this.input,
      time
    );

    // Controls-guide chips ride the same grip spaces; expire the auto-show.
    if (leftGrip && this.guide.left.parent !== leftGrip) leftGrip.add(this.guide.left);
    const rightGrip = this.input.gripSpace('right');
    if (rightGrip && this.guide.right.parent !== rightGrip) rightGrip.add(this.guide.right);
    if (this.guide.visible && !this.guideSticky && time > this.guideAutoUntil) this.guide.hide();

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
    } else if (this.draggedFurniture || this.draggedProp || this.draggedCamera) {
      // Yaw the carried piece (scanned furniture, a prop or a camera) about the
      // world up-axis (same stick gesture as rotating a dragged actor). Its
      // parent is the controller ray, which pitches and rolls with the hand,
      // and rotateOnWorldAxis assumes an unrotated parent: it would spin about
      // the ray's own Y and give a carried camera roll and pitch. So world up
      // is expressed in the parent's frame first. Being a branch of this
      // chain, a carry also keeps the stick from snap-turning the set.
      const held = this.draggedFurniture ?? this.draggedProp?.root ?? this.draggedCamera!.root;
      if (Math.abs(axes.x) > 0.15) {
        const parent = held.parent;
        if (parent) {
          parent.getWorldQuaternion(_qParentInv).invert();
          _spinAxis.copy(_up).applyQuaternion(_qParentInv);
          _qSpin.setFromAxisAngle(_spinAxis, -axes.x * dt * 3.0);
          held.quaternion.premultiply(_qSpin);
        } else {
          held.rotateOnWorldAxis(_up, -axes.x * dt * 3.0);
        }
      }
    } else if (this.miniGrabbing) {
      const grip = this.input.gripSpace(pointer);
      if (grip)
        this.views.miniGrabMove(new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld), axes.x, dt);
    } else if (this.views.mode === 'mini') {
      this.views.miniRotate(axes.x, dt);
    } else {
      // Pointer (right) stick: steps focal length in Camera View / frame-lines
      // mode, otherwise snap-turns the set in Full view.
      const step = this.input.stickStepX(pointer);
      if (step !== 0) {
        if (this.views.mode === 'camera') {
          this.cams.stepActiveFocal(step);
          this.refreshWristState();
        } else if (this.cams.eyesMode) {
          this.cams.stepEyesFocal(step);
        } else if (this.views.mode === 'full' && pointer === 'right') {
          // Stick right → turn the view right (sign lives in snapTurnAngle, which
          // is unit-tested). Guarded to the right stick so a left-only controller
          // keeps the left stick purely for glide, not turning + strafing at once.
          this.views.snapTurn(snapTurnAngle(step, SNAP_TURN_RAD), this.lastViewerPos);
        }
      }
    }

    // Smooth locomotion: LEFT stick glides through the set at full scale. Same
    // content-shift mechanism as teleport, so anchored content stays consistent.
    // Suppressed while manipulating so it never fights a drag/grab. The radial
    // deadzone gate keeps the hot path allocation-free when the stick is centered
    // (the common case) — locomotionAmount only runs on real input.
    const loco = this.locoState;
    loco.viewMode = this.views.mode;
    loco.draggingActor = this.draggedActor !== null;
    loco.draggingCamera = this.draggedCamera !== null;
    loco.draggingProp = this.draggedProp !== null;
    loco.draggingFurniture = this.draggedFurniture !== null;
    loco.miniGrabbing = this.miniGrabbing;
    if (!locomotionSuppressed(loco)) {
      const ls = this.input.axes('left');
      if (ls.x * ls.x + ls.y * ls.y > LOCOMOTION_DEADZONE * LOCOMOTION_DEADZONE) {
        const mv = locomotionAmount(ls.x, ls.y, LOCOMOTION_SPEED, dt, LOCOMOTION_DEADZONE);
        if (mv.forward !== 0 || mv.right !== 0) {
          _fwd.set(0, 0, -1).applyQuaternion(this.lastViewerQuat);
          _fwd.y = 0;
          if (_fwd.lengthSq() > 1e-6) _fwd.normalize();
          _right.set(1, 0, 0).applyQuaternion(this.lastViewerQuat);
          _right.y = 0;
          if (_right.lengthSq() > 1e-6) _right.normalize();
          const dx = _right.x * mv.right + _fwd.x * mv.forward;
          const dz = _right.z * mv.right + _fwd.z * mv.forward;
          this.views.glide(dx, dz);
        }
      }
    }

    // Drift resistance: snap anchored content to tracked anchor positions.
    if (!this.keyframes.active) this.actors.updateFromAnchors(frame);
    this.cams.updateFromAnchors(frame, this.draggedCamera?.data.id ?? null);
    // After a reset: survivors have just reported their new pose; re-anchor the rest.
    if (this.anchorRecheck) this.recheckAnchors(frame, time);

    this.keyframes.tick(dt);
    this.views.update(time);
    this.cams.update(dt, time, this.lastViewerPos, this.lastViewerQuat);
    this.actors.updateLabels(time);
    this.actors.updateAnimations(time * 0.001);
    this.driftMarker.update(time);

    // Multi-User WebRTC Collaboration: Broadcast Presence & Spatial Audio Update
    if (this.collabSession.state === 'connected' && time - this.lastCollabBroadcast > 33) {
      this.lastCollabBroadcast = time;
      const headPose = {
        position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        rotation: {
          x: this.camera.quaternion.x,
          y: this.camera.quaternion.y,
          z: this.camera.quaternion.z,
          w: this.camera.quaternion.w,
        },
      };

      const pointerRay = this.session.reticle.visible
        ? {
            origin: { x: this.camera.position.x, y: this.camera.position.y - 0.2, z: this.camera.position.z },
            direction: { x: 0, y: -1, z: 0 },
            hitPoint: {
              x: this.session.reticle.position.x,
              y: this.session.reticle.position.y,
              z: this.session.reticle.position.z,
            },
          }
        : undefined;

      this.collabSession.broadcastPresence({
        headPose,
        pointerRay,
        activeCameraId: this.cams.active?.data.id,
        lockedEntityId: this.draggedActor?.data.id ?? this.draggedCamera?.data.id ?? undefined,
      });

      this.collabSession.updateListenerPose(this.camera.position, this.camera.quaternion);

      // Prune stale peers
      const stale = this.collabRoster.pruneStalePeers();
      for (const id of stale) {
        this.collabAvatars.removePeer(id);
      }
    }

    // Stream LiveLink telemetry to Unreal Engine
    if (this.sceneData.livelink?.enabled) {
      const activeCam = this.cams.active;
      let streamPos: { x: number; y: number; z: number };
      let streamRot: { x: number; y: number; z: number; w: number };
      let focalMm = 35;
      let tStop = 2.8;
      let focusDist = 2.5;
      let sensorW = 24.89;
      let sensorH = 14.0;
      let fov = 54.0;

      if (activeCam) {
        const p = activeCam.root.position;
        const q = activeCam.root.quaternion;
        streamPos = { x: p.x, y: p.y, z: p.z };
        streamRot = { x: q.x, y: q.y, z: q.z, w: q.w };
        focalMm = activeCam.data.lensFocalLength;
        tStop = activeCam.data.tStop;
        focusDist = computeFocusDistance(activeCam.data, this.sceneData.actors);
        const sFmt = sensorFormat(activeCam.data.formatId);
        sensorW = sFmt.gateWidthMm;
        sensorH = sFmt.gateWidthMm / aspectValue(activeCam.data.aspect);
        fov = hFovDeg(focalMm, sFmt);
      } else {
        streamPos = { x: this.lastViewerPos.x, y: this.lastViewerPos.y, z: this.lastViewerPos.z };
        streamRot = {
          x: this.lastViewerQuat.x,
          y: this.lastViewerQuat.y,
          z: this.lastViewerQuat.z,
          w: this.lastViewerQuat.w,
        };
      }

      this.liveLinkStreamer.sendFrame(
        streamPos,
        streamRot,
        {
          focalLengthMm: focalMm,
          apertureTStop: tStop,
          focusDistanceM: focusDist,
          sensorWidthMm: sensorW,
          sensorHeightMm: sensorH,
          fieldOfViewDeg: fov,
        },
        dt,
      );

      this.vcamHud.updateCameraOptics(focalMm, tStop, focusDist, activeCam?.data.aspect ?? '2.39:1');
    }

    const recording = this.recorder.recording;
    if (this.views.mode === 'camera' || recording) {
      // The virtual camera always sees the scanned set, even when the wearer
      // has it hidden (on location the real room fills that role for eyes,
      // but the monitor can only show virtual content). While a take is
      // rolling the pass runs in ANY view mode — the camera keeps filming
      // while the wearer walks the set. Still the same single RTT pass.
      this.location.beginCameraPass();
      // Clear last frame's near-head ghosting so the take films the full
      // cast; the wearer-view ghost pass below re-applies it after.
      for (const obj of this.actors.all()) obj.root.visible = true;
      let feedTex: THREE.Texture | null = null;
      try {
        feedTex = this.cams.renderMonitor(this.renderer, this.scene3, this.hiddenForVirtualCamera());
      } finally {
        this.location.endCameraPass();
      }
      if (recording) {
        const size = this.cams.feedSize();
        if (feedTex && size) {
          this.recorder.captureFrame(this.renderer, feedTex, size.w, size.h, time);
        } else {
          // Active camera deleted mid-take — finish and save what we have.
          this.stopRecording(true);
        }
      }
    }

    // Ghost any actor the user's head is inside: walking through your own
    // blocking is normal; a torso across the eyes is not (first-QA video:
    // "giant actor on my face"). Scale-aware like the camera-gizmo ghosting;
    // never a mid-drag actor (deliberately in hand). Runs AFTER the virtual
    // camera pass so the monitor and takes keep filming the full cast.
    {
      const worldScale = this.contentRoot.getWorldScale(_pt).x || 1;
      for (const obj of this.actors.all()) {
        if (obj === this.draggedActor) continue;
        const actorScale = obj.data.scale ?? 1.0;
        const threshold = 0.45 * worldScale * actorScale;
        const d = obj.root.getWorldPosition(_fwd).distanceTo(this.lastViewerPos);
        // Distance is to the feet origin; a standing body's torso spans well
        // above it, so also test a chest point (~1.3 m up, scaled).
        const chest = _right.copy(_fwd);
        chest.y += 1.3 * worldScale * actorScale;
        const near = Math.min(d, chest.distanceTo(this.lastViewerPos));
        obj.root.visible = near > threshold;
      }
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
      if (this.recorder.recording)
        this.wrist.setLabel('record', `⏺ ${recordingClock(this.recorder.elapsedS(time))}`);
      // Expire an unconfirmed Space Setup press so the wrist stops saying 'Confirm?'.
      if (this.spaceSetupConfirmUntil !== 0 && performance.now() > this.spaceSetupConfirmUntil) {
        this.spaceSetupConfirmUntil = 0;
        this.refreshWristState();
      }
    }

    this.splatRenderer.update(this.camera);
    const activeCamObj = this.cams.active ?? this.cams.all()[0];
    if (activeCamObj) {
      const focalMm = Number(activeCamObj.data.lensFocalLength) || 35;
      const fmt = sensorFormat(activeCamObj.data.formatId);
      const fov = vFovDeg(activeCamObj.data.lensFocalLength, activeCamObj.data.aspect, fmt);
      const aspect = aspectValue(activeCamObj.data.aspect);
      this.icvfxRenderer.update(
        {
          position: activeCamObj.root.position,
          quaternion: activeCamObj.root.quaternion,
          fov,
          aspect,
        },
        focalMm,
        fmt.gateWidthMm,
        4096,
      );
    }
    this.acousticsRenderer.update(
      this.sceneData.actors,
      activeCamObj?.data,
      time * 0.001,
    );
    this.solarRenderer.update(dt);
    this.screenplayRenderer.update(this.sceneData.actors, this.sceneData.cameras);
    // Only build the reach-target list when the comfort overlay is actually showing.
    // update() reads this argument solely inside its isVisible branch, and arguments
    // evaluate eagerly, so constructing it unconditionally allocated three arrays plus
    // one object per prop, camera and actor on EVERY frame and then threw them away.
    // On a dressed set that is thousands of short-lived objects a second against a
    // 72fps budget, which is exactly the GC micro-stutter this loop is meant to avoid.
    this.comfortRenderer.update(
      this.camera,
      dt,
      this.comfortRenderer.getIsVisible() ? this.comfortReachTargets() : undefined,
    );
    this.volumetrics.tick(dt, this.sceneData.atmosphere, this.sceneData.lights ?? [], this.camera);
    this.renderer.render(this.scene3, this.camera);
    // See the non-XR path above: endFrame stamps its own clock so the begin->end span
    // is real CPU time rather than a zero delta against the frame-start timestamp.
    this.performanceGovernor.endFrame(this.renderer, this.splatRenderer, this.volumetrics);
    this.profilerRuntime.endFrame(this.renderer, time);
  }

  // --- studio modals -----------------------------------------------------------------

  /**
   * Dev server only (the constructor calls this under import.meta.env.DEV,
   * which vite build compiles to false, so production never installs it): a
   * handle for the headed smokes such as test/studio-modal-smoke.html.
   * Undo lives on the 3D wheel and wrist and rendered props live in the 3D
   * scene, so a DOM-driven smoke cannot reach either without it.
   */
  private installDevTestHooks(): void {
    const sent: string[] = [];
    const collab = this.collabSession;
    const broadcast = collab.broadcastPatch.bind(collab);
    collab.broadcastPatch = (patch) => {
      sent.push(JSON.stringify(patch));
      broadcast(patch);
    };
    const splat = this.splatRenderer as unknown as { cloud?: { id: string } | null };
    (window as unknown as { __setviewTest?: unknown }).__setviewTest = {
      undo: () => this.undo(),
      canUndo: () => this.history.canUndo,
      renderedPropCount: () => this.props.all().length,
      splatCloudId: () => splat.cloud?.id ?? null,
      liveDmxEnabled: () => this.dmxStreamer.getConfig().enabled,
      sentPatches: () => sent.slice(),
      // test/location-import-smoke.html: what the live scene shows after an import.
      currentSceneId: () => this.sceneData.id,
      currentScan: () => this.sceneData.scan ?? null,
      displayedScanId: () => this.displayedScanId,
      // Geometry-scan meshes only (Photo parts are counted by photoParts).
      locationMeshCount: () => {
        let n = 0;
        this.location.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.name.startsWith('scan:')) n++;
        });
        return n;
      },
      blobBytes: async (id: string) => (await this.persistence.blobs.getBytes(id))?.byteLength ?? null,
      locationMode: () => this.location.mode,
      photoState: () => this.location.photoState,
      photoParts: () => this.location.photoPartCount,
      photoTextureSizes: () => this.location.photoTextureSizes(),
    };
  }

  /**
   * Where a DOM modal (studio, library, exporter) mounts. Outside an XR session
   * (landing page, desktop preview, the Quest 2D page) that is document.body:
   * #overlay is hidden there. Inside a session only the dom-overlay root is
   * displayed, so it is #overlay when the session granted dom-overlay, and null
   * otherwise, meaning the modal would be invisible and the caller must refuse.
   */
  private modalHost(): HTMLElement | null {
    if (!this.inXRSession()) return document.body;
    if (!this.session.features.domOverlay) return null;
    return document.getElementById('overlay');
  }

  /**
   * True while an XR session is live and presenting. Also checks three's
   * isPresenting, so the 2D page is never treated as in-session because of a
   * session object a failed start left behind.
   */
  private inXRSession(): boolean {
    return !!this.session.session && this.renderer.xr.isPresenting;
  }

  /**
   * modalHost() for a studio the user just asked for. In AR without dom-overlay
   * it returns null after saying so where the user is looking (wheel hub, wrist
   * status, debug log, haptic buzz) instead of opening an invisible modal: the
   * same refusal openNoteEditor makes, made visible.
   */
  private studioHost(name: string): HTMLElement | null {
    const host = this.modalHost();
    if (host) return host;
    const NOTICE_MS = 3000;
    this.debug.log(`${name} needs dom-overlay, which this session lacks: open it on the 2D page`);
    this.wheel.showHubNotice('2D page', 'open it there', NOTICE_MS);
    // noteStatus holds the line through the refreshWristState every press makes,
    // then hands it back to the selection summary.
    this.noteStatus(`${name}: open this on the 2D page`);
    globalSpatialFeedback.triggerHaptic('both', 'error');
    globalSpatialFeedback.playSpatialSound('error');
    return null;
  }

  /**
   * A studio still open when the session ends sits in #overlay, which the 2D
   * page hides. Move it to body so it stays visible and usable there, and its
   * unsaved edits are neither lost nor brought back on the next AR entry. Its
   * Save and Cancel still work: the callbacks do not depend on where it mounts.
   */
  private moveStudiosToPage(): void {
    const overlayRoot = document.getElementById('overlay');
    if (!overlayRoot) return;
    for (const el of Array.from(overlayRoot.children)) {
      if (STUDIO_MODAL_ROOT_CLASSES.some((cls) => el.classList.contains(cls))) document.body.appendChild(el);
    }
  }

  /**
   * Commits an edit made in a studio modal. Studios opened from the landing page
   * can target a scene other than the live one: that scene is only saved, since
   * the live renderers, collab peers and undo history belong to the current
   * scene. For the current scene the edit is applied to this.sceneData itself
   * (the modal may hold a stale object if an undo replaced the scene while it was
   * open), pushed to the running subsystems by `applyLive`, saved, broadcast and
   * recorded as one undo step.
   */
  private commitStudioEdit(
    sc: SceneData,
    mutate: (target: SceneData) => void,
    applyLive?: () => void,
    patch?: CollabScenePatch,
  ): void {
    if (sc.id !== this.sceneData.id) {
      mutate(sc);
      this.persistence.saveNow(sc);
      this.refreshLanding();
      return;
    }
    mutate(this.sceneData);
    applyLive?.();
    this.persistence.saveNow(this.sceneData);
    if (patch) this.collabSession.broadcastPatch(patch);
    this.markDirty();
    // The landing page is hidden in AR and refreshed when the session ends.
    if (!this.inXRSession()) this.refreshLanding();
  }

  /**
   * Older builds kept the Gemini API key inside each scene's set-dressing
   * config, so it was autosaved, exported and sent to collab peers. It is now a
   * per-device setting and normalizeScene drops it from scenes. Runs once per
   * device, before the first scene loads: moves the key from the most recently
   * edited scene that has one into the device setting, then rewrites every
   * stored scene without it, so no scene in storage still holds the key.
   */
  private migrateGeminiKeyOnce(): void {
    let store: Storage | null = null;
    try {
      store = window.localStorage;
    } catch {
      return; // storage blocked: nothing stored to move, nowhere to put it
    }
    // Mirrors SCENE_PREFIX in persistence.ts. If that ever changes this finds
    // nothing and the user re-enters the key once (the Set Dressing modal says so).
    const prefix = 'setview.scene.';
    const sceneKeys = this.persistence.listScenes().map((e) => prefix + e.id); // most recently updated first
    if (migrateEmbeddedGeminiKey(store, sceneKeys)) {
      this.debug.log('Gemini API key moved from scene data to a per-device setting');
    }
  }

  /**
   * props.setScene disposes and rebuilds every prop object (asynchronously) and
   * clears PropsManager's own selection. Drop main's prop selection and prop
   * hover with it, as loadScene and restoreScene do, so Delete and Duplicate
   * never act on a prop that is gone, the radial does not linger on it, and the
   * gizmo never drives a disposed root.
   */
  private dropPropSelectionForRebuild(): void {
    if (this.hover?.kind === 'prop') this.hover = null;
    if (this.selectedPropId) this.selectProp(null);
    else if (this.gizmo.getTarget()?.kind === 'prop') this.gizmo.detach();
  }

  /** Points the splat renderer at the scene's active cloud and floorplan. */
  private applySplatState(data: SceneData): void {
    const clouds = data.gaussianClouds ?? [];
    this.splatRenderer.setCloud(clouds.find((c) => c.id === data.activeSplatCloudId) ?? clouds[0] ?? null);
    this.splatRenderer.setFloorplanOverlay(data.architecture ?? null);
  }

  private openSplatStudioDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('3DGS Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    // The studio replaces scene.architecture only when Extract Walls staged a
    // new one; otherwise Save must not write this (possibly stale) copy back
    // over an architecture changed meanwhile by an undo or a collab patch.
    const architectureAtOpen = sc.architecture;
    openGaussianSplatStudioModal(
      sc,
      (updated) => {
        // A normal undo step. This used to run loadScene, whose history.reset
        // wiped the whole undo stack on every save. Only the splat renderer
        // reads these fields, so actors, cameras and their anchors stay put.
        this.commitStudioEdit(
          sc,
          (t) => {
            t.gaussianClouds = updated.gaussianClouds;
            t.activeSplatCloudId = updated.activeSplatCloudId;
            if (updated.architecture !== architectureAtOpen) t.architecture = updated.architecture;
          },
          () => this.applySplatState(this.sceneData),
        );
      },
      host,
      // Live preview while editing; Cancel sends the opening cloud back here.
      (cloud) => {
        if (sc.id === this.sceneData.id) this.splatRenderer.setCloud(cloud);
      },
    );
  }

  private openPerformanceSettings(): void {
    const host = this.studioHost('Performance Settings');
    if (!host) return;
    openPerformanceSettingsModal(
      this.performanceGovernor,
      (cfg) => {
        this.debug.log(`Perf governor config updated: target ${cfg.targetFps} FPS`);
      },
      host,
    );
  }

  private openDmxBridgeDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('DMX Bridge');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openDmxBridgeStudioModal(
      sc,
      (config) => {
        // Only the loaded scene reconfigures the live streamer (commitStudioEdit
        // skips applyLive for any other scene). No collab patch, as before: rig
        // control stays with whoever is at the console.
        this.commitStudioEdit(
          sc,
          (t) => {
            t.dmxBridge = config;
          },
          () => this.dmxStreamer.setConfig(config),
        );
      },
      (patches) => {
        this.commitStudioEdit(sc, (t) => {
          t.dmxPatches = patches;
        });
      },
      (cue) => {
        this.debug.log(`Triggered DMX Cue: ${cue.name}`);
      },
      // The studio's rig buttons and network edits act on this streamer at
      // once, so it gets the live one only for the loaded scene. For another
      // scene it previews on a private streamer that never transmits.
      sc.id === this.sceneData.id ? this.dmxStreamer : undefined,
      host,
    );
  }

  private openIcvfxStudioDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('ICVFX Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openIcvfxStudioModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.icvfx = config;
          },
          () => this.icvfxRenderer.setConfig(config),
          { type: 'icvfx_update', config },
        );
      },
      () => {
        this.debug.log('Exported nDisplay configuration');
      },
      () => {
        this.debug.log('Exported OpenUSD LED volume stage');
      },
      host,
    );
  }

  private openAcousticsStudioDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('Acoustics Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openAcousticsStudioModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.acoustics = config;
          },
          () => this.acousticsRenderer.setConfig(config),
          { type: 'acoustics_update', config },
        );
      },
      () => {
        this.debug.log('Exported BWF sound report');
      },
      () => {
        this.debug.log('Exported AES31-3 / iXML manifest');
      },
      host,
    );
  }

  private openSolarStudioDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('Solar Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openSolarStudioModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.solar = config;
          },
          () => this.solarRenderer.setConfig(config),
          { type: 'solar_update', config },
        );
      },
      () => {
        this.debug.log('Exported solar tracking CSV');
      },
      () => {
        this.debug.log('Exported standalone DP Sun-Report HTML');
      },
      host,
    );
  }

  private openScreenplayStudioDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('Screenplay Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openScreenplayBreakdownModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.screenplay = config;
          },
          () => this.screenplayRenderer.setConfig(config),
          { type: 'screenplay_update', config },
        );
      },
      (coverage) => {
        const patch: CollabScenePatch = {
          type: 'screenplay_apply_coverage',
          coverage,
        };
        // Coverage cameras go into the scene the studio was opened for; this
        // used to add them to the live scene whichever scene that was.
        this.commitStudioEdit(
          sc,
          (t) => {
            applyScenePatch(t, patch);
          },
          () => {
            // As applyRemotePatch: a carried camera root sits on the controller
            // ray, out of reach of the rebuild, so end the carry first.
            if (this.draggedCamera) this.cancelActiveManipulation();
            this.cams.setScene(this.sceneData);
            this.screenplayRenderer.setConfig(this.sceneData.screenplay ?? null);
            this.contentVersion++;
          },
          patch,
        );
        this.debug.log(`Applied ${coverage.length} AI coverage cameras to scene`);
      },
      () => {
        this.debug.log('Exported Screenplay Shot List CSV');
      },
      () => {
        this.debug.log('Exported Director Pitch Deck HTML');
      },
      host,
    );
  }

  private openWebXRProfilerDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('WebXR Profiler');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openWebXRProfilerModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.profiler = config;
          },
          () => this.profilerRuntime.updateConfig(config),
          { type: 'profiler_update', config },
        );
      },
      async (scenarioId) => {
        const report = await this.profilerRuntime.startBenchmark(scenarioId);
        // Hand back the frames this report was computed from, so the modal's export
        // buttons cannot pair it with a stale or synthetic sample trace.
        return { report, samples: this.profilerRuntime.getReportSamples() };
      },
      () => {
        this.debug.log('Exported WebXR profiler telemetry CSV');
      },
      () => {
        this.debug.log('Exported WebXR standalone performance audit deck HTML');
      },
      host,
    );
  }

  private openVRComfortDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('VR Comfort Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openVRComfortModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.comfort = config;
          },
          () => this.comfortRenderer.setConfig(config),
          { type: 'comfort_update', config },
        );
      },
      undefined,
      () => {
        this.debug.log('Exported VR comfort telemetry CSV');
      },
      () => {
        this.debug.log('Exported VR standalone comfort audit deck HTML');
      },
      host,
    );
  }

  private openSetDressingDialog(sceneToUse?: SceneData): void {
    const host = this.studioHost('Set Dressing Studio');
    if (!host) return;
    const sc = sceneToUse ?? this.sceneData;
    openSetDressingStudioModal(
      sc,
      (config) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            t.setDressing = config;
          },
          () => this.setDressingRenderer.setConfig(config),
          // Normalized copy: the Gemini key is a device setting and must never
          // travel in a patch, whatever the modal hands over.
          { type: 'set_dressing_update', config: normalizeSetDressingConfig(config) },
        );
      },
      (_theme, _density, _enablePhysics) => {
        const scattered = sc.setDressing;
        if (!scattered) return;
        this.commitStudioEdit(
          sc,
          (t) => {
            // The modal scattered into sc.setDressing already; mirror it when the
            // live scene is a different object (an undo replaced it meanwhile).
            if (t === sc) return;
            if (!t.setDressing) t.setDressing = createSetDressingConfig();
            t.setDressing.activeTheme = scattered.activeTheme;
            t.setDressing.settledItems = scattered.settledItems;
          },
          () => this.setDressingRenderer.setConfig(this.sceneData.setDressing ?? scattered),
          { type: 'set_dressing_scatter', theme: scattered.activeTheme, items: scattered.settledItems },
        );
      },
      (mutations) => {
        this.commitStudioEdit(
          sc,
          (t) => {
            // The modal applied the mutations to sc; repeat them only on a
            // different live object (see the scatter callback above).
            if (t !== sc) applyAiMutationsToScene(t, mutations);
          },
          () => {
            // AI edits add and remove props, not just the dressing config: the
            // same refresh a remote set_dressing_ patch gets, so AI-added props
            // appear without a reload. A prop still carried (grip held while
            // clicking Apply in dom-overlay) is put back first, as there, so
            // its release cannot re-attach a disposed root as a ghost.
            this.setDressingRenderer.setConfig(this.sceneData.setDressing ?? createSetDressingConfig());
            if (this.draggedProp) this.cancelActiveManipulation();
            this.dropPropSelectionForRebuild();
            this.props.setScene(this.sceneData);
            this.contentVersion++;
          },
          { type: 'set_dressing_ai_mutate', mutations },
        );
      },
      host,
    );
  }

  private handleContextQuickAction(action: ContextQuickAction, entityId: string, _entityType: string): void {
    const actionKey = action.actionType || action.id;
    switch (actionKey) {
      case 'set_dressing_open_studio': {
        this.openSetDressingDialog();
        break;
      }
      case 'set_dressing_quick_scatter': {
        const conf = this.sceneData.setDressing ?? createSetDressingConfig();
        const regions = conf.regions.length ? conf.regions : detectSemanticRegions(this.sceneData);
        const newItems: SettledPropItem[] = [];
        for (const r of regions) {
          newItems.push(...generateThemeScatter(conf.activeTheme, r, conf.scatterConfig));
        }
        conf.settledItems = newItems;
        this.sceneData.setDressing = conf;
        this.setDressingRenderer.setConfig(conf);
        this.debug.log(`Quick Scatter: placed ${newItems.length} props (${conf.activeTheme})`);
        this.collabSession.broadcastPatch({
          type: 'set_dressing_scatter',
          theme: conf.activeTheme,
          items: newItems,
        });
        this.markDirty();
        break;
      }

      case 'set_dressing_ai_prompt': {
        this.openSetDressingDialog();
        break;
      }
      case 'comfort_open_studio': {
        this.openVRComfortDialog();
        break;
      }

      case 'comfort_toggle_reach_zones': {
        const conf = this.sceneData.comfort ?? createVRComfortConfig();
        conf.enabled = !conf.enabled;
        this.comfortRenderer.setConfig(conf);
        this.debug.log(`Comfort Reach Zones ${conf.enabled ? 'ON' : 'OFF'}`);
        this.markDirty();
        break;
      }
      case 'comfort_toggle_vignette': {
        const conf = this.sceneData.comfort ?? createVRComfortConfig();
        conf.vignette.enabled = !conf.vignette.enabled;
        this.comfortRenderer.setConfig(conf);
        this.debug.log(`Comfort Vignette ${conf.vignette.enabled ? 'ON' : 'OFF'}`);
        this.markDirty();
        break;
      }
      case 'script_open_breakdown': {
        this.openScreenplayStudioDialog();
        break;
      }
      case 'script_apply_coverage': {
        this.openScreenplayStudioDialog();
        break;
      }
      case 'cam_audit_180_line': {
        this.openScreenplayStudioDialog();
        break;
      }
      case 'profiler_open_studio': {
        this.openWebXRProfilerDialog();
        break;
      }
      case 'profiler_toggle_hud': {
        const conf = this.sceneData.profiler ?? createVRProfilerConfig();
        conf.showDiagnosticHud = !conf.showDiagnosticHud;
        this.profilerRuntime.updateConfig(conf);
        this.debug.log(`Profiler HUD ${conf.showDiagnosticHud ? 'ON' : 'OFF'}`);
        this.markDirty();
        break;
      }
      case 'profiler_run_benchmark': {
        this.openWebXRProfilerDialog();
        break;
      }
      case 'actor_set_dialogue_pair': {
        if (!this.sceneData.screenplay) {
          this.sceneData.screenplay = createScreenplayConfig();
        }
        if (!this.sceneData.screenplay.dialoguePartnerAId || this.sceneData.screenplay.dialoguePartnerAId === entityId) {
          this.sceneData.screenplay.dialoguePartnerAId = entityId;
          const other = this.sceneData.actors.find((a) => a.id !== entityId);
          if (other) this.sceneData.screenplay.dialoguePartnerBId = other.id;
        } else {
          this.sceneData.screenplay.dialoguePartnerBId = entityId;
        }
        this.screenplayRenderer.setConfig(this.sceneData.screenplay);
        this.debug.log(`Set dialogue pair actor: ${entityId}`);
        this.markDirty();
        break;
      }
      case 'light_open_dmx': {
        this.openDmxBridgeDialog();
        break;
      }
      case 'cam_icvfx_moire': {
        this.openIcvfxStudioDialog();
        break;
      }
      case 'cam_boom_incursion':
      case 'boom_open_acoustics': {
        this.openAcousticsStudioDialog();
        break;
      }
      case 'sun_open_solar_studio': {
        this.openSolarStudioDialog();
        break;
      }
      case 'sun_snap_golden_hour': {
        const conf = this.sceneData.solar ?? createSolarEnvironmentConfig('golden_hour_sunset');
        conf.timeOfDayHours = 18.0;
        this.solarRenderer.setConfig(conf);
        this.debug.log('Sun snapped to Golden Hour (18:00)');
        this.markDirty();
        break;
      }
      case 'sun_snap_high_noon': {
        const conf = this.sceneData.solar ?? createSolarEnvironmentConfig('high_noon_clear');
        conf.timeOfDayHours = 12.0;
        this.solarRenderer.setConfig(conf);
        this.debug.log('Sun snapped to High Noon (12:00)');
        this.markDirty();
        break;
      }
      case 'sun_toggle_shadows': {
        const conf = this.sceneData.solar ?? createSolarEnvironmentConfig('golden_hour_sunset');
        conf.castShadows = !conf.castShadows;
        this.solarRenderer.setConfig(conf);
        this.debug.log(`Solar cascaded shadows ${conf.castShadows ? 'ON' : 'OFF'}`);
        this.markDirty();
        break;
      }
      case 'actor_boom_target': {
        const actor = this.actors.all().find((a) => a.data.id === entityId);
        if (actor && this.sceneData.acoustics?.boomMics?.length) {
          this.sceneData.acoustics.boomMics[0].targetActorId = actor.data.id;
          this.acousticsRenderer.setConfig(this.sceneData.acoustics);
          this.debug.log(`Aimed Boom 1 cue at actor: ${actor.data.name}`);
          this.markDirty();
        }
        break;
      }
      case 'actor_cycle_stance': {
        const actor = this.actors.all().find((a) => a.data.id === entityId);
        if (actor) {
          const next = cycleStance(actor.data.stance as StanceId);
          this.actors.setStance(actor, next);
          this.debug.log(`Actor stance: ${next}`);
          this.markDirty();
        }
        break;
      }
      case 'actor_add_mark': {
        const actor = this.actors.all().find((a) => a.data.id === entityId);
        if (actor) {
          actor.data.keyframes.push({
            position: { ...actor.data.position },
            rotationY: actor.data.rotationY,
            stance: actor.data.stance,
          });
          this.debug.log(`Mark placed for ${actor.data.name}`);
          this.markDirty();
        }
        break;
      }
      case 'actor_duplicate': {
        const actor = this.actors.all().find((a) => a.data.id === entityId);
        if (actor) {
          const copy = this.actors.spawn(
            { x: actor.data.position.x + 0.5, y: actor.data.position.y, z: actor.data.position.z + 0.5 },
            actor.data.rotationY,
          );
          this.selectActor(copy.data.id);
          this.markDirty();
        }
        break;
      }
      case 'camera_step_focal': {
        this.cams.stepActiveFocal(1);
        this.refreshWristState();
        break;
      }
      case 'camera_duplicate': {
        this.duplicateCamera(entityId);
        break;
      }
      case 'record_take': {
        void this.toggleRecording();
        break;
      }
      case 'prop_ground_floor': {
        const prop = this.props.get(entityId);
        if (prop) {
          prop.data.position.y = 0;
          prop.root.position.y = 0;
          this.collabSession.broadcastPatch({ type: 'prop_move', propId: entityId, position: prop.data.position });
          this.debug.log(`Grounded prop ${prop.data.name} to floor`);
          this.markDirty();
        }
        break;
      }
      case 'prop_grid_snap': {
        const prop = this.props.get(entityId);
        if (prop) {
          prop.data.position = snapPropToGrid(prop.data).position;
          const p = prop.data.position;
          prop.root.position.set(p.x, p.y, p.z);
          this.collabSession.broadcastPatch({ type: 'prop_move', propId: entityId, position: p });
          this.debug.log(`Snapped ${prop.data.name} to the 10 cm grid`);
          this.markDirty();
        }
        break;
      }
      case 'prop_duplicate': {
        const prop = this.props.get(entityId);
        if (prop) {
          void this.props.duplicateProp(prop.data.id).then((spawned) => {
            if (spawned) {
              // Same commit as the wrist/wheel Dup: hover targets, peers, undo.
              this.contentVersion++;
              this.selectProp(spawned.data.id);
              this.collabSession.broadcastPatch({ type: 'prop_add', prop: spawned.data });
              this.debug.log(`duplicated → ${spawned.data.name}`);
              this.markDirty();
            }
          });
        }
        break;
      }
      case 'prop_delete': {
        // Same commit as the wrist/wheel Delete (deleteTarget): end any carry
        // first, then hover targets, peers and undo.
        this.cancelActiveManipulation();
        if (this.props.removeProp(entityId)) {
          this.collabSession.broadcastPatch({ type: 'prop_remove', propId: entityId });
          this.contentVersion++;
          this.hover = null;
          this.debug.log('deleted prop');
          this.markDirty();
        }
        this.contextualRadial.hide();
        if (this.selectedPropId === entityId) this.selectedPropId = null;
        break;
      }
      default:
        // Not "executed": nothing ran. The domain tests keep every action the
        // headset radial can show wired, so this is only reachable from a
        // stale or foreign action list.
        this.debug.log(`${action.label}: no handler for "${actionKey}"`);
        break;
    }
  }

  private updateHover(rc: THREE.Raycaster | null): void {
    let next: Hover = null;
    if (rc && !this.draggedActor && !this.draggedCamera && !this.draggedProp && !this.draggedFurniture && !this.miniGrabbing) {
      // Keyed on the mode as well as the content: startAR resets the mode to
      // Block directly, so a session that ended in Dress would otherwise keep
      // the Dress list (furniture grabbable, actors and cameras not).
      if (this.hoverTargetsVersion !== this.contentVersion || this.hoverTargetsMode !== this.interactionMode) {
        // The mode decides what the ray can touch: blocking never hovers the
        // couch behind an actor; dressing never disturbs the blocking. Props
        // are set dressing too, so Dress can grab them; the hits below are
        // distance-sorted, so the nearer of a prop and a scanned piece wins.
        this.hoverTargets =
          this.interactionMode === 'block'
            ? [...this.actors.raycastTargets(), ...this.cams.raycastTargets(), ...this.props.raycastTargets()]
            : [...this.location.furnitureTargets(), ...this.props.raycastTargets()];
        this.hoverTargetsVersion = this.contentVersion;
        this.hoverTargetsMode = this.interactionMode;
      }
      const hits = rc.intersectObjects(this.hoverTargets, true);
      for (const hit of hits) {
        const actorId = findActorId(hit.object);
        if (actorId) {
          next = { kind: 'actor', id: actorId };
          break;
        }
        if (typeof hit.object.userData.scanMeshIndex === 'number') {
          next = { kind: 'furniture', id: String(hit.object.userData.scanMeshIndex) };
          break;
        }
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (typeof o.userData.propId === 'string') {
            next = { kind: 'prop', id: o.userData.propId };
            break;
          }
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
      this.props.setHovered(next?.kind === 'prop' ? next.id : null);
    }
  }

  private applyRemotePatch(patch: CollabScenePatch): void {
    const success = applyScenePatch(this.sceneData, patch);
    if (!success) return;

    // A branch below that rebuilds a manager disposes and replaces every object
    // in it. If the local user is carrying one of those objects, end the carry
    // first (as loadScene / restoreScene do): a carried camera or prop root sits
    // under the controller ray, out of reach of the rebuild, and releasing the
    // stale object afterwards would leave an undeletable ghost in the set.
    if (patch.type.startsWith('actor_')) {
      if (this.draggedActor) this.cancelActiveManipulation();
      this.actors.setScene(this.sceneData);
      this.keyframes.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('prop_')) {
      if (this.draggedProp) this.cancelActiveManipulation();
      this.props.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('camera_')) {
      if (this.draggedCamera) this.cancelActiveManipulation();
      this.cams.setScene(this.sceneData);
      this.keyframes.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('screenplay_')) {
      this.screenplayRenderer.setConfig(this.sceneData.screenplay ?? null);
      if (patch.type === 'screenplay_apply_coverage') {
        if (this.draggedCamera) this.cancelActiveManipulation();
        this.cams.setScene(this.sceneData);
        this.contentVersion++;
      }
    } else if (patch.type.startsWith('comfort_')) {
      this.comfortRenderer.setConfig(this.sceneData.comfort ?? null);
    } else if (patch.type === 'timeline_transport') {
      if (patch.isPlaying !== undefined) {
        if (patch.isPlaying) this.keyframes.play();
        else this.keyframes.pause();
      }
      if (patch.currentTimeS !== undefined) {
        const ratio = this.keyframes.duration > 0 ? patch.currentTimeS / this.keyframes.duration : 0;
        this.keyframes.scrubTo(ratio);
      }
    } else if (patch.type.startsWith('solar_')) {
      this.solarRenderer.setConfig(this.sceneData.solar || createSolarEnvironmentConfig('golden_hour_sunset'));
    } else if (patch.type.startsWith('icvfx_')) {
      this.icvfxRenderer.setConfig(this.sceneData.icvfx || createLedVolumeConfig('horseshoe_270', { enabled: false }));
    } else if (patch.type.startsWith('acoustics_')) {
      this.acousticsRenderer.setConfig(this.sceneData.acoustics || createAcousticsConfig());
    } else if (patch.type.startsWith('set_dressing_')) {
      this.setDressingRenderer.setConfig(this.sceneData.setDressing || createSetDressingConfig());
      // Dressing mutates the prop list itself, not just the config.
      if (this.draggedProp) this.cancelActiveManipulation();
      this.props.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('profiler_')) {
      this.profilerRuntime.updateConfig(this.sceneData.profiler ?? createVRProfilerConfig());
    } else if (
      patch.type.startsWith('light_') ||
      patch.type.startsWith('atmosphere_') ||
      patch.type.startsWith('dmx_') ||
      patch.type.startsWith('splat_cloud_') ||
      patch.type.startsWith('architecture_') ||
      patch.type.startsWith('audio_cue_')
    ) {
      // Types the union defines and a peer may send, but which have no cheap targeted
      // refresh here. Rebuilding everything is heavier than necessary and correct,
      // which is the right way round: a patch that silently fails to reach its
      // renderer leaves the receiving peer looking at stale geometry while their
      // scene data has already moved on. The rebuild also re-applies furniture
      // placements, so a carried scanned piece ends its carry too.
      if (this.draggedActor || this.draggedCamera || this.draggedProp || this.draggedFurniture) {
        this.cancelActiveManipulation();
      }
      this.applySceneToSubsystems(this.sceneData);
    }

    // Persist, but deliberately do NOT record history: a remote peer's edit does not
    // belong in this user's undo stack. Without this the debounced autosave never
    // fired for anything received over the wire, so remote work survived only if the
    // beforeunload handler got to run. A crash, a forced quit or a flat headset lost
    // every remote change made since the local user last touched something.
    this.persistence.markDirty(this.sceneData);
  }

  private async openPropsLibrary(): Promise<void> {
    const host = this.studioHost('Prop Library');
    if (!host) return;
    const customAssets = await globalPropStore.listAssetMeta();
    openPropsLibraryModal(
      async (assetId, customKey) => {
        const spawnPos = this.propSpawnPoint();
        // An upload is an IndexedDB model: without sourceType 'indexeddb' the
        // renderer drew it as a placeholder box. Name and file it as the upload.
        const upload = customKey ? customAssets.find((a) => a.id === customKey) : undefined;
        const obj = await this.props.addProp(assetId, spawnPos, {
          customModelKey: customKey,
          ...(customKey ? { sourceType: 'indexeddb' as const, category: upload?.category ?? 'custom' } : {}),
          ...(upload ? { name: upload.name } : {}),
          rotationY: this.faceViewerYaw(spawnPos),
        });
        if (!obj) return;
        this.collabSession.broadcastPatch({
          type: 'prop_add',
          prop: obj.data,
        });
        this.markDirty();
        this.contentVersion++;
        // Keep main's selection in step with the manager's highlight (Delete /
        // Dup act on it); the radial menu only means something in a session.
        if (this.session.session) this.selectProp(obj.data.id);
        else this.selectedPropId = obj.data.id;
        this.debug.log(`placed prop: ${obj.data.name}`);
      },
      customAssets,
      async (file) => {
        await globalPropStore.saveAssetFromFile(file);
      },
      async (id) => {
        await globalPropStore.deleteAsset(id);
      },
      host,
    );
  }

  private openCollabDialog(): void {
    openCollabModal(
      this.collabSession,
      this.collabRoster,
      this.collabLockManager,
      (roomCode, name, role) => {
        this.collabSession.joinRoom(roomCode, name, role);
        this.debug.log(`collab: joining room ${roomCode} as ${name} (${role})`);
      },
      () => {
        this.collabSession.leaveRoom();
        this.collabAvatars.clear();
        this.collabRoster.clear();
        this.debug.log('collab: disconnected from room');
      },
    );
  }

  private openLiveLinkDialog(): void {
    const host = this.studioHost('LiveLink');
    if (!host) return;
    openLiveLinkModal(
      this.liveLinkStreamer,
      this.sceneData,
      (cfg) => {
        this.sceneData.livelink = cfg;
        this.persistence.saveNow(this.sceneData);
      },
      host,
    );
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
