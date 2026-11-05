# Device reports (XR capability probe, roadmap P0.0)

This folder holds the JSON reports written by the XR capability probe page,
`test/xr-probe.html`. Each report records what one headset browser actually
does for the platform claims the roadmap depends on: spikes S1 to S6, plus
partial answers for S7 (storage estimate and persist only; the 100 to 300 MB
LAN fetch into IndexedDB is not probed) and S11 (API presence only; no
persistent anchor is created or restored). S5 needs its own Quest session with
Space Setup cleared (step 6 below).
Nothing in `src/` reads these files. They are evidence, and the summary of each
one goes into the "XR capability probe" section of `TESTING.md`.

No report has been committed yet. The probe has only been exercised on a
desktop against a fake WebXR runtime (`test/xr-probe-smoke.html`); every
answer about real hardware is still open.

## Running the probe

1. On the Mac: `npm run dev`. Note the **Network** URL it prints.
2. In the headset browser, open `https://<network-ip>:5173/test/xr-probe.html`
   and accept the self-signed certificate warning (Advanced, then Proceed).
3. **0. Device**: check the device label. It defaults to something like
   `quest-3-browser-154` or `android-chrome-147` from the user agent; edit it
   if that is wrong. It names the report file.
4. **1. File picker (S4)**: pick one file of each kind (.glb, .json, .obj, .ply,
   .fbx, .spz, .splat, and one with no extension). Use throwaway test files:
   their names are stored in the report. The table shows whether the bytes came
   back and what the first 8 bytes were.
5. **2. Storage (S7 and S11, partial)**: press **Request persistent storage**
   once.
6. **S5 (Quest 3 only), a short extra session before the main one**: S1 needs
   Space Setup done and S5 needs it cleared, so one session cannot answer both.
   Clear the saved space for this room in Quest Settings (Space Setup). In
   **3. AR session**, set **Space Setup done for this room before Enter AR** to
   `no` and press **Enter AR probe**. Look at the floor and walls at 1 to 5 m
   for about 30 seconds and let someone walk through the view; do not press
   Run room capture. Exit AR and write in Notes how noisy the hits looked,
   where they stopped and whether they landed on the person. Then run Space
   Setup again. The summary's S5 row is answered from the latest session marked
   `no`; every other row describes the latest session, which is why the main
   session goes last. Skip this step on Galaxy XR.
7. **3. AR session (main)**: leave both checkboxes on (they request
   `plane-detection` and `mesh-detection`). Set **Space Setup done for this
   room before Enter AR** to what is true right now (on Quest, `yes` after
   running Space Setup; on Galaxy XR, leave it or pick `unsure`). It is stored
   with the session. Press **Enter AR probe**. If the browser shows an extra
   permission prompt, note it.
8. In AR a status panel appears about 1.2 m in front of you. Point a controller
   or hand ray at a panel button and pull the trigger or pinch.
   - Look around the whole room for about 30 seconds first, so planes and
     meshes have time to arrive. The panel updates once per second; until
     the browser returns a plane or mesh set it shows `no set yet` with how
     many reads were undefined or threw, and polling carries on.
   - **Keyboard test** focuses a hidden text field. If a system keyboard
     appears, type `ok` and press Enter.
   - **Run room capture** needs two presses within 4 seconds and runs once per
     session. It may launch Space Setup and may invalidate anchors, so do it
     last. Afterwards, stay in the session for at least 5 seconds so the
     anchor follow-up check runs.
   - **Exit AR** ends the session. **Recenter panel** moves the panel in front
     of you again.
9. Back on the 2D page, answer the **Observations** questions and add notes
   (prompts, error dialogs, how fast planes filled in, hit-test noise).
10. Press **Download JSON**. If downloads are awkward on the device, **Copy
    JSON** or **Show JSON** gives the same text.
11. Move the file to this folder and commit it.

The report saves itself in the browser's localStorage after every step (and
every 5 seconds while in AR, outside the XR frame callback), so a
reload (or the page being killed by the room-capture flow) does not lose it. A
session whose page died before it ended is marked
`"endedAt": "not recorded (page closed or killed during AR)"` on the next load.
**Start a new report** clears it.

Run the probe once on Quest 3 (Quest Browser 154.x) and once on Galaxy XR
(Chrome 147 or later). Running a second AR session in the same report is fine:
the summary describes the latest session that started (except the S5 row, see
step 6), and every session is kept in `sessions`.

## File naming

`YYYY-MM-DD-<device>.json`, using the date of the run and the device label,
for example `2026-11-05-quest-3-browser-154.json`. The page builds this name.

## Report format (version 2)

All times inside a session (`t`, `at`, `calledAt`, `settledAt`, `firstHitAt`,
`createdAt` of the anchor) are milliseconds since that session started.
Positions are meters in the session reference space (y-up, `local-floor` when
granted). Label strings are stored exactly as the browser reported them:
`(none)` means the label was null or undefined, `(empty)` means `''`.

Top level:

