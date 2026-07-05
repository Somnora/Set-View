// Domain-core tests (model, lens math, timeline). Runs directly in Node:
//   npm test
// These cover the portable logic; rendering/XR behavior is verified on-headset
// via TESTING.md.

import assert from 'node:assert/strict';
import {
  addKeyframe,
  aspectValue,
  createActor,
  createCameraSetup,
  createScene,
  isSceneData,
  MAX_KEYFRAMES,
  stepFocal,
} from '../src/model.ts';
import { frameSizeAtDistance, hFovRad, vFovDeg } from '../src/lens.ts';
import { buildTimeline, lerpAngle, sampleTimeline } from '../src/timeline.ts';

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

// --- lens math -----------------------------------------------------------------

test('hFOV: 35mm on S35 (24.89mm gate) ≈ 39.13°', () => {
  approx((hFovRad(35) * 180) / Math.PI, 39.13, 0.05);
});

test('hFOV: 16mm wide ≈ 75.7°, 135mm tight ≈ 10.55°', () => {
  approx((hFovRad(16) * 180) / Math.PI, 75.73, 0.1);
  approx((hFovRad(135) * 180) / Math.PI, 10.55, 0.05);
});

test('vFOV depends on aspect (constant-width gate)', () => {
  // 50mm: sensor height 24.89/2.39 = 10.414mm → vFOV = 2·atan(10.414/100)
  approx(vFovDeg(50, '2.39:1'), 11.89, 0.05);
  approx(vFovDeg(50, '16:9'), 15.94, 0.05);
  approx(vFovDeg(50, '4:3'), 21.12, 0.05);
  // wider aspect ⇒ shorter frame ⇒ smaller vertical FOV
  assert.ok(vFovDeg(50, '2.39:1') < vFovDeg(50, '16:9'));
  assert.ok(vFovDeg(50, '16:9') < vFovDeg(50, '4:3'));
});

test('frame size at distance: width constant across aspects', () => {
  const a = frameSizeAtDistance(35, '2.39:1', 1.4);
  const b = frameSizeAtDistance(35, '16:9', 1.4);
  approx(a.width, b.width);
  approx(a.width / a.height, 2.39);
  approx(b.width / b.height, 16 / 9);
  // 35mm at 1.4m: width = 2·1.4·tan(hFov/2) = 2.8·(24.89/70) ≈ 0.9956m
  approx(a.width, 0.9956, 0.001);
});

test('aspectValue + stepFocal clamp at ends', () => {
  approx(aspectValue('16:9'), 16 / 9);
  assert.equal(stepFocal(16, -1), 16);
  assert.equal(stepFocal(135, 1), 135);
  assert.equal(stepFocal(35, 1), 50);
  assert.equal(stepFocal(35, -1), 24);
});

// --- model ---------------------------------------------------------------------

test('scene/actor/camera factories: names, colors, ids', () => {
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
  assert.ok(isSceneData(JSON.parse(JSON.stringify(s))));
  assert.ok(!isSceneData({ version: 2 }));
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

// --- timeline ---------------------------------------------------------------------

test('timeline durations derive from distance at 1.4 m/s', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0 },
    { position: { x: 1.4, y: 0, z: 2.8 }, rotationY: Math.PI / 2 },
  ];
  const tl = buildTimeline(kfs);
  approx(tl.times[0], 0);
  approx(tl.times[1], 2.0); // 2.8m / 1.4 m/s
  approx(tl.times[2], 3.0); // + 1.4m / 1.4
  approx(tl.duration, 3.0);
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
  approx(mid.rotationY, Math.atan2(0, 2.8)); // faces +Z travel
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
  approx(lerpAngle(3.0, -3.0, 0.5), Math.PI, 0.01); // wraps through π, not 0
  approx(lerpAngle(0, Math.PI / 2, 0.5), Math.PI / 4);
});

console.log(`\n${passed} tests passed`);
