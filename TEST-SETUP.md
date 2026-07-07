# SetView — Test Setup Directions

How to stand up and test SetView **without a headset** (dev machine, browser,
unit tests) and **with a headset** (Quest 3 / Android XR). This is the setup
companion to **TESTING.md**, which holds the per-phase on-headset checklist.

- Everything in **Part A** runs on a laptop and needs no XR hardware.
- **Part B** is the full headset bring-up (HTTPS over LAN, cert acceptance).
- **Part C** is a quick reference and troubleshooting.

---

## Prerequisites (one time)

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | Tested on v24. `node --version` to check. The test runner uses `--experimental-strip-types` to run TypeScript directly. |
| **npm** | Ships with Node. |
| **A Chromium browser on the dev machine** | Chrome/Edge/Brave — for the desktop smoke test (Part A). |
| **Install deps** | From the repo root: `npm install` |

```bash
cd /Users/jamesmcshane/Desktop/SetView
npm install
```

Available scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Starts the Vite **HTTPS** dev server on the LAN (headset + desktop). |
| `npm test` | Runs the pure domain unit tests (lens/DOF math, timeline, history, model, exports). No browser, no headset. |
| `npm run typecheck` | `tsc --noEmit` — full type check. |
| `npm run build` | Type-checks **and** produces a production bundle in `dist/`. |
| `npm run preview` | Serves the built `dist/` bundle over HTTPS (to test the production build). |

---

# Part A — Testing WITHOUT a headset

Everything here runs on the dev machine. This is where you verify all the pure
logic and the entire 2D "prep" surface before the Quest is ever involved.

## A1. Static checks (fastest signal)

```bash
npm run typecheck    # must print nothing (clean)
npm test             # must end with "N tests passed"
npm run build        # type-checks + bundles; must end with "built in …"
```

Expected right now: **typecheck clean · 44 tests passed · build 20 modules**.

What the 44 tests cover (all pure, headset-free):

- **Lens/optics** — horizontal/vertical/diagonal FOV, per-format FOV (S35 / Full
  Frame / Super 16), the anamorphic-2×-≡-half-focal identity, frame width at a
  distance, depth of field / hyperfocal (incl. the ∞-past-hyperfocal case).
- **Model** — factories, `stepFocal` preset snapping, **camera-name uniqueness
  after a delete** and the **27-camera no-hang** guard, deep import validation
  (malformed actor/camera rejected), `normalizeScene` defaults/repair.
- **Timeline** — segment timing at a given pace, `moveStats`, shortest-arc
  angle interpolation.
- **History (undo/redo)** — record/undo/redo round-trips, fresh-object
  isolation, redo-stack clearing, bounded depth.
- **Duplicate** — deep copy with fresh id, unique name, offset pose.
- **Exports** — floorplan projection math and shot-list text (incl. empty
  scene, single mark, notes, ∞ DOF, no-NaN).

To run a single area, the test file is `test/domain.test.ts` (plain Node, edit
and re-run `npm test`).

## A2. Desktop browser smoke test (the app actually boots)

The immersive AR view needs a headset, but the **landing page, scene
management, camera editor, and file exports** are ordinary web UI — test them
in a desktop browser.

```bash
npm run dev
```

Open the **Local** URL it prints (e.g. `https://localhost:5173/`) in Chrome.

- `localhost` is a secure context, so no cert warning on the dev machine.
- You will see the landing page with a diagnostics box that reads
  **"WebXR immersive-ar unavailable"** — that is **correct** on a desktop with
  no XR device. **Enter AR** is disabled by design.

**What to verify on desktop (no headset):**

- [ ] Page loads; **SetView** title, diagnostics box, scene list all render.
- [ ] Diagnostics explains *why* AR is unavailable (not a secure context / no
      `navigator.xr` / no immersive-ar). No blank page, no "Could not start the
      3D renderer" error.
- [ ] **+ New Scene** creates a scene; **N** key does the same; **Enter** does
      nothing while AR is unavailable (correctly gated).
- [ ] Each scene row: **Rename** (updates name), **Dup**, **Export** (downloads
      `*.setview.json`), **Del**, **Import JSON** (round-trips a scene back).
- [ ] Expand **Shots & exports** on a scene:
  - [ ] **Move pace (m/s)** field — type a value; clearing it restores the
        prior value (no `0`); out-of-range values clamp to 0.4–3.0.
  - [ ] Per-camera editor (only if the scene has cameras): **Lens mm**,
        **Format**, **Aspect**, **T-stop**, **Height**, tripod **Preset** —
        each edit persists (reload the page, values stick).
  - [ ] **⬇ Floorplan PNG** downloads a top-down diagram (actors with facing,
        numbered dashed keyframe paths, camera FOV wedges, 1 m grid + scale bar).
  - [ ] **⬇ Shot List** downloads a `.md` table (per camera: lens / format /
        aspect / stop / angle of view / height / subject distance / DOF) plus a
        per-actor blocking summary.

