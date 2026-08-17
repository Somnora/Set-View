// ---------------------------------------------------------------------------
// SetView Unreal Engine LiveLink & Real-Time WebXR VCam Streaming Engine
//
// Manages real-time WebSocket connection to Unreal Engine LiveLink companion receiver:
//  - Automatic reconnect with exponential backoff
//  - Latency round-trip ping/pong measurement
//  - Throttled high-frequency frame dispatch (Target 60/72 fps on Meta Quest 3)
//  - Motion smoothing and jitter filter integration
//  - Production tally lights and remote take record triggers
// ---------------------------------------------------------------------------

import {
  applyVcamSmoothing,
  createLiveLinkConfig,
  createVcamCommand,
  decodeLiveLinkInboundMessage,
  encodeLiveLinkCameraPacket,
  normalizeLiveLinkConfig,
  type LiveLinkCameraFrame,
  type LiveLinkConfig,
  type LiveLinkConnectionState,
  type Quat,
  type TallyState,
  type VcamCommand,
  type VcamInboundMessage,
  type Vec3,
} from './livelink.ts';

export interface VcamCameraParameters {
  focalLengthMm: number;
  apertureTStop: number;
  focusDistanceM: number;
  sensorWidthMm: number;
  sensorHeightMm: number;
  zoomNormalized?: number;
  fieldOfViewDeg?: number;
  trackingLoss?: boolean;
  batteryLevel?: number;
  timecode?: string;
  extraProperties?: Record<string, string | number | boolean>;
}

export interface LiveLinkStreamerDiagnostics {
  state: LiveLinkConnectionState;
  fps: number;
  latencyMs: number;
  framesSent: number;
  tally: TallyState;
  isRecording: boolean;
  currentTake: number;
  smoothedPosition: Vec3;
  smoothedRotation: Quat;
}

export class LiveLinkStreamer {
  private config: LiveLinkConfig;
  private ws: WebSocket | null = null;
  private state: LiveLinkConnectionState = 'disconnected';

  // Smooth filter tracking state
  private smoothPos: Vec3 = { x: 0, y: 0, z: 0 };
  private smoothRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private hasInitializedPose = false;

  // Stream Metrics & Diagnostics
  private framesSent = 0;
  private lastFrameTime = 0;
  private fpsWindowStart = 0;
  private fpsWindowFrames = 0;
  private currentFps = 0;
  private latencyMs = 0;
  private lastPingTime = 0;
  private pingTimer: number | null = null;

  // Recording & Tally State
  private isRecording = false;
  private currentTake = 1;
  private tally: TallyState = 'off';
  private frameNumber = 0;

  // Reconnection backoff
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private shouldConnect = false;

  // Event Listeners
  private stateListeners: Set<(state: LiveLinkConnectionState) => void> = new Set();
  private tallyListeners: Set<(tally: TallyState, isRecording: boolean) => void> = new Set();
  private diagnosticsListeners: Set<(diag: LiveLinkStreamerDiagnostics) => void> = new Set();
  private messageListeners: Set<(msg: VcamInboundMessage) => void> = new Set();

  constructor(initialConfig?: Partial<LiveLinkConfig>) {
    this.config = initialConfig ? normalizeLiveLinkConfig(initialConfig) : createLiveLinkConfig();
  }

  // --- Configuration Management ---------------------------------------------

