// ---------------------------------------------------------------------------
// Undo/redo — PURE (no three.js, no DOM). A bounded snapshot stack over the
// SceneData model. record() is called after each committed mutation; undo/redo
// return a fresh, normalized SceneData to load back into the managers.
// ---------------------------------------------------------------------------

import { normalizeScene, type SceneData } from './model.ts';

export class History {
  private past: string[] = [];
  private future: string[] = [];
  private present = '';
  private readonly limit: number;

  constructor(limit = 40) {
    this.limit = limit;
  }

  /** Start (or restart) history from a baseline scene. Clears the stacks. */
  reset(scene: SceneData): void {
    this.present = JSON.stringify(scene);
    this.past = [];
    this.future = [];
  }

  /** Record a committed mutation. No-op if nothing actually changed. */
  record(scene: SceneData): void {
    const snap = JSON.stringify(scene);
    if (snap === this.present) return;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = snap;
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Step back one mutation, or null if there's nothing to undo. */
  undo(): SceneData | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present);
    this.present = prev;
    return normalizeScene(JSON.parse(prev));
  }

  /** Step forward one mutation, or null if there's nothing to redo. */
  redo(): SceneData | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.present = next;
    return normalizeScene(JSON.parse(next));
  }
}
