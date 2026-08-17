// ---------------------------------------------------------------------------
// SetView Runtime Spatial Haptics & Procedural Web Audio Engine
// Real-time dual-gamepad vibration haptics & 3D spatialized procedural audio.
// Zero network dependencies, zero asset files, microsecond latency.
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';

export type HapticPattern =
  | 'tick'
  | 'snap'
  | 'grab'
  | 'boundary_limit'
  | 'tally_start'
  | 'tally_stop'
  | 'error';

export type SpatialSoundType =
  | 'snap'
  | 'click'
  | 'tally_start'
  | 'tally_stop'
  | 'clapper'
  | 'whoosh'
  | 'error';

interface HapticStep {
  intensity: number;
  durationMs: number;
  delayMs?: number;
}

const HAPTIC_RECIPES: Record<HapticPattern, HapticStep[]> = {
  tick: [{ intensity: 0.25, durationMs: 12 }],
  snap: [{ intensity: 0.65, durationMs: 28 }],
  grab: [{ intensity: 0.40, durationMs: 20 }],
  boundary_limit: [
    { intensity: 0.8, durationMs: 25 },
    { intensity: 0.8, durationMs: 25, delayMs: 25 },
  ],
  tally_start: [
    { intensity: 0.45, durationMs: 30 },
    { intensity: 0.85, durationMs: 65, delayMs: 30 },
  ],
  tally_stop: [
    { intensity: 0.8, durationMs: 50 },
    { intensity: 0.35, durationMs: 30, delayMs: 30 },
  ],
  error: [
    { intensity: 0.9, durationMs: 25 },
    { intensity: 0.9, durationMs: 25, delayMs: 30 },
    { intensity: 0.9, durationMs: 25, delayMs: 30 },
  ],
};

export class SpatialFeedbackManager {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private xrInputSources: readonly XRInputSource[] = [];

  constructor() {
    // AudioContext is initialized lazily upon first interaction
  }

  /**
   * Updates reference to active XRInputSources for dual-gamepad haptics routing.
   */
  public setXRInputSources(sources: readonly XRInputSource[] | XRInputSourceArray | Iterable<XRInputSource>): void {
    this.xrInputSources = Array.isArray(sources) ? sources : Array.from(sources);
  }

  /**
   * Alias/helper for per-frame updates of input sources and haptic state.
   */
  public update(sources?: readonly XRInputSource[] | XRInputSourceArray | Iterable<XRInputSource>): void {
    if (sources) {
      this.setXRInputSources(sources);
    }
  }

