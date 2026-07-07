# TESTING.md — on-headset checklist

Run through these on the Quest 3 (and repeat on Android XR if available) after any significant change. Phases build on each other — don't skip ahead if Phase 1 fails.

**Setup:** `npm run dev`, open the Network URL in the headset browser, accept the cert warning, Enter AR. Keep the wrist debug readout in view — it logs session features (`anchors=yes/no`), pose resets, and fps.

---

## Verified headset-free (this build, before QA)

Checked on the dev machine — no headset needed:

- [x] `npm test` — **31** domain tests pass: lens FOV, **depth of field / hyperfocal**, **angle of view** (H/V/diagonal), **sensor formats** (S35/FF/S16 + the anamorphic-2×-≡-half-focal identity), field width at distance, `stepFocal` snapping, **camera-name uniqueness after delete**, **deep import validation** (malformed actor/camera rejected), `normalizeScene` defaults, **floorplan projection**, **shot-list text**, timeline + move stats.
- [x] `npx tsc --noEmit` clean · `npm run build` bundles (19 modules).
- [x] Landing page boots in headless Chrome (canvas created, correct `immersive-ar unavailable` diagnostics on desktop, scene list + per-camera editor render, no error fallback).
- [x] Floorplan PNG rasterizes (`toDataURL`) and shot-list Markdown builds in a real browser via the dev server — no runtime errors, anamorphic format surfaced.

The **desktop prep** surface (scene rename; per-camera lens/format/aspect/T-stop/height editing; floorplan & shot-list export; Enter/N keys) is fully usable and verifiable at a laptop before the headset is available.

---

## Phase 0 — Boot & passthrough

- [ ] Landing page loads over HTTPS; diagnostic box says *immersive-ar supported*; **Enter AR** enabled.
- [ ] On a non-XR desktop browser the button is disabled with a reason listed (checked automatically in CI-style smoke test too).
- [ ] Entering AR shows **passthrough** (real room visible), no opaque background.
- [ ] White ring reticle follows the **right controller ray** along real surfaces: floor, tabletop. It should sit *on* the surface, not float.
- [ ] With controllers off (hands only), the reticle falls back to gaze.
- [ ] Wrist debug line reports the reference space (`ref=local-floor`) and whether anchors were granted.

## Phase 1 — Floor-locked actors ⭐ THE make-or-break test

- [ ] Trigger on the floor reticle spawns a ~1.7 m flat-shaded humanoid, feet **on** the floor, facing you, name label overhead.
- [ ] Each new actor gets a distinct color and name (Actor 1, Actor 2, …).
- [ ] Grip-grab an actor and drag: it follows the reticle **staying on the floor** (no lift, no tilt); thumbstick rotates its facing while held.
- [ ] Wrist **Delete** removes the pointed-at actor.
- [ ] **THE DRIFT LOOP:** place one actor in the middle of the room. Toggle wrist **Drift** — a 1 m cyan grid appears at the session origin with a floating readout. Now walk a full loop around the room (~10 m), looking away and back, crouching once.
  - [ ] The actor's feet stay visually planted — **no sliding, no floating, no pogo**. Sub-centimeter shimmer is acceptable; visible skating is a FAIL.
  - [ ] Compare: the drift grid is *unanchored* on purpose (raw tracking), actors are *anchored* — if anchors are working, actors should hold at least as well as the grid.
  - [ ] The readout logs any `reference space RESET` events. If one fires, note whether content jumped.
  - [ ] fps readout ≥ 70 throughout.
- [ ] Cover the cameras briefly (tracking loss) and uncover: actors should recover to their real positions, not teleport away.
- If drift is bad: verify `anchors=yes` in the debug line. If anchors were denied, that's the fallback path — retest on updated firmware/browser before touching code. **Do not proceed to Phase 2+ until this passes.**

## Phase 2 — Camera View & lenses

