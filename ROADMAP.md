# SetView roadmap

What SetView is today and where it's headed. Dated so it stays honest.

## Shipped (v0.1, as of 2026-07-07)

- Actors on the real floor, anchored against drift; grab/move/rotate.
- Blocking keyframes + simultaneous playback with a procedural walk, adjustable pace.
- **Actor stance** — 10 gray-box poses (stand, lean L/R, seated chair/lounge/cross-legged, lying flat up/down, lying on side L/R).
- **Per-keyframe stance (added 2026-07-08)** — each mark records the stance at capture; playback holds it at the mark and walks upright between ("walk to the chair and sit").
- Cameras with real, format-aware optics (Super 16 / Super 35 / Full-Frame / S35 anamorphic), free focal length, T-stop, aspect; angle-of-view / DOF / frame-width readouts. Format + T-stop cycle from the wrist in-AR (added 2026-07-08) as well as the prep page.
- **Simulated depth of field** on the virtual monitor + PNG captures (toggle, off by default).
- Three views (full / miniature / camera) + teleport, smooth-glide, and snap-turn locomotion.
- Notes, PNG capture with a burned-in slate, floorplan PNG + Markdown shot-list export.
- **Video takes (added 2026-07-08)** — record the virtual camera's monitor feed (any view mode, DOF included) to an mp4/webm saved on device; play blocking while the camera rolls.
- Location scan (Quest Scene Mesh) with hidden/ghost/solid walkthrough; scans travel in exported JSON.
- localStorage autosave + JSON export/import; undo/redo; duplicate.
- **Desktop 3D preview (added 2026-07-09)** — orbit view of any scene on the landing page: posed actors, blocking playback, per-camera lens views; pre-verifies the content half of QA without a headset. CI (GitHub Actions) enforces the test/build gate on every push.
- **Desktop blocking editor (added 2026-07-09)** — the prep panel authors blocking, not just lenses: per-actor mark list (position, facing, per-mark stance, reorder, delete, add) with stance tags on the floorplan/shot-list exports. Author a scene at a laptop, Preview it, walk on set with the blocking built.

## Near term (headset-free-buildable)
- **Richer poses** — an elbow joint (arms rest on thighs when seated), a few gesture poses (pointing, reaching), and left/right-hand-on-hip variants.
- **DOF tuning** — expose focus pull (rack focus between actors) and a bokeh-quality setting; validate the blur budget on-headset and pick the default tap count.
- **Mic audio on video takes** — mix a `getUserMedia` audio track into the MediaRecorder stream so a skit take carries scratch dialogue (needs the headset mic-permission flow; today's takes are silent).
- **AI shot analysis** — captured PNGs/video takes plus the scene JSON (cameras, stances, blocking) are exactly what a multimodal model needs for coverage/continuity suggestions; an export-to-model flow (e.g. Gemini) is an integration, not a rewrite.

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
- Multi-user / networked sessions, spatial/scene audio (mic audio on video takes is the one exception, tracked above).
