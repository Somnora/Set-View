// ---------------------------------------------------------------------------
// WebRTC Multi-User Networking & Spatial Voice Chat Engine
//
// Manages real-time peer-to-peer data channels and spatial voice chat streams:
//   - RTCPeerConnection mesh with STUN servers
//   - High-rate presence channels (unreliable/ordered) and scene channels (reliable)
//   - Web Audio 3D spatialized voice stream processing & volume analyzer
//   - Local BroadcastChannel fallback for multi-window / testing / LAN
// ---------------------------------------------------------------------------

import {
  deserializeCollabMessage,
  generatePatchId,
  generatePeerId,
  serializeCollabMessage,
  type CollabMessage,
  type CollabRole,
  type CollabScenePatch,
  type DeviceType,
  type EntityLock,
  type PeerPresence,
} from './collab.ts';
import type { SceneData, Vec3, Quat } from './model.ts';

export interface CollabSessionOptions {
  roomCode?: string;
  localName?: string;
  localRole?: CollabRole;
  localColor?: string;
  deviceType?: DeviceType;
  enableVoiceChat?: boolean;
  stunServers?: string[];
  onPeerJoined?: (peer: PeerPresence) => void;
  onPeerLeft?: (peerId: string) => void;
  onPeerPresence?: (peerId: string, presence: Partial<PeerPresence>) => void;
  onPresence?: (presence: PeerPresence) => void;
  onPatch?: (patch: CollabScenePatch) => void;
  onScenePatch?: (patch: CollabScenePatch, sourcePeerId: string) => void;
  onLock?: (lock: EntityLock) => void;
  onUnlock?: (entityId: string, peerId: string) => void;
  onSnapshotRequest?: (requesterPeerId: string) => void;
  onSnapshotRequested?: (requesterPeerId: string) => SceneData | null;
  onSnapshotReceived?: (sceneData: SceneData, locks?: EntityLock[]) => void;
  onAudioStream?: (peerId: string, stream: MediaStream) => void;
}

export type CollabConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface RemotePeerConnection {
  peerId: string;
  dataChannelReliable?: RTCDataChannel;
  dataChannelFast?: RTCDataChannel;
  rtcConnection?: RTCPeerConnection;
  remoteStream?: MediaStream;
  pannerNode?: PannerNode | StereoPannerNode;
  gainNode?: GainNode;
  analyserNode?: AnalyserNode;
  audioElement?: HTMLAudioElement;
  lastPingSentAt?: number;
  rttMs: number;
}

export class WebRtcCollabSession {
  readonly localPeerId: string;
  roomCode: string;
  localName: string;
  localRole: CollabRole;
  localColor: string;
  deviceType: DeviceType;
  state: CollabConnectionState = 'disconnected';
  isHost = false;

  // Connected peers
  private peers = new Map<string, RemotePeerConnection>();

  // Signaling mechanisms
  private broadcastChannel: BroadcastChannel | null = null;
  readonly stunServers: RTCIceServer[];

  // Local Voice Chat & Web Audio
  private localAudioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localGain: GainNode | null = null;
  private isMuted = false;
  private isSpeaking = false;
  private speakingThreshold = 0.04;
  private localVolumeLevel = 0;

  // Callbacks
  onStateChange?: (state: CollabConnectionState) => void;
  onPeerJoined?: (peer: PeerPresence) => void;
  onPeerLeft?: (peerId: string) => void;
  onPeerPresence?: (peerId: string, presence: Partial<PeerPresence>) => void;
  onPresence?: (presence: PeerPresence) => void;
  onPatch?: (patch: CollabScenePatch) => void;
  onScenePatch?: (patch: CollabScenePatch, sourcePeerId: string) => void;
  onLock?: (lock: EntityLock) => void;
  onUnlock?: (entityId: string, peerId: string) => void;
  onSnapshotRequest?: (requesterPeerId: string) => void;
  onSnapshotRequested?: (requesterPeerId: string) => SceneData | null;
  onSnapshotReceived?: (sceneData: SceneData, locks?: EntityLock[]) => void;
  onAudioStream?: (peerId: string, stream: MediaStream) => void;
  onLockGranted?: (entityId: string, peerId: string, expiresAtTs: number) => void;
  onLockRejected?: (entityId: string, peerId: string, currentOwnerId: string) => void;
  onLockReleased?: (entityId: string, peerId: string) => void;
  onLaserPing?: (peerId: string, origin: Vec3, hitPoint: Vec3, label?: string) => void;
  onDirectorCue?: (peerId: string, cueText: string) => void;
  onLog?: (msg: string) => void;

