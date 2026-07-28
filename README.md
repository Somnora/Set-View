# SetView

An augmented-reality **previsualization & shot-blocking tool** for filmmakers, built by/for working cinematographers. Stand in your real location, place virtual actors on the real floor, give them blocking marks, attach dialogue/action notes, adjust lighting rigs — and most importantly, look through a virtual lens to **find, analyze, and export your frame**.

- **Runtime:** WebXR `immersive-ar` in the browser. No Unity, no native builds, no backend required for core AR.
- **Primary device:** Meta Quest 3 (Meta Quest Browser). Secondary: Android XR / Samsung headset browser.
- **Stack:** Three.js + TypeScript + Vite, plain ES modules.

---

## Quick start (dev machine)

```bash
npm install
npm run dev
```

Vite starts an **HTTPS** dev server (self-signed cert via `@vitejs/plugin-basic-ssl`) bound to your LAN:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.x.x:5173/     ← this is the one the headset uses
```

Other scripts: `npm run typecheck`, `npm test` (domain-logic tests: lens math, timelines, model, lighting, focus pull), `npm run build`.

## Running on the Quest 3

WebXR requires a **secure context** — that's why the dev server is HTTPS. `localhost` is exempt on your dev machine, but the headset reaches you over LAN, so it needs the cert.

1. Make sure the headset and dev machine are on the **same Wi-Fi network**.
2. Run `npm run dev` and note the **Network** URL (e.g. `https://192.168.0.95:5173/`).
3. In the headset, open the **Meta Quest Browser** and enter that URL exactly (including `https://`).
4. You'll hit a certificate warning ("Your connection is not private", `NET::ERR_CERT_AUTHORITY_INVALID`) because the cert is self-signed. Tap **Advanced → Proceed to 192.168.x.x (unsafe)**. This is safe on your own LAN; you'll need to re-accept occasionally (the cert is regenerated when `node_modules` is wiped).
5. The SetView landing page loads. If it says *immersive-ar supported*, press **Enter AR**.
6. Grant the passthrough / spatial permissions and microphone permission (for mic audio takes) when prompted. You're in.

**Android XR / Samsung headset browser:** identical flow — same URL, same cert warning, same permissions. The app feature-detects everything (anchors, hand-tracking, dom-overlay, audio) and degrades gracefully; the debug readout on the wrist menu tells you what the session actually granted.

**Troubleshooting**

| Symptom | Fix |
|---|---|
| Enter AR disabled | Read the diagnostic box: not HTTPS, no `navigator.xr`, or no immersive-ar. Use the headset browser, not desktop. |
| Page unreachable from headset | Same network? Firewall blocking port 5173? macOS: allow node in System Settings → Firewall. |
| Cert warning loops | Clear site settings for the IP in the Quest browser and re-accept. |
| Entered AR but no passthrough | Make sure the browser has camera/passthrough permission for the site. |

## Major Features & Architecture

### 1. Advanced Actor Rigging & Stance Library (16 Rich Poses & Scaling)
- **16 Rich Stances:** Standing, leaning (L/R), seated chair (with forearm/thigh rests), seated lounge, seated cross-legged, crouching, kneeling, lying flat (up/down), lying side (L/R), and gesture poses (pointing, reaching, hand-on-hip).
- **Actor Scaling:** Dynamic height adjustment (0.5m to 2.5m) via the wrist menu and desktop prep UI, with scale-aware proximity ghosting.
- **Per-Keyframe Stance & Scale:** Each keyframe mark stamps stance, scale, facing, and position. Playback smoothly interpolates walking between marks and settles into target stances ("walk to chair and sit").

### 2. Multi-Path Tool Wheel & VR Wrist HUD Menu
- **Triple Redundant Menu Access:** (1) Left-hand tethered tool wheel riding the wrist, (2) Hard **Y button** toggle parking the wheel head-locked in front of your eyes, (3) Right-hand raycast pointing + trigger/pinch.
- **Wrist HUD Toggle:** Toggle concise HUD readouts (lens, active camera, T-stop, focus distance, recording status) directly on the wrist.
- **Armed Placement Safety (`PlaceArm`):** Select mode by default; placement requires explicitly arming `Actor` or `Camera` via the wheel or **X button**, preventing accidental tap-spams.