  /** Ensures AudioContext is active. */
  public ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      try {
        this.audioCtx = new AudioCtxClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
        this.masterGain.connect(this.audioCtx.destination);
        this.generateNoiseBuffer();
      } catch {
        return null;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  private generateNoiseBuffer(): void {
    if (!this.audioCtx) return;
    const sampleRate = this.audioCtx.sampleRate;
    const length = Math.floor(sampleRate * 0.5); // 500ms noise buffer
    const buffer = this.audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2.0 - 1.0;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * Triggers a tactile haptic vibration pattern on the specified controller.
   */
  public triggerHaptic(
    gamepadTarget: 0 | 1 | 'both' = 'both',
    pattern: HapticPattern = 'tick',
  ): void {
    const steps = HAPTIC_RECIPES[pattern] || HAPTIC_RECIPES.tick;

    const targetGamepads: Gamepad[] = [];

    // 1. Check XRInputSource gamepads
    for (let i = 0; i < this.xrInputSources.length; i++) {
      const src = this.xrInputSources[i];
      if (src.gamepad) {
        if (gamepadTarget === 'both' || (gamepadTarget === 0 && (src.handedness === 'left' || i === 0)) || (gamepadTarget === 1 && (src.handedness === 'right' || i === 1))) {
          targetGamepads.push(src.gamepad);
        }
      }
    }

    // 2. Fallback to navigator gamepads
    if (targetGamepads.length === 0 && typeof navigator !== 'undefined' && navigator.getGamepads) {
      const navGamepads = navigator.getGamepads();
      if (navGamepads) {
        for (let i = 0; i < navGamepads.length; i++) {
          const gp = navGamepads[i];
          if (gp) {
            if (gamepadTarget === 'both' || (gamepadTarget === 0 && i === 0) || (gamepadTarget === 1 && i === 1)) {
              targetGamepads.push(gp);
            }
          }
        }
      }
    }

    for (const gp of targetGamepads) {
      this.playHapticSteps(gp, steps);
    }
  }

  private playHapticSteps(gamepad: Gamepad, steps: HapticStep[]): void {
    const gp = gamepad as unknown as {
      hapticActuators?: Array<{ pulse: (value: number, duration: number) => Promise<boolean> }>;
      vibrationActuator?: { playEffect: (type: string, options: { duration: number; strongMagnitude: number; weakMagnitude: number }) => Promise<string> };
    };

    let accumulatedDelay = 0;

    for (const step of steps) {
      accumulatedDelay += (step.delayMs || 0);

      const runPulse = () => {
        try {
          if (gp.hapticActuators && gp.hapticActuators.length > 0) {
            gp.hapticActuators[0].pulse(step.intensity, step.durationMs);
          } else if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
            gp.vibrationActuator.playEffect('dual-rumble', {
              duration: step.durationMs,
              strongMagnitude: step.intensity,
              weakMagnitude: step.intensity * 0.7,
            }).catch(() => {});
          }
        } catch {
          // Actuator vibration error safely swallowed
        }
      };

      if (accumulatedDelay > 0) {
        setTimeout(runPulse, accumulatedDelay);
      } else {
        runPulse();
      }

      accumulatedDelay += step.durationMs;
    }
  }

  /**
   * Synthesizes and plays a zero-latency spatial sound at the given 3D position.
   */
  public playSpatialSound(soundType: SpatialSoundType, position?: Vec3): void {
    const ctx = this.ensureAudioContext();
    if (!ctx || !this.masterGain) return;

    try {
      let targetNode: AudioNode = this.masterGain;

      if (position) {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.0;
        panner.maxDistance = 25.0;
        panner.rolloffFactor = 1.0;

        if (panner.positionX) {
          panner.positionX.setValueAtTime(position.x, ctx.currentTime);
          panner.positionY.setValueAtTime(position.y, ctx.currentTime);
          panner.positionZ.setValueAtTime(position.z, ctx.currentTime);
        } else if ('setPosition' in panner) {
          (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(position.x, position.y, position.z);
        }

        panner.connect(this.masterGain);
        targetNode = panner;
      }

      const now = ctx.currentTime;

      switch (soundType) {
        case 'snap': {
          // High-frequency tactile ping with exponential decay
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1600, now);
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);

          gain.gain.setValueAtTime(0.6, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

          osc.connect(gain);
          gain.connect(targetNode);

          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case 'click': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(900, now);

          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

          osc.connect(gain);
          gain.connect(targetNode);

          osc.start(now);
          osc.stop(now + 0.025);
          break;
        }

        case 'tally_start': {
          // Rising major chime (D5 -> A5)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(587.33, now);
          gain1.gain.setValueAtTime(0.5, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc1.connect(gain1);
          gain1.connect(targetNode);
          osc1.start(now);
          osc1.stop(now + 0.085);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880.0, now + 0.07);
          gain2.gain.setValueAtTime(0.6, now + 0.07);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc2.connect(gain2);
          gain2.connect(targetNode);
          osc2.start(now + 0.07);
          osc2.stop(now + 0.23);
          break;
        }

        case 'tally_stop': {
          // Falling chime (A5 -> D5)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880.0, now);
          gain1.gain.setValueAtTime(0.5, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc1.connect(gain1);
          gain1.connect(targetNode);
          osc1.start(now);
          osc1.stop(now + 0.085);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(440.0, now + 0.07);
          gain2.gain.setValueAtTime(0.5, now + 0.07);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc2.connect(gain2);
          gain2.connect(targetNode);
          osc2.start(now + 0.07);
          osc2.stop(now + 0.23);
          break;
        }

        case 'clapper': {
          // Slate slap: sharp noise burst + wooden low thump
          if (this.noiseBuffer) {
            const noise = ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.Q.setValueAtTime(3.0, now);

            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.8, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(targetNode);

            noise.start(now);
            noise.stop(now + 0.04);
          }

          const thud = ctx.createOscillator();
          const thudGain = ctx.createGain();
          thud.type = 'sine';
          thud.frequency.setValueAtTime(160, now);
          thud.frequency.exponentialRampToValueAtTime(45, now + 0.06);

          thudGain.gain.setValueAtTime(0.7, now);
          thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

          thud.connect(thudGain);
          thudGain.connect(targetNode);

          thud.start(now);
          thud.stop(now + 0.075);
          break;
        }

        case 'whoosh': {
          if (this.noiseBuffer) {
            const src = ctx.createBufferSource();
            src.buffer = this.noiseBuffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(300, now);
            filter.frequency.exponentialRampToValueAtTime(1800, now + 0.07);
            filter.frequency.exponentialRampToValueAtTime(250, now + 0.16);
            filter.Q.setValueAtTime(4.0, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.01, now);
            gain.gain.linearRampToValueAtTime(0.5, now + 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(targetNode);

            src.start(now);
            src.stop(now + 0.19);
          }
          break;
        }

        case 'error': {
          // Low dissonant buzz
          const oscA = ctx.createOscillator();
          const oscB = ctx.createOscillator();
          const gain = ctx.createGain();

          oscA.type = 'sawtooth';
          oscB.type = 'sawtooth';
          oscA.frequency.setValueAtTime(160, now);
          oscB.frequency.setValueAtTime(215, now);

          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          oscA.connect(gain);
          oscB.connect(gain);
          gain.connect(targetNode);

          oscA.start(now);
          oscB.start(now);
          oscA.stop(now + 0.13);
          oscB.stop(now + 0.13);
          break;
        }
      }
    } catch {
      // Audio playback errors safely handled
    }
  }
}

/** Global singleton spatial feedback manager. */
export const globalSpatialFeedback = new SpatialFeedbackManager();
