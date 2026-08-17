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
import { summarizeScan } from './scan.ts';
import { captureScanFromFrame } from './scanner.ts';
import { LocationRenderer } from './location.ts';
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
import { floorCorrection, newFloorEstimate, observeFloorHit } from './floor.ts';
import { Persistence } from './persistence.ts';
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
// Reused each frame for locomotion basis vectors (no per-frame allocation).
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tip = new THREE.Vector3();

/** Smooth-glide speed (m/s) for thumbstick locomotion through the set. */
const LOCOMOTION_SPEED = 1.8;
/** Radial stick deadzone for glide (shared by the hot-path gate and the math). */
const LOCOMOTION_DEADZONE = 0.15;
/** Snap-turn increment (radians) per thumbstick push. */
const SNAP_TURN_RAD = Math.PI / 6; // 30°

/** Give the platform this long to surface tracked meshes before giving up. */
const SCAN_TIMEOUT_MS = 30_000;
/** If nothing is tracked after this long, ask the OS to run room capture. */
const SCAN_ROOM_CAPTURE_AFTER_MS = 2_000;

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
  /** Wheel "More" pins the detailed wrist panel open under the wheel. */
  private panelPinned = false;
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
  /** Non-null while waiting for the platform's Scene Mesh to capture. */
  private pendingScan: { startedAt: number; roomCaptureRequested: boolean } | null = null;
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

    this.sceneData = this.persistence.loadCurrentOrCreate();
    // Sprite raycasting (name labels, note cards) requires raycaster.camera.
    this.raycaster.camera = this.camera;

    this.session = new SessionManager(this.renderer, (m) => this.debug.log(m));
    this.scene3.add(this.session.reticle);

    this.input = new InputManager(this.renderer, this.scene3);
    this.actors = new ActorManager(this.session, this.sceneData);
    this.contentRoot.add(this.actors.group);
    this.props = new PropsManager(this.session, this.sceneData);
    this.contentRoot.add(this.props.group);
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
      onExport: (id) => void this.persistence.exportScene(id),
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
      onExportNleTimeline: (id) =>
        openNleExportModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          document.getElementById('overlay')!,
        ),
      onExportUe5Bridge: (id) =>
        openUe5ExportModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          document.getElementById('overlay')!,
        ),
      onAiShotAnalysis: (id) =>
        openAiAnalysisModal(
          id === this.sceneData.id ? this.sceneData : (this.persistence.loadScene(id) ?? this.sceneData),
          document.getElementById('overlay')!,
        ),
      onRemoveScan: (id) => this.removeScan(id),
      onExportScanObj: (id) => void this.persistence.exportScanObj(id),
      onExportScanPly: (id) => void this.persistence.exportScanPly(id),
      onExportScanUsd: (id) => void this.persistence.exportScanUsd(id),
      onExportScanGeoJson: (id) => void this.persistence.exportScanGeoJson(id),
      onExportScanPackage: (id) => void this.persistence.exportScanPackage(id),
      onAddSyntheticScan: (id) => {
        void this.persistence.attachSyntheticScan(id).then((scan) => {
          if (scan && id === this.sceneData.id) {
            this.sceneData = this.persistence.loadScene(id) ?? this.sceneData;
            this.syncLocation();
          }
          this.refreshLanding();
        });
      },
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
        openGaussianSplatStudioModal(
          sc,
          (updated) => {
            if (sc.id === this.sceneData.id) {
              this.sceneData = updated;
              this.loadScene(this.sceneData);
              this.persistence.saveNow(this.sceneData);
              this.markDirty();
            } else {
              this.persistence.saveNow(updated);
            }
            this.refreshLanding();
          },
          document.getElementById('overlay')!,
          (cloud) => {
            if (sc.id === this.sceneData.id) {
              this.splatRenderer.setCloud(cloud);
            }
          },
        );
      },
      onOpenDailiesStudio: (sceneId) => {
        const sc =
          sceneId === this.sceneData.id
            ? this.sceneData
            : (this.persistence.loadScene(sceneId) ?? this.sceneData);
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
          document.getElementById('overlay') ?? document.body,
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

    this.persistence.onError = (m) => {
      this.debug.log(m);
      this.wrist.setStatus(m);
    };

    // Fires whichever way a take ends (wrist toggle, camera deleted, session
    // end, MAX_RECORD_S cap, encoder error) — the file is already downloading.
    this.recorder.onStopped = (saved) => {
      this.debug.log(saved ? `saved ${saved}` : 'recording discarded (nothing captured)');
      this.refreshWristState();
    };

    this.wireSubsystems();
    this.loadScene(this.sceneData);
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
        openAiAnalysisModal(this.sceneData);
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
      return;
    }
    if (summary.id === this.displayedScanId) {
      // Same geometry, possibly different furniture placements (undo/redo,
      // scene restore) — re-apply without reloading the blob.
      this.location.applyPlacements(summary.furniture);
      return;
    }
    void this.persistence.scans.getScan(summary.id).then((scan) => {
      if (token !== this.locationSyncToken) return; // superseded
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
    });
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

  /** Wrist "Scan Room": starts (or cancels) waiting for the platform mesh. */
  private toggleScan(): void {
    if (this.pendingScan) {
      this.pendingScan = null;
      this.debug.log('scan cancelled');
      this.refreshWristState();
      return;
    }
    if (!this.session.session) return;
    if (!this.session.features.meshDetection) {
      this.debug.log('mesh detection unavailable — needs a Quest 3/3S-class device with Space Setup done');
      return;
    }
    if (this.views.mode !== 'full' || this.views.isShifted) {
      this.debug.log('scan needs Full view at true alignment — press Re-align first');
      return;
    }
    this.pendingScan = { startedAt: performance.now(), roomCaptureRequested: false };
    this.debug.log('scanning — reading the room mesh…');
    this.refreshWristState();
  }

  /** Per-frame while a scan is pending: snapshot the Scene Mesh when tracked. */
  private updatePendingScan(frame: XRFrame, time: number): void {
    const pending = this.pendingScan;
    if (!pending) return;
    // Teleporting or leaving Full view mid-scan would bake that transform into
    // the captured geometry — cancel instead of misregistering the room.
    if (this.views.mode !== 'full' || this.views.isShifted) {
      this.pendingScan = null;
      this.debug.log('scan cancelled — view changed during capture (Re-align and rescan)');
      this.refreshWristState();
      return;
    }
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return;
    this.contentRoot.updateMatrixWorld();
    _worldToScene.copy(this.contentRoot.matrixWorld).invert();
    const scan = captureScanFromFrame(frame, refSpace, _worldToScene);
    if (scan) {
      this.pendingScan = null;
      const summary = summarizeScan(scan);
      void this.persistence.scans.putScan(scan); // fire-and-forget; onError warns
      this.sceneData.scan = summary; // old blob (if any) stays until next-launch prune
      this.displayedScanId = scan.id;
      this.locationSyncToken++; // kill any in-flight stale load
      this.location.setScan(scan);
      this.location.setMode('ghost'); // show alignment over passthrough for confirmation
      this.contentVersion++; // fresh furniture raycast targets
      this.markDirty();
      this.refreshLanding();
      this.refreshWristState();
      this.debug.log(
        `✓ scanned ${scan.meshes.length} mesh${scan.meshes.length === 1 ? '' : 'es'} · ` +
          `${(summary.triangles / 1000).toFixed(1)}k tris · ` +
          `${(summary.boundsMax.x - summary.boundsMin.x).toFixed(1)}×${(summary.boundsMax.z - summary.boundsMin.z).toFixed(1)} m`,
      );
      return;
    }
    const waited = time - pending.startedAt;
    if (!pending.roomCaptureRequested && waited > SCAN_ROOM_CAPTURE_AFTER_MS) {
      pending.roomCaptureRequested = true;
      this.debug.log('no room mesh yet — asking the system to run room capture…');
      void this.session.requestRoomCapture().then((ok) => {
        if (!ok && this.pendingScan) {
          this.debug.log('room capture unavailable — run Space Setup in Quest Settings, then rescan');
        }
      });
    }
    if (waited > SCAN_TIMEOUT_MS) {
      this.pendingScan = null;
      this.debug.log('scan timed out — finish Space Setup (Settings → Environment Setup) and retry');
      this.refreshWristState();
    }
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
    this.icvfxRenderer.setConfig(data.icvfx || createLedVolumeConfig());
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
    }
    this.selectedActorId = null;
    this.selectedPropId = null;
    this.hover = null;
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
    if (this.draggedProp) this.contentRoot.attach(this.draggedProp.root);
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
      this.location.group.attach(mesh);
      this.location.commitFurniture(mesh);
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

  /** Palm-wheel presses: menu navigation + actions (wheel.ts defines rings). */
  private onWheelPress(id: string): void {
    switch (id) {
      // Navigation.
      case 'sub-lens':
      case 'sub-marks':
      case 'sub-capture':
      case 'sub-edit':
      case 'sub-props':
        this.wheelPath = id.slice(4) as WheelPath;
        break;
      case 'wheel-back':
        this.wheelPath = 'root';
        break;
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
      case 'wheel-more':
        this.panelPinned = !this.panelPinned;
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
      // Everything else is a wrist-panel action verbatim.
      default:
        this.onWristPress(id);
        break;
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
      this.location.setMode('ghost');
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
          openActorStudioModal(actor, this.sceneData, (updated) => {
            Object.assign(actor, updated);
            this.actors.rebuildVisual(actor.id);
            this.persistence.saveNow(this.sceneData);
            this.markDirty();
          });
        } else {
          this.debug.log('No actor in scene: place an actor first');
        }
        break;
      }
      case 'grip-rig': {
        const cam = this.cams.active?.data ?? this.sceneData.cameras[0];
        if (cam) {
          openCameraGripModal(cam, this.sceneData, (updated) => {
            Object.assign(cam, updated);
            this.cams.refreshCamera(cam.id);
            this.persistence.saveNow(this.sceneData);
            this.markDirty();
          });
        } else {
          this.debug.log('No camera in scene: place a camera first');
        }
        break;
      }
      case 'splat-studio': {
        openGaussianSplatStudioModal(
          this.sceneData,
          (updated) => {
            this.sceneData = updated;
            this.loadScene(this.sceneData);
            this.persistence.saveNow(this.sceneData);
            this.markDirty();
          },
          document.getElementById('overlay')!,
          (cloud) => {
            this.splatRenderer.setCloud(cloud);
          },
        );
        break;
      }
      case 'dailies-studio': {
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
          document.getElementById('overlay') ?? document.body,
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
      case 'location': {
        if (!this.location.hasScan) {
          this.debug.log('no location scan in this scene yet — press Scan Room');
          break;
        }
        const mode = this.location.cycleMode();
        this.contentVersion++; // hidden scans aren't grabbable — targets change
        this.debug.log(`location: ${mode}`);
        this.refreshWristState();
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
      case 'aianalysis':
        openAiAnalysisModal(this.sceneData, document.getElementById('overlay')!);
        break;
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
      case 'prop-chair':
      case 'prop-applebox':
      case 'prop-cstand':
      case 'prop-slate':
      case 'prop-desk':
      case 'prop-lamp':
      case 'prop-greenscreen': {
        const propAssetId = id.slice(5);
        const viewerLocal = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
        const spawnPos = {
          x: viewerLocal.x,
          y: 0,
          z: viewerLocal.z - 1.2,
        };
        void this.props.addProp(propAssetId, spawnPos).then((obj) => {
          this.contentVersion++;
          this.collabSession.broadcastPatch({
            type: 'prop_add',
            prop: obj.data,
          });
          this.debug.log(`spawned ${obj.data.name}`);
          this.markDirty();
        });
        break;
      }
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
      this.lastTime = 0;
      // Every session opens planning the shot; Dress is an explicit switch.
      this.interactionMode = 'block';
      this.panelPinned = false;
      this.wheelInFront = false; // wheel starts on the hand, Y parks it in front
      this.placeMode = 'none'; // placing is armed per use, never carried over
      // Fresh reference space, fresh floor evidence.
      this.floorEst = newFloorEstimate();
      this.views.setFloorOffset(0);
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
      this.cams.setActive(this.hover.id);
      const camObj = this.cams.active;
      if (camObj) {
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: camObj.root.position.x,
          y: camObj.root.position.y,
          z: camObj.root.position.z,
        });
        this.contextualRadial.show('camera', camObj.data.id, camObj.root.position, {
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
      if (!this.session.lastHit) return;
      const local = this.contentRoot.worldToLocal(this.session.lastHit.point.clone());
      void this.props.addProp('chair', { x: local.x, y: local.y, z: local.z }).then((obj) => {
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
        this.props.setSelected(obj.data.id);
        this.selectedPropId = obj.data.id;
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
      this.contentRoot.attach(obj.root);
      const pos = obj.root.position;
      const rotY = obj.root.rotation.y;
      obj.data.position = { x: pos.x, y: pos.y, z: pos.z };
      obj.data.rotationY = rotY;
      this.collabSession.broadcastPatch({
        type: 'prop_move',
        propId: obj.data.id,
        position: obj.data.position,
        rotationY: rotY,
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
    this.selectedActorId = id;
    this.actors.setSelected(id);
    if (id) {
      const actor = this.actors.get(id);
      if (actor) {
        this.gizmo.attachActor(actor);
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: actor.root.position.x,
          y: actor.root.position.y,
          z: actor.root.position.z,
        });
        this.contextualRadial.show('actor', id, actor.root.position, {
          stance: actor.data.stance,
          name: actor.data.name,
        });
      } else {
        this.gizmo.detach();
        this.contextualRadial.hide();
      }
    } else {
      if (this.gizmo.getTarget()?.kind === 'actor') {
        this.gizmo.detach();
      }
      this.contextualRadial.hide();
    }
    this.refreshWristState();
  }

  private selectProp(id: string | null): void {
    this.selectedPropId = id;
    this.props.setSelected(id);
    if (id) {
      const prop = this.props.get(id);
      if (prop) {
        this.gizmo.attachProp(prop);
        globalSpatialFeedback.triggerHaptic('both', 'grab');
        globalSpatialFeedback.playSpatialSound('click', {
          x: prop.root.position.x,
          y: prop.root.position.y,
          z: prop.root.position.z,
        });
        this.contextualRadial.show('prop', id, prop.root.position, {
          name: prop.data.name,
          category: prop.data.category,
        });
      } else {
        this.gizmo.detach();
        this.contextualRadial.hide();
      }
    } else {
      if (this.gizmo.getTarget()?.kind === 'prop') {
        this.gizmo.detach();
      }
      this.contextualRadial.hide();
    }
    this.refreshWristState();
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
      const data = duplicateCameraSetup(this.sceneData, this.hover.id);
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
          : 'ARMED: pinch/trigger places a camera at your head',
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
    } else if (this.draggedFurniture) {
      // Yaw the carried piece about the world up-axis (same stick gesture as
      // rotating a dragged actor); world axis so the ray-space parent doesn't
      // skew the spin.
      if (Math.abs(axes.x) > 0.15) this.draggedFurniture.rotateOnWorldAxis(_up, -axes.x * dt * 3.0);
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
    if (
      this.views.mode === 'full' &&
      !this.draggedActor &&
      !this.draggedCamera &&
      !this.draggedFurniture &&
      !this.miniGrabbing
    ) {
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
    this.gizmo.update(this.camera);
    this.renderer.render(this.scene3, this.camera);
    // See the non-XR path above: endFrame stamps its own clock so the begin->end span
    // is real CPU time rather than a zero delta against the frame-start timestamp.
    this.performanceGovernor.endFrame(this.renderer, this.splatRenderer, this.volumetrics);
    this.profilerRuntime.endFrame(this.renderer, time);
  }

  private openPerformanceSettings(): void {
    openPerformanceSettingsModal(
      this.performanceGovernor,
      (cfg) => {
        this.debug.log(`Perf governor config updated: target ${cfg.targetFps} FPS`);
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openDmxBridgeDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openDmxBridgeStudioModal(
      sc,
      (config) => {
        sc.dmxBridge = config;
        this.dmxStreamer.setConfig(config);
        this.persistence.saveNow(this.sceneData);
        this.markDirty();
      },
      (patches) => {
        sc.dmxPatches = patches;
        this.persistence.saveNow(this.sceneData);
        this.markDirty();
      },
      (cue) => {
        this.debug.log(`Triggered DMX Cue: ${cue.name}`);
      },
      this.dmxStreamer,
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openIcvfxStudioDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openIcvfxStudioModal(
      sc,
      (config) => {
        sc.icvfx = config;
        if (sc.id === this.sceneData.id) {
          this.icvfxRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'icvfx_update',
          config,
        });
        this.markDirty();
      },
      () => {
        this.debug.log('Exported nDisplay configuration');
      },
      () => {
        this.debug.log('Exported OpenUSD LED volume stage');
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openAcousticsStudioDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openAcousticsStudioModal(
      sc,
      (config) => {
        sc.acoustics = config;
        if (sc.id === this.sceneData.id) {
          this.acousticsRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'acoustics_update',
          config,
        });
        this.markDirty();
      },
      () => {
        this.debug.log('Exported BWF sound report');
      },
      () => {
        this.debug.log('Exported AES31-3 / iXML manifest');
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openSolarStudioDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openSolarStudioModal(
      sc,
      (config) => {
        sc.solar = config;
        if (sc.id === this.sceneData.id) {
          this.solarRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'solar_update',
          config,
        });
        this.markDirty();
      },
      () => {
        this.debug.log('Exported solar tracking CSV');
      },
      () => {
        this.debug.log('Exported standalone DP Sun-Report HTML');
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openScreenplayStudioDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openScreenplayBreakdownModal(
      sc,
      (config) => {
        sc.screenplay = config;
        if (sc.id === this.sceneData.id) {
          this.screenplayRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'screenplay_update',
          config,
        });
        this.markDirty();
      },
      (coverage) => {
        const patch: CollabScenePatch = {
          type: 'screenplay_apply_coverage',
          coverage,
        };
        this.collabSession.broadcastPatch(patch);
        applyScenePatch(this.sceneData, patch);
        this.cams.setScene(this.sceneData);
        this.screenplayRenderer.setConfig(this.sceneData.screenplay ?? null);
        this.contentVersion++;
        this.persistence.saveNow(this.sceneData);
        this.debug.log(`Applied ${coverage.length} AI coverage cameras to scene`);
        this.markDirty();
      },
      () => {
        this.debug.log('Exported Screenplay Shot List CSV');
      },
      () => {
        this.debug.log('Exported Director Pitch Deck HTML');
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openWebXRProfilerDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openWebXRProfilerModal(
      sc,
      (config) => {
        sc.profiler = config;
        if (sc.id === this.sceneData.id) {
          this.profilerRuntime.updateConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'profiler_update',
          config,
        });
        this.markDirty();
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
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openVRComfortDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openVRComfortModal(
      sc,
      (config) => {
        sc.comfort = config;
        if (sc.id === this.sceneData.id) {
          this.comfortRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'comfort_update',
          config,
        });
        this.markDirty();
      },
      undefined,
      () => {
        this.debug.log('Exported VR comfort telemetry CSV');
      },
      () => {
        this.debug.log('Exported VR standalone comfort audit deck HTML');
      },
      document.getElementById('overlay') ?? document.body,
    );
  }

  private openSetDressingDialog(sceneToUse?: SceneData): void {
    const sc = sceneToUse ?? this.sceneData;
    openSetDressingStudioModal(
      sc,
      (config) => {
        sc.setDressing = config;
        if (sc.id === this.sceneData.id) {
          this.setDressingRenderer.setConfig(config);
        }
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'set_dressing_update',
          config,
        });
        this.markDirty();
      },
      (_theme, _density, _enablePhysics) => {
        if (sc.id === this.sceneData.id && sc.setDressing) {
          this.setDressingRenderer.setConfig(sc.setDressing);
        }
        this.persistence.saveNow(this.sceneData);
        if (sc.setDressing) {
          this.collabSession.broadcastPatch({
            type: 'set_dressing_scatter',
            theme: sc.setDressing.activeTheme,
            items: sc.setDressing.settledItems,
          });
        }
        this.markDirty();
      },
      (mutations) => {
        this.persistence.saveNow(this.sceneData);
        this.collabSession.broadcastPatch({
          type: 'set_dressing_ai_mutate',
          mutations,
        });
        this.markDirty();
      },
      document.getElementById('overlay') ?? document.body,
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
      case 'record_take': {
        void this.toggleRecording();
        break;
      }
      case 'prop_ground_floor': {
        const prop = this.props.all().find((p) => p.data.id === entityId);
        if (prop) {
          prop.data.position.y = 0;
          prop.root.position.y = 0;
          this.debug.log(`Grounded prop ${prop.data.name} to floor`);
          this.markDirty();
        }
        break;
      }
      case 'prop_duplicate': {
        const prop = this.props.all().find((p) => p.data.id === entityId);
        if (prop) {
          void this.props.duplicateProp(prop.data.id).then((spawned) => {
            if (spawned) {
              this.selectProp(spawned.data.id);
              this.markDirty();
            }
          });
        }
        break;
      }
      case 'prop_delete': {
        this.props.removeProp(entityId);
        this.contextualRadial.hide();
        this.selectedPropId = null;
        this.markDirty();
        break;
      }
      default:
        this.debug.log(`Quick action executed: ${action.label}`);
        break;
    }
  }

  private updateHover(rc: THREE.Raycaster | null): void {
    let next: Hover = null;
    if (rc && !this.draggedActor && !this.draggedCamera && !this.draggedProp && !this.draggedFurniture && !this.miniGrabbing) {
      if (this.hoverTargetsVersion !== this.contentVersion) {
        // The mode decides what the ray can touch: blocking never hovers the
        // couch behind an actor; dressing never disturbs the blocking.
        this.hoverTargets =
          this.interactionMode === 'block'
            ? [...this.actors.raycastTargets(), ...this.cams.raycastTargets(), ...this.props.raycastTargets()]
            : [...this.location.furnitureTargets()];
        this.hoverTargetsVersion = this.contentVersion;
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

    if (patch.type.startsWith('actor_')) {
      this.actors.setScene(this.sceneData);
      this.keyframes.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('prop_')) {
      this.props.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('camera_')) {
      this.cams.setScene(this.sceneData);
      this.keyframes.setScene(this.sceneData);
      this.contentVersion++;
    } else if (patch.type.startsWith('screenplay_')) {
      this.screenplayRenderer.setConfig(this.sceneData.screenplay ?? null);
      if (patch.type === 'screenplay_apply_coverage') {
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
      this.icvfxRenderer.setConfig(this.sceneData.icvfx || createLedVolumeConfig());
    } else if (patch.type.startsWith('acoustics_')) {
      this.acousticsRenderer.setConfig(this.sceneData.acoustics || createAcousticsConfig());
    } else if (patch.type.startsWith('set_dressing_')) {
      this.setDressingRenderer.setConfig(this.sceneData.setDressing || createSetDressingConfig());
      // Dressing mutates the prop list itself, not just the config.
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
      // scene data has already moved on.
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
    const customAssets = await globalPropStore.listAssets();
    openPropsLibraryModal(
      async (assetId, customKey) => {
        const viewerLocal = this.contentRoot.worldToLocal(this.lastViewerPos.clone());
        const spawnPos = {
          x: viewerLocal.x,
          y: 0,
          z: viewerLocal.z - 1.2,
        };
        const obj = await this.props.addProp(assetId, spawnPos, {
          customModelKey: customKey,
        });
        this.collabSession.broadcastPatch({
          type: 'prop_add',
          prop: obj.data,
        });
        this.markDirty();
        this.contentVersion++;
        this.debug.log(`placed prop: ${obj.data.name}`);
      },
      customAssets,
      async (file) => {
        await globalPropStore.saveAssetFromFile(file);
      },
      async (id) => {
        await globalPropStore.deleteAsset(id);
      },
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
    openLiveLinkModal(
      this.liveLinkStreamer,
      this.sceneData,
      (cfg) => {
        this.sceneData.livelink = cfg;
        this.persistence.saveNow(this.sceneData);
      },
      document.getElementById('overlay') ?? document.body,
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