  constructor(options: CollabSessionOptions = {}) {
    this.localPeerId = generatePeerId();
    this.roomCode = (options.roomCode || 'SET-001').toUpperCase();
    this.localName = options.localName || 'Director';
    this.localRole = options.localRole || 'director';
    this.localColor = options.localColor || '#3b82f6';
    this.deviceType = options.deviceType || 'desktop';
    this.stunServers = (options.stunServers || ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']).map(
      (urls) => ({ urls }),
    );
    this.onPeerJoined = options.onPeerJoined;
    this.onPeerLeft = options.onPeerLeft;
    this.onPeerPresence = options.onPeerPresence;
    this.onPresence = options.onPresence;
    this.onPatch = options.onPatch;
    this.onScenePatch = options.onScenePatch;
    this.onLock = options.onLock;
    this.onUnlock = options.onUnlock;
    this.onSnapshotRequest = options.onSnapshotRequest;
    this.onSnapshotRequested = options.onSnapshotRequested;
    this.onSnapshotReceived = options.onSnapshotReceived;
    this.onAudioStream = options.onAudioStream;
  }

  /** Starts the collaboration session and joins the specified room code. */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.setState('connecting');
    this.log(`Connecting to collaborative room [${this.roomCode}] as ${this.localName} (${this.localRole})...`);

