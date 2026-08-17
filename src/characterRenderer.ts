// ---------------------------------------------------------------------------
// High-Performance Skinned Humanoid Character Renderer for SetView
//
// Target: Meta Quest 3 72fps, zero per-frame garbage collection allocations.
// Features:
//  - Procedural Skinned Mesh with THREE.Skeleton, THREE.SkinnedMesh, THREE.Bone
//  - 20-bone humanoid hierarchy with smooth 4-weight vertex skinning
//  - Real-time animation sampling, pose overrides, and Look-At / Two-Bone IK
//  - Stylized Mannequin, Realistic Humanoid, and Custom GLTF support
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  type AnimationClipData,
  type BoneTransform,
  type HumanoidBoneName,
  HUMANOID_BONE_NAMES,
  createDefaultHumanoidRig,
  sampleAnimationClip,
  solveLookAtIK,
  solveTwoBoneIK,
  STOCK_ANIMATION_CLIPS,
  v3,
} from './characterRig.ts';
import type { ActorData, SceneData, Vec3 } from './model.ts';

/** Scratch objects allocated once to guarantee zero per-frame GC allocations. */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _headWorldPos = new THREE.Vector3();
const _headWorldQuat = new THREE.Quaternion();

export interface SkinnedHumanoidInstance {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  bones: Record<HumanoidBoneName, THREE.Bone>;
  update: (timeS: number, scene?: SceneData) => void;
  dispose: () => void;
}

export class HumanoidCharacterRenderer {
  /**
   * Generates a fully skinned procedural humanoid character with bone hierarchy
   * and smooth vertex skinning weights.
   */
  static createSkinnedHumanoid(actor: ActorData): SkinnedHumanoidInstance {
    const rigDef = createDefaultHumanoidRig();
    const bonesMap = {} as Record<HumanoidBoneName, THREE.Bone>;
    const boneList: THREE.Bone[] = [];

    // 1. Construct THREE.Bone hierarchy
    for (const name of rigDef.boneOrder) {
      const bone = new THREE.Bone();
      bone.name = name;
      bonesMap[name] = bone;
      boneList.push(bone);
    }

    // Link parents & set rest positions
    for (const name of rigDef.boneOrder) {
      const node = rigDef.hierarchy.bones[name];
      const bone = bonesMap[name];
      bone.position.set(node.restPosition.x, node.restPosition.y, node.restPosition.z);
      bone.quaternion.set(node.restRotation.x, node.restRotation.y, node.restRotation.z, node.restRotation.w);

      if (node.parent) {
        bonesMap[node.parent].add(bone);
      }
    }

    const rootBone = bonesMap[rigDef.hierarchy.root];
    const skeleton = new THREE.Skeleton(boneList);

    // 2. Build procedural skinned mesh geometry
    const geometry = HumanoidCharacterRenderer.buildHumanoidGeometry(rigDef.boneOrder);

    // 3. Create materials with actor color styling
    const actorColor = new THREE.Color(actor.color || '#3b82f6');
    const skinColor = new THREE.Color('#e0ac69');
    const darkAccent = actorColor.clone().multiplyScalar(0.7);
    const clothingPants = new THREE.Color('#1e293b');
    const shoesColor = new THREE.Color('#0f172a');

    const materials: THREE.Material[] = [
      new THREE.MeshStandardMaterial({
        color: actorColor,
        roughness: 0.6,
        metalness: 0.1,
        flatShading: actor.rigType !== 'realistic_humanoid',
      }),
      new THREE.MeshStandardMaterial({
        color: skinColor,
        roughness: 0.7,
        metalness: 0.05,
        flatShading: actor.rigType !== 'realistic_humanoid',
      }),
      new THREE.MeshStandardMaterial({
        color: clothingPants,
        roughness: 0.8,
        metalness: 0.1,
        flatShading: actor.rigType !== 'realistic_humanoid',
      }),
      new THREE.MeshStandardMaterial({
        color: shoesColor,
        roughness: 0.9,
        metalness: 0.05,
      }),
      new THREE.MeshStandardMaterial({
        color: darkAccent,
        roughness: 0.5,
        metalness: 0.2,
      }),
    ];

    const skinnedMesh = new THREE.SkinnedMesh(geometry, materials);
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;

    // Add root bone and mesh to container
    const container = new THREE.Group();
    container.add(rootBone);
    container.add(skinnedMesh);

    skinnedMesh.bind(skeleton);

    // Initial pose update
    HumanoidCharacterRenderer.applyPoseToSkeleton(
      actor,
      0,
      bonesMap,
      skeleton,
    );

    const instance: SkinnedHumanoidInstance = {
      group: container,
      mesh: skinnedMesh,
      skeleton,
      bones: bonesMap,
      update: (timeS: number, scene?: SceneData) => {
        HumanoidCharacterRenderer.updateInstance(actor, timeS, bonesMap, skeleton, scene);
      },
      dispose: () => {
        geometry.dispose();
        if (Array.isArray(materials)) {
          materials.forEach((m) => m.dispose());
        }
      },
    };

    return instance;
  }