### 3. Focus Pull, Rack Focus & Simulated Optics
- **Rack Focus Control:** Interactive focus pulling in Camera View — tap/select target actors or adjust focus distance smoothly to transition focus between foreground and background subjects.
- **Format & Aperture Realism:** Real sensor formats (Super 35, Full-Frame, Super 16, Anamorphic 2×) with adjustable T-stops (T1.4–T8) driving physical circle of confusion depth-of-field shaders.

### 4. Audio-Enabled Video Takes with Mic Passthrough
- **Mic Audio Takes:** Wrist **Rec** captures virtual camera video (24–30 fps) mixed with the headset's microphone audio via Web Audio API & MediaRecorder (`.mp4` / `.webm`), recording scratch dialogue and ambient director notes live during blocking playback.

### 5. In-App VR Lighting Rig & Plan Export
- **Virtual Lighting Rig:** Place Point, Spot, and Area lights on set with full control over intensity (lumens/lux), Kelvin color temperature (2700K warm tungsten to 6500K daylight), and cone angles.
- **Lighting Plan Export:** Export 2D vector lighting plans (**⬇ Lighting Plan PNG**) with gaffer details, light positions, key/fill annotations, and throw angles alongside floorplan diagrams.

### 6. AI Shot Analysis Assistant (Gemini Integration)
- **Automated Shot & Coverage Analysis:** Integrated AI assistant analyzes captured camera slates, lens data, actor blocking, stances, and lighting setups to suggest coverage shots, flag continuity issues, and evaluate scene pacing.

### 7. Modern Desktop Prep UI & 3D Orbit Preview
- **Laptop Previz Surface:** Full desktop scene editing before putting on the headset — edit actor marks, stances, scale, camera specs, lighting rigs, preview 3D orbit playback, and export floorplans, shot lists, and lighting diagrams.