- [ ] Wrist **Frame Lines**: white frame rectangle + darkened letterbox border + a readout like `35mm S35 · 2.39:1 · H39° · 1.0m @ 1.4m` (lens, format, aspect, horizontal AoV, frame width at 1.4 m) appear centered in your view.
- [ ] Thumbstick left/right steps 16 → 24 → 35 → 50 → 85 → 135 mm; the rectangle visibly shrinks as focal length grows (16 mm fills most of your view; 135 mm is a small distant rect); the AoV/width numbers update.
- [ ] Wrist **Aspect** cycles 2.39:1 / 16:9 / 4:3 — frame height changes, width stays (constant-gate behavior).
- [ ] Camera-View monitor readout shows the full line: name · lens · format · aspect · T-stop, AoV (H/Ø°), subject distance, **DOF near–far**, and frame width. (Format/T-stop are set per camera on the desktop prep page; defaults S35 / T2.8.)
- [ ] Committing a camera on **Full-Frame** vs **Super 35** at the same focal length gives a visibly wider frame on FF (verify after setting format on the landing page, re-entering AR).
- [ ] Walk until two placed actors compose nicely, press **A** → label flashes `✓ CAM A committed`, gizmo with sightline cone appears at your head position.
- [ ] **Y** to Camera View: floating monitor shows the frame from CAM A — actor positions/sizes in-frame should match what you saw through the frame lines (this is the fidelity check: stand behind the gizmo and compare).
- [ ] Thumbstick steps focal length live in Camera View: FOV change is obvious and the readout under the monitor updates.
- [ ] Monitor shows dark background + grid floor (passthrough can't be captured — expected, documented).
- [ ] Place a second camera (Place: Cam mode or another A-commit); trigger-click gizmos to switch the active camera; monitor follows.
- [ ] Grip-drag a camera gizmo — monitor viewpoint moves with it after release.

## Phase 3 — Three views + teleport

- [ ] **Y** cycles Full → Mini → Camera → Full. Any view reachable in ≤ 2 clicks (or 1 wrist tap).
- [ ] Miniature: whole blocked scene appears as a ≤ ~0.5 m diorama on a platform at waist height. Actors, camera gizmos, sightline cones, footprints all present and to scale.
- [ ] Live mirror check: have a second person... no wait, single user: enter Mini during playback (Phase 4) — the tiny actors move exactly as the full-scale ones did.
- [ ] Grip-grab moves the diorama; thumbstick rotates it; you can view it top-down like a table model.
- [ ] Full-scale: aim at a far floor point, click thumbstick → quick 150 ms fade, and the scene has shifted so that point is at your feet (walk-free repositioning). No smooth slide, no nausea.
- [ ] Wrist **Re-align** snaps content back to true room registration (verify an anchored actor returns exactly to its real spot).

## Phase 4 — Keyframes & playback

- [ ] Select Actor 1, press **B** → numbered footprint `1` under it, label flashes `KF 1 ✓`.
- [ ] Drag the actor 3 m away, rotate it, **B** again → footprint `2` + dotted path between marks.
- [ ] Repeat for Actor 2 (2–3 keyframes crossing Actor 1's path).
- [ ] 6th **B** on one actor flashes `MAX 5 KFs` and stores nothing.
- [ ] Wrist **▶ Play**: both actors walk their paths **simultaneously**, ~1.4 m/s, legs/arms swinging, slight bob; they face their direction of travel and settle into the keyframed facing on arrival.
- [ ] Scrub the wrist slider: timeline jogs smoothly both directions; pause/play resumes from the playhead.
- [ ] **⏹ Stop** returns actors to their placed (rest) positions.
- [ ] Repeat playback while in **Miniature** view — identical blocking in the diorama.
- [ ] fps ≥ 70 with 4 actors playing.

## Phase 5 — Notes, persistence, export

- [ ] Select an actor → wrist **+ Note** → dom-overlay dialog appears with the system keyboard; type a line as *Dialogue* → card appears beside the actor **in quotes**; add an *Action* note → plain card, stacked below.
- [ ] Wrist **Notes** toggles all cards.
- [ ] Exit AR → landing page lists the scene with actor/camera counts. **Restart the browser entirely**, reload the page: scene still listed; Enter AR: actors, keyframes, notes, cameras all restored (positioned relative to where you start the session — stand at your original start point).
- [ ] Duplicate & Delete work from the scene list; Export downloads `.setview.json`; Import brings it back as a new scene.
- [ ] In Camera View, press **A** (or wrist 📷): PNG downloads named like `scene-1-cam-a-35mm-20260704-193212.png`; open it: 1920 px wide, correct aspect (e.g. 1920×803 for 2.39:1), slate bar burned in at the bottom (scene, camera, focal, aspect, date).

## Performance sweep (any phase)

- [ ] 6 actors + 3 cameras + Camera View open: fps readout ≥ 70, no heat warnings in 10 min.
- [ ] If fps sags: close Camera View (kills the RTT pass) and re-check — if that recovers it, lower `RT_BASE_W` in `cameraView.ts`.

## Known tuning knobs (edit & hot-reload)

- Wrist panel placement feels wrong → `WRIST_POS` / `WRIST_ROT_X` at the top of `main.ts`.
- Frame lines too close/far → `FRAME_LINE_DIST` in `cameraView.ts`.
- Diorama size → `MINI_SCALE` in `views.ts`.
- Monitor size/distance → `MONITOR_IMG_W` in `cameraView.ts`, follow distance in `CameraSystem.update`.
