// Domain-core tests (model, lens math, timeline). Runs directly in Node:
//   npm test
// These cover the portable logic; rendering/XR behavior is verified on-headset
// via TESTING.md.

import assert from 'node:assert/strict';
import {
  addKeyframe,
  addNote,
  applyMarkOp,
  createActor,
  createCameraSetup,
  createScene,
  cycleTStop,
  DEFAULT_FORMAT_ID,
  DEFAULT_TSTOP,
  duplicateActor,
  duplicateCameraSetup,
  isSceneData,
  MAX_KEYFRAMES,
  nextFormatId,
  normalizeScene,
  SENSOR_FORMATS,
  sensorFormat,
  stepFocal,
  vecDistance,
  WALK_SPEED_MS,
  type SceneData,
} from '../src/model.ts';
import { History } from '../src/history.ts';
import {
  cocDiameterMm,
  depthOfField,
  depthOfFieldFor,
  dFovDeg,
  frameSizeAtDistance,
  hFovDeg,
  hFovRad,
  hyperfocalM,
  vFovDeg,
} from '../src/lens.ts';
import { cycleStance, isStanceId, poseFor, STANCES } from '../src/pose.ts';
import { buildTimeline, lerpAngle, moveStats, sampleTimeline } from '../src/timeline.ts';
import { ANCHOR_OFFSETS, guideItems, NEXT_VIEW } from '../src/guide.ts';
import {
  buildShotList,
  cameraHalfFovRad,
  cameraYaw,
  floorplanLayout,
  nearestActorDistance,
  planBounds,
} from '../src/plan.ts';
import {
  base64ToBytes,
  bytesToBase64,
  decodeScan,
  encodeScan,
  isLocationScan,
  isMovableScanMesh,
  meshFootprintCenter,
  quatYaw,
  summarizeScan,
  transformPositions,
  type LocationScan,
} from '../src/scan.ts';
import { ScanStore } from '../src/scanStore.ts';
import { locomotionAmount, rotateOffsetAboutPivot, snapTurnAngle } from '../src/locomotion.ts';
import {
  containScale,
  fileExtensionFor,
  MAX_RECORD_S,
  pickMimeType,
  RECORD_FPS,
  RECORD_MIME_CANDIDATES,
  RECORD_VIDEO_BPS,
  recordingClock,
} from '../src/recording.ts';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

const approx = (a: number, b: number, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

const S35 = 'super35';

// --- lens math: FOV -------------------------------------------------------------

test('hFOV: 35mm on S35 (24.89mm gate) ≈ 39.15°', () => {
  approx(hFovDeg(35, S35), 39.15, 0.03);
});

test('hFOV: 16mm wide ≈ 75.7°, 135mm tight ≈ 10.55°', () => {
  approx(hFovDeg(16, S35), 75.73, 0.1);
  approx(hFovDeg(135, S35), 10.55, 0.05);
});

test('hFOV scales with sensor format at 50mm (S16 < S35 < FF)', () => {
  approx(hFovDeg(50, S35), 27.96, 0.05);
  approx(hFovDeg(50, 'fullframe'), 39.63, 0.05);
  approx(hFovDeg(50, 'super16'), 14.27, 0.05);
  assert.ok(hFovDeg(50, 'super16') < hFovDeg(50, S35));
  assert.ok(hFovDeg(50, S35) < hFovDeg(50, 'fullframe'));
});

test('anamorphic 2× at 50mm frames like a 25mm spherical', () => {
  approx(hFovDeg(50, 'anamorphic35'), hFovDeg(25, S35), 1e-6);
  assert.ok(hFovDeg(50, 'anamorphic35') > 52 && hFovDeg(50, 'anamorphic35') < 54);
});

test('vFOV depends on aspect (constant-width gate)', () => {
  approx(vFovDeg(50, '2.39:1', S35), 11.89, 0.05);
  approx(vFovDeg(50, '16:9', S35), 15.94, 0.05);
  approx(vFovDeg(50, '4:3', S35), 21.12, 0.05);
  assert.ok(vFovDeg(50, '2.39:1', S35) < vFovDeg(50, '16:9', S35));
  assert.ok(vFovDeg(50, '16:9', S35) < vFovDeg(50, '4:3', S35));
});

test('diagonal FOV: 35mm / 2.39 on S35 ≈ 42.16°', () => {
  approx(dFovDeg(35, '2.39:1', S35), 42.16, 0.1);
  // diagonal is always the widest angle of the three
  assert.ok(dFovDeg(35, '2.39:1', S35) > hFovDeg(35, S35));
});

test('frame size at distance: width constant across aspects', () => {
  const a = frameSizeAtDistance(35, '2.39:1', 1.4, S35);
  const b = frameSizeAtDistance(35, '16:9', 1.4, S35);
  approx(a.width, b.width);
  approx(a.width / a.height, 2.39);
  approx(b.width / b.height, 16 / 9);
  approx(a.width, 0.9956, 0.001); // 2·1.4·tan(hFov/2)
});

test('field width readout: 35mm at 4.2m frames ~2.99m wide', () => {
  approx(frameSizeAtDistance(35, '2.39:1', 4.2, S35).width, 2.987, 0.01);
});

// --- lens math: depth of field --------------------------------------------------

test('DOF: 35mm T2 @ 3m on S35 → 2.68m..3.41m', () => {
  const d = depthOfField(35, 2, 3, sensorFormat(S35).cocMm);
  approx(d.nearM, 2.676, 0.005);
  approx(d.farM, 3.413, 0.005);
  approx(d.hyperfocalM, 24.535, 0.01);
});

test('DOF: 50mm T2.8 @ 4m on S35 → 3.60m..4.50m', () => {
  const d = depthOfFieldFor({ lensFocalLength: 50, tStop: 2.8, formatId: S35 }, 4);
  approx(d.nearM, 3.602, 0.005);
  approx(d.farM, 4.497, 0.005);
});

test('DOF: 24mm T4 @ 6m is past hyperfocal → far = Infinity', () => {
  const d = depthOfField(24, 4, 6, sensorFormat(S35).cocMm);
  approx(d.hyperfocalM, 5.784, 0.01);
  assert.equal(d.farM, Infinity);
  assert.equal(d.dofM, Infinity);
  assert.ok(d.nearM < d.hyperfocalM);
});

test('hyperfocalM matches the closed form', () => {
  approx(hyperfocalM(35, 2, 0.025), 24.535, 0.01);
  // wider format (bigger CoC) ⇒ nearer hyperfocal at the same lens/stop
  assert.ok(hyperfocalM(35, 2, 0.029) < hyperfocalM(35, 2, 0.025));
});

// --- model ----------------------------------------------------------------------

test('stepFocal: clamps at ends and snaps non-presets to a neighbour', () => {
  assert.equal(stepFocal(16, -1), 16);
  assert.equal(stepFocal(135, 1), 135);
  assert.equal(stepFocal(35, 1), 50);
  assert.equal(stepFocal(35, -1), 24);
  assert.equal(stepFocal(27, 1), 35); // 27mm steps up to 35
  assert.equal(stepFocal(27, -1), 24); // and down to 24
});

test('scene/actor/camera factories: names, colors, ids, defaults', () => {
  const s = createScene('Test');
  const a1 = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  const a2 = createActor(s, { x: 1, y: 0, z: 0 }, 0);
  assert.equal(a1.name, 'Actor 1');
  assert.equal(a2.name, 'Actor 2');
  assert.notEqual(a1.color, a2.color);
  assert.notEqual(a1.id, a2.id);
  const c1 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const c2 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '16:9');
  assert.equal(c1.name, 'CAM A');
  assert.equal(c2.name, 'CAM B');
  assert.equal(c1.tStop, DEFAULT_TSTOP);
  assert.equal(c1.formatId, DEFAULT_FORMAT_ID);
  assert.ok(isSceneData(JSON.parse(JSON.stringify(s))));
  assert.ok(!isSceneData({ version: 2 }));
});

