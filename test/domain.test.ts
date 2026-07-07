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
  isSceneData,
  MAX_KEYFRAMES,
  normalizeScene,
  sensorFormat,
  stepFocal,
  vecDistance,
  type SceneData,
} from '../src/model.ts';
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

console.log(`\n${passed} tests passed`);