> **Tip — seeding a scene without a headset:** the camera editor and exports
> only get interesting once a scene has actors/cameras, which are placed in AR.
> To test the 2D surface end-to-end now, **Import** a scene JSON that already
> has content (export one from a headset session later, or hand-write one —
> `isSceneData` will reject anything malformed, which is itself worth testing:
> import a broken JSON and confirm it's refused without crashing the page).

## A3. Optional — automated headless boot check

Confirms the real bundle boots and the landing DOM renders, using headless
Chrome. Useful in CI or after a big refactor.

```bash
npm run build
npm run preview            # serves dist/ over HTTPS on :4173 (note the URL)
```

Then, in another terminal (macOS path shown; adjust for your OS):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --ignore-certificate-errors \
  --enable-unsafe-swiftshader --virtual-time-budget=6000 \
  --dump-dom https://localhost:4173/ | grep -q "Enter AR</button>" \
  && echo "BOOT OK" || echo "BOOT FAIL"
```

`--ignore-certificate-errors` is required because the dev/preview cert is
self-signed. `--enable-unsafe-swiftshader` gives headless Chrome a software GL
context so the Three.js renderer initializes.

## A3b. Scan storage smoke test (headed browser)

`test/scan-store.html` verifies the location-scan storage path end-to-end in a
real browser: IndexedDB round trip of the typed-array geometry, the binary/
base64 codec, and delete. With `npm run dev` running, open

```
https://localhost:5173/test/scan-store.html
```

in a **normal browser tab** and read the verdict line: `SCAN-STORE PASS`
(IndexedDB verified), `SCAN-STORE SKIP` (IndexedDB unavailable — the memory
fallback engaged, codec still verified), or `SCAN-STORE FAIL` (real bug).

This one is *not* headless-able: headless Chrome (macOS, observed Chrome 138)
never completes `indexedDB.open`, which is precisely the pathology the
ScanStore's 4 s watchdog exists for — in the app it degrades to an in-memory
scan plus a wrist warning instead of hanging. The same fallback contract is
unit-tested in Node (`npm test`, which has no IndexedDB at all).

## A4. What CANNOT be tested without a headset

These need the Quest and are deferred to Part B / TESTING.md:

- Passthrough, hit-test reticle, actor placement on the real floor.
- **Anchor drift stability** (the Phase 1 make-or-break test).
- Frame-line fidelity, the virtual monitor, PNG capture *from a live session*.
- Controller ergonomics, wrist-panel placement, hand-tracking fallback.
- Real-world framerate (the 72 fps budget).
- **Location scanning** (Scan Room reads the platform's Scene Mesh, which only
  exists on-device; requires Space Setup completed in Quest Settings). The
  scan *codec, storage plumbing, validation, and export/import format* are all
  unit-tested headset-free; the capture + registration is Phase 6 in TESTING.md.

---

# Part B — Testing WITH the headset (Quest 3 / Android XR)

WebXR requires a **secure context (HTTPS)**. `localhost` is exempt on the dev
machine, but the headset reaches the dev machine over the LAN by IP, so it needs
the HTTPS server and a one-time cert acceptance.

## B1. Network + server

1. Put the **headset and the dev machine on the same Wi-Fi network** (same
   subnet; guest networks and client-isolation APs will block it).
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. Note the **Network** URL it prints — this is the one the headset uses:
   ```
   ➜  Local:   https://localhost:5173/
   ➜  Network: https://192.168.x.x:5173/   ← enter THIS in the headset
   ```
   If it only prints Local, the LAN bind failed — see Troubleshooting (C3).

> **macOS firewall:** the first `npm run dev` may prompt to allow incoming
> connections for `node`. Allow it (System Settings → Network → Firewall), or
> the headset can't reach the server.

## B2. Load it in the headset

**Meta Quest 3:**

1. Put the headset on, open the **Meta Quest Browser**.
2. Type the **Network** URL exactly, including `https://`
   (e.g. `https://192.168.0.95:5173/`).
3. You'll hit a cert warning — **"Your connection is not private"** /
   `NET::ERR_CERT_AUTHORITY_INVALID` — because the cert is self-signed. Tap
   **Advanced → Proceed to 192.168.x.x (unsafe)**. This is safe on your own LAN.
   You may need to re-accept occasionally (the cert regenerates if
   `node_modules` is wiped).
4. The SetView landing page loads. If the diagnostics box says **"immersive-ar
   supported"**, press **Enter AR**.
5. Grant the **passthrough / spatial** permission the browser requests.

**Android XR / Samsung headset browser:** identical flow — same URL, same cert
warning, same permission grant. The app feature-detects anchors, hand-tracking,
and dom-overlay and degrades gracefully; the **wrist debug readout** reports
what the session actually granted (`anchors=yes/no`, `ref=local-floor`, fps).

## B3. First-session sanity pass (≈2 min)

Before the full checklist, confirm the basics:

- [ ] Passthrough visible (you see the real room), not an opaque background.
- [ ] White reticle tracks the **right controller** ray along real surfaces.
- [ ] **Right trigger** on the floor places a ~1.7 m humanoid, feet on the floor.
- [ ] The **wrist menu** floats above your **left** controller; pointing the
      right controller at it + trigger presses buttons.
- [ ] Wrist debug line shows `anchors=…` and an fps number.

Keep the wrist debug readout in view — it logs session features, pose resets,
and fps throughout.

## B4. Full on-headset checklist

Run **TESTING.md** top to bottom. It's ordered by build phase and gated:

- **Phase 0** — boot, passthrough, reticle.
- **Phase 1 — THE DRIFT LOOP** ⭐ the single most important test. Place an
  actor, toggle **Drift**, walk a full loop around the room, and confirm the
  actor's feet stay planted (anchored) with no skating. *Do not proceed past
  this if it fails* — it's the make-or-break for the whole tool.
- **Phase 2** — cameras, lenses, format/DOF/AoV readouts, frame lines, monitor.
- **Phase 3** — full/miniature/camera views, teleport, re-align.
- **Phase 4** — keyframes, playback, **pace ±**, **duplicate**, **undo/redo**.
- **Phase 5** — notes, persistence, PNG capture.
- **Phase 6** — **location scan**: Scan Room on location (needs Space Setup
  done in Quest Settings first), ghost-alignment walk, hidden/ghost/solid,
  solid walkthrough in a different room, JSON export/import with geometry.
- **Performance sweep** — hold ≥ 70 fps with a few actors playing back; repeat
  with the scan **Solid** + Camera View open (worst case).

Record pass/fail and any drift/fidelity/ergonomics notes; those drive the next
iteration.

---

# Part C — Quick reference

## C1. The 30-second desktop loop (no headset)

```bash
npm run typecheck && npm test && npm run build
```

Green on all three = the pure logic, types, and bundle are sound. Do this after
every change before touching the headset.

## C2. The headset loop

```bash
npm run dev        # leave running
# headset: open the Network URL, accept cert, Enter AR
```

Edits hot-reload; re-enter AR after a reload. The dev server can stay up across
many headset sessions.

## C3. Troubleshooting

| Symptom | Fix |
|---|---|
| **Enter AR disabled** (headset) | Read the diagnostics box. Must be HTTPS, have `navigator.xr`, and support immersive-ar. Use the headset browser, not a desktop one. |
| **Enter AR disabled** (desktop) | Expected — desktop has no immersive-ar. Test the 2D surface here; use the headset for AR. |
| **Page unreachable from headset** | Same Wi-Fi/subnet? Firewall allowing `node` on the dev machine? Client isolation off on the AP? Try the exact **Network** IP with `https://`. |
| **Only "Local" prints, no "Network" URL** | `host: true` should bind the LAN; check you're on Wi-Fi/Ethernet with a real IP (`ipconfig getifaddr en0` on macOS). |
| **Cert warning loops / won't proceed** | Clear site settings for that IP in the Quest browser and re-accept via **Advanced → Proceed**. |
| **Entered AR but no passthrough** | Grant the browser camera/passthrough permission for the site. |
| **`npm test` can't strip types** | Node too old — needs a version supporting `--experimental-strip-types` (v20+, tested on v24). |
| **Headless boot check fails** | Ensure `--ignore-certificate-errors` and `--enable-unsafe-swiftshader` flags are present; the preview server must be running. |
| **Storage full / edits not saving** | The app surfaces a wrist-status warning and prompts to Export the scene to JSON. Free localStorage or export/import to migrate. |

## C4. File map for testers

| File | Purpose |
|---|---|
| **TEST-SETUP.md** | This document — how to stand up testing with/without a headset. |
| **TESTING.md** | The per-phase on-headset checklist (what to actually verify in AR). |
| **README.md** | Product overview, controls cheat-sheet, known limitations, Unity-port notes. |
| `test/domain.test.ts` | The pure unit tests run by `npm test`. |