test('camera names stay unique after deleting a middle camera', () => {
  const s = createScene('T');
  const mk = () => createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const a = mk();
  const b = mk();
  const c = mk();
  assert.deepEqual([a.name, b.name, c.name], ['CAM A', 'CAM B', 'CAM C']);
  // delete CAM B (mirrors CameraSystem.remove) then add — must NOT reuse a name
  s.cameras = s.cameras.filter((x) => x.id !== b.id);
  const d = mk();
  assert.equal(d.name, 'CAM B');
  const names = s.cameras.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, `duplicate camera name: ${names}`);
});

test('cycleTStop: whole-stop wheel wraps; free values snap to nearest then step', () => {
  assert.equal(cycleTStop(2.8), 4);
  assert.equal(cycleTStop(8), 1.4); // wraps
  assert.equal(cycleTStop(2.2), 2.8); // T2.2 snaps to 2, steps to 2.8
  // Six presses from any preset returns home.
  let t = 5.6;
  for (let i = 0; i < 6; i++) t = cycleTStop(t);
  assert.equal(t, 5.6);
});

test('nextFormatId: cycles the sensor table in order and wraps; unknown → first', () => {
  const ids = SENSOR_FORMATS.map((f) => f.id);
  let cur = ids[0];
  const seen = [cur];
  for (let i = 1; i < ids.length; i++) {
    cur = nextFormatId(cur);
    seen.push(cur);
  }
  assert.deepEqual(seen, ids); // visits every format once, in table order
  assert.equal(nextFormatId(cur), ids[0]); // wraps
  assert.equal(nextFormatId('betamax'), ids[0]); // unknown falls back safely
});

test(`keyframes cap at ${MAX_KEYFRAMES}`, () => {
  const s = createScene('T');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  for (let i = 0; i < MAX_KEYFRAMES; i++) {
    assert.equal(addKeyframe(a, { x: i, y: 0, z: 0 }, 0), true);
  }
  assert.equal(addKeyframe(a, { x: 9, y: 0, z: 0 }, 0), false);
  assert.equal(a.keyframes.length, MAX_KEYFRAMES);
});

// --- import validation ----------------------------------------------------------

function validScene(): SceneData {
  const s = createScene('Valid');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0.2);
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  createCameraSetup(s, { x: 0, y: 1.6, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '2.39:1');
  return JSON.parse(JSON.stringify(s));
}

test('isSceneData accepts a well-formed scene', () => {
  assert.ok(isSceneData(validScene()));
});

test('isSceneData rejects malformed actors/cameras (crash guard)', () => {
  const base = validScene();
  assert.ok(!isSceneData({ ...base, actors: [{}] }), 'empty actor');
  assert.ok(
    !isSceneData({ ...base, actors: [{ ...base.actors[0], position: { x: 0, y: 0 } }] }),
    'actor missing position.z',
  );
  assert.ok(
    !isSceneData({ ...base, cameras: [{ ...base.cameras[0], rotation: undefined }] }),
    'camera missing rotation',
  );
  assert.ok(
    !isSceneData({ ...base, cameras: [{ ...base.cameras[0], aspect: '9:16' }] }),
    'camera bad aspect',
  );
  assert.ok(
    !isSceneData({ ...base, actors: [{ ...base.actors[0], rotationY: NaN }] }),
    'actor NaN rotation',
  );
});

test('normalizeScene fills tStop/formatId defaults for legacy JSON', () => {
  const base = validScene();
  const cam = base.cameras[0] as unknown as Record<string, unknown>;
  delete cam.tStop;
  delete cam.formatId;
  const norm = normalizeScene(base);
  assert.equal(norm.cameras[0].tStop, DEFAULT_TSTOP);
  assert.equal(norm.cameras[0].formatId, DEFAULT_FORMAT_ID);
  // bad values get repaired too
  norm.cameras[0].tStop = -1;
  norm.cameras[0].formatId = 'bogus';
  normalizeScene(norm);
  assert.equal(norm.cameras[0].tStop, DEFAULT_TSTOP);
  assert.equal(norm.cameras[0].formatId, DEFAULT_FORMAT_ID);
});

// --- timeline -------------------------------------------------------------------

test('timeline durations derive from distance at 1.4 m/s', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0 },
    { position: { x: 1.4, y: 0, z: 2.8 }, rotationY: Math.PI / 2 },
  ];
  const tl = buildTimeline(kfs);
  approx(tl.times[0], 0);
  approx(tl.times[1], 2.0);
  approx(tl.times[2], 3.0);
  approx(tl.duration, 3.0);
});

test('moveStats: distance, duration, average speed', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0 },
    { position: { x: 1.4, y: 0, z: 2.8 }, rotationY: 0 },
  ];
  const m = moveStats(kfs);
  assert.equal(m.marks, 3);
  approx(m.distanceM, 4.2);
  approx(m.durationS, 3.0);
  approx(m.avgSpeed, 1.4);
  // slower speed ⇒ longer duration
  approx(moveStats(kfs, 0.7).durationS, 6.0);
  // a single mark has no move
  assert.equal(moveStats([kfs[0]]).distanceM, 0);
  assert.equal(moveStats([kfs[0]]).avgSpeed, 0);
});

test('vecDistance is symmetric Euclidean', () => {
  approx(vecDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }), 5);
  approx(vecDistance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), 0);
});

test('sample: lerped position, heading while moving, rest at ends', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0.3 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 1.0 },
  ];
  const tl = buildTimeline(kfs);
  const mid = sampleTimeline(kfs, tl, 1.0)!;
  approx(mid.position.z, 1.4);
  assert.equal(mid.moving, true);
  approx(mid.rotationY, Math.atan2(0, 2.8));
  approx(mid.speed, 1.4);
  const start = sampleTimeline(kfs, tl, -1)!;
  approx(start.position.z, 0);
  assert.equal(start.moving, false);
  const end = sampleTimeline(kfs, tl, 99)!;
  approx(end.position.z, 2.8);
  approx(end.rotationY, 1.0);
  assert.equal(end.moving, false);
});

