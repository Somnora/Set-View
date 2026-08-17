// ---------------------------------------------------------------------------
// 3D Set & Prop Renderer, Procedural Geometry Engine & 3D Loaders
//
// Renders:
//   - 16 procedural, high-detail film set primitives (zero texture asset downloads)
//   - Custom user-uploaded GLTF/GLB/OBJ meshes via dynamic loaders
//   - Selection bounding box gizmo, floor projection, and 3D transform manipulators
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  getBuiltinPropDefinition,
  type PropData,
} from './props.ts';
import { globalPropStore } from './propStore.ts';
import { disposeTree } from './ui.ts';

// Shared reusable materials & geometries to keep WebXR draw calls minimal
const _matCache = new Map<string, THREE.Material>();

function getOrCreateMaterial(colorHex: string, roughness = 0.5, metalness = 0.1): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${roughness}_${metalness}`;
  let mat = _matCache.get(key) as THREE.MeshStandardMaterial;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      flatShading: true,
    });
    _matCache.set(key, mat);
  }
  return mat;
}

const WOOD_MAT = getOrCreateMaterial('#854d0e', 0.8, 0.0);
const CHROME_MAT = getOrCreateMaterial('#94a3b8', 0.2, 0.85);
const BLACK_MAT = getOrCreateMaterial('#0f172a', 0.7, 0.2);
const FABRIC_MAT = getOrCreateMaterial('#1e293b', 0.9, 0.0);
const GREEN_CHROMA_MAT = getOrCreateMaterial('#22c55e', 0.9, 0.0);
const EMISSIVE_WARM_MAT = new THREE.MeshBasicMaterial({ color: 0xffedd5 });

export interface PropRenderInstance {
  data: PropData;
  root: THREE.Group;
  contentGroup: THREE.Group;
  selectionBox: THREE.LineSegments | null;
  footprintMesh: THREE.Mesh | null;
  isSelected: boolean;
}

export class PropRenderer {
  private gltfLoader = new GLTFLoader();
  private objLoader = new OBJLoader();

  /** Builds the Three.js 3D visual object for a given PropData. */
  async createPropMesh(prop: PropData): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = `prop_${prop.id}`;

    if (prop.sourceType === 'indexeddb' && prop.customModelKey) {
      const customMesh = await this.loadCustomModel(prop.customModelKey);
      if (customMesh) {
        group.add(customMesh);
        return group;
      }
    }

    // Built-in or fallback procedural geometry
    const proceduralMesh = this.buildProceduralProp(prop);
    group.add(proceduralMesh);
    return group;
  }

  /** Loads and normalizes a custom 3D model from PropStore. */
  private async loadCustomModel(customKey: string): Promise<THREE.Group | null> {
    try {
      const asset = await globalPropStore.getAsset(customKey);
      if (!asset) return null;

      const url = await globalPropStore.getAssetBlobUrl(customKey);
      if (!url) return null;

      const root = new THREE.Group();

      if (asset.fileType === 'glb' || asset.fileType === 'gltf') {
        const gltf = await this.gltfLoader.loadAsync(url);
        root.add(gltf.scene);
      } else if (asset.fileType === 'obj') {
        const obj = await this.objLoader.loadAsync(url);
        root.add(obj);
      }

      // Compute bounding box and normalize center/floor
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Center horizontally and align bottom to floor (y = 0)
      root.position.x = -center.x;
      root.position.y = -box.min.y;
      root.position.z = -center.z;

      const wrapper = new THREE.Group();
      wrapper.add(root);
      return wrapper;
    } catch {
      return null;
    }
  }

  /** Builds stylized low-poly cinematic primitives for built-in props. */
  buildProceduralProp(prop: PropData): THREE.Group {
    const root = new THREE.Group();
    const colorHex = prop.colorHex || '#475569';
    const primaryMat = getOrCreateMaterial(colorHex, 0.6, 0.1);

    switch (prop.assetId) {
      case 'directors_chair': {
        // Scissor legs
        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6);
        const legMat = WOOD_MAT;
        const leg1 = new THREE.Mesh(legGeo, legMat);
        leg1.position.set(-0.2, 0.45, 0);
        leg1.rotation.z = 0.2;
        const leg2 = new THREE.Mesh(legGeo, legMat);
        leg2.position.set(0.2, 0.45, 0);
        leg2.rotation.z = -0.2;
        root.add(leg1, leg2);

        // Canvas seat
        const seatGeo = new THREE.BoxGeometry(0.48, 0.02, 0.42);
        const seat = new THREE.Mesh(seatGeo, FABRIC_MAT);
        seat.position.set(0, 0.72, 0);
        root.add(seat);

        // Canvas backrest
        const backGeo = new THREE.BoxGeometry(0.48, 0.22, 0.02);
        const back = new THREE.Mesh(backGeo, FABRIC_MAT);
        back.position.set(0, 1.05, -0.2);
        root.add(back);

        // Wooden armrests
        const armGeo = new THREE.BoxGeometry(0.04, 0.03, 0.44);
        const armL = new THREE.Mesh(armGeo, legMat);
        armL.position.set(-0.25, 0.88, 0);
        const armR = new THREE.Mesh(armGeo, legMat);
        armR.position.set(0.25, 0.88, 0);
        root.add(armL, armR);
        break;
      }

      case 'apple_box_full': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.1;
        root.add(box);
        break;
      }

      case 'apple_box_half': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.1, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.05;
        root.add(box);
        break;
      }

      case 'apple_box_quarter': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.05, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.025;
        root.add(box);
        break;
      }

      case 'c_stand_with_arm': {
        // Turtle base
        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(legGeo, CHROME_MAT);
          const ang = (i * Math.PI * 2) / 3;
          leg.position.set(Math.cos(ang) * 0.22, 0.08 + i * 0.04, Math.sin(ang) * 0.22);
          leg.rotation.z = Math.PI / 2;
          leg.rotation.y = ang;
          root.add(leg);
        }

        // Telescoping column
        const columnGeo = new THREE.CylinderGeometry(0.02, 0.025, 1.6, 8);
        const col = new THREE.Mesh(columnGeo, CHROME_MAT);
        col.position.y = 0.85;
        root.add(col);

        // Knuckle head + Grip arm
        const knuckleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
        const knuckle = new THREE.Mesh(knuckleGeo, BLACK_MAT);
        knuckle.position.set(0, 1.65, 0);
        knuckle.rotation.x = Math.PI / 2;
        root.add(knuckle);

        const armGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.0, 8);
        const arm = new THREE.Mesh(armGeo, CHROME_MAT);
        arm.position.set(0.35, 1.65, 0);
        arm.rotation.z = Math.PI / 2;
        root.add(arm);
        break;
      }

      case 'film_slate_clapper': {
        // Slate board
        const boardGeo = new THREE.BoxGeometry(0.3, 0.2, 0.015);
        const board = new THREE.Mesh(boardGeo, BLACK_MAT);
        board.position.y = 0.1;
        root.add(board);

        // Hinged clapper stick on top
        const stickGeo = new THREE.BoxGeometry(0.3, 0.04, 0.018);
        const stick = new THREE.Mesh(stickGeo, primaryMat);
        stick.position.set(0, 0.22, 0);
        stick.rotation.z = 0.15; // angled slightly open
        root.add(stick);
        break;
      }

      case 'production_desk': {
        // Desk top
        const topGeo = new THREE.BoxGeometry(1.5, 0.04, 0.8);
        const top = new THREE.Mesh(topGeo, primaryMat);
        top.position.y = 0.74;
        root.add(top);

        // Metal square legs
        const legGeo = new THREE.BoxGeometry(0.05, 0.72, 0.05);
        const legOffsets = [
          [-0.7, 0.36, -0.35],
          [0.7, 0.36, -0.35],
          [-0.7, 0.36, 0.35],
          [0.7, 0.36, 0.35],
        ];
        for (const [x, y, z] of legOffsets) {
          const leg = new THREE.Mesh(legGeo, BLACK_MAT);
          leg.position.set(x, y, z);
          root.add(leg);
        }
        break;
      }

      case 'office_chair': {
        // 5-Star base
        const baseGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5);
        const base = new THREE.Mesh(baseGeo, BLACK_MAT);
        base.position.y = 0.08;
        root.add(base);

        // Center cylinder
        const colGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
        const col = new THREE.Mesh(colGeo, CHROME_MAT);
        col.position.y = 0.28;
        root.add(col);

        // Seat cushion
        const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.48);
        const seat = new THREE.Mesh(seatGeo, FABRIC_MAT);
        seat.position.y = 0.52;
        root.add(seat);

        // Backrest
        const backGeo = new THREE.BoxGeometry(0.46, 0.45, 0.06);
        const back = new THREE.Mesh(backGeo, FABRIC_MAT);
        back.position.set(0, 0.8, -0.22);
        root.add(back);
        break;
      }

      case 'doorframe_standard': {
        const jambGeo = new THREE.BoxGeometry(0.08, 2.14, 0.15);
        const jambL = new THREE.Mesh(jambGeo, primaryMat);
        jambL.position.set(-0.44, 1.07, 0);
        const jambR = new THREE.Mesh(jambGeo, primaryMat);
        jambR.position.set(0.44, 1.07, 0);

        const headerGeo = new THREE.BoxGeometry(0.96, 0.08, 0.15);
        const header = new THREE.Mesh(headerGeo, primaryMat);
        header.position.set(0, 2.1, 0);

        root.add(jambL, jambR, header);
        break;
      }

      case 'window_frame_double': {
        const frameGeo = new THREE.BoxGeometry(1.4, 1.6, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          wireframe: true,
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.y = 1.2;
        root.add(frame);

        // Glass pane representation (translucent)
        const glassGeo = new THREE.PlaneGeometry(1.3, 1.5);
        const glassMat = new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.y = 1.2;
        root.add(glass);
        break;
      }

      case 'practical_floor_lamp': {
        // Weighted base
        const baseGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.03, 16);
        const base = new THREE.Mesh(baseGeo, BLACK_MAT);
        base.position.y = 0.015;
        root.add(base);

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8);
        const stem = new THREE.Mesh(stemGeo, CHROME_MAT);
        stem.position.y = 0.75;
        root.add(stem);

        // Lamp shade
        const shadeGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.28, 16, 1, true);
        const shade = new THREE.Mesh(shadeGeo, primaryMat);
        shade.position.y = 1.52;
        root.add(shade);

        // Glowing bulb inside
        const bulbGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const bulb = new THREE.Mesh(bulbGeo, EMISSIVE_WARM_MAT);
        bulb.position.y = 1.52;
        root.add(bulb);
        break;
      }

      case 'couch_leather_3seater': {
        // Main base
        const baseGeo = new THREE.BoxGeometry(2.1, 0.25, 0.9);
        const base = new THREE.Mesh(baseGeo, primaryMat);
        base.position.y = 0.18;
        root.add(base);

        // 3 Seat cushions
        const cushionGeo = new THREE.BoxGeometry(0.62, 0.14, 0.65);
        for (let i = -1; i <= 1; i++) {
          const cushion = new THREE.Mesh(cushionGeo, primaryMat);
          cushion.position.set(i * 0.64, 0.35, 0.05);
          root.add(cushion);
        }

        // Backrest
        const backGeo = new THREE.BoxGeometry(2.1, 0.5, 0.22);
        const back = new THREE.Mesh(backGeo, primaryMat);
        back.position.set(0, 0.6, -0.32);
        root.add(back);

        // Armrests
        const armGeo = new THREE.BoxGeometry(0.18, 0.35, 0.88);
        const armL = new THREE.Mesh(armGeo, primaryMat);
        armL.position.set(-1.0, 0.45, 0);
        const armR = new THREE.Mesh(armGeo, primaryMat);
        armR.position.set(1.0, 0.45, 0);
        root.add(armL, armR);
        break;
      }

      case 'green_screen_frame': {
        // Frame pipes
        const pipeMat = CHROME_MAT;
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        postL.position.set(-1.22, 1.22, 0);
        const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        postR.position.set(1.22, 1.22, 0);
        const barTop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        barTop.position.set(0, 2.44, 0);
        barTop.rotation.z = Math.PI / 2;
        root.add(postL, postR, barTop);

        // Green Screen canvas
        const canvasGeo = new THREE.PlaneGeometry(2.38, 2.38);
        const canvas = new THREE.Mesh(canvasGeo, GREEN_CHROMA_MAT);
        canvas.position.set(0, 1.22, 0);
        root.add(canvas);
        break;
      }

      default: {
        // Generic bounding cube for other props
        const def = getBuiltinPropDefinition(prop.assetId);
        const d = def?.dimensions || { width: 0.6, height: 0.6, depth: 0.6 };
        const boxGeo = new THREE.BoxGeometry(d.width, d.height, d.depth);
        const box = new THREE.Mesh(boxGeo, primaryMat);
        box.position.y = d.height / 2;
        root.add(box);
        break;
      }
    }

    return root;
  }

  /** Creates a wireframe selection bounding box. */
  createSelectionGizmo(
    dim: { width: number; height: number; depth: number } | { x: number; y: number; z: number },
    color = 0x38bdf8,
  ): THREE.LineSegments {
    const w = 'width' in dim ? dim.width : dim.x;
    const h = 'height' in dim ? dim.height : dim.y;
    const d = 'depth' in dim ? dim.depth : dim.z;
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    line.position.y = h / 2;
    return line;
  }

  /** Disposes a rendered prop hierarchy. */
  disposeProp(group: THREE.Group): void {
    disposeTree(group);
  }
}

export const globalPropRenderer = new PropRenderer();