  /**
   * Builds articulated humanoid body vertex geometry with bone weights.
   */
  private static buildHumanoidGeometry(boneOrder: HumanoidBoneName[]): THREE.BufferGeometry {
    const boneIndexMap: Record<HumanoidBoneName, number> = {} as any;
    boneOrder.forEach((name, idx) => {
      boneIndexMap[name] = idx;
    });

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const indices: number[] = [];
    const materialGroups: { start: number; count: number; materialIndex: number }[] = [];

    let vertexOffset = 0;

    function addSegment(
      geom: THREE.BufferGeometry,
      bone1: HumanoidBoneName,
      bone2: HumanoidBoneName | null,
      blendFactor: number,
      matIdx: number,
      transformMatrix?: THREE.Matrix4,
    ) {
      const posAttr = geom.getAttribute('position');
      const normAttr = geom.getAttribute('normal');
      const uvAttr = geom.getAttribute('uv');
      const indexAttr = geom.getIndex();

      const b1 = boneIndexMap[bone1] ?? 0;
      const b2 = bone2 ? (boneIndexMap[bone2] ?? 0) : b1;
      const w2 = bone2 ? blendFactor : 0.0;

      const groupStart = indices.length;

      for (let i = 0; i < posAttr.count; i++) {
        _v1.fromBufferAttribute(posAttr, i);
        _v2.fromBufferAttribute(normAttr, i);

        if (transformMatrix) {
          _v1.applyMatrix4(transformMatrix);
          _v2.applyMatrix3(new THREE.Matrix3().setFromMatrix4(transformMatrix)).normalize();
        }

        positions.push(_v1.x, _v1.y, _v1.z);
        normals.push(_v2.x, _v2.y, _v2.z);

        if (uvAttr) {
          uvs.push(uvAttr.getX(i), uvAttr.getY(i));
        } else {
          uvs.push(0, 0);
        }

        // Height-based blending if dual-bone influence
        let localW2 = w2;
        if (bone2) {
          const yNormalized = Math.max(0, Math.min(1, (_v1.y + 0.2) / 0.4));
          localW2 = blendFactor * yNormalized;
        }
        const localW1 = 1.0 - localW2;

        skinIndices.push(b1, b2, 0, 0);
        skinWeights.push(localW1, localW2, 0, 0);
      }

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i++) {
          indices.push(indexAttr.getX(i) + vertexOffset);
        }
        materialGroups.push({
          start: groupStart,
          count: indexAttr.count,
          materialIndex: matIdx,
        });
      }