test('sample: zero-length turn-in-place still takes a beat', () => {
  const kfs = [
    { position: { x: 1, y: 0, z: 1 }, rotationY: 0 },
    { position: { x: 1, y: 0, z: 1 }, rotationY: Math.PI / 2 },
  ];
  const tl = buildTimeline(kfs);
  assert.ok(tl.duration >= 0.4);
  const mid = sampleTimeline(kfs, tl, tl.duration / 2)!;
  assert.equal(mid.moving, false);
  approx(mid.rotationY, Math.PI / 4, 0.01);
});

test('single keyframe: actor holds the mark', () => {
  const kfs = [{ position: { x: 2, y: 0, z: -1 }, rotationY: 0.5 }];
  const tl = buildTimeline(kfs);
  approx(tl.duration, 0);
  const s = sampleTimeline(kfs, tl, 5)!;
  approx(s.position.x, 2);
  approx(s.rotationY, 0.5);
});

test('lerpAngle takes the shortest arc across ±π', () => {
  approx(lerpAngle(3.0, -3.0, 0.5), Math.PI, 0.01);
  approx(lerpAngle(0, Math.PI / 2, 0.5), Math.PI / 4);
});

// --- desktop blocking editor (applyMarkOp) ---------------------------------------

function markScene(): { s: SceneData; a: ReturnType<typeof createActor> } {
  const s = createScene('marks');
  const a = createActor(s, { x: 1, y: 0, z: 2 }, 0.5);
  return { s, a };
}

test('applyMarkOp add: first mark lands at the rest pose, stamped with the actor stance', () => {
  const { a } = markScene();
  a.stance = 'seated-chair';
  assert.equal(applyMarkOp(a, { kind: 'add' }), true);
  assert.deepEqual(a.keyframes[0].position, { x: 1, y: 0, z: 2 });
  assert.equal(a.keyframes[0].rotationY, 0.5);
  assert.equal(a.keyframes[0].stance, 'seated-chair');
});

test('applyMarkOp add: later marks step past the last; cap at MAX_KEYFRAMES', () => {
  const { a } = markScene();
  for (let i = 0; i < MAX_KEYFRAMES; i++) assert.equal(applyMarkOp(a, { kind: 'add' }), true);
  approx(a.keyframes[1].position.x, a.keyframes[0].position.x + 0.6);
  assert.equal(applyMarkOp(a, { kind: 'add' }), false); // full
  assert.equal(a.keyframes.length, MAX_KEYFRAMES);
});

test('applyMarkOp update: patches x/z/facing/stance; null stance clears to rest', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, position: { x: -3, z: 4 }, rotationY: 1.2, stance: 'lying-up' }), true);
  assert.deepEqual(a.keyframes[0].position, { x: -3, y: 0, z: 4 });
  approx(a.keyframes[0].rotationY, 1.2);
  assert.equal(a.keyframes[0].stance, 'lying-up');
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, stance: null }), true);
  assert.equal(a.keyframes[0].stance, undefined);
});

test('applyMarkOp update: invalid input rejected atomically (no half-applied op)', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  const before = JSON.stringify(a.keyframes[0]);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, position: { x: 9, z: NaN } }), false);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, rotationY: Infinity }), false);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 5, rotationY: 1 }), false); // OOB
  assert.equal(JSON.stringify(a.keyframes[0]), before); // untouched, incl. the valid x
});

test('applyMarkOp move/remove: swap neighbours, reject ends, splice out', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  applyMarkOp(a, { kind: 'add' });
  applyMarkOp(a, { kind: 'add' });
  const [k0, k1, k2] = [...a.keyframes];
  assert.equal(applyMarkOp(a, { kind: 'move', index: 0, dir: -1 }), false); // top end
  assert.equal(applyMarkOp(a, { kind: 'move', index: 2, dir: 1 }), false); // bottom end
  assert.equal(applyMarkOp(a, { kind: 'move', index: 1, dir: 1 }), true);
  assert.deepEqual(a.keyframes, [k0, k2, k1]);
  assert.equal(applyMarkOp(a, { kind: 'remove', index: 0 }), true);
  assert.deepEqual(a.keyframes, [k2, k1]);
  assert.equal(applyMarkOp(a, { kind: 'remove', index: 7 }), false);
});

// --- per-keyframe stance ---------------------------------------------------------

test('addKeyframe stamps a stance when given, leaves legacy marks bare', () => {
  const s = createScene('kf-stance');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'seated-chair');
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  assert.equal(a.keyframes[0].stance, 'seated-chair');
  assert.equal(a.keyframes[1].stance, undefined);
});

test('sample: walk to the chair and sit (stance held at marks, none while walking)', () => {
  // Mark 1: start standing. Mark 2: arrive at the chair (standing). Mark 3:
  // same spot, seated — the turn/settle beat where the actor sits.
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0, stance: 'standing' as const },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0, stance: 'standing' as const },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 1.0, stance: 'seated-chair' as const },
  ];
  const tl = buildTimeline(kfs);
  assert.equal(sampleTimeline(kfs, tl, 0)!.stance, 'standing'); // holding mark 1
  const walking = sampleTimeline(kfs, tl, 1.0)!;
  assert.equal(walking.moving, true);
  assert.equal(walking.stance, undefined); // upright while walking
  const settling = sampleTimeline(kfs, tl, tl.times[1] + 0.2)!; // mid settle beat
  assert.equal(settling.moving, false);
  assert.equal(settling.stance, 'seated-chair'); // sits on arrival at the chair
  assert.equal(sampleTimeline(kfs, tl, 99)!.stance, 'seated-chair'); // stays seated
});

test('sample: marks without a stance leave it undefined (caller falls back to rest stance)', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2 }, rotationY: 0 },
  ];
  const tl = buildTimeline(kfs);
  assert.equal(sampleTimeline(kfs, tl, 0)!.stance, undefined);
  assert.equal(sampleTimeline(kfs, tl, 99)!.stance, undefined);
});

test('normalizeScene drops an invalid mark stance but keeps valid ones', () => {
  const s = createScene('kf-stance-repair');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'lying-left');
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  (a.keyframes[1] as { stance?: string }).stance = 'levitating'; // corrupt import
  normalizeScene(s);
  assert.equal(a.keyframes[0].stance, 'lying-left');
  assert.equal(a.keyframes[1].stance, undefined); // repaired to legacy fallback
});

test('duplicateActor deep-copies mark stances', () => {
  const s = createScene('kf-stance-dup');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'seated-lounge');
  const copy = duplicateActor(s, a.id)!;
  assert.equal(copy.keyframes[0].stance, 'seated-lounge');
  copy.keyframes[0].stance = 'standing';
  assert.equal(a.keyframes[0].stance, 'seated-lounge'); // originals untouched
});

test('scene JSON round-trips mark stances through the import validator', () => {
  const s = createScene('kf-stance-json');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'lying-up');
  const back = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(back), true);
  assert.equal(normalizeScene(back).actors[0].keyframes[0].stance, 'lying-up');
});

// --- floorplan / shot-list exports ---------------------------------------------

