// ---------------------------------------------------------------------------
// Controller-anchored controls chips: renders guide.ts items as billboarded
// label sprites fanned beside each controller, with a thin leader line from
// each chip to the physical button it describes. main.ts parents `left` /
// `right` to the XR grip spaces (same pattern as the wrist panel mount) and
// drives show/hide (12 s auto-show on session start, wrist Help toggles).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { ANCHOR_OFFSETS, guideItems, type GuideContext, type GuideHand } from './guide.ts';
import { disposeSprite, makeLabel } from './ui.ts';

const CHIP_LINE_H = 0.021; // world meters per text line
const FAN_X = 0.16; // chips fan out to the side of the controller
const FAN_Y0 = 0.05;
const FAN_STEP = 0.05;

export class GuideView {
  /** Parented to the left/right XR grip spaces by main.ts. */
  readonly left = new THREE.Group();
  readonly right = new THREE.Group();
  visible = false;

  private lineMat = new THREE.LineBasicMaterial({ color: 0x8ab4ff, transparent: true, opacity: 0.85 });
  private builtKey = '';

  constructor() {
    this.left.visible = false;
    this.right.visible = false;
    // Chips render over scene content so they're readable against anything.
    this.left.renderOrder = 30;
    this.right.renderOrder = 30;
  }

  show(ctx: GuideContext): void {
    this.visible = true;
    this.rebuild(ctx);
    this.left.visible = true;
    this.right.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.left.visible = false;
    this.right.visible = false;
  }

  /** Re-renders the chips for a state change; no-op while hidden. */
  refresh(ctx: GuideContext): void {
    if (this.visible) this.rebuild(ctx);
  }

  private rebuild(ctx: GuideContext): void {
    const key = `${ctx.mode}|${ctx.placeMode}|${ctx.eyesMode}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.clear(this.left);
    this.clear(this.right);

    const slots: Record<GuideHand, number> = { left: 0, right: 0 };
    for (const item of guideItems(ctx)) {
      const group = item.hand === 'left' ? this.left : this.right;
      const mirror = item.hand === 'left' ? -1 : 1;
      const slot = slots[item.hand]++;

      const chip = makeLabel(item.label, CHIP_LINE_H, { fontPx: 40, maxWidthPx: 430 });
      chip.sprite.position.set(mirror * FAN_X, FAN_Y0 + slot * FAN_STEP, -0.03);
      chip.sprite.renderOrder = 30;

      const a = ANCHOR_OFFSETS[item.anchor];
      const from = new THREE.Vector3(a.x * mirror, a.y, a.z);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, chip.sprite.position.clone()]),
        this.lineMat,
      );
      line.renderOrder = 29;
      group.add(line, chip.sprite);
    }
  }

  private clear(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Sprite) disposeSprite(child);
      else if (child instanceof THREE.Line) child.geometry.dispose(); // material is shared
    }
  }
}
