// ---------------------------------------------------------------------------
// Hardware & Network Runtime Streamer for DMX512 / Art-Net / sACN
//
// Manages real-time 16-universe DMX buffers, 25-44Hz streaming loop,
// bidirectional synchronization with SetView scene lights, console blackouts,
// fixture highlights, cue playback, and WebSocket / UDP proxy bridge integration.
// ---------------------------------------------------------------------------

import {
  type DmxBridgeConfig,
  type DmxCue,
  createDmxBridgeConfig,
  encodeArtDmxPacket,
  encodeSacnPacket,
  findFixtureProfile,
  mapDmxChannelsToLight,
  mapLightToDmxChannels,
  normalizeDmxBridgeConfig,
} from './dmxEngine.ts';
import type { LightData, SceneData } from './model.ts';

export type DmxConnectionState = 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error';

export interface DmxStreamerDiagnostics {
  state: DmxConnectionState;
  fps: number;
  packetsSent: number;
  packetsReceived: number;
  bytesSent: number;
  activeUniverses: number;
  lastStreamTime: number;
  lastErrorMessage?: string;
}

export type DmxUniverseUpdateListener = (universe: number, channels: Uint8Array) => void;
export type DmxDiagnosticsListener = (diagnostics: DmxStreamerDiagnostics) => void;

export class DmxStreamer {
  private config: DmxBridgeConfig;
  private universeBuffers: Uint8Array[];
  private timerId: ReturnType<typeof setInterval> | null = null;
  private socket: WebSocket | null = null;
  private connectionState: DmxConnectionState = 'disconnected';
  private packetsSent = 0;
  private packetsReceived = 0;
  private bytesSent = 0;
  private sequence = 0;
  private lastStreamTime = 0;
  private lastFpsCalcTime = 0;
  private framesSinceLastCalc = 0;
  private currentFps = 0;
  private lastErrorMessage?: string;

  private universeListeners: Set<DmxUniverseUpdateListener> = new Set();
  private diagnosticsListeners: Set<DmxDiagnosticsListener> = new Set();

  constructor(initialConfig?: Partial<DmxBridgeConfig>) {
    this.config = createDmxBridgeConfig(initialConfig);
    // 16 universes (0-15), 512 channels each
    this.universeBuffers = Array.from({ length: 16 }, () => new Uint8Array(512));
    if (this.config.enabled) {
      this.start();
    }
  }

  public getConfig(): DmxBridgeConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<DmxBridgeConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = normalizeDmxBridgeConfig({ ...this.config, ...newConfig });