function exportScene(): SceneData {
  const s = createScene('INT-KITCHEN Sc14');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 2.8 }, 0);
  createCameraSetup(s, { x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  return s;
}

test('planBounds spans actors, their keyframes, and cameras', () => {
  const b = planBounds(exportScene());
  approx(b.minX, 0);
  approx(b.maxX, 2); // camera at x=2
  approx(b.minZ, 0);
  approx(b.maxZ, 2.8); // keyframe at z=2.8
});

test('floorplanLayout projects world X/Z to centered page pixels', () => {
  const s = createScene('T');
  createActor(s, { x: 0, y: 0, z: 0 }, 0);
  createCameraSetup(s, { x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const L = floorplanLayout(s, 1000, 100); // bounds x:[0,2] z:[0,0] → span 2, scale 400
  approx(L.scale, 400);
  const p0 = L.toPx(0, 0);
  approx(p0.x, 100);
  approx(p0.y, 500);
  const p1 = L.toPx(2, 0);
  approx(p1.x, 900);
  approx(p1.y, 500);
});

test('cameraYaw: identity faces -Z (up-page), +90° yaw faces -X', () => {
  approx(Math.abs(cameraYaw({ x: 0, y: 0, z: 0, w: 1 })), Math.PI, 1e-6); // ±π, same dir
  const q90 = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  approx(cameraYaw(q90), -Math.PI / 2, 1e-6);
});

test('nearestActorDistance picks the closest actor', () => {
  const s = createScene('T');
  createActor(s, { x: 0, y: 0, z: 0 }, 0);
  createActor(s, { x: 10, y: 0, z: 0 }, 0);
  const cam = createCameraSetup(s, { x: 3, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  approx(nearestActorDistance(cam, s)!, Math.hypot(3, 1.6), 0.01); // 3D lens→subject = 3.4m
  assert.equal(nearestActorDistance(cam, createScene('empty')), null);
});

test('buildShotList emits camera + blocking details', () => {
  const md = buildShotList(exportScene());
  assert.ok(md.includes('INT-KITCHEN Sc14'), 'scene name in title');
  assert.ok(md.includes('CAM A'), 'camera name');
  assert.ok(md.includes('35mm'), 'lens');
  assert.ok(md.includes('S35'), 'format short');
  assert.ok(md.includes('2.39:1'), 'aspect');
  assert.ok(/Actor 1/.test(md), 'actor name');
  assert.ok(md.includes('2 marks'), 'blocking summary');
  // empty scene must not throw and should say so
  const empty = buildShotList(createScene('Empty'));
  assert.ok(empty.includes('No cameras'));
  assert.ok(empty.includes('No actors'));
});

test('buildShotList: static mark, notes, and ∞ DOF past hyperfocal', () => {
  const s = createScene('S');
  const a = createActor(s, { x: 0, y: 0, z: 10 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 10 }, 0); // one mark → static
  addNote(a, 'dialogue', 'Hello there');
  // 24mm T4 with subject ~10m is past the 5.78m hyperfocal → far = ∞
  createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 24, '2.39:1', 4, 'super35');
  const md = buildShotList(s);
  assert.ok(md.includes('static (1 mark)'), 'single-mark actor');
  assert.ok(md.includes('“Hello there”'), 'dialogue note quoted');
  assert.ok(md.includes('∞'), 'infinite DOF far limit');
  assert.ok(!/NaN/.test(md), 'no NaN anywhere in the export');
});

test('buildShotList: stances surface on the header and on non-standing marks only', () => {
  const s = createScene('S');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-lounge';
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'standing');
  addKeyframe(a, { x: 2, y: 0, z: 0 }, 0, 'seated-chair');
  const md = buildShotList(s);
  assert.ok(md.includes('Seated (lounging)'), 'rest stance on the actor header');
  assert.ok(md.includes('Seated (chair)'), 'non-standing mark stance listed');
  // The standing mark line carries no stance suffix (standing is the default read).
  const mark1 = md.split('\n').find((l) => l.trim().startsWith('1.'))!;
  assert.ok(!/Standing/.test(mark1), `standing mark stays untagged: ${mark1}`);
});

test('cameraHalfFovRad is half the horizontal FOV for the camera format', () => {
  const s = createScene('S');
  const cam = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  approx(cameraHalfFovRad(cam), hFovRad(35, 'super35') / 2, 1e-9);
});

test('planBounds falls back to a ±1m box for an empty scene', () => {
  const b = planBounds(createScene('empty'));
  assert.deepEqual(b, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
});

// --- regression guards for the pre-QA review fixes -----------------------------

test('camera naming: 27th camera falls back to a numeric suffix (no hang)', () => {
  const s = createScene('Big');
  for (let i = 0; i < 26; i++) createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  assert.equal(s.cameras[25].name, 'CAM Z');
  const c27 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  assert.equal(c27.name, 'CAM 27'); // must terminate — not spin forever
});

test('normalizeScene repairs a zero/negative focal length (editor/import guard)', () => {
  const s = createScene('S');
  const c = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  c.lensFocalLength = 0;
  normalizeScene(s);
  assert.equal(c.lensFocalLength, 35);
  c.lensFocalLength = -10;
  normalizeScene(s);
  assert.equal(c.lensFocalLength, 35);
});

test('isSceneData rejects a non-positive focal length on import', () => {
  const s = createScene('S');
  createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const json = JSON.parse(JSON.stringify(s)) as SceneData;
  assert.ok(isSceneData(json));
  json.cameras[0].lensFocalLength = 0;
  assert.ok(!isSceneData(json), 'focal 0 rejected');
});

// --- duplication ----------------------------------------------------------------

test('duplicateActor: new id, unique name, offset pose, independent deep copy', () => {
  const s = createScene('T');
  const a = createActor(s, { x: 1, y: 0, z: 2 }, 0.5);
  addKeyframe(a, { x: 1, y: 0, z: 2 }, 0.5);
  addKeyframe(a, { x: 1, y: 0, z: 4 }, 0.5);
  addNote(a, 'action', 'enters');
  const dup = duplicateActor(s, a.id)!;
  assert.notEqual(dup.id, a.id);
  assert.equal(dup.name, 'Actor 2');
  approx(dup.position.x, 1.6); // offset +0.6
  approx(dup.keyframes[1].position.x, 1.6); // whole path shifted
  assert.equal(s.actors.length, 2); // original + duplicate
  // deep copy: mutating the dup must not touch the original
  dup.notes[0].text = 'changed';
  assert.equal(a.notes[0].text, 'enters');
  assert.equal(duplicateActor(s, 'nope'), null);
});

test('duplicateCameraSetup: new id, unique name, copied optics, offset', () => {
  const s = createScene('T');
  const c = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 85, '16:9', 4, 'fullframe');
  const dup = duplicateCameraSetup(s, c.id)!;
  assert.notEqual(dup.id, c.id);
  assert.equal(dup.name, 'CAM B');
  assert.equal(dup.lensFocalLength, 85);
  assert.equal(dup.aspect, '16:9');
  assert.equal(dup.tStop, 4);
  assert.equal(dup.formatId, 'fullframe');
  approx(dup.position.x, 0.4);
  assert.equal(duplicateCameraSetup(s, 'nope'), null);
});

// --- move pace ------------------------------------------------------------------

test('createScene defaults walkSpeed; normalizeScene repairs a bad pace', () => {
  const s = createScene('T');
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  s.walkSpeed = 0;
  normalizeScene(s);
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  s.walkSpeed = -1;
  normalizeScene(s);
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  // a legacy scene JSON with no walkSpeed field is filled in
  const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete legacy.walkSpeed;
  normalizeScene(legacy as unknown as SceneData);
  assert.equal((legacy as unknown as SceneData).walkSpeed, WALK_SPEED_MS);
});

// --- undo / redo (History) ------------------------------------------------------

function sceneWithActors(n: number): SceneData {
  const s = createScene('H');
  for (let i = 0; i < n; i++) createActor(s, { x: i, y: 0, z: 0 }, 0);
  return s;
}

test('History: record/undo/redo restores exact scene state', () => {
  const h = new History();
  const s0 = sceneWithActors(0);
  h.reset(s0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);

  const s1 = sceneWithActors(1);
  h.record(s1);
  const s2 = sceneWithActors(2);
  h.record(s2);
  assert.equal(h.canUndo, true);

  const u1 = h.undo()!; // → s1
  assert.equal(u1.actors.length, 1);
  const u0 = h.undo()!; // → s0
  assert.equal(u0.actors.length, 0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);

  const r1 = h.redo()!; // → s1
  assert.equal(r1.actors.length, 1);
  assert.equal(h.undo()!.actors.length, 0); // back to s0
});

test('History: undo/redo return fresh objects, not shared references', () => {
  const h = new History();
  h.reset(sceneWithActors(0));
  h.record(sceneWithActors(1));
  const a = h.undo()!;
  a.name = 'mutated';
  h.redo(); // advance forward again
  const c = h.undo()!;
  assert.notEqual(c.name, 'mutated'); // mutating a restored scene never leaks back
});

test('History: a new record clears the redo stack', () => {
  const h = new History();
  h.reset(sceneWithActors(0));
  h.record(sceneWithActors(1));
  h.undo();
  assert.equal(h.canRedo, true);
  h.record(sceneWithActors(3)); // branch off
  assert.equal(h.canRedo, false);
  assert.equal(h.redo(), null);
});

test('History: no-op record on unchanged scene, and bounded depth', () => {
  const h = new History();
  const s = sceneWithActors(1);
  h.reset(s);
  h.record(s); // identical snapshot → no history entry
  assert.equal(h.canUndo, false);

  const small = new History(3);
  small.reset(sceneWithActors(0));
  for (let i = 1; i <= 10; i++) small.record(sceneWithActors(i));
  let steps = 0;
  while (small.undo()) steps++;
  assert.equal(steps, 3); // capped at the limit, never unbounded
});

// --- location scans -----------------------------------------------------------

function makeScan(): LocationScan {
  return {
    version: 1,
    id: 'scan-1',
    capturedAt: 1_720_000_000_000,
    meshes: [
      {
        label: 'global mesh',
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, -3]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
      {
        label: 'table',
        positions: new Float32Array([-1, 0.7, -1, -0.5, 0.7, -1, -1, 0.7, -0.5]),
        indices: new Uint32Array([0, 1, 2]),
      },
    ],
  };
}

/** Corrupt-and-reencode helper for decoder rejection tests. */
function mutated(b64: string, fn: (bytes: Uint8Array) => Uint8Array): string {
  return bytesToBase64(fn(base64ToBytes(b64)!));
}

test('base64: round-trips all remainder lengths and matches Node', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 31]) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 5) % 256;
    const b64 = bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual(base64ToBytes(b64), bytes);
  }
});

