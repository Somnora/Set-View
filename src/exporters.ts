// ---------------------------------------------------------------------------
// Deliverable exports: a printable top-down floorplan PNG and a Markdown shot
// list. Drawing/DOM only — all projection & text come from the pure plan.ts.
// ---------------------------------------------------------------------------

import { sensorFormat, type SceneData } from './model.ts';
import {
  buildShotList,
  cameraHalfFovRad,
  cameraYaw,
  floorplanLayout,
  nearestActorDistance,
} from './plan.ts';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Renders a printable top-down blocking diagram to a canvas. */
export function renderFloorplanCanvas(scene: SceneData, sizePx = 1400): HTMLCanvasElement {
  const layout = floorplanLayout(scene, sizePx);
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;

  // Background.
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Meter grid across the visible extent.
  const halfSpanM = sizePx / 2 / layout.scale;
  const cx = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const cz = (layout.bounds.minZ + layout.bounds.maxZ) / 2;
  const x0 = Math.floor(cx - halfSpanM);
  const x1 = Math.ceil(cx + halfSpanM);
  const z0 = Math.floor(cz - halfSpanM);
  const z1 = Math.ceil(cz + halfSpanM);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#1b2230';
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    const p = layout.toPx(x, 0).x;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, sizePx);
  }
  for (let z = z0; z <= z1; z++) {
    const p = layout.toPx(0, z).y;
    ctx.moveTo(0, p);
    ctx.lineTo(sizePx, p);
  }
  ctx.stroke();

  // Keyframe paths + numbered marks per actor.
  for (const a of scene.actors) {
    const col = a.color;
    if (a.keyframes.length >= 2) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      a.keyframes.forEach((k, i) => {
        const p = layout.toPx(k.position.x, k.position.z);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    a.keyframes.forEach((k, i) => {
      const p = layout.toPx(k.position.x, k.position.z);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0d1016';
      ctx.font = '700 16px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y);
    });
  }

  // Actors: dot + facing tick + name.
  for (const a of scene.actors) {
    const p = layout.toPx(a.position.x, a.position.z);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();
    // facing: (sinθ, cosθ) in world (X,Z) → page (x, y)
    const dx = Math.sin(a.rotationY);
    const dz = Math.cos(a.rotationY);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + dx * 30, p.y + dz * 30);
    ctx.stroke();
    ctx.fillStyle = '#e8ecf3';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.name, p.x + 22, p.y - 20);
  }

  // Cameras: FOV wedge + body + label.
  for (const c of scene.cameras) {
    const p = layout.toPx(c.position.x, c.position.z);
    const yaw = cameraYaw(c.rotation);
    const half = cameraHalfFovRad(c);
    const dist = nearestActorDistance(c, scene);
    const reachM = dist !== null ? Math.max(dist, 1) : 3;
    const reachPx = reachM * layout.scale;
    const dir = (a: number) => ({ x: Math.sin(a), y: Math.cos(a) });
    const l = dir(yaw - half);
    const r = dir(yaw + half);
    ctx.fillStyle = 'rgba(102,204,255,0.14)';
    ctx.strokeStyle = 'rgba(102,204,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + l.x * reachPx, p.y + l.y * reachPx);
    ctx.arc(p.x, p.y, reachPx, Math.atan2(l.y, l.x), Math.atan2(r.y, r.x));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // body
    ctx.fillStyle = '#66ccff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    const fmt = sensorFormat(c.formatId);
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${c.name} ${Math.round(c.lensFocalLength)}mm ${fmt.short}`, p.x + 14, p.y + 4);
  }

  // Title + scale bar.
  ctx.fillStyle = '#e8ecf3';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${scene.name} — blocking floorplan`, 28, 24);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillStyle = '#9aa3b2';
  ctx.fillText('top-down · +X right · +Z down · 1 m grid', 28, 62);

  const barM = 1;
  const barPx = barM * layout.scale;
  const by = sizePx - 40;
  ctx.strokeStyle = '#e8ecf3';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, by);
  ctx.lineTo(28 + barPx, by);
  ctx.stroke();
  ctx.fillStyle = '#e8ecf3';
  ctx.font = '600 18px ui-monospace, monospace';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1 m', 28, by - 6);

  return canvas;
}

export function downloadFloorplan(scene: SceneData): void {
  const canvas = renderFloorplanCanvas(scene);
  canvas.toBlob((blob) => {
    if (blob) download(`${slug(scene.name)}-floorplan.png`, blob);
  }, 'image/png');
}

export function downloadShotList(scene: SceneData): void {
  const header = `Exported ${new Date().toLocaleString()}`;
  const md = buildShotList(scene, header);
  download(`${slug(scene.name)}-shotlist.md`, new Blob([md], { type: 'text/markdown' }));
}
