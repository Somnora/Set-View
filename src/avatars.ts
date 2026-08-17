// ---------------------------------------------------------------------------
// Multi-User Avatar & Spatial Presence Visualization System
//
// Renders 3D VR avatars for remote connected peers:
//   - Stylized VR headset visor with role accent colors (Director, DP, Gaffer, etc.)
//   - Floating billboard nameplates with role badges and speaking waveforms
//   - Left and right controller/hand gizmos with pinch/pointing states
//   - Spatial laser pointer beams and surface target rings
//   - Zero-allocation render loop (updates transforms and visibility in place)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { COLLAB_ROLES, type PeerPresence, type CollabRole } from './collab.ts';

/** Visual representation of a single remote peer in the 3D scene. */
export class RemotePeerAvatar {
  readonly group = new THREE.Group();
  readonly headGroup = new THREE.Group();
  readonly leftHandGroup = new THREE.Group();
  readonly rightHandGroup = new THREE.Group();

  // Headset geometry & materials
  private visorMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private roleMaterial: THREE.MeshStandardMaterial;

  // Billboard nameplate canvas
  private labelSprite: THREE.Sprite;
  private labelCanvas: HTMLCanvasElement;
  private labelCtx: CanvasRenderingContext2D;
  private labelTexture: THREE.CanvasTexture;

  // Laser pointer line and reticle
  private laserLine: THREE.Line;
  private laserReticle: THREE.Mesh;
  private laserPositions = new Float32Array(6); // 2 points * 3 coords

  // Hand models
  private leftHandMesh: THREE.Mesh;
  private rightHandMesh: THREE.Mesh;

  readonly peerId: string;
  private currentName = '';
  private currentRole: CollabRole = 'observer';
  private currentColor = '#3b82f6';
  private wasSpeaking = false;
  private lastRenderedLevel = 0;