test('base64: rejects bad charset and bad length', () => {
  assert.equal(base64ToBytes('####'), null);
  assert.equal(base64ToBytes('QUJ'), null); // not a multiple of 4
  assert.equal(base64ToBytes('émoji=='), null);
});

test('transformPositions: translation and 90° yaw (column-major)', () => {
  const p = new Float32Array([1, 2, 3]);
  transformPositions(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
  assert.deepEqual([...p], [11, 22, 33]);
  const q = new Float32Array([1, 0, 0]);
  // +90° about Y: (1,0,0) → (0,0,-1), matching THREE's applyAxisAngle.
  transformPositions(q, [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
  approx(q[0], 0);
  approx(q[1], 0);
  approx(q[2], -1);
});

test('summarizeScan: counts and bounds across meshes', () => {
  const s = summarizeScan(makeScan());
  assert.equal(s.id, 'scan-1');
  assert.equal(s.vertices, 7);
  assert.equal(s.triangles, 3);
  assert.deepEqual(s.boundsMin, { x: -1, y: 0, z: -3 });
  assert.deepEqual(s.boundsMax, { x: 1, y: 2, z: 0 });
});

test('summarizeScan: empty scan yields zeroed bounds, not infinities', () => {
  const s = summarizeScan({ version: 1, id: 'e', capturedAt: 1, meshes: [] });
  assert.deepEqual(s.boundsMin, { x: 0, y: 0, z: 0 });
  assert.deepEqual(s.boundsMax, { x: 0, y: 0, z: 0 });
});

test('scan codec: encode/decode round-trips geometry with a fresh id', () => {
  const src = makeScan();
  const out = decodeScan(encodeScan(src));
  assert.ok(out);
  assert.notEqual(out.id, src.id); // imports must never collide with stored blobs
  assert.equal(out.capturedAt, src.capturedAt);
  assert.equal(out.meshes.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(out.meshes[i].label, src.meshes[i].label);
    assert.deepEqual([...out.meshes[i].positions], [...src.meshes[i].positions]);
    assert.deepEqual([...out.meshes[i].indices], [...src.meshes[i].indices]);
  }
  assert.ok(isLocationScan(out));
});

test('scan codec: u32 index path preserved above 65535 vertices', () => {
  const n = 66_000; // > 0xffff forces the wide index path
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (i % 977) * 0.01;
  const scan: LocationScan = {
    version: 1,
    id: 'wide',
    capturedAt: 2,
    meshes: [{ label: 'global mesh', positions, indices: new Uint32Array([0, 65_999, 65_536]) }],
  };
  const out = decodeScan(encodeScan(scan))!;
  assert.deepEqual([...out.meshes[0].indices], [0, 65_999, 65_536]);
  assert.equal(out.meshes[0].positions.length, n * 3);
});

test('scan codec: rejects corrupt input instead of crashing', () => {
  const good = encodeScan(makeScan());
  assert.equal(decodeScan('not base64!!'), null);
  // wrong version
  assert.equal(decodeScan(mutated(good, (b) => ((b[0] = 9), b))), null);
  // truncated buffer
  assert.equal(decodeScan(mutated(good, (b) => b.subarray(0, b.length - 7))), null);
  // trailing garbage
  assert.equal(
    decodeScan(
      mutated(good, (b) => {
        const g = new Uint8Array(b.length + 4);
        g.set(b);
        return g;
      }),
    ),
    null,
  );
  // out-of-range index (encoder doesn't validate; decoder must)
  const bad = makeScan();
  bad.meshes[1].indices = new Uint32Array([0, 1, 9]);
  assert.equal(decodeScan(encodeScan(bad)), null);
  // non-finite position
  const nan = makeScan();
  nan.meshes[0].positions[4] = NaN;
  assert.equal(decodeScan(encodeScan(nan)), null);
});

test('SceneData: scan summary is validated and normalized', () => {
  const s = createScene('scan-scene');
  assert.equal(s.scan, null); // new scenes carry an explicit null
  s.scan = summarizeScan(makeScan());
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(json), true);

  const broken = JSON.parse(JSON.stringify(s));
  broken.scan.boundsMax = 'nope';
  assert.equal(isSceneData(broken), false);

  const legacy = JSON.parse(JSON.stringify(s)) as SceneData;
  delete (legacy as unknown as Record<string, unknown>).scan; // pre-scan export
  assert.equal(isSceneData(legacy), true);
  normalizeScene(legacy);
  assert.equal(legacy.scan, null);
});

// --- movable scan furniture (Stage 1) -------------------------------------------

test('furniture: global mesh is fixed, labeled meshes are movable', () => {
  assert.equal(isMovableScanMesh('global mesh'), false);
  assert.equal(isMovableScanMesh('Global Mesh'), false);
  assert.equal(isMovableScanMesh('couch'), true);
  assert.equal(isMovableScanMesh('table'), true);
});

test('furniture: meshFootprintCenter is the XZ bounds center, y always 0', () => {
  const c = meshFootprintCenter(new Float32Array([-1, 0.7, -1, -0.5, 0.7, -1, -1, 0.7, -0.5]));
  approx(c.x, -0.75);
  approx(c.z, -0.75);
  assert.equal(c.y, 0);
  assert.deepEqual(meshFootprintCenter(new Float32Array([])), { x: 0, y: 0, z: 0 });
});

test('furniture: quatYaw matches the rotationY convention (0 = +Z)', () => {
  approx(quatYaw(0, 0, 0, 1), 0); // identity
  const half = Math.PI / 4; // quaternion for +90° yaw: (0, sin45, 0, cos45)
  approx(quatYaw(0, Math.sin(half), 0, Math.cos(half)), Math.PI / 2);
  // Mostly-yaw with a small tilt still lands on the yaw component.
  approx(quatYaw(0.05, Math.sin(half), 0.05, Math.cos(half)), Math.PI / 2, 0.02);
  assert.equal(quatYaw(Math.SQRT1_2, 0, 0, Math.SQRT1_2), 0); // forward → straight up: degenerate → 0
});

test('furniture: placements validate, survive JSON round-trip, bad ones drop', () => {
  const s = createScene('furnished');
  s.scan = summarizeScan(makeScan());
  s.scan.furniture = [{ meshIndex: 1, dx: 0.5, dz: -0.25, rotY: Math.PI / 2 }];
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(json), true);
  assert.deepEqual(json.scan.furniture, s.scan.furniture);

  const broken = JSON.parse(JSON.stringify(s));
  broken.scan.furniture = [{ meshIndex: -1, dx: 0, dz: 0, rotY: 0 }];
  assert.equal(isSceneData(broken), false); // import path rejects outright

  // normalize path (localStorage autosave) drops bad entries, keeps good ones.
  const mixed = JSON.parse(JSON.stringify(s)) as SceneData;
  mixed.scan!.furniture = [
    { meshIndex: 1, dx: 0.5, dz: -0.25, rotY: 0 },
    { meshIndex: 0.5, dx: 0, dz: 0, rotY: 0 }, // fractional index
    { meshIndex: 2, dx: NaN, dz: 0, rotY: 0 }, // NaN offset
  ];
  normalizeScene(mixed);
  assert.deepEqual(mixed.scan!.furniture, [{ meshIndex: 1, dx: 0.5, dz: -0.25, rotY: 0 }]);

  // All-bad list normalizes away entirely (absent = as captured).
  const allBad = JSON.parse(JSON.stringify(s)) as SceneData;
  allBad.scan!.furniture = [{ meshIndex: NaN, dx: 0, dz: 0, rotY: 0 }];
  normalizeScene(allBad);
  assert.equal(allBad.scan!.furniture, undefined);
});

// --- stance / pose ------------------------------------------------------------

test('STANCES: all 10 requested poses present, unique ids, finite targets', () => {
  const ids = STANCES.map((p) => p.id);
  const expected = [
    'standing',
    'lean-left',
    'lean-right',
    'seated-chair',
    'seated-lounge',
    'seated-cross',
    'lying-up',
    'lying-down',
    'lying-left',
    'lying-right',
  ];
  assert.equal(STANCES.length, expected.length);
  const idSet = new Set<string>(ids);
  for (const id of expected) assert.ok(idSet.has(id), `missing stance ${id}`);
  assert.equal(idSet.size, ids.length, 'stance ids must be unique');
  for (const p of STANCES) {
    for (const v of [p.bodyRot.x, p.bodyRot.y, p.bodyRot.z, p.bodyLift, p.hip, p.knee, p.shoulder, p.legSplay]) {
      assert.ok(Number.isFinite(v), `${p.id} has a non-finite target`);
    }
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.ok(typeof p.short === 'string' && p.short.length > 0);
  }
});

test('standing is the neutral pose (all targets zero)', () => {
  const s = poseFor('standing');
  for (const v of [s.bodyRot.x, s.bodyRot.y, s.bodyRot.z, s.bodyLift, s.hip, s.knee, s.shoulder, s.legSplay]) {
    assert.equal(v, 0);
  }
});

test('seated/lying poses actually differ from standing', () => {
  assert.ok(poseFor('seated-chair').bodyLift < 0, 'seated lowers the hips');
  assert.ok(Math.abs(poseFor('seated-chair').hip) > 0.5, 'seated bends the hips');
  assert.ok(Math.abs(poseFor('lying-up').bodyRot.x) > 1, 'lying swings the body flat');
  assert.notEqual(poseFor('lying-up').bodyRot.z, poseFor('lying-left').bodyRot.z); // side roll differs
  assert.equal(poseFor('lean-left').bodyRot.z, -poseFor('lean-right').bodyRot.z); // mirror leans
});

test('poseFor falls back to standing for unknown ids', () => {
  assert.equal(poseFor(undefined).id, 'standing');
  assert.equal(poseFor('nonsense').id, 'standing');
});

test('cycleStance wraps forward and back over all poses', () => {
  const n = STANCES.length;
  let id: string = 'standing';
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    seen.add(id);
    id = cycleStance(id, 1);
  }
  assert.equal(seen.size, n, 'forward cycle visits every stance');
  assert.equal(id, 'standing', 'a full forward cycle returns to the start');
  assert.equal(cycleStance('standing', -1), STANCES[n - 1].id); // backward wraps
  assert.equal(cycleStance('nonsense', 1), STANCES[1 % n].id); // unknown treated as index 0
});

