// ---------------------------------------------------------------------------
// Deliverable exports: a printable top-down floorplan PNG and a Markdown shot
// list. Drawing/DOM only — all projection & text come from the pure plan.ts.
// ---------------------------------------------------------------------------

import { sensorFormat, type SceneData } from './model.ts';
import { poseFor } from './pose.ts';
import {
  buildShotList,
  cameraHalfFovRad,
  cameraYaw,
  floorplanLayout,
  nearestActorDistance,
} from './plan.ts';
import { depthOfFieldFor, frameSizeAtDistance, hFovDeg, vFovDeg } from './lens.ts';
import { moveStats } from './timeline.ts';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Renders a printable top-down blocking diagram as a standalone SVG string. */
export function renderFloorplanSvg(scene: SceneData, sizePx = 1000): string {
  const layout = floorplanLayout(scene, sizePx);
  const elements: string[] = [];

  // Background.
  elements.push(`<rect width="${sizePx}" height="${sizePx}" fill="#0d1016" />`);

  // Meter grid across the visible extent.
  const halfSpanM = sizePx / 2 / layout.scale;
  const cx = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const cz = (layout.bounds.minZ + layout.bounds.maxZ) / 2;
  const x0 = Math.floor(cx - halfSpanM);
  const x1 = Math.ceil(cx + halfSpanM);
  const z0 = Math.floor(cz - halfSpanM);
  const z1 = Math.ceil(cz + halfSpanM);

  for (let x = x0; x <= x1; x++) {
    const p = layout.toPx(x, 0).x;
    elements.push(`<line x1="${p.toFixed(1)}" y1="0" x2="${p.toFixed(1)}" y2="${sizePx}" stroke="#1b2230" stroke-width="1" />`);
  }
  for (let z = z0; z <= z1; z++) {
    const p = layout.toPx(0, z).y;
    elements.push(`<line x1="0" y1="${p.toFixed(1)}" x2="${sizePx}" y2="${p.toFixed(1)}" stroke="#1b2230" stroke-width="1" />`);
  }

  // Keyframe paths + numbered marks per actor.
  for (const a of scene.actors) {
    if (a.keyframes.length >= 2) {
      const points = a.keyframes
        .map((k) => {
          const p = layout.toPx(k.position.x, k.position.z);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');
      elements.push(
        `<polyline points="${points}" fill="none" stroke="${a.color}" stroke-width="3" stroke-dasharray="10,8" opacity="0.8" />`,
      );
    }
    a.keyframes.forEach((k, i) => {
      const p = layout.toPx(k.position.x, k.position.z);
      elements.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="${a.color}" opacity="0.35" />`);
      elements.push(
        `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" fill="#0d1016" font-family="monospace" font-size="16" font-weight="700" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`,
      );
      if (k.stance && k.stance !== 'standing') {
        const poseLabel = poseFor(k.stance).short;
        elements.push(
          `<text x="${p.x.toFixed(1)}" y="${(p.y + 22).toFixed(1)}" fill="${a.color}" font-family="monospace" font-size="13" font-weight="600" text-anchor="middle">${escapeHtml(poseLabel)}</text>`,
        );
      }
    });
  }

  // Actors: dot + facing tick + name.
  for (const a of scene.actors) {
    const p = layout.toPx(a.position.x, a.position.z);
    const dx = Math.sin(a.rotationY);
    const dz = Math.cos(a.rotationY);
    const tx = p.x + dx * 30;
    const ty = p.y + dz * 30;
    elements.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" fill="${a.color}" />`);
    elements.push(
      `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${a.color}" stroke-width="5" />`,
    );
    elements.push(
      `<text x="${(p.x + 22).toFixed(1)}" y="${(p.y - 12).toFixed(1)}" fill="#e8ecf3" font-family="sans-serif" font-size="20" font-weight="600">${escapeHtml(a.name)}</text>`,
    );
  }

  // Cameras: FOV wedge + body + label.
  for (const c of scene.cameras) {
    const p = layout.toPx(c.position.x, c.position.z);
    const yaw = cameraYaw(c.rotation);
    const half = cameraHalfFovRad(c);
    const dist = nearestActorDistance(c, scene);
    const reachM = dist !== null ? Math.max(dist, 1) : 3;
    const reachPx = reachM * layout.scale;
    const lx = p.x + Math.sin(yaw - half) * reachPx;
    const ly = p.y + Math.cos(yaw - half) * reachPx;
    const rx = p.x + Math.sin(yaw + half) * reachPx;
    const ry = p.y + Math.cos(yaw + half) * reachPx;

    const pathD = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${lx.toFixed(1)} ${ly.toFixed(1)} A ${reachPx.toFixed(1)} ${reachPx.toFixed(1)} 0 0 1 ${rx.toFixed(1)} ${ry.toFixed(1)} Z`;
    elements.push(`<path d="${pathD}" fill="rgba(102,204,255,0.14)" stroke="rgba(102,204,255,0.6)" stroke-width="2" />`);
    elements.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="#66ccff" />`);
    const fmt = sensorFormat(c.formatId);
    elements.push(
      `<text x="${(p.x + 14).toFixed(1)}" y="${(p.y + 6).toFixed(1)}" fill="#bfe6ff" font-family="monospace" font-size="18" font-weight="700">${escapeHtml(c.name)} ${Math.round(c.lensFocalLength)}mm ${escapeHtml(fmt.short)}</text>`,
    );
  }

  // Title + scale bar.
  elements.push(
    `<text x="28" y="36" fill="#e8ecf3" font-family="sans-serif" font-size="26" font-weight="700">${escapeHtml(scene.name)} — floorplan</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}">\n${elements.join('\n')}\n</svg>`;
}

/** Generates a structured Markdown prompt package for AI Shot Analysis & Continuity LLMs. */
export function buildAiShotAnalysisPrompt(scene: SceneData, floorplanSvg?: string): string {
  const svgContent = floorplanSvg ?? renderFloorplanSvg(scene);
  const lines: string[] = [];

  lines.push(`# AI Shot Analysis & Continuity Audit Prompt`);
  lines.push('');
  lines.push(`You are an expert AI Cinematography, Shot Analysis, and Continuity Specialist.`);
  lines.push(`Analyze the following 3D scene blocking and camera setup data from SetView.`);
  lines.push('');

  lines.push(`## Scene Overview`);
  lines.push(`- **Scene Name**: ${scene.name}`);
  lines.push(`- **Blocking Pace**: ${scene.walkSpeed.toFixed(1)} m/s`);
  lines.push(`- **Total Cameras**: ${scene.cameras.length}`);
  lines.push(`- **Total Actors**: ${scene.actors.length}`);
  if (scene.scan) {
    const sc = scene.scan;
    const sizeStr = `${(sc.boundsMax.x - sc.boundsMin.x).toFixed(1)}×${(sc.boundsMax.z - sc.boundsMin.z).toFixed(1)} m`;
    lines.push(`- **Location Scan**: ${Math.round(sc.triangles / 1000)}k triangles, ${sizeStr}`);
  } else {
    lines.push(`- **Location Scan**: None`);
  }
  lines.push('');

  lines.push(`## Camera Setups & Optics Details`);
  if (scene.cameras.length === 0) {
    lines.push(`_No cameras defined in scene._`);
    lines.push('');
  } else {
    for (const c of scene.cameras) {
      const fmt = sensorFormat(c.formatId);
      const dist = nearestActorDistance(c, scene);
      const dof = dist !== null ? depthOfFieldFor(c, dist) : null;
      const hFov = hFovDeg(c.lensFocalLength, fmt);
      const vFov = vFovDeg(c.lensFocalLength, c.aspect, fmt.id);
      const yawRad = cameraYaw(c.rotation);
      const yawDeg = (yawRad * 180) / Math.PI;
      const fieldWidth = dist !== null ? frameSizeAtDistance(c.lensFocalLength, c.aspect, dist, fmt.id).width : null;

      lines.push(`### Camera: ${c.name}`);
      lines.push(`- **Position (XYZ)**: (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}) m (Height: ${c.position.y.toFixed(2)}m)`);
      lines.push(`- **Heading / Facing Yaw**: ${yawDeg.toFixed(1)}° (${yawRad.toFixed(2)} rad)`);
      lines.push(`- **Lens & Optics**: ${Math.round(c.lensFocalLength)}mm | Aperture: T${c.tStop} | Sensor Format: ${fmt.name} (${fmt.short}, gate ${fmt.gateWidthMm}mm, squeeze ${fmt.squeeze}x)`);
      lines.push(`- **Aspect Ratio**: ${c.aspect}`);
      lines.push(`- **Field of View**: Horizontal ${hFov.toFixed(1)}° | Vertical ${vFov.toFixed(1)}°`);
      lines.push(`- **Subject Distance**: ${dist !== null ? `${dist.toFixed(2)}m` : 'N/A'}`);
      if (dist !== null && fieldWidth !== null) {
        lines.push(`- **Framed Field Width at Subject**: ${fieldWidth.toFixed(2)}m`);
      }
      if (dof) {
        const nearStr = dof.nearM.toFixed(2);
        const farStr = dof.farM === Infinity ? '∞' : `${dof.farM.toFixed(2)}m`;
        lines.push(`- **Depth of Field**: ${nearStr}m to ${farStr} (Hyperfocal: ${dof.hyperfocalM.toFixed(2)}m)`);
      }
      lines.push('');
    }
  }

  lines.push(`## Cast, Blocking & Keyframe Timelines`);
  if (scene.actors.length === 0) {
    lines.push(`_No actors defined in scene._`);
    lines.push('');
  } else {
    for (const a of scene.actors) {
      const ms = moveStats(a.keyframes, scene.walkSpeed);
      const restPose = a.stance ? poseFor(a.stance).name : 'Standing';
      lines.push(`### Actor: ${a.name}`);
      lines.push(`- **Rest Stance**: ${restPose}`);
      lines.push(`- **Rest Position**: (${a.position.x.toFixed(2)}, ${a.position.y.toFixed(2)}, ${a.position.z.toFixed(2)}) facing ${((a.rotationY * 180) / Math.PI).toFixed(0)}°`);
      lines.push(`- **Blocking Timeline**: ${ms.marks} mark(s), Total Distance: ${ms.distanceM.toFixed(2)}m, Duration: ${ms.durationS.toFixed(1)}s at ${ms.avgSpeed.toFixed(1)} m/s`);

      if (a.keyframes.length > 0) {
        lines.push(`- **Keyframe Marks**:`);
        a.keyframes.forEach((k, i) => {
          const pose = k.stance ? poseFor(k.stance).name : 'Rest stance';
          lines.push(`  ${i + 1}. Position (${k.position.x.toFixed(2)}, ${k.position.z.toFixed(2)}) facing ${((k.rotationY * 180) / Math.PI).toFixed(0)}° [Stance: ${pose}]`);
        });
      }

      if (a.notes.length > 0) {
        lines.push(`- **Notes**:`);
        for (const n of a.notes) {
          lines.push(`  - [${n.kind.toUpperCase()}] ${n.text}`);
        }
      }
      lines.push('');
    }
  }

  lines.push(`## Scene Data Payload (JSON)`);
  lines.push('```json');
  lines.push(JSON.stringify(scene, null, 2));
  lines.push('```');
  lines.push('');

  if (svgContent) {
    lines.push(`## Top-Down Floorplan Diagram (SVG)`);
    lines.push('```xml');
    lines.push(svgContent);
    lines.push('```');
    lines.push('');
  }

  lines.push(`## AI Analysis Instructions`);
  lines.push(`Please perform a rigorous, structured technical and creative evaluation of this scene across the following 5 categories:`);
  lines.push('');
  lines.push(`1. **Shot Coverage & Gap Identification**`);
  lines.push(`   - Evaluate whether all actors, key action beats, and dialogue lines are adequately covered by the camera setups.`);
  lines.push(`   - Identify missing coverage, blind spots, missing reverse angles, or necessary insert/cutaway shots.`);
  lines.push('');
  lines.push(`2. **180-Degree Line Rule & Eyeline Continuity Audit**`);
  lines.push(`   - Analyze camera positions and headings relative to actor positions and facing directions to detect axis crossing (180-degree rule violations).`);
  lines.push(`   - Check eyeline continuity across setups (e.g., matching left/right look directions between cross-shots).`);
  lines.push('');
  lines.push(`3. **Lens Selection & Perspective Consistency**`);
  lines.push(`   - Evaluate focal length and sensor format choices for depth compression, spatial distortion, field of view, and optical perspective consistency across setups.`);
  lines.push(`   - Highlight potential focal length jumps or mismatched optical characteristics between reverse angles.`);
  lines.push('');
  lines.push(`4. **Lighting Plan & Key Light Direction Recommendations**`);
  lines.push(`   - Recommend key light directions, fill ratios, spatial lighting setups, and contrast/mood based on camera placements, actor positions/facings, and scene movement.`);
  lines.push(`   - Note potential camera shadows or lens flare risks with proposed lighting directions.`);
  lines.push('');
  lines.push(`5. **Scene Pacing & Blocking Flow Feedback**`);
  lines.push(`   - Assess actor movement paths, keyframe timing, stances, and walk speeds for physical realism, pacing, clutter, and spatial flow across the scene.`);
  lines.push(`   - Identify blocking bottlenecks, awkward transitions, or collision points.`);

  return lines.join('\n');
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
      // Non-standing marks carry their pose ("Sit", "Lie ↑") under the number
      // — what an AD reads off the printed diagram on the day.
      if (k.stance && k.stance !== 'standing') {
        ctx.fillStyle = col;
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText(poseFor(k.stance).short, p.x, p.y + 22);
      }
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

/** Generates a detailed cinematic AI prompt for Midjourney / Sora / Flux based on scene blocking & camera optics. */
export function buildAIPrompt(scene: SceneData): string {
  const parts: string[] = [];
  parts.push(`Cinematic movie still from scene "${scene.name}".`);

  if (scene.cameras.length > 0) {
    const cam = scene.cameras[0];
    const fmt = sensorFormat(cam.formatId);
    parts.push(
      `Filmed on ${cam.name} (${Math.round(cam.lensFocalLength)}mm lens, ${fmt.name} format, T${cam.tStop.toFixed(1)} aperture, aspect ratio ${cam.aspect}, camera height ${cam.position.y.toFixed(1)}m).`,
    );
  } else {
    parts.push(`Cinematic wide framing, aspect ratio 2.39:1, 35mm lens.`);
  }

  if (scene.actors.length > 0) {
    const actorDescs = scene.actors.map((a, i) => {
      const stance = a.stance ?? 'standing';
      const pos = `X:${a.position.x.toFixed(1)}m Z:${a.position.z.toFixed(1)}m`;
      const marks = a.keyframes.length ? ` (${a.keyframes.length} keyframe marks)` : '';
      return `Actor ${i + 1} "${a.name}" holding ${stance} posture at [${pos}]${marks}`;
    });
    parts.push(`Blocking & Cast: ${actorDescs.join('; ')}.`);
  }

  if (scene.lights && scene.lights.length > 0) {
    const lightDescs = scene.lights.map(
      (l) => `${l.name} (${l.type.toUpperCase()}, ${l.colorKelvin}K, intensity ${l.intensity.toFixed(1)})`,
    );
    parts.push(`Lighting Key: ${lightDescs.join('; ')}.`);
  } else {
    parts.push(`Lighting: Cinematic key light, subtle rim light, soft fill.`);
  }

  if (scene.scan) {
    parts.push(`Environment: Detailed location scan interior set.`);
  } else {
    parts.push(`Environment: Architectural studio set.`);
  }

  parts.push(
    `Atmosphere & Quality: Photorealistic 8k, volumetric light shafts, fine film grain, shallow depth of field, master color grading, highly detailed. --ar 16:9`,
  );

  return parts.join(' ');
}

/** Simulates AI Shot Analysis evaluation for offline/mock usage. */
export function simulateAiShotAnalysis(scene: SceneData): string {
  const lines: string[] = [];
  lines.push('# AI Shot Analysis & Continuity Report');
  lines.push('');
  lines.push(`Scene: **${scene.name}** | ${scene.cameras.length} Camera(s) | ${scene.actors.length} Actor(s)`);
  lines.push('');
  lines.push('## Shot Coverage & Gap Identification');
  lines.push('- Coverage looks complete across primary actors.');
  lines.push('');
  lines.push('## 180-Degree Line Rule & Eyeline Continuity Audit');
  lines.push('- All cameras respect the axis of action.');
  lines.push('');
  lines.push('## Lens Selection & Perspective Consistency');
  lines.push('- Focal length selection is consistent across setups.');
  lines.push('');
  lines.push('## Lighting Plan & Key Light Direction Recommendations');
  lines.push('- Key light direction aligns with subject facing angles.');
  lines.push('');
  lines.push('## Scene Pacing & Blocking Flow Feedback');
  lines.push(`- Blocking pace (${scene.walkSpeed.toFixed(1)} m/s) feels natural.`);
  return lines.join('\n');
}



