# SetView

An augmented-reality **previsualization & shot-blocking tool** for filmmakers, built by/for working cinematographers. Stand in your real location, place virtual actors on the real floor, give them blocking marks, attach dialogue/action notes — and most importantly, look through a virtual lens to **find and export your frame**.

- **Runtime:** WebXR `immersive-ar` in the browser. No Unity, no native builds, no backend.
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

Other scripts: `npm run typecheck`, `npm test` (domain-logic tests: lens math, timelines, model), `npm run build`.

## Running on the Quest 3

WebXR requires a **secure context** — that's why the dev server is HTTPS. `localhost` is exempt on your dev machine, but the headset reaches you over LAN, so it needs the cert.

1. Make sure the headset and dev machine are on the **same Wi-Fi network**.
2. Run `npm run dev` and note the **Network** URL (e.g. `https://192.168.0.95:5173/`).
3. In the headset, open the **Meta Quest Browser** and enter that URL exactly (including `https://`).
4. You'll hit a certificate warning ("Your connection is not private", `NET::ERR_CERT_AUTHORITY_INVALID`) because the cert is self-signed. Tap **Advanced → Proceed to 192.168.x.x (unsafe)**. This is safe on your own LAN; you'll need to re-accept occasionally (the cert is regenerated when `node_modules` is wiped).
5. The SetView landing page loads. If it says *immersive-ar supported*, press **Enter AR**.
6. Grant the passthrough / spatial permissions the browser asks for. You're in.

**Android XR / Samsung headset browser:** identical flow — same URL, same cert warning, same permissions. The app feature-detects everything (anchors, hand-tracking, dom-overlay) and degrades gracefully; the debug readout on the wrist menu tells you what the session actually granted.

**Troubleshooting**

| Symptom | Fix |
|---|---|
| Enter AR disabled | Read the diagnostic box: not HTTPS, no `navigator.xr`, or no immersive-ar. Use the headset browser, not desktop. |
| Page unreachable from headset | Same network? Firewall blocking port 5173? macOS: allow node in System Settings → Firewall. |
| Cert warning loops | Clear site settings for the IP in the Quest browser and re-accept. |
| Entered AR but no passthrough | Make sure the browser has camera/passthrough permission for the site. |

## Controls cheat-sheet

### Phase 0–1 — placing & moving actors
| Input | Action |
|---|---|
| Point at floor | White reticle sits on the detected surface |
| **Right trigger** on reticle | Place an actor (feet planted, faces you) |
| **Right trigger** on an actor | Select it (yellow ring) |
| **Right grip (hold)** on an actor | Grab & drag — stays floor-locked while dragging |
| **Right stick ← →** while holding | Rotate the actor's facing |
| Wrist **Delete** | Delete the pointed-at (or selected) actor/camera |
| Wrist **Drift** | Toggle drift-test grid at the session origin + debug readout |
| **X** | Toggle placement mode: Actor ↔ Camera |

The **wrist menu** floats above your **left** controller — point at it with the right controller and pull the trigger.

### Phase 2 — cameras & lenses
| Input | Action |
|---|---|
| Wrist **Frame Lines** | Eyes-as-camera mode: focal-correct frame rectangle + letterbox in your own view. Walk to find the frame. |
| **Right stick ← →** | Step focal length 16/24/35/50/85/135 mm (in Frame Lines or Cam View) |
| **A** (Frame Lines on) | Commit your head pose as a new camera setup (CAM A, B, …) |
| Place: Cam + **trigger** | Alternative: drop a camera gizmo at your head pose |
| Wrist **Aspect** | Cycle 2.39:1 → 16:9 → 4:3 |
| **Y** / wrist **Cam View** | Virtual monitor shows the active camera's frame (see limitation below) |
| **Trigger** on a camera gizmo | Make it the active camera |
| **Grip** on a camera gizmo | Grab & re-position it (full 6-DOF) |

### Phase 3 — views & teleport
| Input | Action |
|---|---|
| **Y** | Cycle view: Full-scale → Miniature → Camera View |
| **Grip** (miniature view) | Grab the diorama to move it; stick ← → rotates it |
| **Right stick click** | Teleport: shifts the virtual scene so the aimed floor point comes to you (150 ms fade) |
| Wrist **Re-align** | Undo all teleports — snap content back to true AR registration |

### Phase 4 — keyframes & playback
| Input | Action |
|---|---|
| **B** (actor selected) | Store its current position/facing as the next keyframe (max 5, numbered footprints + dotted path) |
| Wrist **▶ Play / ⏸ Pause** | Play all actors' blocking simultaneously (walking speed ≈ 1.4 m/s, procedural walk) |
| Wrist slider | Scrub/jog the timeline |
| Wrist **⏹ Stop** | Stop & return actors to their placed positions |
| Wrist **Clear KF** | Clear the selected actor's keyframes |

