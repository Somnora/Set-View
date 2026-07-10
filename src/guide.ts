// ---------------------------------------------------------------------------
// In-AR controls guide content — PURE, renderer-free (the tested surface).
// The guide is context-sensitive: it describes what every control does RIGHT
// NOW (current view mode, place mode, frame-lines state), not a static legend.
// guideView.ts renders these items as chips tethered to the controllers.
// ---------------------------------------------------------------------------

export type GuideMode = 'full' | 'mini' | 'camera';
export type GuideHand = 'left' | 'right';
export type GuideAnchor = 'trigger' | 'grip' | 'stick' | 'stick-click' | 'upper' | 'lower' | 'wrist';

export interface GuideContext {
  mode: GuideMode;
  /** Placement arming ('none' = pinch/trigger only selects, never places). */
  placeMode: 'none' | 'actor' | 'camera';
  /** Frame Lines (eyes-as-camera) active. */
  eyesMode: boolean;
  /** Block = plan the shot; dress = adjust the physical space. */
  interaction: 'block' | 'dress';
}

export interface GuideItem {
  hand: GuideHand;
  anchor: GuideAnchor;
  label: string;
}

/** Seconds the guide stays up when it auto-shows at session start. */
export const GUIDE_AUTO_SHOW_S = 12;

/** Must match ViewManager's cycle order (full → mini → camera → full). */
export const NEXT_VIEW: Record<GuideMode, GuideMode> = {
  full: 'mini',
  mini: 'camera',
  camera: 'full',
};

const VIEW_TITLE: Record<GuideMode, string> = {
  full: 'Full',
  mini: 'Mini',
  camera: 'Cam View',
};

/**
 * Line-start points for each anchor in grip-space meters, authored for the
 * RIGHT controller; the view mirrors x for the left hand.
 */
export const ANCHOR_OFFSETS: Record<GuideAnchor, { x: number; y: number; z: number }> = {
  trigger: { x: 0.0, y: -0.005, z: -0.055 },
  grip: { x: -0.015, y: -0.02, z: -0.01 },
  stick: { x: -0.012, y: 0.03, z: -0.04 },
  'stick-click': { x: -0.012, y: 0.034, z: -0.04 },
  upper: { x: -0.002, y: 0.024, z: -0.052 },
  lower: { x: -0.018, y: 0.02, z: -0.058 },
  wrist: { x: 0.0, y: 0.03, z: 0.09 },
};

/** The chips shown for a given app state. Order = fan slot order per hand. */
export function guideItems(ctx: GuideContext): GuideItem[] {
  const items: GuideItem[] = [];
  const nextTitle = VIEW_TITLE[NEXT_VIEW[ctx.mode]];

  // Left controller.
  items.push({ hand: 'left', anchor: 'wrist', label: 'Look at this hand: tool wheel' });
  items.push({ hand: 'left', anchor: 'upper', label: `Y: next view (${nextTitle})` });
  if (ctx.mode === 'full') {
    if (ctx.interaction === 'block') {
      items.push({
        hand: 'left',
        anchor: 'lower',
        label:
          ctx.placeMode === 'none'
            ? 'X: arm actor placing'
            : ctx.placeMode === 'actor'
              ? 'X: switch to camera placing'
              : 'X: placing off',
      });
    }
    items.push({ hand: 'left', anchor: 'stick', label: 'Glide through the set' });
  }

  // Right controller.
  if (ctx.mode === 'full' && ctx.interaction === 'dress') {
    items.push({ hand: 'right', anchor: 'grip', label: 'Hold: grab furniture to move it' });
    items.push({ hand: 'right', anchor: 'stick', label: 'Snap turn (or spin held furniture)' });
    items.push({ hand: 'right', anchor: 'stick-click', label: 'Click: teleport to the ring' });
  } else if (ctx.mode === 'full') {
    items.push({
      hand: 'right',
      anchor: 'trigger',
      label:
        ctx.placeMode === 'none'
          ? 'Select what you point at'
          : ctx.placeMode === 'actor'
            ? 'Place actor on the ring'
            : 'Place camera at your head',
    });
    items.push({ hand: 'right', anchor: 'grip', label: 'Hold: grab an actor or camera' });
    items.push({ hand: 'right', anchor: 'upper', label: 'B: mark a move for the actor' });
    if (ctx.eyesMode) items.push({ hand: 'right', anchor: 'lower', label: 'A: commit camera at your eyes' });
    items.push({ hand: 'right', anchor: 'stick', label: 'Snap turn' });
    items.push({ hand: 'right', anchor: 'stick-click', label: 'Click: teleport to the ring' });
  } else if (ctx.mode === 'mini') {
    items.push({ hand: 'right', anchor: 'trigger', label: 'Select' });
    items.push({ hand: 'right', anchor: 'grip', label: 'Hold: move the diorama' });
    items.push({ hand: 'right', anchor: 'stick', label: 'Spin the diorama' });
  } else {
    items.push({ hand: 'right', anchor: 'lower', label: 'A: take a photo' });
    items.push({ hand: 'right', anchor: 'upper', label: 'B: mark a move for the actor' });
    items.push({ hand: 'right', anchor: 'grip', label: 'Hold: grab the monitor to park it' });
    items.push({ hand: 'right', anchor: 'stick', label: 'Focal length up / down' });
  }
  return items;
}
