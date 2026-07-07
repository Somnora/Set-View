// ---------------------------------------------------------------------------
// Planning exports — PURE (no three.js, no DOM). Top-down floorplan projection
// and the shot-list text are derived entirely from the scene data model, so
// they are unit-testable and portable. The canvas/PNG drawing that consumes
// this lives in exporters.ts.
//
// Plan convention: looking straight down. World +X → page right, world +Z →
// page down. A heading of 0 (facing +Z) points down the page; a facing
// direction is (sin θ, cos θ) in (X, Z).
// ---------------------------------------------------------------------------

import {
  sensorFormat,
  vecDistance,
  type CameraSetupData,
  type Quat,
  type SceneData,
} from './model.ts';
import { depthOfFieldFor, hFovDeg, hFovRad } from './lens.ts';
import { moveStats } from './timeline.ts';

export interface PlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** X/Z extent over all actors (+ their keyframes) and cameras, in meters. */
export function planBounds(scene: SceneData): PlanBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const add = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const a of scene.actors) {
    add(a.position.x, a.position.z);
    for (const k of a.keyframes) add(k.position.x, k.position.z);
  }
  for (const c of scene.cameras) add(c.position.x, c.position.z);
  if (minX === Infinity) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }; // empty scene
  return { minX, maxX, minZ, maxZ };
}

export interface PlanLayout {
  /** Pixels per meter. */
  scale: number;
  sizePx: number;
  bounds: PlanBounds;
  /** Projects a world (x, z) point to page pixels. */
  toPx(x: number, z: number): { x: number; y: number };
}

/**
 * A square, content-centered top-down layout. `span` is padded to at least a
 * few meters so a tiny scene isn't drawn at an absurd scale.
 */
export function floorplanLayout(scene: SceneData, sizePx = 1400, padPx = 90): PlanLayout {
  const b = planBounds(scene);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 2);
  const scale = (sizePx - padPx * 2) / span;
  return {
    scale,
    sizePx,
    bounds: b,
    toPx(x: number, z: number) {
      return { x: sizePx / 2 + (x - cx) * scale, y: sizePx / 2 + (z - cz) * scale };
    },
  };
}

/**
 * Yaw of a camera's optical axis on the plan (radians). Cameras look down -Z;
 * we rotate (0,0,-1) by the quaternion and take the in-plane heading, matching
 * the actor facing convention atan2(dirX, dirZ).
 */
export function cameraYaw(q: Quat): number {
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(fx, fz);
}

/** Half-angle (radians) of a camera's horizontal FOV wedge. */
export function cameraHalfFovRad(cam: CameraSetupData): number {
  return hFovRad(cam.lensFocalLength, sensorFormat(cam.formatId)) / 2;
}

// --- shot list --------------------------------------------------------------

function fmtM(v: number): string {
  return v === Infinity ? '∞' : `${v.toFixed(v < 10 ? 1 : 0)}m`;
}

/** Distance (m) from a camera to the nearest actor, or null if no actors. */
export function nearestActorDistance(cam: CameraSetupData, scene: SceneData): number | null {
  let best: number | null = null;
  for (const a of scene.actors) {
    const d = vecDistance(cam.position, a.position);
    if (best === null || d < best) best = d;
  }
  return best;
}

/**
 * A readable Markdown shot list: a camera table (lens/format/aspect/stop, angle
 * of view, height, subject distance, DOF) and a blocking summary per actor
 * (marks, travel distance, move duration). `header` lets the caller stamp a
 * date without making this impure.
 */
export function buildShotList(scene: SceneData, header = ''): string {
  const lines: string[] = [];
  lines.push(`# ${scene.name} — Shot List`);
  if (header) lines.push('', `_${header}_`);
  lines.push('', `${scene.cameras.length} camera(s) · ${scene.actors.length} actor(s)`, '');

  lines.push('## Cameras', '');
  if (scene.cameras.length === 0) {
    lines.push('_No cameras yet._', '');
  } else {
    lines.push('| Cam | Lens | Format | Aspect | Stop | AoV H | Height | Subject | DOF |');
    lines.push('|-----|------|--------|--------|------|-------|--------|---------|-----|');
    for (const c of scene.cameras) {
      const fmt = sensorFormat(c.formatId);
      const h = hFovDeg(c.lensFocalLength, fmt).toFixed(1);
      const dist = nearestActorDistance(c, scene);
      const dof = dist !== null ? depthOfFieldFor(c, dist) : null;
      lines.push(
        `| ${c.name} | ${Math.round(c.lensFocalLength)}mm | ${fmt.short} | ${c.aspect} | T${c.tStop} | ${h}° | ${c.position.y.toFixed(2)}m | ${dist !== null ? fmtM(dist) : '—'} | ${dof ? `${fmtM(dof.nearM)}–${fmtM(dof.farM)}` : '—'} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Blocking', '');
  if (scene.actors.length === 0) {
    lines.push('_No actors yet._');
  } else {
    for (const a of scene.actors) {
      const ms = moveStats(a.keyframes);
      if (a.keyframes.length <= 1) {
        lines.push(`- **${a.name}** — static (${a.keyframes.length} mark)`);
      } else {
        lines.push(
          `- **${a.name}** — ${ms.marks} marks · ${ms.distanceM.toFixed(1)}m · ${ms.durationS.toFixed(1)}s @ ${ms.avgSpeed.toFixed(1)} m/s`,
        );
      }
      a.keyframes.forEach((k, i) => {
        lines.push(`  ${i + 1}. (${k.position.x.toFixed(2)}, ${k.position.z.toFixed(2)}) facing ${((k.rotationY * 180) / Math.PI).toFixed(0)}°`);
      });
      for (const n of a.notes) {
        lines.push(`  - _${n.kind}_: ${n.kind === 'dialogue' ? `“${n.text}”` : n.text}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}