test('isStanceId accepts known ids, rejects junk', () => {
  assert.ok(isStanceId('seated-cross'));
  assert.ok(!isStanceId('sitting'));
  assert.ok(!isStanceId(42));
  assert.ok(!isStanceId(undefined));
});

test('createActor defaults to standing; normalizeScene repairs a bad stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  assert.equal(a.stance, 'standing');
  (a as unknown as Record<string, unknown>).stance = 'floating';
  normalizeScene(scene);
  assert.equal(a.stance, 'standing');
  // A valid non-default stance survives normalization.
  a.stance = 'lying-right';
  normalizeScene(scene);
  assert.equal(a.stance, 'lying-right');
});

test('isSceneData accepts a valid stance and a legacy actor with no stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-lounge';
  const json = JSON.parse(JSON.stringify(scene));
  assert.equal(isSceneData(json), true);
  delete json.actors[0].stance; // pre-stance export
  assert.equal(isSceneData(json), true);
  normalizeScene(json);
  assert.equal(json.actors[0].stance, 'standing');
});

test('duplicateActor copies the stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-cross';
  const dup = duplicateActor(scene, a.id)!;
  assert.equal(dup.stance, 'seated-cross');
});

// --- depth-of-field circle of confusion ---------------------------------------

test('cocDiameterMm: zero at the focus plane, grows with distance from it', () => {
  // Focus at 3m: a subject exactly at 3m is sharp.
  assert.equal(cocDiameterMm(50, 2.8, 3, 3), 0);
  const near = cocDiameterMm(50, 2.8, 3, 2);
  const far = cocDiameterMm(50, 2.8, 3, 5);
  assert.ok(near > 0 && far > 0);
  // Farther from focus (2m off vs 1m off) blurs more.
  assert.ok(cocDiameterMm(50, 2.8, 3, 6) > cocDiameterMm(50, 2.8, 3, 4));
});