  public getConfig(): LiveLinkConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<LiveLinkConfig>): void {
    const prevServer = this.config.serverUrl;
    const prevPort = this.config.port;
    this.config = normalizeLiveLinkConfig({ ...this.config, ...patch });

    if (this.ws && (this.config.serverUrl !== prevServer || this.config.port !== prevPort)) {
      this.disconnect();
      if (this.shouldConnect) {
        this.connect();
      }
    }
  }

  // --- Connection Lifecycle --------------------------------------------------

  public connect(): void {
    this.shouldConnect = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        return;
      }
      this.ws.close();
      this.ws = null;
    }

    this.setState('connecting');

    try {
      let targetUrl = this.config.serverUrl;
      if (!targetUrl.startsWith('ws://') && !targetUrl.startsWith('wss://')) {
        targetUrl = `ws://${targetUrl}`;
      }
      if (!targetUrl.includes(':', 6) && this.config.port) {
        targetUrl = `${targetUrl}:${this.config.port}`;
      }

      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPingLoop();
        this.notifyDiagnostics();
      };

      this.ws.onclose = () => {
        this.stopPingLoop();
        this.ws = null;
        if (this.shouldConnect && this.config.autoReconnect) {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = () => {
        this.setState('error');
      };

      this.ws.onmessage = (event) => {
        this.handleInboundMessage(event.data);
      };
    } catch {
      this.setState('error');
      if (this.shouldConnect && this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingLoop();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.setState('disconnected');
    this.notifyDiagnostics();
  }

  private scheduleReconnect(): void {
    this.setState('connecting');
    this.reconnectAttempts++;
    const backoffMs = Math.min(10000, this.config.reconnectIntervalMs * Math.pow(1.5, Math.min(this.reconnectAttempts - 1, 4)));

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldConnect) {
        this.connect();
      }
    }, backoffMs);
  }

  private setState(newState: LiveLinkConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const listener of this.stateListeners) {
      try {
        listener(this.state);
      } catch {
        // Keep listener exceptions isolated
      }
    }
  }

  // --- Real-Time Camera Frame Dispatch ---------------------------------------

  /**
   * Dispatches a live camera frame to Unreal Engine LiveLink receiver.
   * Applies smoothing filters and throttles to configured target frame rate.
   */
  public sendFrame(
    rawPos: Vec3,
    rawRot: Quat,
    cameraParams: VcamCameraParameters,
    dtSeconds: number,
  ): void {
    const now = Date.now();

    // 1. Initialize or apply smoothing filter
    if (!this.hasInitializedPose) {
      this.smoothPos = { ...rawPos };
      this.smoothRot = { ...rawRot };
      this.hasInitializedPose = true;
    } else {
      const smoothed = applyVcamSmoothing(
        this.smoothPos,
        this.smoothRot,
        rawPos,
        rawRot,
        this.config.smoothingPreset,
        dtSeconds,
        {
          posWeight: this.config.smoothingPosWeight,
          rotWeight: this.config.smoothingRotWeight,
        },
      );
      this.smoothPos = smoothed.position;
      this.smoothRot = smoothed.rotation;
    }

    // 2. Throttle dispatch according to target FPS
    const frameIntervalMs = 1000.0 / Math.max(10, Math.min(240, this.config.targetFps));
    if (now - this.lastFrameTime < frameIntervalMs) {
      return;
    }

    this.lastFrameTime = now;
    this.frameNumber++;

    // 3. Calculate rolling stream FPS
    if (this.fpsWindowStart === 0 || now - this.fpsWindowStart >= 1000) {
      this.currentFps = this.fpsWindowFrames;
      this.fpsWindowFrames = 0;
      this.fpsWindowStart = now;
      this.notifyDiagnostics();
    }
    this.fpsWindowFrames++;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.state !== 'streaming') {
      this.setState('streaming');
    }

    // 4. Format SMPTE or system timecode
    let timecodeStr = cameraParams.timecode;
    if (!timecodeStr) {
      const d = new Date(now);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const ff = String(Math.floor((d.getMilliseconds() / 1000) * this.config.targetFps)).padStart(2, '0');
      timecodeStr = `${hh}:${mm}:${ss}:${ff}`;
    }

    // 5. Construct frame and encode packet
    const frame: LiveLinkCameraFrame = {
      timestamp: now,
      timecode: timecodeStr,
      subjectName: this.config.subjectName,
      frameNumber: this.frameNumber,
      position: this.smoothPos,
      rotation: this.smoothRot,
      focalLengthMm: this.config.streamFocalLength ? cameraParams.focalLengthMm : 35,
      apertureTStop: this.config.streamAperture ? cameraParams.apertureTStop : 2.8,
      focusDistanceM: this.config.streamFocusDistance ? cameraParams.focusDistanceM : 3.0,
      sensorWidthMm: this.config.streamFilmback ? cameraParams.sensorWidthMm : 24.89,
      sensorHeightMm: this.config.streamFilmback ? cameraParams.sensorHeightMm : 14.0,
      isRecording: this.isRecording,
      tally: this.tally,
      zoomNormalized: cameraParams.zoomNormalized,
      fieldOfViewDeg: cameraParams.fieldOfViewDeg,
      trackingLoss: cameraParams.trackingLoss,
      batteryLevel: cameraParams.batteryLevel,
      extraProperties: cameraParams.extraProperties,
    };

    const packet = encodeLiveLinkCameraPacket(frame) + '\n';

    try {
      this.ws.send(packet);
      this.framesSent++;
    } catch {
      this.setState('error');
    }
  }

  // --- Production Tally & Record Commands -------------------------------------

  public startRecording(takeName?: string): void {
    this.isRecording = true;
    this.tally = 'recording';
    this.sendCommand(
      createVcamCommand('start_record', {
        take: this.currentTake,
        takeName: takeName || `Take_${this.currentTake}`,
        subjectName: this.config.subjectName,
      }),
    );
    this.notifyTally();
  }

  public stopRecording(): void {
    this.isRecording = false;
    this.tally = 'program';
    this.sendCommand(
      createVcamCommand('stop_record', {
        take: this.currentTake,
        subjectName: this.config.subjectName,
      }),
    );
    this.currentTake++;
    this.notifyTally();
  }

  public toggleRecording(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  public setTally(state: TallyState): void {
    this.tally = state;
    this.notifyTally();
  }

  public sendCommand(cmd: VcamCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(cmd) + '\n');
    } catch {
      // Ignore transient send failures
    }
  }

  // --- Inbound Messages & Latency --------------------------------------------

  private handleInboundMessage(rawData: unknown): void {
    const msg = decodeLiveLinkInboundMessage(rawData as string | ArrayBuffer);
    if (!msg) return;

    if (msg.type === 'pong') {
      const sentAt = typeof msg.payload === 'object' && msg.payload && 'sentAt' in msg.payload
        ? (msg.payload as { sentAt: number }).sentAt
        : this.lastPingTime;
      if (sentAt > 0) {
        this.latencyMs = Math.max(0, Date.now() - sentAt);
        this.notifyDiagnostics();
      }
    } else if (msg.type === 'tally_update') {
      if (typeof msg.payload === 'object' && msg.payload && 'tally' in msg.payload) {
        const t = (msg.payload as { tally: TallyState }).tally;
        if (t === 'off' || t === 'preview' || t === 'program' || t === 'recording') {
          this.tally = t;
          this.isRecording = t === 'recording';
          this.notifyTally();
        }
      }
    } else if (msg.type === 'take_info') {
      if (typeof msg.payload === 'object' && msg.payload && 'take' in msg.payload) {
        const tNum = (msg.payload as { take: number }).take;
        if (typeof tNum === 'number' && Number.isFinite(tNum) && tNum > 0) {
          this.currentTake = Math.round(tNum);
        }
      }
    }

    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch {
        // Keep listener exceptions isolated
      }
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.sendCommand(createVcamCommand('ping', { sentAt: this.lastPingTime }));
      }
    }, 2500);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // --- Diagnostics & Event Subscriptions -------------------------------------

  public getDiagnostics(): LiveLinkStreamerDiagnostics {
    return {
      state: this.state,
      fps: this.currentFps,
      latencyMs: this.latencyMs,
      framesSent: this.framesSent,
      tally: this.tally,
      isRecording: this.isRecording,
      currentTake: this.currentTake,
      smoothedPosition: { ...this.smoothPos },
      smoothedRotation: { ...this.smoothRot },
    };
  }

  private notifyDiagnostics(): void {
    const diag = this.getDiagnostics();
    for (const listener of this.diagnosticsListeners) {
      try {
        listener(diag);
      } catch {
        // Keep listener exceptions isolated
      }
    }
  }

  private notifyTally(): void {
    for (const listener of this.tallyListeners) {
      try {
        listener(this.tally, this.isRecording);
      } catch {
        // Keep listener exceptions isolated
      }
    }
    this.notifyDiagnostics();
  }

  public onStateChange(listener: (state: LiveLinkConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public onTallyChange(listener: (tally: TallyState, isRecording: boolean) => void): () => void {
    this.tallyListeners.add(listener);
    listener(this.tally, this.isRecording);
    return () => this.tallyListeners.delete(listener);
  }

  public onDiagnosticsUpdate(listener: (diag: LiveLinkStreamerDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(listener);
    listener(this.getDiagnostics());
    return () => this.diagnosticsListeners.delete(listener);
  }

  public onInboundMessage(listener: (msg: VcamInboundMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
}