### 8. Unreal Engine 5.8 Handoff Importer
- **Seamless Studio Handoff:** Python-based importer (`import_setview.py`) for Unreal Engine 5.8 reads `.setview.json` exports and automatically sets up CineCameraActors (with matching filmback & focal lengths), MetaHuman skeletal meshes (matching SetView poses & scale), virtual lights (matching Kelvin & intensity), and LevelSequences. See [UNREAL-HANDOFF.md](file:///Users/jamesmcshane/Desktop/SetView/UNREAL-HANDOFF.md) for full documentation and workflow details.

---

## Controls cheat-sheet

**The tool wheel (your menu for everything):** a ring of tools that **always rides your left hand** — raise your hand and it's right there, drop your hand and it falls out of frame. **Controllers also have a hard menu button: press Y (left) to pop the wheel head-locked in front of your face** (press Y again to tuck it away). **To operate it: point your right hand/controller at a sector and pull the trigger (or pinch)**.

Sectors marked **▸** open a sub-wheel in place (Lens, Marks, Camera, Edit, Light, Scale) and the hub becomes **◂ Back**. The wheel switches between **Block** (plan the shot), **Dress** (adjust physical room furniture), and **Light** (place & tune set lights).

### Quick Control Matrix

| Input | Action |
|---|---|
| **Y** | Toggle tool wheel head-locked in front of face |
| **X** | Cycle Place tool mode: Off → Actor → Camera → Light → Off |
| **Point + Trigger / Pinch** | Select actor / camera / light or press wheel sector |
| **Right Grip (hold)** | Grab & move selected actor, camera, scanned furniture, or light |
| **Right stick ← → (holding)** | Rotate facing / yaw of held object |
| **Wrist HUD Toggle** | Pin/unpin the concise VR wrist HUD readout |
| **Wrist Frame Lines** | Eyes-as-camera mode with focal-correct letterboxing & specs |
| **A (in Frame Lines)** | Commit head pose as a new camera setup (CAM A, B, ...) |
| **B (actor selected)** | Capture keyframe mark (stores position, facing, stance, scale) |
| **Wrist ▶ Play / ⏸ Pause** | Play/pause scene blocking playback |
| **Wrist Focus Pull / Touch** | Rack focus to selected actor or focus distance in Camera View |
| **Wrist ⏺ Rec** | Record virtual camera feed + mic dialogue to MP4/WebM |
| **Wrist Light ▸** | Place & adjust Point/Spot/Area lights (Kelvin, lumens, cone) |
| **Wrist Scale ▸** | Adjust selected actor scale (0.5x – 2.5x height) |
| **Wrist AI Analysis** | Trigger AI Shot Analysis Assistant for coverage feedback |

---

## Repo layout

```
src/
  model.ts        Scene data model + sensor formats + lighting + scale — PURE data
  lens.ts         Lens math: FOV, angle of view, depth of field, focus pull — PURE
  timeline.ts     Keyframe timing/interpolation + stance/scale interp — PURE
  history.ts      Undo/redo snapshot stack over SceneData — PURE
  plan.ts         Floorplan + lighting plan projection + shot-list text — PURE
  pose.ts         Actor stance/pose joint targets (16 rich poses) — PURE
  locomotion.ts   Thumbstick glide + snap-turn math — PURE
  scan.ts         Location-scan data + binary/base64 codec + transforms — PURE
  recording.ts    Video-take policy + audio track mix math — PURE
  analysis.ts     AI Shot Analysis Assistant prompt payload & parser — PURE
  dof.ts          Depth-of-field shader pass for camera monitor
  recorder.ts     Virtual-camera video recorder: canvas + mic audio MediaRecorder
  session.ts      WebXR session, feature detection, hit-test, anchors, mic grant
  scanner.ts      Reads Scene Mesh off live XRFrame into scene space
  location.ts     Renders scanned room: hidden/ghost/solid + furniture moves
  scanStore.ts    IndexedDB blob store for scan geometry
  input.ts        Controllers + hands input routing & edge detection
  actors.ts       Humanoid meshes, scale, floor-locking, stance joints, walk cycle
  lights.ts       In-app VR lighting rig rendering & gizmos
  keyframes.ts    Keyframe capture, footprints/paths, playback driving actors
  cameraView.ts   Camera gizmos, virtual monitor (RTT), frame lines, focus pull
  preview.ts      Desktop (non-XR) 3D orbit preview: playback + lens views
  views.ts        Full-scale / miniature / camera view, teleport, fades
  ui.ts           Wrist panel, HUD toggle, debug log, landing page, desktop prep UI
  exporters.ts    Floorplan, Lighting Plan PNG + Markdown shot-list exporters
  persistence.ts  localStorage autosave, scene list, JSON export/import
  main.ts         Wiring + per-frame loop + input routing
test/domain.test.ts  Node-runnable tests for all pure domain modules
Content/Python/
  import_setview.py   Unreal Engine 5.8 scene importer script
  import_people.py    Unreal Engine 5.8 character & furniture asset importer
UNREAL-HANDOFF.md      Complete Unreal Engine 5.8 handoff guide & coordinate specs
```

---

## Port-to-Unity & Unreal Engine Handoff

SetView's pure domain model (`model.ts`, `lens.ts`, `timeline.ts`) provides clean export pipelines for both Unity and Unreal Engine 5.8:

- **Unreal Engine 5.8 Handoff:** Run `import_setview.py` (or `Content/Python/import_setview.py`) inside UE 5.8 to read `.setview.json` exports. It maps CineCameraActors (filmback, sensor gate, focal length, T-stop), MetaHumans / skeletal placeholders (stances, scale, keyframed Sequencer tracks), Rect/Point/Spot Lights (matching Kelvin & intensity), and Scanned Room geometry automatically. For complete instructions, see [UNREAL-HANDOFF.md](file:///Users/jamesmcshane/Desktop/SetView/UNREAL-HANDOFF.md).
- **Unity Port:** Port pure TypeScript domain modules directly to C# structs and classes. Sensor formats map to physical `Camera` properties, and keyframes map into `AnimationClip` keying.

