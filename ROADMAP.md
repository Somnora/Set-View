# SetView roadmap

What SetView is today and where it's headed. Dated so it stays honest.

## Shipped (v0.2, as of 2026-07-28)

- Actors on the real floor, anchored against drift; grab/move/rotate.
- **Actor scaling (added 2026-07-28)** — dynamic height/scale adjustments (0.5m to 2.5m) via wrist menu and desktop prep UI with scale-aware proximity ghosting.
- Blocking keyframes + simultaneous playback with a procedural walk, adjustable pace.
- **Actor stance library & 16 rich poses (updated 2026-07-28)** — 16 gray-box jointed poses (standing, leaning L/R, seated chair with forearm/thigh rests, seated lounge, seated cross-legged, crouching, kneeling, lying flat up/down, lying side L/R, pointing, reaching, hand-on-hip).
- **Per-keyframe stance & scale** — each mark records stance, scale, facing, and position at capture; playback holds it at the mark and interpolates upright walking between marks ("walk to chair and sit").
- Cameras with real, format-aware optics (Super 16 / Super 35 / Full-Frame / S35 anamorphic), free focal length, T-stop, aspect; angle-of-view / DOF / frame-width readouts. Format + T-stop cycle from the wrist in-AR as well as the prep page.
- **Focus pull & rack focus (added 2026-07-28)** — interactive focus pulling in Camera View; tap actors or adjust focus distance smoothly to rack focus between foreground and background subjects with thin-lens circle-of-confusion falloff.
- **Simulated depth of field** on the virtual monitor + PNG captures (toggle, off by default).
- Three views (full / miniature / camera) + teleport, smooth-glide, and snap-turn locomotion.
- Notes, PNG capture with a burned-in slate, floorplan PNG + Markdown shot-list export.
- **In-app VR lighting rig & lighting plan export (added 2026-07-28)** — place Point, Spot, and Area lights on set with intensity (lumens/lux), Kelvin color temperature, and cone angles. Generates a 2D vector lighting plan PNG alongside floorplan exports.
- **Video takes with mic audio (updated 2026-07-28)** — record virtual camera feed (any view mode, DOF included) mixed with headset microphone audio into an MP4/WebM clip saved on device; captures scratch dialogue and live director notes while blocking plays.
- **AI shot analysis assistant (added 2026-07-28)** — multimodal AI integration (Gemini) analyzing captured slates, camera specs, actor blocking, stances, and lighting setups to deliver coverage recommendations, continuity checks, and pacing analysis.
- **Unreal Engine 5.8 importer & handoff (added 2026-07-28)** — `import_setview.py` script reads `.setview.json` exports and sets up CineCameraActors (matching filmback & focal length), MetaHumans / skeletal placeholders (matching SetView stances, scale & keyframed Sequencer tracks), virtual lights (matching Kelvin & intensity), and scanned room geometry.
- **VR wrist HUD menu toggle & triple menu access** — always-on left-wrist tool wheel, hard Y-button toggle parking menu in front of eyes, and wrist HUD toggle for instant optics/camera status readouts.
- Location scan (Quest Scene Mesh) with hidden/ghost/solid walkthrough; moveable scanned furniture; scans travel in exported JSON.
- localStorage autosave + JSON export/import; undo/redo; duplicate.
- **Desktop 3D preview & modern prep UI** — orbit view of any scene on landing page: posed/scaled actors, blocking playback, lighting rig editor, per-camera lens views; pre-verifies content without a headset.

## Near term (headset-free-buildable)
- **Multi-camera live monitoring (video village)** — simultaneous grid view of multiple active camera feeds on a virtual desk split board.
- **Gaussian splat & GLB location import** — import high-poly GLBs or Gaussian Splat point clouds of remote locations into IndexedDB scan storage.
- **Stage 2 smart scan furniture swapping** — replace volumetric gray-box scan meshes with curated 3D model prefabs.

## The realistic-rendering path (Unreal handoff)

The goal: keep SetView as the fast, in-location blocking tool, and hand a shot to **Unreal Engine** for realistic lighting on the subjects.

- **The bridge is the scene JSON.** Every export carries the full, engine-agnostic scene: actor positions + facing + **stance** + **scale**, blocking keyframes, cameras (position, rotation, focal length, sensor format, T-stop, aspect, focus distance), virtual lights (type, lumens, Kelvin, cone angle), and location-scan geometry.
- **Shipped:** `Content/Python/import_setview.py` in UE 5.8 reads `.setview.json` and lays out CineCameraActors, MetaHuman skeletal meshes at exact stances/scale with LevelSequence tracks, matching lights, and static scan meshes.

## Not planned (by design)

- Photoreal rendering inside SetView (that's the Unreal path — WebXR + 72 fps Quest budget shouldn't try to render photoreal pixels).
- Capturing passthrough/real-world pixels (the platform never exposes them).
- Multi-user / networked sessions (WebRTC multi-user is a candidate v2).