test('cocDiameterMm: wider aperture (lower T-stop) blurs more; longer lens blurs more', () => {
  assert.ok(cocDiameterMm(50, 1.4, 3, 6) > cocDiameterMm(50, 5.6, 3, 6)); // f/1.4 vs f/5.6
  assert.ok(cocDiameterMm(85, 2.8, 3, 6) > cocDiameterMm(35, 2.8, 3, 6)); // 85mm vs 35mm
});

test('cocDiameterMm: degenerate inputs return 0, never NaN', () => {
  assert.equal(cocDiameterMm(50, 2.8, 3, 0), 0); // subject at 0
  assert.equal(cocDiameterMm(50, 0, 3, 6), 0); // no aperture
  assert.equal(cocDiameterMm(50, 2.8, 0.01, 6), 0); // focus closer than focal length
  for (const v of [cocDiameterMm(50, 2.8, 3, 6), cocDiameterMm(1000, 2.8, 3, 6)]) {
    assert.ok(Number.isFinite(v));
  }
});

// --- locomotion ---------------------------------------------------------------

test('locomotionAmount: deadzone suppresses stick noise', () => {
  const a = locomotionAmount(0.1, -0.1, 2, 0.5);
  assert.deepEqual(a, { forward: 0, right: 0 });
});

test('locomotionAmount: forward = -stickY, right = +stickX, scaled by speed·dt', () => {
  // Push straight up (stickY = -1): move forward speed·dt = 2·0.5 = 1 m.
  const f = locomotionAmount(0, -1, 2, 0.5);
  approx(f.forward, 1);
  approx(f.right, 0);
  // Push right (stickX = +1): strafe right 1 m.
  const r = locomotionAmount(1, 0, 2, 0.5);
  approx(r.right, 1);
  approx(r.forward, 0);
});

test('locomotionAmount: diagonals are clamped to unit speed (no faster corners)', () => {
  const d = locomotionAmount(1, -1, 2, 0.5); // full diagonal
  const mag = Math.hypot(d.forward, d.right);
  approx(mag, 1); // same total speed as a cardinal push, not √2
});

test('rotateOffsetAboutPivot: rotating about the offset itself is a no-op', () => {
  const p = { x: 3, z: -2 };
  const r = rotateOffsetAboutPivot(p, p, Math.PI / 3);
  approx(r.x, 3);
  approx(r.z, -2);
});

test('rotateOffsetAboutPivot: 90° about origin maps +Y-rotation convention', () => {
  // Rotation about +Y by +90° on (x,z): x' = z, z' = -x.
  const r = rotateOffsetAboutPivot({ x: 1, z: 0 }, { x: 0, z: 0 }, Math.PI / 2);
  approx(r.x, 0);
  approx(r.z, -1);
});

