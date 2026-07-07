// Domain-core tests (model, lens math, timeline). Runs directly in Node:
//   npm test
// These cover the portable logic; rendering/XR behavior is verified on-headset
// via TESTING.md.

import assert from 'node:assert/strict';
import {
  addKeyframe,
  addNote,
  createActor,
  createCameraSetup,
  createScene,
  DEFAULT_FORMAT_ID,
  DEFAULT_TSTOP,
  duplicateActor,
  duplicateCameraSetup,
  isSceneData,
  MAX_KEYFRAMES,
  normalizeScene,
  sensorFormat,
  stepFocal,
  vecDistance,
  WALK_SPEED_MS,
  type SceneData,
} from '../src/model.ts';
import { History } from '../src/history.ts';
import {
  depthOfField,
  depthOfFieldFor,
  dFovDeg,
  frameSizeAtDistance,
  hFovDeg,
  hFovRad,
  hyperfocalM,
  vFovDeg,
} from '../src/lens.ts';
import { buildTimeline, lerpAngle, moveStats, sampleTimeline } from '../src/timeline.ts';
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
  summarizeScan,
  transformPositions,
  type LocationScan,
} from '../src/scan.ts';
import { ScanStore } from '../src/scanStore.ts';
import { locomotionAmount, rotateOffsetAboutPivot } from '../src/locomotion.ts';

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

test('rotateOffsetAboutPivot: full turn returns to start; pivot is fixed', () => {
  const start = { x: 2, z: 5 };
  const pivot = { x: -1, z: 1 };
  let cur = start;
  for (let i = 0; i < 12; i++) cur = rotateOffsetAboutPivot(cur, pivot, Math.PI / 6); // 12×30° = 360°
  approx(cur.x, start.x, 1e-6);
  approx(cur.z, start.z, 1e-6);
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