  constructor(peerId: string, initialRole: CollabRole = 'director', initialColor = '#3b82f6') {
    this.peerId = peerId;
    this.currentRole = initialRole;
    this.currentColor = initialColor;

    // Build Headset
    this.roleMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialColor),
      roughness: 0.35,
      metalness: 0.1,
    });

    const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.14);
    this.headMesh = new THREE.Mesh(headGeo, this.roleMaterial);
    this.headMesh.position.set(0, 0, -0.02);
    this.headGroup.add(this.headMesh);

    const visorGeo = new THREE.BoxGeometry(0.16, 0.06, 0.04);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.position.set(0, 0, -0.09);
    this.headGroup.add(this.visorMesh);

    // Glowing visor accent strip
    const stripGeo = new THREE.BoxGeometry(0.14, 0.012, 0.01);
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(initialColor) });
    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.position.set(0, 0, -0.111);
    this.headGroup.add(stripMesh);

    // Billboard Nameplate
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 128;
    this.labelCtx = this.labelCanvas.getContext('2d')!;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthTest: false,
    });
    this.labelSprite = new THREE.Sprite(spriteMat);
    this.labelSprite.position.set(0, 0.22, 0);
    this.labelSprite.scale.set(0.6, 0.15, 1);
    this.headGroup.add(this.labelSprite);

    // Hands
    const handGeo = new THREE.BoxGeometry(0.05, 0.04, 0.1);
    this.leftHandMesh = new THREE.Mesh(handGeo, this.roleMaterial);
    this.leftHandGroup.add(this.leftHandMesh);
    this.leftHandGroup.visible = false;

    this.rightHandMesh = new THREE.Mesh(handGeo, this.roleMaterial);
    this.rightHandGroup.add(this.rightHandMesh);
    this.rightHandGroup.visible = false;

    // Laser Line
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.BufferAttribute(this.laserPositions, 3));
    const laserMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(initialColor),
      transparent: true,
      opacity: 0.75,
      linewidth: 2,
    });
    this.laserLine = new THREE.Line(laserGeo, laserMat);
    this.laserLine.frustumCulled = false;
    this.laserLine.visible = false;

    // Surface Hit Reticle
    const reticleGeo = new THREE.RingGeometry(0.04, 0.06, 24);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(initialColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.laserReticle = new THREE.Mesh(reticleGeo, reticleMat);
    this.laserReticle.rotation.x = -Math.PI / 2;
    this.laserReticle.visible = false;

    // Assemble root group
    this.group.add(this.headGroup);
    this.group.add(this.leftHandGroup);
    this.group.add(this.rightHandGroup);
    this.group.add(this.laserLine);
    this.group.add(this.laserReticle);
  }

  /** Updates avatar transform, hands, laser, and speaking indicators. Zero allocations. */
  update(presence: PeerPresence): void {
    // 1. Update Head Transform
    this.headGroup.position.set(
      presence.headPose.position.x,
      presence.headPose.position.y,
      presence.headPose.position.z,
    );
    this.headGroup.quaternion.set(
      presence.headPose.rotation.x,
      presence.headPose.rotation.y,
      presence.headPose.rotation.z,
      presence.headPose.rotation.w,
    );

    // 2. Update Left Hand
    if (presence.handLeft) {
      this.leftHandGroup.visible = true;
      this.leftHandGroup.position.set(
        presence.handLeft.position.x,
        presence.handLeft.position.y,
        presence.handLeft.position.z,
      );
      this.leftHandGroup.quaternion.set(
        presence.handLeft.rotation.x,
        presence.handLeft.rotation.y,
        presence.handLeft.rotation.z,
        presence.handLeft.rotation.w,
      );
    } else {
      this.leftHandGroup.visible = false;
    }

    // 3. Update Right Hand
    if (presence.handRight) {
      this.rightHandGroup.visible = true;
      this.rightHandGroup.position.set(
        presence.handRight.position.x,
        presence.handRight.position.y,
        presence.handRight.position.z,
      );
      this.rightHandGroup.quaternion.set(
        presence.handRight.rotation.x,
        presence.handRight.rotation.y,
        presence.handRight.rotation.z,
        presence.handRight.rotation.w,
      );
    } else {
      this.rightHandGroup.visible = false;
    }

    // 4. Update Laser Pointer
    if (presence.pointerRay && presence.pointerRay.hitPoint) {
      this.laserLine.visible = true;
      this.laserReticle.visible = true;

      const pos = this.laserPositions;
      pos[0] = presence.pointerRay.origin.x;
      pos[1] = presence.pointerRay.origin.y;
      pos[2] = presence.pointerRay.origin.z;

      pos[3] = presence.pointerRay.hitPoint.x;
      pos[4] = presence.pointerRay.hitPoint.y;
      pos[5] = presence.pointerRay.hitPoint.z;

      (this.laserLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      this.laserReticle.position.set(
        presence.pointerRay.hitPoint.x,
        presence.pointerRay.hitPoint.y + 0.01,
        presence.pointerRay.hitPoint.z,
      );
    } else {
      this.laserLine.visible = false;
      this.laserReticle.visible = false;
    }

    // 5. Update Color / Role changes
    if (presence.color !== this.currentColor || presence.role !== this.currentRole) {
      this.currentColor = presence.color;
      this.currentRole = presence.role;
      this.roleMaterial.color.set(this.currentColor);
      this.redrawLabel(presence);
    }

    // 6. Update Speaking / Audio waveform
    const speakingChanged = presence.isSpeaking !== this.wasSpeaking;
    const volDelta = Math.abs(presence.audioVolume - this.lastRenderedLevel);
    if (presence.name !== this.currentName || speakingChanged || (presence.isSpeaking && volDelta > 0.1)) {
      this.currentName = presence.name;
      this.wasSpeaking = presence.isSpeaking;
      this.lastRenderedLevel = presence.audioVolume;
      this.redrawLabel(presence);
    }
  }

  private redrawLabel(presence: PeerPresence): void {
    const ctx = this.labelCtx;
    const w = this.labelCanvas.width;
    const h = this.labelCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background rounded pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(16, 16, w - 32, h - 32, 24);
    ctx.fill();

    // Role Accent Border
    ctx.strokeStyle = presence.color || '#3b82f6';
    ctx.lineWidth = presence.isSpeaking ? 6 : 3;
    ctx.stroke();

    // Role Badge Pill
    const meta = COLLAB_ROLES[presence.role] ?? COLLAB_ROLES.director;
    ctx.fillStyle = presence.color || '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(36, 36, 92, 56, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.badgeLabel, 82, 64);

    // Peer Name
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(presence.name.slice(0, 16), 146, 64);

    // Speaking soundwave animation bars
    if (presence.isSpeaking) {
      const vol = Math.max(0.2, presence.audioVolume);
      ctx.fillStyle = '#22c55e';
      for (let i = 0; i < 4; i++) {
        const barH = 16 + Math.sin(Date.now() * 0.01 + i * 1.5) * 12 * vol;
        ctx.fillRect(430 + i * 12, 64 - barH / 2, 6, barH);
      }
    }

    this.labelTexture.needsUpdate = true;
  }

  dispose(): void {
    this.headMesh.geometry.dispose();
    this.visorMesh.geometry.dispose();
    this.roleMaterial.dispose();
    this.labelTexture.dispose();
    this.laserLine.geometry.dispose();
    (this.laserLine.material as THREE.Material).dispose();
    this.laserReticle.geometry.dispose();
    (this.laserReticle.material as THREE.Material).dispose();
    this.leftHandMesh.geometry.dispose();
    this.rightHandMesh.geometry.dispose();
  }
}

/** Manages multiple remote peer avatars in the Three.js scene. */
export class CollabAvatarManager {
  readonly group = new THREE.Group();
  private avatars = new Map<string, RemotePeerAvatar>();

  /** Updates or creates avatar for a remote peer. */
  updatePeer(presence: PeerPresence): void {
    let avatar = this.avatars.get(presence.id);
    if (!avatar) {
      avatar = new RemotePeerAvatar(presence.id, presence.role, presence.color);
      this.avatars.set(presence.id, avatar);
      this.group.add(avatar.group);
    }
    avatar.update(presence);
  }

  /** Removes avatar when peer disconnects. */
  removePeer(peerId: string): void {
    const avatar = this.avatars.get(peerId);
    if (avatar) {
      this.group.remove(avatar.group);
      avatar.dispose();
      this.avatars.delete(peerId);
    }
  }

  /** Removes all avatars on session reset. */
  clear(): void {
    for (const avatar of this.avatars.values()) {
      this.group.remove(avatar.group);
      avatar.dispose();
    }
    this.avatars.clear();
  }

  get count(): number {
    return this.avatars.size;
  }
}