test('snapTurn sign: a RIGHT push turns the view right (right-side actor comes to front)', () => {
  // Full view, at true registration: viewYaw = 0, offset = 0. An actor is to
  // the user's right at world/content (5, 0). The user (at origin) pushes the
  // right stick RIGHT (step +1) to turn toward it. After the turn the actor
  // must appear IN FRONT (content forward is -Z, so world z < 0, x ~ 0).
  const step = 1; // stickStepX for a rightward push
  const angle = snapTurnAngle(step, Math.PI / 2); // 90° for a clean check
  // snapTurn accumulates viewYaw += angle; displayed world = R(viewYaw)·p (offset 0).
  // R(θ) about +Y: x' = x·cosθ + z·sinθ, z' = -x·sinθ + z·cosθ.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const p = { x: 5, z: 0 };
  const world = { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
  approx(world.x, 0, 1e-9); // no longer off to the side
  assert.ok(world.z < 0, `right-side actor should swing to front (z<0), got z=${world.z}`);
});

test('snapTurnAngle: left push is the exact opposite of right', () => {
  assert.equal(snapTurnAngle(1, Math.PI / 6), -snapTurnAngle(-1, Math.PI / 6));
  assert.equal(snapTurnAngle(0, Math.PI / 6), 0);
});

test('rotateOffsetAboutPivot: full turn returns to start; pivot is fixed', () => {
  const start = { x: 2, z: 5 };
  const pivot = { x: -1, z: 1 };
  let cur = start;
  for (let i = 0; i < 12; i++) cur = rotateOffsetAboutPivot(cur, pivot, Math.PI / 6); // 12×30° = 360°
  approx(cur.x, start.x, 1e-6);
  approx(cur.z, start.z, 1e-6);
});

// --- video recording (pure policy/math; MediaRecorder itself is browser-only) --

test('pickMimeType: first supported candidate wins, in preference order', () => {
  const picked = pickMimeType(RECORD_MIME_CANDIDATES, (t) => t.startsWith('video/webm'));
  assert.equal(picked, 'video/webm;codecs=vp9'); // mp4s unsupported → best webm
  const mp4 = pickMimeType(RECORD_MIME_CANDIDATES, () => true);
  assert.ok(mp4?.startsWith('video/mp4'), 'mp4 preferred when everything is supported');
});

test('pickMimeType: nothing supported → null (recording unavailable, not a crash)', () => {
  assert.equal(pickMimeType(RECORD_MIME_CANDIDATES, () => false), null);
});

test('fileExtensionFor matches container for every shipped candidate', () => {
  for (const c of RECORD_MIME_CANDIDATES) {
    const ext = fileExtensionFor(c);
    assert.ok(ext === 'mp4' || ext === 'webm');
    assert.equal(ext === 'mp4', c.startsWith('video/mp4'), `wrong extension for ${c}`);
  }
});

test('containScale: matching aspect fills the frame exactly (the common case)', () => {
  assert.deepEqual(containScale(1024, 430, 1024, 430), { x: 1, y: 1 });
  assert.deepEqual(containScale(2048, 860, 1024, 430), { x: 1, y: 1 }); // same aspect, any size
});

test('containScale: wider source letterboxes, taller source pillarboxes', () => {
  // 2.39:1 feed into a 16:9 canvas → full width, reduced height.
  const lb = containScale(2390, 1000, 1600, 900);
  approx(lb.x, 1);
  approx(lb.y, (1600 / 900) / (2390 / 1000));
  assert.ok(lb.y < 1);
  // 4:3 feed into a 2.39:1 canvas → full height, reduced width.
  const pb = containScale(4, 3, 2390, 1000);
  approx(pb.y, 1);
  assert.ok(pb.x < 1);
});

test('containScale: degenerate inputs fall back to full cover, never a zero rect', () => {
  assert.deepEqual(containScale(0, 430, 1024, 430), { x: 1, y: 1 });
  assert.deepEqual(containScale(1024, 430, 1024, 0), { x: 1, y: 1 });
  assert.deepEqual(containScale(NaN, 430, 1024, 430), { x: 1, y: 1 });
});

test('recordingClock: M:SS with zero-padded seconds, clamped at 0', () => {
  assert.equal(recordingClock(0), '0:00');
  assert.equal(recordingClock(7.9), '0:07');
  assert.equal(recordingClock(75), '1:15');
  assert.equal(recordingClock(600), '10:00');
  assert.equal(recordingClock(-3), '0:00');
});

test('recording policy constants are sane (fps/bitrate/cap all positive, bounded memory)', () => {
  assert.ok(RECORD_FPS > 0 && RECORD_FPS <= 72);
  assert.ok(RECORD_VIDEO_BPS > 0);
  // The cap bounds worst-case in-memory take size to something a Quest tab survives.
  assert.ok((RECORD_VIDEO_BPS / 8) * MAX_RECORD_S < 512 * 1024 * 1024);
});

// --- in-AR controls guide -------------------------------------------------------

const GUIDE_MODES = ['full', 'mini', 'camera'] as const;
const GUIDE_CTXS = GUIDE_MODES.flatMap((mode) =>
  (['actor', 'camera'] as const).flatMap((placeMode) =>
    [false, true].map((eyesMode) => ({ mode, placeMode, eyesMode })),
  ),
);

test('guide: every state yields chips, unique per hand+anchor, wrist chip always present', () => {
  for (const ctx of GUIDE_CTXS) {
    const items = guideItems(ctx);
    assert.ok(items.length >= 4, `${ctx.mode}: too few chips`);
    const keys = items.map((i) => `${i.hand}|${i.anchor}`);
    assert.equal(new Set(keys).size, keys.length, `${ctx.mode}: duplicate hand+anchor`);
    assert.ok(
      items.some((i) => i.hand === 'left' && i.anchor === 'wrist'),
      `${ctx.mode}: wrist-menu chip missing (scan-room discoverability)`,
    );
    for (const i of items) {
      assert.ok(i.label.length > 0 && i.label.length <= 44, `label length: "${i.label}"`);
      assert.ok(!/[—–]/.test(i.label), `no em/en dashes in product copy: "${i.label}"`);
      assert.ok(i.anchor in ANCHOR_OFFSETS, `anchor "${i.anchor}" has no offset`);
    }
  }
});

test('guide: NEXT_VIEW matches ViewManager cycle order and the Y chip names it', () => {
  assert.equal(NEXT_VIEW.full, 'mini');
  assert.equal(NEXT_VIEW.mini, 'camera');
  assert.equal(NEXT_VIEW.camera, 'full');
  const titles = { full: 'Full', mini: 'Mini', camera: 'Cam View' } as const;
  for (const ctx of GUIDE_CTXS) {
    const y = guideItems(ctx).find((i) => i.hand === 'left' && i.anchor === 'upper');
    assert.ok(y, `${ctx.mode}: Y chip missing`);
    assert.ok(y.label.includes(titles[NEXT_VIEW[ctx.mode]]), `${ctx.mode}: Y chip names wrong next view`);
  }
});

test('guide: full-view trigger chip tracks place mode; eyes mode adds the A chip', () => {
  const actorTrig = guideItems({ mode: 'full', placeMode: 'actor', eyesMode: false }).find(
    (i) => i.anchor === 'trigger',
  );
  const camTrig = guideItems({ mode: 'full', placeMode: 'camera', eyesMode: false }).find(
    (i) => i.anchor === 'trigger',
  );
  assert.ok(actorTrig?.label.includes('actor') && !actorTrig.label.includes('camera'));
  assert.ok(camTrig?.label.includes('camera'));
  const eyesA = (eyes: boolean) =>
    guideItems({ mode: 'full', placeMode: 'actor', eyesMode: eyes }).some(
      (i) => i.hand === 'right' && i.anchor === 'lower',
    );
  assert.equal(eyesA(false), false, 'A does nothing in plain full view — no chip');
  assert.equal(eyesA(true), true, 'eyes mode: A commits the camera — chip required');
});

test('guide: camera view teaches photo, focal, and monitor grab', () => {
  const items = guideItems({ mode: 'camera', placeMode: 'actor', eyesMode: false });
  const labels = items.map((i) => i.label.toLowerCase()).join(' | ');
  assert.ok(labels.includes('photo'), 'photo chip');
  assert.ok(labels.includes('focal'), 'focal chip');
  assert.ok(labels.includes('monitor'), 'monitor-grab chip');
});

// ScanStore's IndexedDB-free contract: Node has no indexedDB, so this
// exercises exactly the degraded path a storage-broken browser takes
// (memory fallback + onError warning). Real IDB is covered by
// test/scan-store.html in a headed browser and TESTING.md Phase 6.
async function scanStoreFallback(): Promise<void> {
  const store = new ScanStore();
  let warned = '';
  store.onError = (m) => (warned = m);
  const scan = makeScan();

  const stored = await store.putScan(scan);
  assert.equal(stored, false); // memory fallback reports non-durable
  assert.ok(warned.includes('memory'), 'warns that the scan is memory-only');
  assert.equal(await store.getScan('scan-1'), scan);
  assert.deepEqual(await store.listScanIds(), ['scan-1']);

  // Prune keeps referenced ids, removes orphans.
  const other = { ...makeScan(), id: 'scan-2' };
  await store.putScan(other);
  const removed = await store.pruneOrphans(new Set(['scan-1']));
  assert.equal(removed, 1);
  assert.equal(await store.getScan('scan-2'), null);
  assert.equal((await store.getScan('scan-1'))?.id, 'scan-1');

  await store.deleteScan('scan-1');
  assert.equal(await store.getScan('scan-1'), null);
}

void scanStoreFallback().then(
  () => {
    passed++;
    console.log('  ✓ ScanStore: memory fallback contract (put/get/list/prune/delete + warning)');
    console.log(`\n${passed} tests passed`);
  },
  (e) => {
    console.error('  ✗ ScanStore: memory fallback contract');
    throw e;
  },
);