      vertexOffset += posAttr.count;
    }

    // Torso & Pelvis (Mat 0 = actor primary color, Mat 2 = pants)
    const torsoGeom = new THREE.CylinderGeometry(0.18, 0.14, 0.44, 12, 4);
    const mTorso = new THREE.Matrix4().makeTranslation(0, 1.15, 0);
    addSegment(torsoGeom, 'Spine', 'Spine2', 0.5, 0, mTorso);
    torsoGeom.dispose();

    const hipsGeom = new THREE.CylinderGeometry(0.14, 0.13, 0.2, 12, 2);
    const mHips = new THREE.Matrix4().makeTranslation(0, 0.92, 0);
    addSegment(hipsGeom, 'Hips', 'Spine', 0.2, 2, mHips);
    hipsGeom.dispose();

    // Head & Neck (Mat 1 = skin)
    const headGeom = new THREE.SphereGeometry(0.12, 14, 12);
    const mHead = new THREE.Matrix4().makeTranslation(0, 1.58, 0);
    addSegment(headGeom, 'Head', 'Neck', 0.1, 1, mHead);
    headGeom.dispose();

    const neckGeom = new THREE.CylinderGeometry(0.065, 0.075, 0.1, 10, 2);
    const mNeck = new THREE.Matrix4().makeTranslation(0, 1.42, 0);
    addSegment(neckGeom, 'Neck', 'Spine2', 0.3, 1, mNeck);
    neckGeom.dispose();

    // Upper Arms & Forearms (Mat 0 = shirt, Mat 1 = skin hand)
    const armGeom = new THREE.CylinderGeometry(0.045, 0.04, 0.28, 8, 3);
    const forearmGeom = new THREE.CylinderGeometry(0.04, 0.035, 0.26, 8, 3);
    const handGeom = new THREE.BoxGeometry(0.07, 0.1, 0.03);

    // Left Arm chain
    const mLArm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-0.22, 1.34, 0);
    addSegment(armGeom, 'LeftShoulder', 'LeftArm', 0.6, 0, mLArm);

    const mLForeArm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-0.48, 1.34, 0);
    addSegment(forearmGeom, 'LeftArm', 'LeftForeArm', 0.6, 0, mLForeArm);

    const mLHand = new THREE.Matrix4().setPosition(-0.68, 1.34, 0);
    addSegment(handGeom, 'LeftForeArm', 'LeftHand', 0.8, 1, mLHand);

    // Right Arm chain
    const mRArm = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(0.22, 1.34, 0);
    addSegment(armGeom, 'RightShoulder', 'RightArm', 0.6, 0, mRArm);

    const mRForeArm = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(0.48, 1.34, 0);
    addSegment(forearmGeom, 'RightArm', 'RightForeArm', 0.6, 0, mRForeArm);

    const mRHand = new THREE.Matrix4().setPosition(0.68, 1.34, 0);
    addSegment(handGeom, 'RightForeArm', 'RightHand', 0.8, 1, mRHand);

    armGeom.dispose();
    forearmGeom.dispose();
    handGeom.dispose();

    // Legs: Thighs, Calves, Feet (Mat 2 = pants, Mat 3 = shoes)
    const thighGeom = new THREE.CylinderGeometry(0.07, 0.055, 0.42, 10, 4);
    const calfGeom = new THREE.CylinderGeometry(0.055, 0.045, 0.4, 10, 4);
    const footGeom = new THREE.BoxGeometry(0.09, 0.07, 0.2);

    // Left Leg
    const mLThigh = new THREE.Matrix4().setPosition(-0.09, 0.68, 0);
    addSegment(thighGeom, 'Hips', 'LeftUpLeg', 0.7, 2, mLThigh);

    const mLCalf = new THREE.Matrix4().setPosition(-0.09, 0.26, 0);
    addSegment(calfGeom, 'LeftUpLeg', 'LeftLeg', 0.7, 2, mLCalf);

    const mLFoot = new THREE.Matrix4().setPosition(-0.09, 0.04, 0.04);
    addSegment(footGeom, 'LeftLeg', 'LeftFoot', 0.8, 3, mLFoot);

    // Right Leg
    const mRThigh = new THREE.Matrix4().setPosition(0.09, 0.68, 0);
    addSegment(thighGeom, 'Hips', 'RightUpLeg', 0.7, 2, mRThigh);

    const mRCalf = new THREE.Matrix4().setPosition(0.09, 0.26, 0);
    addSegment(calfGeom, 'RightUpLeg', 'RightLeg', 0.7, 2, mRCalf);

    const mRFoot = new THREE.Matrix4().setPosition(0.09, 0.04, 0.04);
    addSegment(footGeom, 'RightLeg', 'RightFoot', 0.8, 3, mRFoot);

    thighGeom.dispose();
    calfGeom.dispose();
    footGeom.dispose();

    // Assemble final BufferGeometry
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    bufferGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bufferGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bufferGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    bufferGeometry.setIndex(indices);

    materialGroups.forEach((g) => bufferGeometry.addGroup(g.start, g.count, g.materialIndex));

    return bufferGeometry;
  }

  /**
   * Applies animation clip, pose overrides, Look-At IK, and Two-Bone IK to the skeleton.
   */
  private static updateInstance(
    actor: ActorData,
    timeS: number,
    bonesMap: Record<HumanoidBoneName, THREE.Bone>,
    skeleton: THREE.Skeleton,
    scene?: SceneData,
  ): void {
    const speed = actor.animationSpeed ?? 1.0;
    const clipName = actor.animationClip ?? 'idle_breathing';
    const clip: AnimationClipData =
      actor.customMocap ?? STOCK_ANIMATION_CLIPS[clipName] ?? STOCK_ANIMATION_CLIPS['idle_breathing'];

    // 1. Sample clip rotations and translations
    const sampledPose = sampleAnimationClip(clip, timeS * speed);

    for (const name of HUMANOID_BONE_NAMES) {
      const bone = bonesMap[name];
      if (!bone) continue;

      const transform: BoneTransform = sampledPose[name] ?? {
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      };

      // Check per-bone manual pose override
      if (actor.poseOverrides && actor.poseOverrides[name]) {
        const ovr = actor.poseOverrides[name]!;
        bone.quaternion.set(ovr.x, ovr.y, ovr.z, ovr.w);
      } else {
        bone.quaternion.set(
          transform.rotation.x,
          transform.rotation.y,
          transform.rotation.z,
          transform.rotation.w,
        );
      }

      if (transform.position) {
        bone.position.set(transform.position.x, transform.position.y, transform.position.z);
      }
    }

    // 2. Look-At IK (orient Head and Neck towards target Camera or Actor)
    if (scene && (actor.lookAtTargetCameraId || actor.lookAtTargetActorId)) {
      let targetPosVec: Vec3 | null = null;

      if (actor.lookAtTargetCameraId) {
        const cam = scene.cameras.find((c) => c.id === actor.lookAtTargetCameraId);
        if (cam) targetPosVec = cam.position;
      } else if (actor.lookAtTargetActorId) {
        const other = scene.actors.find((a) => a.id === actor.lookAtTargetActorId);
        if (other) {
          targetPosVec = {
            x: other.position.x,
            y: other.position.y + (other.heightM ?? 1.75) * 0.9,
            z: other.position.z,
          };
        }
      }

      if (targetPosVec) {
        const headBone = bonesMap['Head'];
        if (headBone) {
          headBone.getWorldPosition(_headWorldPos);
          headBone.getWorldQuaternion(_headWorldQuat);

          const solvedQuat = solveLookAtIK(
            { x: _headWorldPos.x, y: _headWorldPos.y, z: _headWorldPos.z },
            {
              x: _headWorldQuat.x,
              y: _headWorldQuat.y,
              z: _headWorldQuat.z,
              w: _headWorldQuat.w,
            },
            targetPosVec,
            45,
            70,
          );

          // Convert solved world rotation back to bone local rotation
          const parentQuat = headBone.parent ? headBone.parent.getWorldQuaternion(_q1) : _q1.identity();
          _q2.set(solvedQuat.x, solvedQuat.y, solvedQuat.z, solvedQuat.w);
          headBone.quaternion.copy(parentQuat.invert().multiply(_q2));
        }
      }
    }

    // 3. Two-Bone IK End-Effector Targets (L/R hands & feet)
    if (actor.ikTargets) {
      if (actor.ikTargets.rightHand) {
        HumanoidCharacterRenderer.applyTwoBoneIKToChain(
          bonesMap['RightArm'],
          bonesMap['RightForeArm'],
          bonesMap['RightHand'],
          actor.ikTargets.rightHand,
          v3(0, -1, 0),
          0.28,
          0.26,
        );
      }
      if (actor.ikTargets.leftHand) {
        HumanoidCharacterRenderer.applyTwoBoneIKToChain(
          bonesMap['LeftArm'],
          bonesMap['LeftForeArm'],
          bonesMap['LeftHand'],
          actor.ikTargets.leftHand,
          v3(0, -1, 0),
          0.28,
          0.26,
        );
      }
    }

    // Notify skeleton of bone updates
    skeleton.update();
  }

  private static applyTwoBoneIKToChain(
    rootBone: THREE.Bone,
    midBone: THREE.Bone,
    endBone: THREE.Bone,
    target: Vec3,
    pole: Vec3,
    upperLen: number,
    lowerLen: number,
  ): void {
    if (!rootBone || !midBone || !endBone) return;

    rootBone.getWorldPosition(_v1);
    midBone.getWorldPosition(_v2);
    endBone.getWorldPosition(_v3);

    const ik = solveTwoBoneIK(
      { x: _v1.x, y: _v1.y, z: _v1.z },
      { x: _v2.x, y: _v2.y, z: _v2.z },
      { x: _v3.x, y: _v3.y, z: _v3.z },
      target,
      pole,
      upperLen,
      lowerLen,
    );

    _q1.set(ik.rootRotation.x, ik.rootRotation.y, ik.rootRotation.z, ik.rootRotation.w);
    rootBone.quaternion.multiply(_q1);

    _q2.set(ik.midRotation.x, ik.midRotation.y, ik.midRotation.z, ik.midRotation.w);
    midBone.quaternion.multiply(_q2);
  }

  private static applyPoseToSkeleton(
    actor: ActorData,
    timeS: number,
    bonesMap: Record<HumanoidBoneName, THREE.Bone>,
    skeleton: THREE.Skeleton,
  ): void {
    const clipName = actor.animationClip ?? 'idle_breathing';
    const clip = actor.customMocap ?? STOCK_ANIMATION_CLIPS[clipName] ?? STOCK_ANIMATION_CLIPS['idle_breathing'];
    const sampledPose = sampleAnimationClip(clip, timeS);

    for (const name of HUMANOID_BONE_NAMES) {
      const bone = bonesMap[name];
      if (!bone) continue;
      const t = sampledPose[name];
      if (t) {
        bone.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
        if (t.position) bone.position.set(t.position.x, t.position.y, t.position.z);
      }
    }
    skeleton.update();
  }
}
