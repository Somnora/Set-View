# TESTING.md — on-headset checklist

Run through these on the Quest 3 (and repeat on Android XR if available) after any significant change. Phases build on each other — don't skip ahead if Phase 1 fails.

**Setup:** `npm run dev`, open the Network URL in the headset browser, accept the cert warning, Enter AR. Keep the wrist debug readout in view — it logs session features (`anchors=yes/no`), pose resets, and fps.

---

## QA findings — second on-headset session (2026-07-10, James, Quest 3, on video)

- [x] **Whole scene floated at head height ("giant legs from the ceiling")** — the headset's floor origin sat ~1–1.5 m above the real floor (bad boundary floor height or local-space fallback), so everything authored at scene y=0 rendered at head level while the hit-test reticle sat correctly on the REAL floor. Fixed (pending re-QA): `floor.ts` watches the lowest real hit over the first seconds of a session; when it sits >0.15 m below y=0 (with enough hits, enough time, and a plausible resulting eye height), the scene re-bases onto the real floor once, with a debug-log warning. One-directional by design — hits on desks/props can't trigger a false fix. Unit-tested against this exact failure.
- [x] **Hands-only users were locked out of every menu** — wrist panel (and the new wheel) were hidden for tracked hands, so with controllers down there was no mode switch, no scan, no exit: just floating geometry. Fixed: the gaze-summoned wheel + panel now work with hands (Quest hands expose a grip pose; pinch = trigger). If a grip pose is ever missing, the gaze gate's arm-length cap keeps the dead mount from appearing.
- [x] **Giant actor body across the face** — actors now ghost when your head is inside them (feet or chest within 0.45 m, scale-aware), same as camera gizmos; re-appear when you step back. The virtual-camera pass and video takes still film the full cast (ghosting applies only to the wearer's view, after the RTT pass).
- [ ] **Leftover confusion-era actors** — the scene autosaved the Actor 2/3/4 placed during the broken session (some stored below scene floor). Delete them on the landing page or start a New Scene before the next run.

## QA findings — first on-headset session (2026-07-09, James, Quest 3)

- [x] **Every landing-page button dead to hands AND controllers** — the full-screen WebGL canvas covered the page and swallowed all pointer input (synthetic-click smokes never caught it). Fixed: canvas is `pointer-events: none` except while the desktop preview owns it; guarded by `test/hit-check.html`.
- [x] **Controls are unclear in AR** — fixed (pending re-QA): context-sensitive controls guide, chips tethered to each controller with leader lines to the physical buttons, describing what every control does in the CURRENT mode (view mode, place mode, frame lines). Auto-shows for 12 s at session start; wrist `?` pins/unpins it. Pure content in `guide.ts` (unit-tested incl. a no-em-dash copy check); layout screenshot-verified via `test/guide-smoke.html` (`GUIDE-SMOKE PASS`).
- [x] **"A giant camera on top of my face" after switching view** — two causes, both fixed (pending re-QA): (1) the director's monitor lazy-followed the head forever at 0.7 m — it now parks once where you're looking on entering Camera View (0.9 m out, slightly low), billboards in place, and can be grip-grabbed and re-parked like a camera; (2) an eyes-mode commit places the camera AT your head and its body sat on your eyes — any camera gizmo within 0.45 m of the head now ghosts until you step back (scale-aware, never while grip-carried).
- [x] **Couldn't figure out how to scan a room** — the guide's wrist chip ("Menu here: Scan Room, Rec, views, notes") points at the left wrist; re-QA whether that's enough or Scan Room needs a first-run prompt.
- [~] **Wants movable scanned furniture** — Stage 1 built (pending on-headset QA): labeled scan meshes (couch, table, bed — anything the Quest's Space Setup tagged, i.e. every mesh that isn't the global room mesh) are now **grip-grabbable in Full view** whenever the scan is shown (Ghost/Solid). Carry to move; right stick yaws it; release settles it flat on the floor. Placements persist in the scene JSON (`scan.furniture` — the geometry blob is untouched), survive export/import, and undo/redo. The walls (global mesh) stay fixed. Stage 2 (swap scan furniture for generated 3D models) not started. **On-headset:** needs Space Setup with labeled furniture; verify pieces highlight-and-grab, settle flat, persist across sessions, and that the global room mesh is NOT grabbable.
- [ ] **Wants to "build a room from scratch"** — no such feature yet (scan-only); candidate: primitive wall/flat blocking volumes. Roadmap item, not a bug.

---

## Verified headset-free (this build, before QA)

Checked on the dev machine — no headset needed:

- [x] `npm test` — **96** domain tests pass: lens FOV, **depth of field / hyperfocal**, **circle of confusion** (focus-plane zero, aperture/focal scaling, degenerate-input guards), **angle of view** (H/V/diagonal), **sensor formats** (S35/FF/S16 + the anamorphic-2×-≡-half-focal identity), field width at distance, `stepFocal` snapping, **camera-name uniqueness after delete + 27-camera hang guard**, **deep import validation** (malformed actor/camera rejected), `normalizeScene` defaults, **undo/redo history** (record/undo/redo, fresh-object isolation, redo-clear, bounded depth), **duplicate actor/camera** (fresh id/name, deep copy, offset), **move pace** normalization, **stance/pose** (all 10 poses present + unique + finite, standing-neutral, seated/lying differ, cycle wraps, validation/normalize/duplicate/round-trip), **per-keyframe stance** (capture stamp, walk-to-chair-and-sit sampling incl. the settle beat, legacy fallback, invalid-mark repair, duplicate/JSON round-trip), **blocking-editor mark ops** (add at rest/step/cap, atomic update validation, stance set/clear, reorder ends, remove; shot-list stance tags), **floorplan projection**, **shot-list text**, timeline + move stats, **locomotion** (glide deadzone/clamp, pivot-rotation identities), **video-recording policy** (container preference/fallback, extension mapping, letterbox fit incl. degenerate inputs, take clock, bounded-memory cap), **location scans** (base64 vs Node reference, column-major vertex transforms, bounds/counts summary, binary codec round-trip incl. >65k-vertex index path, corrupt-input rejection, scan-summary scene validation).
- [x] `npx tsc --noEmit` clean · `npm run build` bundles.
- [x] Landing page boots in headless Chrome (canvas created, correct `immersive-ar unavailable` diagnostics on desktop, scene list + per-camera editor render, no error fallback).
- [x] **DOF shader compiles + runs headless** — `test/dof-smoke.html` builds a WebGL2 (swiftshader) context, renders a depth+color target, runs the `DofPass`, reads back a pixel: `DOF-SMOKE PASS` (a GLSL error can't hide until on-headset).
- [x] **Video recorder records headless** — `test/record-smoke.html` runs the real `MonitorRecorder` (captureStream + MediaRecorder + the letterbox blit) against a fake feed RT: start → 30 frames → stop must finalize a non-empty take and restore the canvas backbuffer: `RECORD-SMOKE PASS (record-smoke.mp4)`. Caveat: `--virtual-time-budget` starves the real-time encoder now and then, so a run can hang or finalize empty — a PASS is meaningful, a hang/empty means re-run (notes in the file header). On-headset there is no virtual clock.
- [x] Floorplan PNG rasterizes (`toDataURL`) and shot-list Markdown builds in a real browser via the dev server — no runtime errors, anamorphic format surfaced.

The **desktop prep** surface (scene rename; per-camera lens/format/aspect/T-stop/height editing; floorplan & shot-list export; Enter/N keys) is fully usable and verifiable at a laptop before the headset is available.

- [x] **Blocking editor drives the real DOM headless** — `test/marks-editor-smoke.html` seeds a scene, boots the actual app, and clicks/types through the prep panel: add mark, edit Z, set a mark stance, reorder, delete — asserting the persisted scene after every step and that the panel stays expanded: `MARKS-SMOKE PASS`. `test/floorplan-check.html` renders the floorplan export for a walk→sit→lie path (screenshot: pose tags under non-standing marks).
- [x] **Landing buttons are hit-testable** — `test/hit-check.html` boots the app and asserts via `elementFromPoint` that nothing (the full-screen WebGL canvas in particular) covers **Enter AR** or the scene-bar buttons: `HIT-CHECK PASS`. Guards the canvas `pointer-events: none` contract — synthetic `.click()` smokes bypass hit-testing, so only this catches a covering layer (found live on the Quest 2026-07-09: every landing button dead).
- [x] **Controls-guide chips render** — `test/guide-smoke.html` renders both controller chip fans (full view, actor mode) and asserts every guide item drew a chip + leader line: `GUIDE-SMOKE PASS (9 chips)`. Screenshot the run to review copy/layout. Guide content itself is pure (`guide.ts`) and covered by 4 domain tests.
- [x] **Movable scan furniture (renderer half)** — `test/furniture-smoke.html` feeds a scan through the real `LocationRenderer`: labeled mesh re-centered on its footprint (source buffer untouched, world vertices where captured), hidden mode offers no grab targets, placements apply/reset, `commitFurniture` settles a lifted+tilted release flat and returns the right offsets: `FURNITURE-SMOKE PASS`. Pure half (footprint center, `quatYaw`, placement validation/normalize/round-trip) in domain tests.
- [x] **Hand tool wheel** — `test/wheel-smoke.html` renders the `WheelPanel` in both modes and drives a real raycast: sector hover + press routes `wheel-mode`, hub press routes `wheel-mode`, a miss consumes nothing: `WHEEL-SMOKE PASS`. Pure half (`wheel.ts`: mode-aware sector sets, ring hit-testing with 12-o'clock wrap, gaze-summon hysteresis + arm-length cap) in 4 domain tests.

**Dress/Block modes + tool wheel — on-headset (next QA pass):** look at the left hand → wheel appears; look away → it hides (no flicker at the boundary); hub or top sector flips Block/Dress; in Dress the grip grabs furniture but never actors (and the reticle stops offering placement); in Block pointing near a couch never hovers it; wheel More pins/unpins the detail panel; entering Dress with a hidden scan auto-ghosts it.

**On-headset (next QA pass):** guide chips readable at wrist distance and correctly mirrored on the left hand; guide auto-hides after 12 s; wrist `?` pins it and survives view switches; monitor parks on entering Cam View, grip-grab re-parks it, no face-chasing; eyes-mode commit ghosts the camera until you step back.

**Desktop 3D preview (pre-QA):** the landing page **Preview** button opens a non-XR orbit view of any scene — posed actors, blocking playback, per-camera lens views. Use it to pre-verify the *content* half of this checklist at a laptop (stance silhouettes, walk-to-chair-and-sit, footprint pose tags, camera framing/format width) so the headset hour spends itself on the AR-only half (anchors/drift, passthrough, fps, controllers, scan, video takes). `test/preview-smoke.html` renders it headless (`PREVIEW-SMOKE PASS`); `?gallery` renders all 10 stances in a row — screenshot it to review pose aesthetics without a headset.

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
- [ ] **Delete-mid-drag (regression):** grip-grab an actor, and *while still holding grip* aim at the wrist **Delete** and pull trigger. The actor vanishes cleanly, the drag ends immediately (reticle/placement return without releasing grip), and no ghost lingers — releasing grip afterward does nothing.
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
- [ ] Camera-View monitor readout shows the full line: name · lens · format · aspect · T-stop, AoV (H/Ø°), subject distance, **DOF near–far**, and frame width. (Defaults S35 / T2.8; both are editable from the wrist or the desktop prep page.)
- [ ] Wrist **Format** cycles S35 → FF → S16 → ANA2× on the active camera: at the same focal, FF visibly widens the monitor's view and S16 tightens it; ANA2× frames like half the focal. The frame-lines readout and the camera's frustum wedge update to match. With no camera yet, the cycle still changes frame lines + the format new cameras commit with.
- [ ] Wrist **T-stop** cycles T1.4 → 2 → 2.8 → 4 → 5.6 → 8 on the active camera; the monitor's DOF near–far readout tightens as the stop opens (and the DOF blur deepens if the toggle is on). A free value typed on the prep page (e.g. T2.2) steps from its nearest preset.
- [ ] Committing a camera on **Full-Frame** vs **Super 35** at the same focal length gives a visibly wider frame on FF (verify after setting format on the landing page, re-entering AR).
- [ ] Walk until two placed actors compose nicely, press **A** → label flashes `✓ CAM A committed`, gizmo with sightline cone appears at your head position.
- [ ] **Y** to Camera View: floating monitor shows the frame from CAM A — actor positions/sizes in-frame should match what you saw through the frame lines (this is the fidelity check: stand behind the gizmo and compare).
- [ ] Thumbstick steps focal length live in Camera View: FOV change is obvious and the readout under the monitor updates.
- [ ] Monitor shows dark background + grid floor (passthrough can't be captured — expected, documented).
- [ ] Place a second camera (Place: Cam mode or another A-commit); trigger-click gizmos to switch the active camera; monitor follows.
- [ ] Grip-drag a camera gizmo — monitor viewpoint moves with it after release.

## Phase 3 — Three views, locomotion + teleport

- [ ] **Y** cycles Full → Mini → Camera → Full. Any view reachable in ≤ 2 clicks (or 1 wrist tap).
- [ ] Miniature: whole blocked scene appears as a ≤ ~0.5 m diorama on a platform at waist height. Actors, camera gizmos, sightline cones, footprints all present and to scale.
- [ ] Live mirror check: have a second person... no wait, single user: enter Mini during playback (Phase 4) — the tiny actors move exactly as the full-scale ones did.
- [ ] Grip-grab moves the diorama; thumbstick rotates it; you can view it top-down like a table model.
- [ ] **Walk (IRL):** in Full view with an actor placed, physically walk around — the actor stays planted on the real floor (this is the same anchor test as Phase 1, and the on-location locomotion).
- [ ] **Glide (left stick):** push the left stick — you glide through the set in the direction you're **facing** (forward/back + strafe), ~1.8 m/s, no drift when centered. Turn your head and glide again: direction follows your gaze, not a fixed axis. Actors/cameras move together as one rigid set (nothing tears apart).
- [ ] **Snap-turn (right stick ← →):** in Full view with frame lines OFF, flick the right stick — the set yaws 30° per flick about your position (the spot under your feet stays put). **Direction check:** flick RIGHT and you should now be facing further to your right (something that was on your right swings to front); flick LEFT is the mirror. Push-and-hold gives one turn, re-armed on release (not a spin).
- [ ] Glide out into a scanned/blocked area, then **Re-align** — content snaps back to true room registration and an anchored actor returns exactly to its real spot (verifies glide + turn both fold into the same offset the re-align clears).
- [ ] Frame lines ON: right stick steps focal length instead of snap-turning (no conflict); left stick still glides.
- [ ] Full-scale teleport: aim at a far floor point, click thumbstick → quick 150 ms fade, scene shifts so that point is at your feet. No smooth slide, no nausea.
- [ ] Wrist **Re-align** snaps content back to true room registration after any mix of walk / glide / turn / teleport.
- [ ] **Teleport-then-Mini (regression):** thumbstick-click to teleport, and immediately (within the fade) press **Y** to Miniature. The diorama shows correctly on the platform — the scene does *not* pop back to life-size overlapping the room, and the platform isn't left empty.
- [ ] **Comfort:** a few minutes of glide + snap-turn shouldn't induce sickness at the default speed. If smooth strafe feels too much, `LOCOMOTION_SPEED` in `main.ts` is the knob; snap-turn (vs smooth-turn) is already the comfort default.

## Phase 4 — Keyframes & playback

- [ ] Select Actor 1, press **B** → numbered footprint `1` under it, label flashes `KF 1 ✓`.
- [ ] Drag the actor 3 m away, rotate it, **B** again → footprint `2` + dotted path between marks.
- [ ] Repeat for Actor 2 (2–3 keyframes crossing Actor 1's path).
- [ ] 6th **B** on one actor flashes `MAX 5 KFs` and stores nothing.
- [ ] Wrist **▶ Play**: both actors walk their paths **simultaneously**, ~1.4 m/s, legs/arms swinging, slight bob; they face their direction of travel and settle into the keyframed facing on arrival.
- [ ] Wrist **Pace − / +**: the readout steps (0.4–3.0 m/s) and the *same* blocking plays back visibly slower/faster; the scrub playhead keeps its relative position.
- [ ] Scrub the wrist slider: timeline jogs smoothly both directions; pause/play resumes from the playhead.
- [ ] **⏹ Stop** returns actors to their placed (rest) positions.
- [ ] **Clear-mid-scrub (regression):** scrub an actor to a mid-path pose (so it sits away from its placed spot), then wrist **Clear KF**. The actor snaps back to its authored rest position (not left frozen mid-path), and afterward still tracks the real floor when you walk (it isn't stuck ignoring anchor drift).
- [ ] **Delete-after-playback (regression):** with one keyframed actor and one plain anchored actor, press **▶ Play** and let it run to the end (don't press Stop), then delete the keyframed actor. Walk a loop — the remaining actor still holds to the real floor (deleting the last keyframed actor must not freeze anchor drift for everyone else).
- [ ] Wrist **⧉ Dup** on a selected actor with a path: a new-colored clone appears ~0.6 m over with the whole path copied; on a camera: a clone with the identical lens/format one step over.
- [ ] Wrist **↶ Undo** reverses the last action (place / move / keyframe / delete / duplicate / camera commit); **↷ Redo** re-applies it. Both buttons are highlighted only when there's something to undo/redo. Delete an actor, Undo → it returns with its keyframes and notes intact.
- [ ] Repeat playback while in **Miniature** view — identical blocking in the diorama.
- [ ] fps ≥ 70 with 4 actors playing.

## Phase 4b — Stance & depth of field

- [ ] Select an actor, wrist **Stance ▸** → the button label flashes the pose short-name and cycles through all 10: standing → lean L → lean R → seated (chair) → seated (lounge) → seated (cross) → lie up → lie down → side L → side R → back to standing. Each pose visibly changes the gray-box figure (leans tilt; seated lowers the hips with bent knees; lying swings the body flat on the floor).
- [ ] Sanity the four laying poses read as intended (flat face-up vs face-down; on-side facing left vs right). Tune the first-pass angles in `pose.ts` (`STANCES`) if a pose reads wrong — the numbers are on-headset-tunable by design.
- [ ] A seated/lying actor **stays posed** as you walk around it (stance persists; it doesn't pop back to standing).
- [ ] Give a seated actor a blocking path and **Play**: it stands to walk the path, then re-settles into its stance at the end (walking figures are always upright).
- [ ] **Walk to the chair and sit (per-keyframe stance):** with an actor standing, capture a mark; move it to a "chair" spot, capture a second mark still standing; set stance **Seated (chair)**, capture a third mark at the same spot. The footprint labels read `1`, `2`, `3 · Seated`. **▶ Play**: it walks upright to the chair, then sits during the settle beat and stays seated. **Scrub** back before the chair: standing again mid-path.
- [ ] Legacy marks (captured before this build, no stance tag) still play back holding the actor's rest stance.
- [ ] **Undo** after a stance change reverts the pose; the desktop prep page shows a per-actor **Stance** dropdown that matches (set it there without the headset too).
- [ ] Wrist **DOF** toggle (in Camera View with an actor in frame): with a foreground actor in focus and something at a very different distance, toggling DOF **on** softens the far/near element while the actor stays sharp; **off** returns a fully sharp frame. Lower the camera's **T-stop** (prep page) → shallower focus (more blur); a longer lens → more blur.
- [ ] **📷 Capture** with DOF on: the PNG shows the same blur as the monitor.
- [ ] **Perf:** DOF on + Camera View open + a few actors → fps ≥ 70. If it sags, DOF is off by default for a reason; leave it off while composing and flick it on to check focus. The blur cap is `maxCoCPx` in `cameraView.ts`.

## Phase 5 — Notes, persistence, export

- [ ] Select an actor → wrist **+ Note** → dom-overlay dialog appears with the system keyboard; type a line as *Dialogue* → card appears beside the actor **in quotes**; add an *Action* note → plain card, stacked below.
- [ ] Wrist **Notes** toggles all cards.
- [ ] Exit AR → landing page lists the scene with actor/camera counts. **Restart the browser entirely**, reload the page: scene still listed; Enter AR: actors, keyframes, notes, cameras all restored (positioned relative to where you start the session — stand at your original start point).
- [ ] Duplicate & Delete work from the scene list; Export downloads `.setview.json`; Import brings it back as a new scene.
- [ ] In Camera View, press **A** (or wrist 📷): PNG downloads named like `scene-1-cam-a-35mm-20260704-193212.png`; open it: 1920 px wide, correct aspect (e.g. 1920×803 for 2.39:1), slate bar burned in at the bottom (scene, camera, focal, aspect, date).

### Video takes (wrist ⏺ Rec)

- [ ] With an active camera, wrist **⏺ Rec** → button lights and shows a ticking take clock (`⏺ 0:05`); press again → log shows `saved …` and the file lands in the headset's Downloads (open the Files app), named like the PNG but `.mp4`/`.webm`. Play it back on the headset: it's the monitor's frame, correct aspect, smooth (not a slideshow).
- [ ] **The camera rolls while you move:** start a take, switch to Full view, walk/glide around the set, **▶ Play** the blocking — the recorded video shows the camera's fixed framing with actors walking through it (not your head view).
- [ ] **Cut mid-take:** with two cameras, start a take, select the other camera — the video cuts to the new framing at that moment. Cycling aspect mid-take letterboxes instead of stretching.
- [ ] **Mini view mid-take:** switch to the miniature while rolling — the recorded framing stays life-size and unchanged (the camera films the set, not the diorama; uniform scale cancels through the lens camera).
- [ ] **DOF on** while recording: the video shows the same blur as the monitor.
- [ ] **Ends safely:** delete the active (and only) camera mid-take → take stops and saves what it has. Exit AR mid-take → same. A take auto-stops at 5:00 (`MAX_RECORD_S`).
- [ ] **Perf:** recording + Camera View + a few actors → fps ≥ 70 (the encoder is the only new per-frame cost; the RTT pass is the same single pass as Camera View). If it sags, stop the take, compose, then record.

## Phase 6 — Location scan & walkthrough

Prereq: Space Setup done on the headset (Settings → Environment Setup → Space Setup). Quest 3 / 3S class device; the session log line should read `mesh=yes`.

- [ ] Wrist **Scan Room** → within a second or two the log shows `✓ scanned N meshes · X.Xk tris · W×D m` and the room appears as a translucent **Ghost** overlay. **Walk the room edges**: ghost walls/furniture should hug the real ones (this is the scan-registration test — same stakes as the Phase 1 drift loop).
- [ ] If the log says `no room mesh yet — asking the system to run room capture…`, the OS room-capture flow should appear; complete it and the scan should land when you return.
- [ ] Wrist **Loc:** cycles Hidden → Ghost → Solid. Solid: the gray-box room replaces passthrough geometry visually; actors placed earlier still sit correctly on the floor.
- [ ] **Occlusion sanity (Solid):** put an actor behind a scanned wall — the wall hides the actor. Switch to Ghost — the actor shows through.
- [ ] **Camera View:** with Loc set to Hidden, open Camera View — the monitor still shows the scanned set behind the actors. 📷 Capture: the PNG includes the room.
- [ ] **Miniature:** Y-cycle to Mini with a scan present — the diorama includes the dollhouse room, centered on the platform. Set Ghost if the walls block your view of the actors.
- [ ] **Walkthrough (the location-scout payoff):** exit AR, walk to a *different* room, Enter AR, load the scene, set **Loc: Solid** → the scanned location surrounds you at full scale; teleport (stick-click) to move through it; place actors/cameras inside it and frame shots.
- [ ] **Persistence:** restart the browser → scene list shows `· location scan`; load it → scan reappears (IndexedDB). Export JSON → file is several MB; Import on any device → scan restores.
- [ ] **Undo:** re-scan the room, then wrist **↶ Undo** → the previous scan comes back. **Remove scan** on the landing page → prep panel shows "no scan"; Undo (in AR) restores it.
- [ ] **Scan while teleported** is refused with a log message ("Re-align first") — expected, not a bug.

## Performance sweep (any phase)

- [ ] 6 actors + 3 cameras + Camera View open: fps readout ≥ 70, no heat warnings in 10 min.
- [ ] If fps sags: close Camera View (kills the RTT pass) and re-check — if that recovers it, lower `RT_BASE_W` in `cameraView.ts`.
- [ ] With a location scan **Solid** + Camera View open (worst case: room drawn twice — eyes + RTT): fps ≥ 70. If it sags, set Loc to Hidden while composing and rely on the monitor, or Ghost only for spot checks.

## Known tuning knobs (edit & hot-reload)

- Wrist panel placement feels wrong → `WRIST_POS` / `WRIST_ROT_X` at the top of `main.ts`.
- Frame lines too close/far → `FRAME_LINE_DIST` in `cameraView.ts`.
- Diorama size → `MINI_SCALE` in `views.ts`.
- Monitor size/distance → `MONITOR_IMG_W` in `cameraView.ts`, follow distance in `CameraSystem.update`.