    try {
      // Initialize Web Audio Context if available
      this.initAudioContext();

      // Initialize BroadcastChannel signaling for multi-tab and local mesh testing
      if (typeof BroadcastChannel !== 'undefined') {
        const chanName = `setview_collab_${this.roomCode}`;
        this.broadcastChannel = new BroadcastChannel(chanName);
        this.broadcastChannel.onmessage = (e) => this.handleRawMessage(e.data);
      }

      // Announce Join to room
      this.broadcastMessage({
        type: 'join',
        peerId: this.localPeerId,
        name: this.localName,
        role: this.localRole,
        color: this.localColor,
        deviceType: this.deviceType,
        clientVersion: '1.0.0',
      });

      // Request latest scene snapshot
      this.broadcastMessage({
        type: 'snapshot_request',
        requesterId: this.localPeerId,
      });

      this.setState('connected');
    } catch (err) {
      this.log(`Collab connect error: ${(err as Error).message}`);
      this.setState('disconnected');
    }
  }

  /** Leaves the session and cleans up WebRTC channels and audio streams. */
  disconnect(): void {
    if (this.state === 'disconnected') return;

    this.broadcastMessage({
      type: 'leave',
      peerId: this.localPeerId,
      reason: 'User disconnected',
    });

    // Close all peer connections
    for (const [peerId, conn] of this.peers.entries()) {
      try {
        conn.dataChannelFast?.close();
        conn.dataChannelReliable?.close();
        conn.rtcConnection?.close();
        conn.audioElement?.remove();
      } catch {
        // Ignore cleanup errors
      }
      this.peers.delete(peerId);
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((t) => t.stop());
      this.localAudioStream = null;
    }

    this.setState('disconnected');
    this.log(`Disconnected from room [${this.roomCode}].`);
  }

  /** Broadcasts a high-frequency presence frame (headset pose, controller poses, gaze/pointer). */
  sendPresence(presence: Partial<PeerPresence>): void {
    if (this.state !== 'connected') return;

    // Update speaking detection from local audio level
    this.updateLocalSpeakingState();
    presence.isSpeaking = this.isSpeaking;
    presence.isMuted = this.isMuted;
    presence.audioVolume = this.localVolumeLevel;

    this.broadcastMessage({
      type: 'presence',
      peerId: this.localPeerId,
      presence,
    });
  }

  /** Broadcasts a scene mutation patch across all connected peers. */
  sendScenePatch(patch: CollabScenePatch): void {
    if (this.state !== 'connected') return;

    const msg: CollabMessage = {
      type: 'scene_patch',
      patchId: generatePatchId(),
      sourcePeerId: this.localPeerId,
      patch,
      ts: Date.now(),
    };

    this.broadcastMessage(msg);
  }

  /** Alias for sendScenePatch. */
  broadcastPatch(patch: CollabScenePatch): void {
    this.sendScenePatch(patch);
  }

  /** Requests an exclusive edit lock for an entity. */
  requestLock(entityId: string, entityType: 'actor' | 'camera' | 'light' | 'audioCue' | 'prop'): void {
    if (this.state !== 'connected') return;
    this.broadcastMessage({
      type: 'lock_request',
      entityId,
      entityType,
      peerId: this.localPeerId,
    });
  }

  /** Releases an edit lock. */
  releaseLock(entityId: string): void {
    if (this.state !== 'connected') return;
    this.broadcastMessage({
      type: 'lock_released',
      entityId,
      peerId: this.localPeerId,
    });
  }

  /** Sends a spatial laser pointer ping to draw peer attention. */
  sendLaserPing(origin: Vec3, hitPoint: Vec3, label?: string): void {
    if (this.state !== 'connected') return;
    this.broadcastMessage({
      type: 'laser_ping',
      peerId: this.localPeerId,
      origin,
      hitPoint,
      label,
    });
  }

  /** Sends a director prompt cue or blocking instruction banner. */
  sendDirectorCue(cueText: string, targetActorId?: string, targetCameraId?: string): void {
    if (this.state !== 'connected') return;
    this.broadcastMessage({
      type: 'director_cue',
      peerId: this.localPeerId,
      cueText,
      targetActorId,
      targetCameraId,
    });
  }

  /** Responds to a snapshot request with current SceneData and active locks. */
  sendSnapshotResponse(sceneData: SceneData, locks: EntityLock[]): void {
    if (this.state !== 'connected') return;
    this.broadcastMessage({
      type: 'snapshot_response',
      sceneData,
      roomCode: this.roomCode,
      hostPeerId: this.localPeerId,
      locks,
    });
  }

  /** Enables or disables microphone voice capture. */
  async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    this.isMuted = !enabled;
    if (enabled && !this.localAudioStream) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          this.localAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });

          if (this.audioContext && this.localAudioStream) {
            const micSource = this.audioContext.createMediaStreamSource(this.localAudioStream);
            this.localAnalyser = this.audioContext.createAnalyser();
            this.localAnalyser.fftSize = 256;
            this.localGain = this.audioContext.createGain();
            this.localGain.gain.value = 1.0;
            micSource.connect(this.localGain);
            this.localGain.connect(this.localAnalyser);
          }
        }
      } catch (err) {
        this.log(`Microphone access error: ${(err as Error).message}`);
        this.isMuted = true;
        return false;
      }
    } else if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    }
    return !this.isMuted;
  }

  /** Toggles microphone mute state. */
  async toggleMute(): Promise<boolean> {
    return this.setMicrophoneEnabled(this.isMuted);
  }

  /** Gets whether microphone is currently muted. */
  get muted(): boolean {
    return this.isMuted;
  }

  /** Gets current local voice audio level (0.0 to 1.0). */
  get voiceLevel(): number {
    return this.localVolumeLevel;
  }

  /** Updates spatial positioning for a remote peer's 3D voice audio. */
  updatePeerSpatialVoice(peerId: string, _listenerPos: Vec3, _listenerRot: Quat, speakerPos: Vec3): void {
    const conn = this.peers.get(peerId);
    if (!conn || !this.audioContext) return;

    if (conn.pannerNode && conn.pannerNode instanceof PannerNode) {
      const p = conn.pannerNode;
      const t = this.audioContext.currentTime + 0.05;
      p.positionX.setTargetAtTime(speakerPos.x, t, 0.05);
      p.positionY.setTargetAtTime(speakerPos.y, t, 0.05);
      p.positionZ.setTargetAtTime(speakerPos.z, t, 0.05);
    }
  }

  /** Updates listener spatial pose for 3D HRTF voice rendering. */
  updateListenerPose(pos: Vec3, _rot?: Quat): void {
    if (!this.audioContext) return;
    const listener = this.audioContext.listener;
    if (listener) {
      if (listener.positionX) {
        const t = this.audioContext.currentTime + 0.05;
        listener.positionX.setTargetAtTime(pos.x, t, 0.05);
        listener.positionY.setTargetAtTime(pos.y, t, 0.05);
        listener.positionZ.setTargetAtTime(pos.z, t, 0.05);
      } else {
        listener.setPosition(pos.x, pos.y, pos.z);
      }
    }
  }

  /** High-frequency presence broadcast alias. */
  broadcastPresence(presence: Partial<PeerPresence>): void {
    this.sendPresence(presence);
  }

  /** Connects to a specific collaborative room with specified user credentials. */
  async joinRoom(roomCode: string, name: string, role: CollabRole, color?: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      this.disconnect();
    }
    this.roomCode = roomCode.toUpperCase();
    this.localName = name;
    this.localRole = role;
    if (color) this.localColor = color;
    await this.connect();
  }

  /** Disconnects from collaborative room. */
  leaveRoom(): void {
    this.disconnect();
  }

  /** Sends snapshot to requester or entire room. */
  sendSnapshot(_requesterPeerId: string, sceneData: SceneData, locks: EntityLock[] = []): void {
    this.sendSnapshotResponse(sceneData, locks);
  }

  /** Attaches incoming remote WebRTC audio stream into spatial audio graph. */
  setupRemoteAudio(peerId: string, stream: MediaStream): void {
    if (!this.audioContext) return;
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const panner = this.audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 30;
      panner.rolloffFactor = 1;

      const gain = this.audioContext.createGain();
      gain.gain.value = 1.0;

      source.connect(panner);
      panner.connect(gain);
      gain.connect(this.audioContext.destination);

      const conn = this.peers.get(peerId);
      if (conn) {
        conn.remoteStream = stream;
        conn.pannerNode = panner;
        conn.gainNode = gain;
      }
    } catch {
      // ignore audio graph setup error
    }
  }

  // --- Internal Message Dispatch --------------------------------------------

  private broadcastMessage(msg: CollabMessage): void {
    const raw = serializeCollabMessage(msg);

    // 1. Send via local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(raw);
      } catch {
        // ignore channel buffer errors
      }
    }

    // 2. Send via WebRTC DataChannels to remote peers
    for (const conn of this.peers.values()) {
      try {
        if (msg.type === 'presence' && conn.dataChannelFast && conn.dataChannelFast.readyState === 'open') {
          conn.dataChannelFast.send(raw);
        } else if (conn.dataChannelReliable && conn.dataChannelReliable.readyState === 'open') {
          conn.dataChannelReliable.send(raw);
        }
      } catch {
        // ignore socket send errors
      }
    }
  }

  private handleRawMessage(rawData: string | ArrayBuffer): void {
    if (typeof rawData !== 'string') return;
    const msg = deserializeCollabMessage(rawData);
    if (!msg) return;

    // Ignore messages from self
    if ('peerId' in msg && msg.peerId === this.localPeerId) return;
    if ('senderId' in msg && msg.senderId === this.localPeerId) return;
    if ('sourcePeerId' in msg && msg.sourcePeerId === this.localPeerId) return;

    switch (msg.type) {
      case 'join': {
        const peer: PeerPresence = {
          id: msg.peerId,
          name: msg.name,
          role: msg.role,
          color: msg.color,
          deviceType: msg.deviceType,
          headPose: {
            position: { x: 0, y: 1.6, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          isSpeaking: false,
          isMuted: false,
          audioVolume: 0,
          pingMs: 0,
          joinedAtTs: Date.now(),
          lastSeenTs: Date.now(),
        };
        this.onPeerJoined?.(peer);
        // Respond with presence
        this.sendPresence({
          name: this.localName,
          role: this.localRole,
          color: this.localColor,
          deviceType: this.deviceType,
        });
        break;
      }
      case 'leave': {
        this.peers.delete(msg.peerId);
        this.onPeerLeft?.(msg.peerId);
        break;
      }
      case 'presence': {
        this.onPeerPresence?.(msg.peerId, msg.presence);
        this.onPresence?.({ ...msg.presence, id: msg.peerId } as PeerPresence);
        break;
      }
      case 'snapshot_request': {
        this.onSnapshotRequest?.(msg.requesterId);
        if (this.onSnapshotRequested) {
          const snapshot = this.onSnapshotRequested(msg.requesterId);
          if (snapshot) {
            this.sendSnapshotResponse(snapshot, []);
          }
        }
        break;
      }
      case 'snapshot_response': {
        this.onSnapshotReceived?.(msg.sceneData, msg.locks);
        break;
      }
      case 'scene_patch': {
        this.onScenePatch?.(msg.patch, msg.sourcePeerId);
        this.onPatch?.(msg.patch);
        break;
      }
      case 'lock_granted': {
        this.onLockGranted?.(msg.entityId, msg.peerId, msg.expiresAtTs);
        this.onLock?.({
          entityId: msg.entityId,
          entityType: 'actor',
          lockedByPeerId: msg.peerId,
          lockedAtTs: Date.now(),
          expiresAtTs: msg.expiresAtTs,
        });
        break;
      }
      case 'lock_rejected': {
        this.onLockRejected?.(msg.entityId, msg.peerId, msg.currentOwnerId);
        break;
      }
      case 'lock_released': {
        this.onLockReleased?.(msg.entityId, msg.peerId);
        this.onUnlock?.(msg.entityId, msg.peerId);
        break;
      }
      case 'laser_ping': {
        this.onLaserPing?.(msg.peerId, msg.origin, msg.hitPoint, msg.label);
        break;
      }
      case 'director_cue': {
        this.onDirectorCue?.(msg.peerId, msg.cueText);
        break;
      }
      case 'ping': {
        this.broadcastMessage({
          type: 'pong',
          senderId: this.localPeerId,
          originalClientTs: msg.clientTs,
          serverTs: Date.now(),
        });
        break;
      }
      case 'pong': {
        const rtt = Date.now() - msg.originalClientTs;
        const conn = this.peers.get(msg.senderId);
        if (conn) conn.rttMs = rtt;
        break;
      }
    }
  }

  private updateLocalSpeakingState(): void {
    if (this.isMuted || !this.localAnalyser) {
      this.isSpeaking = false;
      this.localVolumeLevel = 0;
      return;
    }

    const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
    this.localAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length / 255;
    this.localVolumeLevel = Math.min(1.0, avg * 3.0);
    this.isSpeaking = this.localVolumeLevel > this.speakingThreshold;
  }

  private initAudioContext(): void {
    if (!this.audioContext && typeof AudioContext !== 'undefined') {
      try {
        this.audioContext = new AudioContext();
      } catch {
        // AudioContext may require user gesture on web browsers
      }
    }
  }

  private setState(newState: CollabConnectionState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private log(msg: string): void {
    this.onLog?.(msg);
  }
}