### Phase 5 — notes, capture, scenes
| Input | Action |
|---|---|
| Wrist **+ Note** (actor selected) | dom-overlay text input (system keyboard); dialogue in quotes, action beats plain |
| Wrist **Notes** | Toggle all note cards |
| **A** (in Cam View) / wrist **📷 Capture** | Download the active camera's frame as PNG — 1920 px wide, burned-in slate (`scene-camera-focal-timestamp.png`) |
| Landing page | Scene list: load / duplicate / delete / export JSON / import JSON. Autosaves to localStorage. |

**Hands (no controllers):** pinch = trigger (place/select on the gaze/hand-ray reticle). The wrist menu and buttons need controllers — noted limitation.

## Pragmatic choices & known limitations

- **The virtual monitor shows virtual content only.** Passthrough camera pixels cannot be captured or re-projected by WebXR (by design, for privacy), so you cannot "zoom the real world". Camera View is therefore a *director's-viewfinder overlay*: actors composited over a neutral dark background with a subtle grid floor for spatial context. To judge the real location through a lens, use **Frame Lines** (eyes-as-camera) and physically stand at the camera position — that's the workflow the tool optimizes for. Exported PNGs show the same virtual-only frame.
- **Lens math:** Super 35 modeled as a constant **24.89 mm-wide** gate across all aspect ratios (horizontal FOV depends only on focal length, like a real director's finder). Vertical FOV follows from the aspect.
- **Anchors are position-only.** Orientation comes from the data model. Yaw drift on a standing figure is negligible; position drift is what kills the illusion, and that's what anchors correct.
- **Scene restore is relative to session start.** `local-floor` origin is set where you begin each AR session (persistent anchors are out of scope for v1). Re-entering a saved scene, stand roughly where you originally started, facing the same way. Within one session, placements are anchor-locked to the real room.
- **Teleport de-registers AR on purpose.** In passthrough you physically exist in the room, so "teleport" shifts the *virtual content* to you (e.g. to stand at a far camera position without walking). Objects placed while shifted are not anchored. **Re-align** restores true registration and re-anchoring.
- **Notes need dom-overlay.** Quest and Android XR browsers support it; if a session lacks it, the note button explains instead of failing.
- **No depth occlusion** of virtual actors by real objects, no 3D scan import, no multi-user, no audio — explicitly out of scope for v1.
- **Performance budget:** flat-shaded Lambert primitives, no shadows, no postprocessing, foveation 1.0, one 1024-wide render-target pass only while Camera View is open. Designed to hold 72 fps on Quest 3; watch the fps readout on the wrist panel.

## Repo layout

```
src/
  model.ts        Scene data model — PURE data, fully typed (design source of truth)
  lens.ts         Super-35 lens math — PURE
  timeline.ts     Keyframe timing/interpolation — PURE
  session.ts      WebXR session, feature detection, hit-test, anchors, reset logging
  input.ts        Controllers + hands: trigger/grip/buttons/sticks with edge detection
  actors.ts       Humanoid meshes, floor-locking, labels, notes cards, walk cycle
  keyframes.ts    Keyframe capture, footprints/paths, playback driving actors
  cameraView.ts   Camera gizmos, virtual monitor (RTT), frame lines, PNG capture
  views.ts        Full-scale / miniature / camera view, teleport, fades
  ui.ts           Wrist panel, labels, debug log, drift marker, landing page, note editor
  persistence.ts  localStorage autosave, scene list, JSON export/import
  main.ts         Wiring + the per-frame loop + input routing
test/domain.test.ts  Node-runnable tests for the pure domain modules
```

## Port-to-Unity notes

The domain core (`model.ts`, `lens.ts`, `timeline.ts`) is deliberately renderer-free plain data — port these first, verbatim, and the rest is view code.

| Module | Unity equivalent |
|---|---|
| `model.ts` | Plain C# classes + `[Serializable]`; `SceneData` ⇄ JSON via `JsonUtility`/Newtonsoft |
| `lens.ts` | Static `LensMath`; `Camera.usePhysicalProperties` + `sensorSize = (24.89, h)` gives the same FOV natively |
| `timeline.ts` | Static `Timeline` class; or bake into an `AnimationClip` at author-time |
| `session.ts` | AR Foundation `ARSession` + `ARRaycastManager` (hit-test) + `ARAnchorManager` (anchors) |
| `input.ts` | Unity XR Interaction Toolkit `InputActionReferences` (trigger/grip/primary/secondary/stick) |
| `actors.ts` | Actor prefab (primitives), `ARAnchor` per actor, `TextMeshPro` labels, Animator for walk bob |
| `keyframes.ts` | MonoBehaviour playing `Timeline` samples; footprint prefabs + `LineRenderer` (dashed material) |
| `cameraView.ts` | Second `Camera` → `RenderTexture` on a quad; `ScreenCapture`/`Texture2D.ReadPixels` for export |
| `views.ts` | Scale/transform a content root; `XROrigin` offset for teleport; fade via full-screen sphere |
| `ui.ts` | World-space Canvas on the left controller; XRI ray interactor for clicks |
| `persistence.ts` | `Application.persistentDataPath` JSON files |

Conventions that carry over: **meters everywhere**, y-up, actor origin at the feet, camera forward = −Z (Unity: +Z — negate on import), `rotationY` heading with 0 = +Z.
