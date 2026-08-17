import { secondsToSmpte } from './timecode.ts';

export interface TakeRecord {
  id: string;
  takeNumber: number;
  sceneName: string;
  timestamp: number;
  durationS: number;
  smpteDuration: string;
  blob: Blob | null;
  url: string;
  cameraName: string;
  focalLengthMm: number;
  tStop: number;
  aspect: string;
  formatShort: string;
  hasAudio: boolean;
}

/** Creates a structured TakeRecord from capture metadata. Pure. */
export function createTakeRecord(data: {
  takeNumber: number;
  sceneName?: string;
  timestamp?: number;
  durationS: number;
  blob?: Blob | null;
  url: string;
  cameraName?: string;
  focalLengthMm?: number;
  tStop?: number;
  aspect?: string;
  formatShort?: string;
  hasAudio?: boolean;
}): TakeRecord {
  const ts = data.timestamp ?? Date.now();
  const id = `take-${String(data.takeNumber).padStart(3, '0')}-${ts}`;
  const durationS = Math.max(0, data.durationS);
  return {
    id,
    takeNumber: data.takeNumber,
    sceneName: data.sceneName ?? 'Scene 1',
    timestamp: ts,
    durationS,
    smpteDuration: secondsToSmpte(durationS).formatted,
    blob: data.blob ?? null,
    url: data.url,
    cameraName: data.cameraName ?? 'CAM A',
    focalLengthMm: data.focalLengthMm ?? 35,
    tStop: data.tStop ?? 2.8,
    aspect: data.aspect ?? '16:9',
    formatShort: data.formatShort ?? 'S35',
    hasAudio: data.hasAudio ?? false,
  };
}

/** Formats a compact take slate header string for display. Pure. */
export function formatTakeSlate(take: TakeRecord): string {
  const dur = `${Math.floor(take.durationS / 60)}:${String(Math.floor(take.durationS % 60)).padStart(2, '0')}`;
  return `TAKE ${take.takeNumber} · ${take.cameraName} (${Math.round(take.focalLengthMm)}mm T${take.tStop.toFixed(1)}) · ${dur}`;
}

/** Sorts takes chronologically descending (newest first). Pure. */
export function sortTakesDescending(takes: readonly TakeRecord[]): TakeRecord[] {
  return [...takes].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * TakeLibrary manages the active session's recorded takes for playback and review.
 */
export class TakeLibrary {
  private takes: TakeRecord[] = [];
  private activeTakeIndex = -1;

  onTakesChanged: () => void = () => {};
  onActiveTakeChanged: (take: TakeRecord | null) => void = () => {};

  get allTakes(): readonly TakeRecord[] {
    return this.takes;
  }

  get count(): number {
    return this.takes.length;
  }

  get activeTake(): TakeRecord | null {
    if (this.activeTakeIndex >= 0 && this.activeTakeIndex < this.takes.length) {
      return this.takes[this.activeTakeIndex];
    }
    return null;
  }

  get activeIndex(): number {
    return this.activeTakeIndex;
  }

  /** Adds a newly completed take to the library and selects it. */
  addTake(take: TakeRecord): void {
    this.takes.push(take);
    this.activeTakeIndex = this.takes.length - 1;
    this.onTakesChanged();
    this.onActiveTakeChanged(take);
  }

  /** Selects a take by its index or ID in the take array. */
  selectTake(idOrIndex: string | number): TakeRecord | null {
    let index = -1;
    if (typeof idOrIndex === 'number') {
      index = idOrIndex;
    } else {
      index = this.takes.findIndex((t) => t.id === idOrIndex);
    }
    if (index >= 0 && index < this.takes.length) {
      this.activeTakeIndex = index;
      const take = this.takes[index];
      this.onActiveTakeChanged(take);
      return take;
    }
    return null;
  }

  /** Selects the next take in sequence. */
  nextTake(): TakeRecord | null {
    if (this.takes.length === 0) return null;
    const nextIdx = (this.activeTakeIndex + 1) % this.takes.length;
    return this.selectTake(nextIdx);
  }

  /** Selects the previous take in sequence. */
  prevTake(): TakeRecord | null {
    if (this.takes.length === 0) return null;
    const prevIdx = (this.activeTakeIndex - 1 + this.takes.length) % this.takes.length;
    return this.selectTake(prevIdx);
  }

  /** Clears all takes and revokes object URLs. */
  clear(): void {
    for (const t of this.takes) {
      if (t.url && t.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(t.url);
        } catch {
          // ignore revocation errors
        }
      }
    }
    this.takes = [];
    this.activeTakeIndex = -1;
    this.onTakesChanged();
    this.onActiveTakeChanged(null);
  }
}
