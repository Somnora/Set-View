// ---------------------------------------------------------------------------
// SetView Spatial Sound Engine — Web Audio 3D spatialization & synth playback
// Manages real-time 3D sound positioning, procedural audio synthesizers,
// scratch microphone recording, and timeline-synchronized cue playback.
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';
import {
  type AudioCueData,
  type AudioCueType,
  evaluateCueSpatialPosition,
} from './audioCues.ts';

interface ActiveVoice {
  cueId: string;
  sourceNode: AudioNode;
  pannerNode: PannerNode | null;
  gainNode: GainNode;
  startedAtContextTime: number;
  durationS: number;
  offsetS: number;
}

export class SpatialSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices = new Map<string, ActiveVoice>();
  private lastEvaluatedTimeS = -1;
  private audioBufferCache = new Map<string, AudioBuffer>();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor() {
    // AudioContext will be initialized on first user interaction or explicit start
  }

  /** Ensures AudioContext is created and running. */
  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Updates listener pose (director's head/camera in scene-space meters).
   */
  public updateListenerPose(position: Vec3, forward: Vec3 = { x: 0, y: 0, z: -1 }, up: Vec3 = { x: 0, y: 1, z: 0 }): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const listener = ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, ctx.currentTime);
      listener.positionY.setValueAtTime(position.y, ctx.currentTime);
      listener.positionZ.setValueAtTime(position.z, ctx.currentTime);
      listener.forwardX.setValueAtTime(forward.x, ctx.currentTime);
      listener.forwardY.setValueAtTime(forward.y, ctx.currentTime);
      listener.forwardZ.setValueAtTime(forward.z, ctx.currentTime);
      listener.upX.setValueAtTime(up.x, ctx.currentTime);
      listener.upY.setValueAtTime(up.y, ctx.currentTime);
      listener.upZ.setValueAtTime(up.z, ctx.currentTime);
    } else if ('setPosition' in listener) {
      // Legacy Web Audio fallback
      (listener as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(position.x, position.y, position.z);
      (listener as unknown as { setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void }).setOrientation(
        forward.x,
        forward.y,
        forward.z,
        up.x,
        up.y,
        up.z,
      );
    }
  }

  /**
   * Synchronizes spatial sound voices with the playback timeline.
   */
  public syncTimeline(
    cues: readonly AudioCueData[],
    currentTimeS: number,
    isPlaying: boolean,
    playbackRate = 1.0,
    actorPositions: ReadonlyMap<string, Vec3> = new Map(),
    cameraPositions: ReadonlyMap<string, Vec3> = new Map(),
  ): void {
    if (!isPlaying) {
      if (this.activeVoices.size > 0) {
        this.stopAll();
      }
      this.lastEvaluatedTimeS = currentTimeS;
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    // Detect timeline loop/rewind or jump
    const isJump = Math.abs(currentTimeS - this.lastEvaluatedTimeS) > 0.3;
    if (isJump) {
      this.stopAll();
    }
    this.lastEvaluatedTimeS = currentTimeS;

    const activeCueIds = new Set<string>();

    for (const cue of cues) {
      const startS = cue.timestampS;
      const endS = startS + cue.durationS;
      const isInside = currentTimeS >= startS && (currentTimeS < endS || (cue.loop && currentTimeS >= startS));

      if (isInside) {
        activeCueIds.add(cue.id);
        const totalElapsed = currentTimeS - startS;
        const offsetS = cue.loop ? totalElapsed % cue.durationS : totalElapsed;
        const worldPos = evaluateCueSpatialPosition(cue, actorPositions, cameraPositions);

        const existing = this.activeVoices.get(cue.id);
        if (existing) {
          // Update emitter position
          if (existing.pannerNode) {
            this.updatePannerPosition(existing.pannerNode, worldPos);
          }
        } else {
          // Start voice
          this.startVoice(cue, offsetS, worldPos, playbackRate);
        }
      }
    }

    // Stop voices that are no longer active
    for (const [id, voice] of this.activeVoices) {
      if (!activeCueIds.has(id)) {
        this.stopVoice(voice);
        this.activeVoices.delete(id);
      }
    }
  }

  private updatePannerPosition(panner: PannerNode, pos: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(pos.x, ctx.currentTime);
      panner.positionY.setValueAtTime(pos.y, ctx.currentTime);
      panner.positionZ.setValueAtTime(pos.z, ctx.currentTime);
    } else if ('setPosition' in panner) {
      (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  /** Starts a procedural or sampled audio voice. */
  private startVoice(cue: AudioCueData, offsetS: number, worldPos: Vec3, playbackRate: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      let panner: PannerNode | null = null;
      let targetNode: AudioNode = this.masterGain;

      if (cue.spatial) {
        panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = cue.refDistanceM ?? 1.0;
        panner.maxDistance = cue.maxDistanceM ?? 20.0;
        panner.rolloffFactor = cue.rolloffFactor ?? 1.0;
        panner.coneInnerAngle = cue.coneInnerAngleDeg ?? 360;
        panner.coneOuterAngle = cue.coneOuterAngleDeg ?? 360;
        panner.coneOuterGain = cue.coneOuterGain ?? 0.0;
        this.updatePannerPosition(panner, worldPos);
        panner.connect(this.masterGain);
        targetNode = panner;
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0, Math.min(1, cue.volume)), ctx.currentTime);
      gain.connect(targetNode);

      const sourceNode = this.createAudioSource(cue, offsetS, playbackRate);
      if (!sourceNode) return;

      sourceNode.connect(gain);

      const voice: ActiveVoice = {
        cueId: cue.id,
        sourceNode,
        pannerNode: panner,
        gainNode: gain,
        startedAtContextTime: ctx.currentTime,
        durationS: cue.durationS,
        offsetS,
      };

      this.activeVoices.set(cue.id, voice);
    } catch {
      // Audio node construction failure safely handled
    }
  }

  /** Creates the audio oscillator / synth / buffer source for the cue. */
  private createAudioSource(cue: AudioCueData, offsetS: number, playbackRate: number): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;

    const remainingS = Math.max(0.05, (cue.durationS - offsetS) / Math.max(0.1, playbackRate));

    if (cue.audioUrl && this.audioBufferCache.has(cue.audioUrl)) {
      const buffer = this.audioBufferCache.get(cue.audioUrl)!;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.setValueAtTime((cue.pitch ?? 1.0) * playbackRate, ctx.currentTime);
      src.loop = cue.loop;
      src.start(ctx.currentTime, offsetS);
      src.stop(ctx.currentTime + remainingS);
      return src;
    }

    // Procedural synthesizer generator based on cue type and synth tone
    return this.createProceduralSynth(cue.type, cue, offsetS, remainingS, playbackRate);
  }

  private createProceduralSynth(
    type: AudioCueType,
    cue: AudioCueData,
    _offsetS: number,
    remainingS: number,
    playbackRate: number,
  ): AudioNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    const baseFreq = cue.synthTone?.frequencyHz ?? 300;
    const finalFreq = baseFreq * (cue.pitch ?? 1.0) * playbackRate;

    switch (type) {
      case 'dialogue': {
        // Formant-like warble imitating speech envelope
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(finalFreq, ctx.currentTime);
        // Subtle vocal vibrato
        osc.frequency.setTargetAtTime(finalFreq * 1.05, ctx.currentTime + 0.1, 0.2);
        env.gain.setValueAtTime(0.01, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 0.05);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + remainingS);
        break;
      }
      case 'foley': {
        // Quick percussive tap/thud
        osc.type = 'sine';
        osc.frequency.setValueAtTime(finalFreq * 2.5, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(finalFreq * 0.4, ctx.currentTime + 0.08);
        env.gain.setValueAtTime(0.9, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + Math.min(0.2, remainingS));
        break;
      }
      case 'sfx': {
        // Sharp punch / gunshot crack
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(finalFreq * 4, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(finalFreq * 0.5, ctx.currentTime + 0.3);
        env.gain.setValueAtTime(1.0, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + Math.min(0.5, remainingS));
        break;
      }
      case 'ambience': {
        // Soft low rumble / room tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(Math.min(120, finalFreq), ctx.currentTime);
        env.gain.setValueAtTime(0.01, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.5);
        env.gain.linearRampToValueAtTime(0.01, ctx.currentTime + remainingS);
        break;
      }
      case 'director_note':
      default: {
        // Clear pleasant UI chime/bleep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(finalFreq, ctx.currentTime);
        env.gain.setValueAtTime(0.01, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + Math.min(0.4, remainingS));
        break;
      }
    }

    osc.connect(env);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + remainingS);

    return env;
  }

  /** Plays an instant one-shot preview of a cue at a given 3D position. */
  public playCuePreview(cue: AudioCueData, worldPos?: Vec3): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      let targetNode: AudioNode = this.masterGain;
      if (cue.spatial && worldPos) {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        this.updatePannerPosition(panner, worldPos);
        panner.connect(this.masterGain);
        targetNode = panner;
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(cue.volume, ctx.currentTime);
      gain.connect(targetNode);

      const src = this.createAudioSource(cue, 0, 1.0);
      if (src) {
        src.connect(gain);
      }
    } catch {
      // preview failure handled gracefully
    }
  }

  private stopVoice(voice: ActiveVoice): void {
    try {
      if ('stop' in voice.sourceNode && typeof (voice.sourceNode as AudioScheduledSourceNode).stop === 'function') {
        (voice.sourceNode as AudioScheduledSourceNode).stop();
      }
      voice.gainNode.disconnect();
      if (voice.pannerNode) {
        voice.pannerNode.disconnect();
      }
    } catch {
      // already stopped
    }
  }

  /** Stops all actively playing sound voices. */
  public stopAll(): void {
    for (const voice of this.activeVoices.values()) {
      this.stopVoice(voice);
    }
    this.activeVoices.clear();
  }

  /**
   * Records a live scratch voice clip from the headset/system microphone.
   * Resolves with { blob, url, durationS } upon completion.
   */
  public async startScratchVoiceRecording(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordedChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start(100);
      return true;
    } catch {
      return false;
    }
  }

  public async stopScratchVoiceRecording(): Promise<{ blob: Blob; url: string; durationS: number } | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      const startTime = Date.now();
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const durationS = Math.max(0.5, (Date.now() - startTime) / 1000);

        // Pre-cache buffer for instant playback
        if (this.ctx) {
          blob.arrayBuffer().then((buf) => {
            this.ctx?.decodeAudioData(buf).then((decoded) => {
              this.audioBufferCache.set(url, decoded);
            }).catch(() => {});
          });
        }

        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
        this.mediaRecorder = null;
        resolve({ blob, url, durationS });
      };

      this.mediaRecorder.stop();
    });
  }

  public get isRecordingScratch(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

export const globalSpatialSoundEngine = new SpatialSoundEngine();
