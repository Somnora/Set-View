// ---------------------------------------------------------------------------
// 3D Architectural Set Dressing Renderer and Procedural PBR Engine
//
// Renders:
//   - Procedural architectural walls with arbitrary thickness, height, and finish
//   - Precise CSG-free procedural cutouts for windows and doors
//   - Procedural window frames, sashes, mullions, and semi-transparent PBR glass panes
//   - Procedural door frames, slabs, handles, and animated swing/slide offsets
//   - Procedural canvas-generated PBR textures for wallpapers (brick, wood, damask, etc.)
//   - Mobile Quest 3 72fps optimizations (shared material cache, batching, clean disposal)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  type ArchitecturalSet,
  type DoorData,
  type WallData,
  type WallFinishType,
  type WindowData,
  WALL_FINISH_PRESETS,
} from './architecture.ts';
import { disposeTree } from './ui.ts';

// Shared reusable material cache to keep WebXR draw calls minimal
const _materialCache = new Map<string, THREE.Material>();
const _textureCache = new Map<string, THREE.Texture>();

function getOrCreatePbrMaterial(
  colorHex: string,
  roughness = 0.7,
  metalness = 0.0,
  finish?: WallFinishType,
): THREE.MeshStandardMaterial {
  const key = `mat_${colorHex}_${roughness}_${metalness}_${finish ?? 'default'}`;
  let mat = _materialCache.get(key) as THREE.MeshStandardMaterial;
  if (!mat) {
    const textures = finish ? getOrCreateProceduralWallTextures(finish, colorHex) : null;
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      map: textures?.map ?? null,
      roughnessMap: textures?.roughnessMap ?? null,
      bumpMap: textures?.bumpMap ?? null,
      bumpScale: 0.02,
      flatShading: false,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

function getOrCreateGlassMaterial(
  tintHex = '#e0f2fe',
  roughness = 0.08,
  opacity = 0.35,
): THREE.MeshStandardMaterial {
  const key = `glass_${tintHex}_${roughness}_${opacity}`;
  let mat = _materialCache.get(key) as THREE.MeshStandardMaterial;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tintHex),
      roughness,
      metalness: 0.1,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

function getOrCreateHardwareMaterial(
  colorHex = '#d4af37',
  roughness = 0.3,
  metalness = 0.85,
): THREE.MeshStandardMaterial {
  const key = `hw_${colorHex}_${roughness}_${metalness}`;
  let mat = _materialCache.get(key) as THREE.MeshStandardMaterial;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

interface ProceduralTextureSet {
  map: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
}

/**
 * Procedurally generates tileable PBR canvas textures for architectural wall finishes.
 * Supports painted drywall, Victorian damask, 1960s geometric, exposed brick,
 * wood paneling, concrete, and acoustic foam.
 */
export function getOrCreateProceduralWallTextures(
  finish: WallFinishType,
  tintHex: string,
): ProceduralTextureSet {
  const cacheKey = `tex_${finish}_${tintHex}`;
  const existingMap = _textureCache.get(`${cacheKey}_map`) as THREE.CanvasTexture | undefined;
  const existingRough = _textureCache.get(`${cacheKey}_rough`) as THREE.CanvasTexture | undefined;
  const existingBump = _textureCache.get(`${cacheKey}_bump`) as THREE.CanvasTexture | undefined;

  if (existingMap) {
    return {
      map: existingMap,
      roughnessMap: existingRough ?? null,
      bumpMap: existingBump ?? null,
    };
  }

  if (typeof document === 'undefined') {
    // Headless or Node test fallback
    return { map: null, roughnessMap: null, bumpMap: null };
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { map: null, roughnessMap: null, bumpMap: null };

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  // Fill base color
  ctx.fillStyle = tintHex;
  ctx.fillRect(0, 0, size, size);

  if (bumpCtx) {
    bumpCtx.fillStyle = '#808080';
    bumpCtx.fillRect(0, 0, size, size);
  }

  if (roughCtx) {
    const defaultRough = WALL_FINISH_PRESETS[finish]?.defaultRoughness ?? 0.8;
    const roughByte = Math.round(defaultRough * 255);
    roughCtx.fillStyle = `rgb(${roughByte}, ${roughByte}, ${roughByte})`;
    roughCtx.fillRect(0, 0, size, size);
  }

  // Draw procedural pattern per finish
  switch (finish) {
    case 'painted_drywall': {
      // Subtle stipple plaster noise
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 14;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }

    case 'victorian_damask': {
      // Ornate repeating damask motif
      const tileSize = 128;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 3;

      for (let y = 0; y < size; y += tileSize) {
        for (let x = 0; x < size; x += tileSize) {
          const cx = x + tileSize / 2;
          const cy = y + tileSize / 2;
          // Damask central diamond cartouche
          ctx.beginPath();
          ctx.moveTo(cx, cy - tileSize * 0.4);
          ctx.bezierCurveTo(cx + tileSize * 0.35, cy - tileSize * 0.2, cx + tileSize * 0.35, cy + tileSize * 0.2, cx, cy + tileSize * 0.4);
          ctx.bezierCurveTo(cx - tileSize * 0.35, cy + tileSize * 0.2, cx - tileSize * 0.35, cy - tileSize * 0.2, cx, cy - tileSize * 0.4);
          ctx.fill();
          ctx.stroke();

          // Acanthus leaf flourishes
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.18, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }

    case 'midcentury_geometric': {
      // 1960s geometric diamond and starburst tile
      const tileSize = 128;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';

      for (let y = 0; y < size; y += tileSize) {
        for (let x = 0; x < size; x += tileSize) {
          const cx = x + tileSize / 2;
          const cy = y + tileSize / 2;

          // Diamond
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(x + tileSize, cy);
          ctx.lineTo(cx, y + tileSize);
          ctx.lineTo(x, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Inner retro starburst
          ctx.beginPath();
          ctx.moveTo(cx, cy - 20);
          ctx.lineTo(cx, cy + 20);
          ctx.moveTo(cx - 20, cy);
          ctx.lineTo(cx + 20, cy);
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }

    case 'exposed_brick': {
      // Staggered running bond brick pattern
      const brickH = 32;
      const brickW = 64;
      const mortarSize = 4;
      ctx.save();
      ctx.fillStyle = '#262626'; // Mortar joint

      for (let row = 0; row < size / brickH; row++) {
        const y = row * brickH;
        // Horizontal mortar
        ctx.fillRect(0, y, size, mortarSize);

        const offsetX = (row % 2) * (brickW / 2);
        for (let col = -1; col < size / brickW + 1; col++) {
          const x = col * brickW + offsetX;
          // Vertical mortar
          ctx.fillRect(x, y, mortarSize, brickH);

          // Brick face micro-variation
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
          ctx.fillRect(x + mortarSize, y + mortarSize, brickW - mortarSize, brickH - mortarSize);
          ctx.fillStyle = '#262626';
        }
      }
      ctx.restore();
      break;
    }

    case 'wood_paneling': {
      // Vertical timber planks with plank seams and wood grain
      const plankW = 48;
      ctx.save();
      for (let x = 0; x < size; x += plankW) {
        // Vertical plank seam
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x, 0, 3, size);

        // Plank shading gradient
        const grad = ctx.createLinearGradient(x, 0, x + plankW, 0);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        grad.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = grad;
        ctx.fillRect(x + 3, 0, plankW - 3, size);

        // Grain lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 4; g++) {
          const gx = x + 8 + g * 9;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx + 4, size * 0.3, gx - 4, size * 0.7, gx, size);
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }

    case 'industrial_concrete': {
      // Formwork panels and circular tie holes
      const panelH = 128;
      const panelW = 256;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 2;

      for (let y = 0; y < size; y += panelH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();

        for (let x = 0; x < size; x += panelW) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + panelH);
          ctx.stroke();

          // Tie holes
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(x + 24, y + 24, 6, 0, Math.PI * 2);
          ctx.arc(x + panelW - 24, y + 24, 6, 0, Math.PI * 2);
          ctx.arc(x + 24, y + panelH - 24, 6, 0, Math.PI * 2);
          ctx.arc(x + panelW - 24, y + panelH - 24, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      break;
    }

    case 'acoustic_foam': {
      // Pyramid wedge acoustic foam tiles
      const pyramidSize = 32;
      ctx.save();
      for (let y = 0; y < size; y += pyramidSize) {
        for (let x = 0; x < size; x += pyramidSize) {
          const cx = x + pyramidSize / 2;
          const cy = y + pyramidSize / 2;

          // Top wedge facet (highlight)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + pyramidSize, y);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();

          // Bottom wedge facet (shadow)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.moveTo(x, y + pyramidSize);
          ctx.lineTo(x + pyramidSize, y + pyramidSize);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();

          // Left wedge facet
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + pyramidSize);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();

          // Right wedge facet
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.beginPath();
          ctx.moveTo(x + pyramidSize, y);
          ctx.lineTo(x + pyramidSize, y + pyramidSize);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
      break;
    }

    case 'custom_color':
    default: {
      // Subtle micro noise
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 8;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }
  }

  const mapTex = new THREE.CanvasTexture(canvas);
  mapTex.wrapS = THREE.RepeatWrapping;
  mapTex.wrapT = THREE.RepeatWrapping;

  let roughTex: THREE.CanvasTexture | null = null;
  if (roughCtx) {
    roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;
  }

  let bumpTex: THREE.CanvasTexture | null = null;
  if (bumpCtx) {
    bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
  }

  _textureCache.set(`${cacheKey}_map`, mapTex);
  if (roughTex) _textureCache.set(`${cacheKey}_rough`, roughTex);
  if (bumpTex) _textureCache.set(`${cacheKey}_bump`, bumpTex);

  return { map: mapTex, roughnessMap: roughTex, bumpMap: bumpTex };
}

interface OpeningSpan {
  id: string;
  kind: 'window' | 'door';
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  windowData?: WindowData;
  doorData?: DoorData;
}

export class ArchitectureRenderer {
  private rootGroup = new THREE.Group();
  private wallGroups = new Map<string, THREE.Group>();

  constructor() {
    this.rootGroup.name = 'architecture_set_root';
  }

  /**
   * Renders a complete architectural set into a Three.js hierarchy.
   */
  createArchitecturalSetMesh(set: ArchitecturalSet): THREE.Group {
    this.dispose();
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = `arch_set_${set.id}`;

    for (const wall of set.walls) {
      const wallMesh = this.createWallMesh(wall);
      this.rootGroup.add(wallMesh);
      this.wallGroups.set(wall.id, wallMesh);
    }

    return this.rootGroup;
  }

  /**
   * Renders a single procedural wall segment including all door and window cutouts.
   */
  createWallMesh(wall: WallData): THREE.Group {
    const wallRoot = new THREE.Group();
    wallRoot.name = `wall_${wall.id}`;
    wallRoot.userData = { wallId: wall.id, wallData: wall };
    this.wallGroups.set(wall.id, wallRoot);

    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const lengthM = Math.hypot(dx, dz);

    if (lengthM < 1e-4) return wallRoot;

    // Align wall local frame: local +X along wall vector, local +Y up, local +Z normal
    const angleY = Math.atan2(dx, dz); // Rotation around +Y
    wallRoot.position.set(wall.start.x, wall.start.y, wall.start.z);
    wallRoot.rotation.y = angleY - Math.PI / 2;

    const wallMat = getOrCreatePbrMaterial(wall.tintHex, wall.roughness, 0.05, wall.finish);

    // Collect all openings along this wall
    const openings: OpeningSpan[] = [];

    if (wall.windows) {
      for (const win of wall.windows) {
        const xMin = Math.max(0, Math.min(lengthM, win.offsetAlongWallM));
        const xMax = Math.max(0, Math.min(lengthM, win.offsetAlongWallM + win.widthM));
        const yMin = Math.max(0, Math.min(wall.heightM, win.heightFromFloorM));
        const yMax = Math.max(0, Math.min(wall.heightM, win.heightFromFloorM + win.heightM));
        if (xMax > xMin && yMax > yMin) {
          openings.push({
            id: win.id,
            kind: 'window',
            xMin,
            xMax,
            yMin,
            yMax,
            windowData: win,
          });
        }
      }
    }

    if (wall.doors) {
      for (const door of wall.doors) {
        const xMin = Math.max(0, Math.min(lengthM, door.offsetAlongWallM));
        const xMax = Math.max(0, Math.min(lengthM, door.offsetAlongWallM + door.widthM));
        const yMin = 0;
        const yMax = Math.max(0, Math.min(wall.heightM, door.heightM));
        if (xMax > xMin && yMax > yMin) {
          openings.push({
            id: door.id,
            kind: 'door',
            xMin,
            xMax,
            yMin,
            yMax,
            doorData: door,
          });
        }
      }
    }

    // Sort openings along wall length
    openings.sort((a, b) => a.xMin - b.xMin);

    // Build solid wall blocks around cutouts
    const solidGroup = new THREE.Group();
    solidGroup.name = `wall_solid_${wall.id}`;

    let currentX = 0;
    for (const op of openings) {
      // Solid full-height segment before this opening
      if (op.xMin > currentX + 1e-4) {
        const segW = op.xMin - currentX;
        const blockGeo = new THREE.BoxGeometry(segW, wall.heightM, wall.thicknessM);
        const blockMesh = new THREE.Mesh(blockGeo, wallMat);
        blockMesh.position.set(currentX + segW / 2, wall.heightM / 2, 0);
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        solidGroup.add(blockMesh);
      }

      // Lintel block above opening
      if (op.yMax < wall.heightM - 1e-4) {
        const lintelH = wall.heightM - op.yMax;
        const lintelW = op.xMax - op.xMin;
        const lintelGeo = new THREE.BoxGeometry(lintelW, lintelH, wall.thicknessM);
        const lintelMesh = new THREE.Mesh(lintelGeo, wallMat);
        lintelMesh.position.set(op.xMin + lintelW / 2, op.yMax + lintelH / 2, 0);
        lintelMesh.castShadow = true;
        lintelMesh.receiveShadow = true;
        solidGroup.add(lintelMesh);
      }

      // Under-window sill block (for windows only)
      if (op.kind === 'window' && op.yMin > 1e-4) {
        const sillH = op.yMin;
        const sillW = op.xMax - op.xMin;
        const sillGeo = new THREE.BoxGeometry(sillW, sillH, wall.thicknessM);
        const sillMesh = new THREE.Mesh(sillGeo, wallMat);
        sillMesh.position.set(op.xMin + sillW / 2, sillH / 2, 0);
        sillMesh.castShadow = true;
        sillMesh.receiveShadow = true;
        solidGroup.add(sillMesh);
      }

      // Render the window or door assembly inside the opening
      if (op.kind === 'window' && op.windowData) {
        const winMesh = this.buildWindowAssembly(op.windowData, wall.thicknessM);
        winMesh.position.set(op.xMin + (op.xMax - op.xMin) / 2, op.yMin + (op.yMax - op.yMin) / 2, 0);
        wallRoot.add(winMesh);
      } else if (op.kind === 'door' && op.doorData) {
        const doorMesh = this.buildDoorAssembly(op.doorData, wall.thicknessM);
        doorMesh.position.set(op.xMin, 0, 0); // Positioned at door hinge baseline
        wallRoot.add(doorMesh);
      }

      currentX = Math.max(currentX, op.xMax);
    }

    // Trailing solid segment after last opening
    if (lengthM > currentX + 1e-4) {
      const segW = lengthM - currentX;
      const blockGeo = new THREE.BoxGeometry(segW, wall.heightM, wall.thicknessM);
      const blockMesh = new THREE.Mesh(blockGeo, wallMat);
      blockMesh.position.set(currentX + segW / 2, wall.heightM / 2, 0);
      blockMesh.castShadow = true;
      blockMesh.receiveShadow = true;
      solidGroup.add(blockMesh);
    }

    wallRoot.add(solidGroup);
    this.wallGroups.set(wall.id, wallRoot);
    return wallRoot;
  }

  /**
   * Builds procedural window casing, muntins, and semi-transparent PBR glass pane.
   */
  private buildWindowAssembly(win: WindowData, wallThickness: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `window_${win.id}`;

    const frameColor = win.frameColorHex ?? '#334155';
    const frameMat = getOrCreateHardwareMaterial(frameColor, 0.4, 0.2);
    const glassMat = getOrCreateGlassMaterial(win.glassTintHex, win.glassRoughness, win.glassOpacity);

    const frameThick = 0.04; // Frame wood/metal border width
    const frameDepth = wallThickness + 0.02; // Protrudes slightly from wall face

    // Outer frame jambs
    // Top header
    const topGeo = new THREE.BoxGeometry(win.widthM, frameThick, frameDepth);
    const topMesh = new THREE.Mesh(topGeo, frameMat);
    topMesh.position.set(0, win.heightM / 2 - frameThick / 2, 0);
    group.add(topMesh);

    // Bottom sill
    const botGeo = new THREE.BoxGeometry(win.widthM, frameThick, frameDepth + 0.04);
    const botMesh = new THREE.Mesh(botGeo, frameMat);
    botMesh.position.set(0, -win.heightM / 2 + frameThick / 2, 0);
    group.add(botMesh);

    // Left jamb
    const leftGeo = new THREE.BoxGeometry(frameThick, win.heightM - frameThick * 2, frameDepth);
    const leftMesh = new THREE.Mesh(leftGeo, frameMat);
    leftMesh.position.set(-win.widthM / 2 + frameThick / 2, 0, 0);
    group.add(leftMesh);

    // Right jamb
    const rightGeo = new THREE.BoxGeometry(frameThick, win.heightM - frameThick * 2, frameDepth);
    const rightMesh = new THREE.Mesh(rightGeo, frameMat);
    rightMesh.position.set(win.widthM / 2 - frameThick / 2, 0, 0);
    group.add(rightMesh);

    // Glass pane
    const glassW = win.widthM - frameThick * 2;
    const glassH = win.heightM - frameThick * 2;
    const glassGeo = new THREE.BoxGeometry(glassW, glassH, 0.008);
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.renderOrder = 1;
    group.add(glassMesh);

    // Type-specific muntin divisions
    if (win.type === 'casement') {
      // Center vertical muntin
      const muntinGeo = new THREE.BoxGeometry(0.025, glassH, frameDepth * 0.7);
      const muntinMesh = new THREE.Mesh(muntinGeo, frameMat);
      group.add(muntinMesh);
    } else if (win.type === 'sash') {
      // Center horizontal meeting rail
      const sashGeo = new THREE.BoxGeometry(glassW, 0.035, frameDepth * 0.75);
      const sashMesh = new THREE.Mesh(sashGeo, frameMat);
      group.add(sashMesh);
    } else if (win.type === 'stained_glass') {
      // Leaded came diamond cross pattern
      const crossGeo = new THREE.BoxGeometry(0.02, glassH, 0.015);
      const cross1 = new THREE.Mesh(crossGeo, frameMat);
      cross1.rotation.z = Math.PI / 4;
      const cross2 = new THREE.Mesh(crossGeo, frameMat);
      cross2.rotation.z = -Math.PI / 4;
      group.add(cross1);
      group.add(cross2);
    }

    return group;
  }

  /**
   * Builds procedural door frame, slab leaf, handles, and swing pivot.
   */
  private buildDoorAssembly(door: DoorData, wallThickness: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `door_${door.id}`;

    const finishColor = door.finishHex ?? '#78350f';
    const slabMat = getOrCreatePbrMaterial(finishColor, 0.5, 0.05);
    const frameMat = getOrCreateHardwareMaterial('#1e293b', 0.5, 0.2);
    const handleMat = getOrCreateHardwareMaterial('#e2e8f0', 0.2, 0.9);

    const frameThick = 0.04;
    const frameDepth = wallThickness + 0.02;

    // Door frame header
    const topGeo = new THREE.BoxGeometry(door.widthM, frameThick, frameDepth);
    const topMesh = new THREE.Mesh(topGeo, frameMat);
    topMesh.position.set(door.widthM / 2, door.heightM - frameThick / 2, 0);
    group.add(topMesh);

    // Left frame jamb
    const leftGeo = new THREE.BoxGeometry(frameThick, door.heightM - frameThick, frameDepth);
    const leftMesh = new THREE.Mesh(leftGeo, frameMat);
    leftMesh.position.set(frameThick / 2, (door.heightM - frameThick) / 2, 0);
    group.add(leftMesh);

    // Right frame jamb
    const rightGeo = new THREE.BoxGeometry(frameThick, door.heightM - frameThick, frameDepth);
    const rightMesh = new THREE.Mesh(rightGeo, frameMat);
    rightMesh.position.set(door.widthM - frameThick / 2, (door.heightM - frameThick) / 2, 0);
    group.add(rightMesh);

    const slabW = door.widthM - frameThick * 2;
    const slabH = door.heightM - frameThick;
    const slabThick = 0.045;
    const openDeg = door.openAngleDeg ?? 0;

    if (door.type === 'double_french') {
      // Two symmetrical leaves hinged at left and right
      const leafW = slabW / 2;
      const leftHinge = new THREE.Group();
      leftHinge.name = `door_hinge_left_${door.id}`;
      leftHinge.position.set(frameThick, 0, 0);
      leftHinge.rotation.y = (openDeg * Math.PI) / 180;

      const leftLeafGeo = new THREE.BoxGeometry(leafW, slabH, slabThick);
      const leftLeafMesh = new THREE.Mesh(leftLeafGeo, slabMat);
      leftLeafMesh.position.set(leafW / 2, slabH / 2, 0);
      leftHinge.add(leftLeafMesh);

      // Glass inset in French door
      const glassMat = getOrCreateGlassMaterial('#e0f2fe', 0.08, 0.35);
      const paneGeo = new THREE.BoxGeometry(leafW * 0.7, slabH * 0.75, 0.008);
      const paneMesh = new THREE.Mesh(paneGeo, glassMat);
      paneMesh.position.set(leafW / 2, slabH / 2, 0);
      leftHinge.add(paneMesh);

      const rightHinge = new THREE.Group();
      rightHinge.name = `door_hinge_right_${door.id}`;
      rightHinge.position.set(door.widthM - frameThick, 0, 0);
      rightHinge.rotation.y = (-openDeg * Math.PI) / 180;

      const rightLeafGeo = new THREE.BoxGeometry(leafW, slabH, slabThick);
      const rightLeafMesh = new THREE.Mesh(rightLeafGeo, slabMat);
      rightLeafMesh.position.set(-leafW / 2, slabH / 2, 0);
      rightHinge.add(rightLeafMesh);

      const paneRight = new THREE.Mesh(paneGeo, glassMat);
      paneRight.position.set(-leafW / 2, slabH / 2, 0);
      rightHinge.add(paneRight);

      group.add(leftHinge);
      group.add(rightHinge);
    } else if (door.type === 'sliding_barn') {
      // Top barn track rail and sliding slab
      const railGeo = new THREE.BoxGeometry(door.widthM * 2, 0.04, 0.05);
      const railMesh = new THREE.Mesh(railGeo, frameMat);
      railMesh.position.set(door.widthM, door.heightM + 0.05, wallThickness / 2 + 0.04);
      group.add(railMesh);

      const slideOffset = (openDeg / 90) * door.widthM;
      const slabGroup = new THREE.Group();
      slabGroup.position.set(frameThick + slideOffset, 0, wallThickness / 2 + 0.03);

      const slabGeo = new THREE.BoxGeometry(slabW + 0.1, slabH + 0.05, slabThick);
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.position.set(slabW / 2, slabH / 2, 0);
      slabGroup.add(slabMesh);

      group.add(slabGroup);
    } else {
      // Single swing door pivoted at left hinge
      const hingeGroup = new THREE.Group();
      hingeGroup.name = `door_hinge_${door.id}`;
      hingeGroup.position.set(frameThick, 0, 0);
      hingeGroup.rotation.y = (openDeg * Math.PI) / 180;

      const slabGeo = new THREE.BoxGeometry(slabW, slabH, slabThick);
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.position.set(slabW / 2, slabH / 2, 0);
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      hingeGroup.add(slabMesh);

      // Handle lever and rosette plate
      const handleGroup = new THREE.Group();
      handleGroup.position.set(slabW - 0.08, 0.95, 0);

      const plateGeo = new THREE.CylinderGeometry(0.03, 0.03, slabThick + 0.01, 16);
      plateGeo.rotateX(Math.PI / 2);
      const plateMesh = new THREE.Mesh(plateGeo, handleMat);
      handleGroup.add(plateMesh);

      // Front lever
      const leverGeo = new THREE.BoxGeometry(0.11, 0.02, 0.02);
      const leverFront = new THREE.Mesh(leverGeo, handleMat);
      leverFront.position.set(-0.04, 0, slabThick / 2 + 0.03);
      handleGroup.add(leverFront);

      // Back lever
      const leverBack = new THREE.Mesh(leverGeo, handleMat);
      leverBack.position.set(-0.04, 0, -slabThick / 2 - 0.03);
      handleGroup.add(leverBack);

      hingeGroup.add(handleGroup);
      group.add(hingeGroup);
    }

    return group;
  }

  /**
   * Updates interactive door open angle without full scene recreation.
   */
  updateDoorAngle(wallId: string, doorId: string, angleDeg: number): void {
    const wallMesh = this.wallGroups.get(wallId);
    if (!wallMesh) return;

    const hinge = wallMesh.getObjectByName(`door_hinge_${doorId}`);
    if (hinge) {
      hinge.rotation.y = (angleDeg * Math.PI) / 180;
    }
  }

  /**
   * Replaces or updates a wall mesh in the active scene hierarchy.
   */
  updateWall(wall: WallData): void {
    const existing = this.wallGroups.get(wall.id);
    if (existing) {
      this.rootGroup.remove(existing);
      disposeTree(existing);
      this.wallGroups.delete(wall.id);
    }

    const newWallMesh = this.createWallMesh(wall);
    this.rootGroup.add(newWallMesh);
    this.wallGroups.set(wall.id, newWallMesh);
  }

  /**
   * Removes a wall from the scene and cleans up resources.
   */
  removeWall(wallId: string): void {
    const existing = this.wallGroups.get(wallId);
    if (existing) {
      this.rootGroup.remove(existing);
      disposeTree(existing);
      this.wallGroups.delete(wallId);
    }
  }

  /**
   * Disposes of all meshes, geometries, and textures.
   */
  dispose(): void {
    for (const group of this.wallGroups.values()) {
      disposeTree(group);
    }
    this.wallGroups.clear();
    disposeTree(this.rootGroup);
    this.rootGroup.clear();
  }
}