| field | meaning |
| --- | --- |
| `probe`, `version` | Always `"setview-xr-probe"` and `2`. Version 1 (never committed) had `planesError`/`meshesError`, which stopped polling at the first undefined read; it was stored under a different localStorage key and is not loaded. |
| `createdAt`, `updatedAt` | ISO timestamps. |
| `device` | The device label (also the file name suffix). |
| `page` | URL, user agent, secure context, CPU count, device memory, screen. |
| `env` | 2D checks: `immersiveAR`/`immersiveVR` from `isSessionSupported`; `storage` (`usage`, `quota` in bytes), `persisted`, `persistRequest` (result of `persist()`, or an error string); `typeof` of `XRAnchor.prototype.requestPersistentHandle`, `XRSession.prototype.restorePersistentAnchor` and `initiateRoomCapture`; whether `XRFrame.prototype` has `detectedPlanes`/`detectedMeshes`; `webkitSpeechRecognition` and `SpeechRecognition` presence. |
| `files` | One entry per picked file: `name`, `type`, `size`, `lastModified`, `byteLength` (null if the read failed), `head` (first 8 bytes in hex), `ascii`, `ms` (read time), `error` (`"Name: message"`). |
| `sessions` | One entry per Enter AR press (see below), at most 20 (the first and the newest are kept). |
| `observations` | Owner answers (`yes`, `no`, `unsure`, or `''`) to: `permissionPrompt`, `keyboardShown`, `spaceSetupLaunched`, `sessionSurvived`. |
| `notes` | Free text from the page. |
| `log` | `[epoch ms, message]` pairs, the page log, at most 400. |

Each session:

| field | meaning |
| --- | --- |
| `startedAt`, `endedAt` | ISO timestamps (see above for the killed-page marker). |
| `init` | The `requiredFeatures` and `optionalFeatures` requested. |
| `spaceSetup` | The owner's answer picked before Enter AR: was Space Setup done for this room? `yes`, `no`, `unsure`, or `''` (not recorded). |
| `requestError` | `requestSession` failure, or null. |
| `enabledFeatures` | `session.enabledFeatures`, or null when the browser does not expose it. |
| `domOverlayState` | `attribute-missing`, `null`, or the overlay type. |
| `referenceSpace` | `local-floor`, or `local` after the same fallback the app uses. |
| `environmentBlendMode`, `interactionMode`, `frameRate`, `supportedFrameRates` | As reported by the session. |
| `persistentAnchors` | Read-only count of `session.persistentAnchors` and how many are blank. The probe never creates a persistent anchor. |
| `inputSources` | Distinct input sources seen: handedness, target ray mode, hand/gamepad, profiles. |
| `hitTest` | Viewer (gaze) hit-test: `source` (`ok` or the error), frames tested, frames with a hit, time of the first hit. |
| `detection` | `planes` and `meshes`, one entry each for `frame.detectedPlanes` and `frame.detectedMeshes`, read once per tick: `setTicks` (a set came back, possibly empty), `missingTicks` (undefined or null), `throwTicks`, `dropoutTicks` (missing or throwing after the first set), `firstSetAt`, `error` (the first throw), and `skipped`. Neither undefined nor a throw stops the polling; `skipped` is set, and the attribute never read, only when `enabledFeatures` is exposed and lacks `plane-detection` or `mesh-detection`. |
| `anchor` | The sentinel anchor, created at the reference-space origin 1.5 s into the session: `created`, `error`, `createdAt`. |
| `geometry` | Detected-geometry samples, stored once per second only when something changed. `planes`: `count`, `labels` and `orientations` (counts), `perPlane` as `[label, orientation, polygon point count]`. `meshes`: `count`, `labels`, `totalVertices`, `totalIndices`, `perMesh` as `[label, vertices, indices]`, largest first. Lists are capped at 64 entries; counts are not. At most 300 samples. |
| `ticks` | One per second, the first one second after the first XR frame (at most 900, about 15 minutes): `fps`, `gapMaxMs` (longest frame gap), plane and mesh counts (null when the attribute gave no set that tick), latest viewer `hit` and `head` positions, `anchor` (1 tracked, 0 lost, null none), `vis` (session visibility), `saveMs` (time spent saving the report during that second, so frame gaps can be attributed to it). |
| `events` | `{ t, type, detail }` objects (at most 300) for start, visibility, doc-visibility, reset, inputs, select, anchor, keyboard, room-capture, planes, meshes, error and end. |
| `keyboard` | The last Keyboard test: whether focus took (`activeIsInput`), `focusError`, visibility changes while it was open, input event count, the typed text (64 chars max), and whether it ended by Enter or blur. |
| `roomCapture` | The one `initiateRoomCapture()` call: `outcome` (`pending`, `resolved`, `missing`, `NotSupportedError`, `InvalidStateError`, `OperationError`, or `other:<name>`), `message`, call and settle times, sentinel anchor state before, right after, and 3 s after the call settled, how far it moved, the longest frame gap and the reference-space resets and visibility changes from the call until the follow-up, and plane and mesh counts before and after. `pending` in a saved report means the page died before the call settled. |

## What a report does not contain

No camera images, no mesh vertex data and no plane polygons: only counts,
sizes and label strings. It does contain the user agent, the dev server's LAN
URL and the names of the files picked on the 2D page.
