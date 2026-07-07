# SetView roadmap

What SetView is today and where it's headed. Dated so it stays honest.

## Shipped (v0.1, as of 2026-07-07)

- Actors on the real floor, anchored against drift; grab/move/rotate.
- Blocking keyframes + simultaneous playback with a procedural walk, adjustable pace.
- **Actor stance** — 10 gray-box poses (stand, lean L/R, seated chair/lounge/cross-legged, lying flat up/down, lying on side L/R).
- Cameras with real, format-aware optics (Super 16 / Super 35 / Full-Frame / S35 anamorphic), free focal length, T-stop, aspect; angle-of-view / DOF / frame-width readouts.
- **Simulated depth of field** on the virtual monitor + PNG captures (toggle, off by default).
- Three views (full / miniature / camera) + teleport, smooth-glide, and snap-turn locomotion.
- Notes, PNG capture with a burned-in slate, floorplan PNG + Markdown shot-list export.
- Location scan (Quest Scene Mesh) with hidden/ghost/solid walkthrough; scans travel in exported JSON.
- localStorage autosave + JSON export/import; undo/redo; duplicate.

## Near term (headset-free-buildable)

- **Per-keyframe stance** — let an actor walk to a chair and sit (stance on each mark, not just per actor). The data model and rig already support arbitrary poses; this is a keyframe-schema + playback-hold change.
- **Sensor-format switch from the wrist** — today format/T-stop are set on the desktop prep page; add an in-AR cycle so S16/S35/FF is changeable through the lens.
- **Richer poses** — an elbow joint (arms rest on thighs when seated), a few gesture poses (pointing, reaching), and left/right-hand-on-hip variants.
- **DOF tuning** — expose focus pull (rack focus between actors) and a bokeh-quality setting; validate the blur budget on-headset and pick the default tap count.

## The realistic-rendering path (Unreal handoff)

The goal: keep SetView as the fast, in-location blocking tool, and hand a shot to **Unreal Engine** for realistic lighting on the subjects.

- **The bridge is the scene JSON.** Every export already carries the full, engine-agnostic scene: actor positions + facing + **stance**, blocking keyframes, cameras (position, rotation, focal length, sensor format, T-stop, aspect), and — when present — the location-scan geometry (embedded, validated). That is exactly what an importer needs.
- **Planned:** a small Unreal importer (Python/Editor Utility or a USD/Datasmith bridge) that reads a `.setview.json` and lays out: a CineCameraActor per camera (physical focal length + sensor width map 1:1 to Unreal's `Filmback`/`CurrentFocalLength`), a skeletal-mesh MetaHuman (or placeholder) per actor at its mark and pose, and the scanned room as a static mesh. Blocking keyframes become a LevelSequence.
- **Why this order:** SetView's optics are already the same physical model Unreal uses (gate width + focal length → FOV; T-stop + CoC → DOF), so a camera crosses over faithfully. The gray-box actor becomes a lit, textured human in Unreal without re-blocking.

## Lighting plan (further out)

- **In-app lights** — place point/spot/area lights in the scene (same reticle + gizmo pattern as cameras), with intensity, color temperature, and cone angle. Pure data in the model; a lighting-plan PNG export alongside the floorplan.
- **Simulated preview** — a cheap real-time approximation on-headset (the perf budget rules out full GI), enough to judge coverage and shadows-as-blocking. The *accurate* lighting render stays in Unreal; SetView's job is the plan and the previz, not the final pixel.
- **Handoff** — lights travel in the scene JSON too, so the Unreal importer places them as real light actors for the photoreal pass.

## Not planned (by design)

- Photoreal rendering inside SetView (that's the Unreal path — WebXR + the 72 fps Quest budget can't do it, and shouldn't try).
- Capturing passthrough/real-world pixels (the platform never exposes them).
- Multi-user / networked sessions, audio.