    if (this.config.enabled && !wasEnabled) {
      this.start();
    } else if (!this.config.enabled && wasEnabled) {
      this.stop();
    } else if (this.config.enabled && this.timerId) {
      // Restart loop if refresh rate changed
      this.restartTimer();
    }
    this.notifyDiagnostics();
  }

  public getUniverseData(universe: number): Uint8Array {
    const u = Math.max(0, Math.min(15, universe));
    return this.universeBuffers[u];
  }

  public setChannel(universe: number, channel: number, value: number): void {
    const u = Math.max(0, Math.min(15, universe));
    const ch = Math.max(1, Math.min(512, channel)) - 1;
    const val = Math.max(0, Math.min(255, Math.floor(value)));
    this.universeBuffers[u][ch] = val;
    this.notifyUniverseUpdate(u);
  }

  public setUniverseData(universe: number, data: Uint8Array): void {
    const u = Math.max(0, Math.min(15, universe));
    const copyLen = Math.min(512, data.length);
    for (let i = 0; i < copyLen; i++) {
      this.universeBuffers[u][i] = data[i];
    }
    this.notifyUniverseUpdate(u);
  }

  public start(): void {
    if (this.timerId) return;
    this.connectionState = 'streaming';
    this.lastFpsCalcTime = Date.now();
    this.framesSinceLastCalc = 0;
    this.restartTimer();
    this.connectNetworkSocket();
    this.notifyDiagnostics();
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.disconnectNetworkSocket();
    this.connectionState = 'disconnected';
    this.currentFps = 0;
    this.notifyDiagnostics();
  }

  private restartTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    const intervalMs = Math.max(16, Math.floor(1000 / Math.max(1, this.config.refreshRateHz)));
    this.timerId = setInterval(() => this.streamTick(), intervalMs);
  }

  private connectNetworkSocket(): void {
    if (typeof WebSocket === 'undefined') return;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }

    // Connect to local DMX/UDP proxy bridge if enabled
    const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = this.config.targetIp === '127.0.0.1' || this.config.targetIp === 'localhost' ? '127.0.0.1' : this.config.targetIp;
    const wsUrl = `${protocol}//${host}:${this.config.targetPort}/dmx`;

    try {
      this.connectionState = 'connecting';
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.connectionState = 'streaming';
        this.notifyDiagnostics();
      };

      this.socket.onmessage = (event) => {
        this.packetsReceived++;
        if (event.data instanceof ArrayBuffer) {
          this.handleInboundPacket(new Uint8Array(event.data));
        }
      };

      this.socket.onerror = () => {
        // Soft fallback to offline simulation mode
        this.connectionState = 'streaming';
        this.lastErrorMessage = 'Offline simulation mode (no proxy bridge)';
        this.notifyDiagnostics();
      };

      this.socket.onclose = () => {
        if (this.config.enabled) {
          this.connectionState = 'streaming';
        } else {
          this.connectionState = 'disconnected';
        }
        this.notifyDiagnostics();
      };
    } catch (e) {
      this.connectionState = 'streaming';
      this.lastErrorMessage = e instanceof Error ? e.message : String(e);
    }
  }

  private disconnectNetworkSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
  }

  private handleInboundPacket(_packet: Uint8Array): void {
    // Inbound Art-Net or sACN packets can be decoded and merged into universe buffers
  }

  public streamTick(): void {
    this.sequence = (this.sequence + 1) & 0xff;
    this.lastStreamTime = Date.now();
    this.framesSinceLastCalc++;

    const now = Date.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      this.currentFps = Math.round((this.framesSinceLastCalc * 1000) / (now - this.lastFpsCalcTime));
      this.framesSinceLastCalc = 0;
      this.lastFpsCalcTime = now;
      this.notifyDiagnostics();
    }

    // Transmit active universes
    for (let u = 0; u < 16; u++) {
      const buffer = this.universeBuffers[u];
      let hasData = false;
      for (let i = 0; i < 512; i++) {
        if (buffer[i] > 0) {
          hasData = true;
          break;
        }
      }

      if (hasData || u === 0) {
        this.transmitUniverse(u, buffer);
      }
    }
  }

  private transmitUniverse(universe: number, channels: Uint8Array): void {
    let packet: Uint8Array;
    if (this.config.protocol === 'sacn') {
      packet = encodeSacnPacket(
        universe + 1 + this.config.universeOffset,
        channels,
        this.sequence,
        this.config.priority,
        'SetView Soundstage DMX Bridge',
      );
    } else {
      packet = encodeArtDmxPacket(
        universe + this.config.universeOffset,
        channels,
        this.sequence,
        this.config.subnet,
      );
    }

    this.packetsSent++;
    this.bytesSent += packet.byteLength;

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(packet.buffer);
      } catch (err) {
        this.lastErrorMessage = err instanceof Error ? err.message : String(err);
      }
    }
  }

  public syncFromScene(scene: SceneData): void {
    if (!scene.dmxPatches || scene.dmxPatches.length === 0) return;
    const lightsMap = new Map<string, LightData>((scene.lights ?? []).map((l) => [l.id, l]));

    for (const patch of scene.dmxPatches) {
      if (!patch.enabled) continue;
      const light = lightsMap.get(patch.lightId);
      if (!light) continue;

      const profile = findFixtureProfile(patch.fixtureProfileId);
      const u = Math.max(0, Math.min(15, patch.universe));
      mapLightToDmxChannels(
        {
          intensity: light.intensity,
          kelvin: light.colorKelvin,
          position: light.position,
        },
        profile,
        patch.startAddress,
        this.universeBuffers[u],
      );
      this.notifyUniverseUpdate(u);
    }
  }

  public syncToScene(scene: SceneData): void {
    if (!scene.dmxPatches || scene.dmxPatches.length === 0 || !scene.lights) return;
    const lightsMap = new Map<string, LightData>(scene.lights.map((l) => [l.id, l]));

    for (const patch of scene.dmxPatches) {
      if (!patch.enabled) continue;
      const light = lightsMap.get(patch.lightId);
      if (!light) continue;

      const profile = findFixtureProfile(patch.fixtureProfileId);
      const u = Math.max(0, Math.min(15, patch.universe));
      const mapped = mapDmxChannelsToLight(this.universeBuffers[u], profile, patch.startAddress);

      light.intensity = mapped.intensity;
      light.colorKelvin = mapped.kelvin;
    }
  }

  public blackoutAll(): void {
    for (let u = 0; u < 16; u++) {
      this.universeBuffers[u].fill(0);
      this.notifyUniverseUpdate(u);
    }
  }

  public highlightFixture(patchId: string, scene?: SceneData): void {
    const patches = scene?.dmxPatches;
    if (!patches) return;
    const patch = patches.find((p) => p.patchId === patchId);
    if (!patch) return;

    const u = Math.max(0, Math.min(15, patch.universe));
    const profile = findFixtureProfile(patch.fixtureProfileId);
    const baseIdx = Math.max(0, patch.startAddress - 1);

    for (const m of profile.mappings) {
      const ch = baseIdx + m.channelOffset;
      if (ch < 0 || ch >= 512) continue;
      if (m.parameter === 'dimmer' || m.parameter === 'red' || m.parameter === 'green' || m.parameter === 'blue' || m.parameter === 'white') {
        this.universeBuffers[u][ch] = 255;
        if (m.bitDepth === 16 && ch + 1 < 512) {
          this.universeBuffers[u][ch + 1] = 255;
        }
      }
    }
    this.notifyUniverseUpdate(u);
  }

  public triggerCue(cue: DmxCue | string, scene?: SceneData): void {
    let targetCue: DmxCue | undefined;
    if (typeof cue === 'string') {
      targetCue = scene?.dmxCues?.find((c) => c.cueId === cue);
    } else {
      targetCue = cue;
    }
    if (!targetCue) return;

    for (const item of targetCue.values) {
      const u = Math.max(0, Math.min(15, item.universe));
      const ch = Math.max(1, Math.min(512, item.channel)) - 1;
      this.universeBuffers[u][ch] = Math.max(0, Math.min(255, item.value));
      this.notifyUniverseUpdate(u);
    }
  }

  public onUniverseUpdate(listener: DmxUniverseUpdateListener): () => void {
    this.universeListeners.add(listener);
    return () => this.universeListeners.delete(listener);
  }

  public onDiagnostics(listener: DmxDiagnosticsListener): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  private notifyUniverseUpdate(universe: number): void {
    for (const listener of this.universeListeners) {
      listener(universe, this.universeBuffers[universe]);
    }
  }

  private notifyDiagnostics(): void {
    let activeUniverses = 0;
    for (let u = 0; u < 16; u++) {
      if (this.universeBuffers[u].some((val) => val > 0)) activeUniverses++;
    }

    const diag: DmxStreamerDiagnostics = {
      state: this.connectionState,
      fps: this.currentFps,
      packetsSent: this.packetsSent,
      packetsReceived: this.packetsReceived,
      bytesSent: this.bytesSent,
      activeUniverses,
      lastStreamTime: this.lastStreamTime,
      lastErrorMessage: this.lastErrorMessage,
    };

    for (const listener of this.diagnosticsListeners) {
      listener(diag);
    }
  }

  public getDiagnostics(): DmxStreamerDiagnostics {
    let activeUniverses = 0;
    for (let u = 0; u < 16; u++) {
      if (this.universeBuffers[u].some((val) => val > 0)) activeUniverses++;
    }

    return {
      state: this.connectionState,
      fps: this.currentFps,
      packetsSent: this.packetsSent,
      packetsReceived: this.packetsReceived,
      bytesSent: this.bytesSent,
      activeUniverses,
      lastStreamTime: this.lastStreamTime,
      lastErrorMessage: this.lastErrorMessage,
    };
  }
}
