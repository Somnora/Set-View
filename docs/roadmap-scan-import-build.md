# Scan, import and build roadmap

How SetView gets from today to letting a user scan a location, bring it into a scene, and build a set from scratch inside the headset. Written 2026-11-05.

## Status

- **Phase 0 is implemented** on branch `p0/make-existing-honest` ([PR #1](https://github.com/Somnora/Set-View/pull/1)). 498 unit tests pass, typecheck and build are clean, nine headless smoke pages pass, and the S12 Ghost check passes in a headed desktop run. Nothing has been checked on a headset yet.
- **Phases 1 to 4 have not started.** Several Phase 1 items depend on the answers from the probe page (spikes S1 to S7), so running `test/xr-probe.html` on a Quest 3 is the next gate. P1.1 (ingest core) and P1.5 (LAN drop box) do not depend on the probe.
- **Before building any Phase 1 to 4 item, read its review notes** in [Review corrections](#review-corrections). An independent review found design problems the item text below does not yet reflect.
- File and line references are as of commit `cd82a8e`, before Phase 0. Phase 0 moved many of them, so find each site by its content before editing.

## Approach

Written before Phase 0. The broken entry points listed in the next paragraph are the ones Phase 0 fixed.

SetView already contains most of what both goals need: a scan codec and IndexedDB store, LocationRenderer modes, a tested wall/door/window model, snapping math, ray handlers, IndexedDB prop uploads and an XRPlane triangulator. Nearly every user-facing entry point to them is broken or unwired. Studio modals mount into a hidden overlay. Uploaded models and all seven in-AR presets render as grey cubes. plane-detection is never requested, and initiateRoomCapture fires automatically and must reject. Ghost can render opaque. Scene import drops furniture moves. ArchitectureRenderer is never instantiated. Every new scene ships with an opaque LED horseshoe. So the roadmap takes the fastest-value spine. Phase 0 makes existing code honest with 16 small, separately verifiable fixes, plus a probe page that checks the unverified platform claims on Quest 3 and Galaxy XR. Phase 1 then delivers one mesh-first location loop with no backend and no new runtime dependency. A phone scan (Polycam Free GLB, Scaniverse FBX or PLY mesh) or a headset room capture goes through a pure, magic-byte ingest core into the existing LocationScan, ScanStore and LocationRenderer pipeline. Original bytes go in a separate blob database so textured Photo mode works. Files reach the headset through a LAN drop box on the Vite dev server, since dom-overlay and the Quest file picker are unreliable. The location is lined up in AR by grab-nudge or two-point Align, which bakes a rigid transform into scene data. That keeps the anchor convention (reference space equals scene space) and leaves the exporters and the Unreal importer unchanged. Phase 2 builds sets from scratch on the tested architecture model: a flat-Lambert ArchitectureRenderer, floor-traced walls and room boxes with feet-inch readouts over meters, wall openings and wild walls, a film-standard kit (flats as WallData, platforms, steps and apple boxes as props), a pure allocation-free snap stack, and a keypad. Phase 3 adds photoreal splats through Spark 2.4, Quest persistent anchors, scan-to-walls conversion and placement on the scan, each gated on its on-device spike. Phase 4 holds the owner-gated work: packages, a hosted relay with Web Launch, sender-side SPZ conversion, lights, floor-plan underlays, AI blockout and a VR walkthrough. From the cinematographer plan it adopts units, keypad, kit, snap stack, wild walls and the hands policy. From the architecture plan it adopts the separate blob database, references-only scene data, plane capture alongside meshes, the scan-flow reducer, the package format and the relay privacy rules. Every new domain module stays free of three and the DOM, and nothing in the render loop allocates per frame.

This plan was merged from three candidate plans: a fastest-value plan (used as the spine), a cinematographer-UX plan and an architecture-risk plan.

## User journeys

### Phone scan of a remote location, walked and blocked in the headset

1. Capture with Polycam Free (export GLB) or Scaniverse Free (export FBX or a mesh PLY; splat SPZ waits for P3.2). Tape two marks on the stage floor 3 to 5 m apart, and capture two matching features at the location.
2. With npm run dev running, open `https://<mac-ip>:5173/drop.html` on the phone, accept the certificate once, save the scan to Files, and upload it with drop.html's file picker (P1.5). Neither iOS Safari nor drop.html can act as a share-sheet target. Alternative: pick the file on the Quest 2D page (P1.2), if the P0.0 probe shows the picker reads .glb.
3. On the Quest 2D landing page, open the scene. The 'Files on your computer' panel lists the upload; tap Import as Location. The file is identified by its bytes, checked against the triangle budget, stored as a LocationScan, and its original bytes go to the blob database. A license reminder appears for free-tier captures (P1.1, P1.2, P1.3).
4. Enter AR. The location shows in Photo mode, with real textures and unlit (P1.4). Dress > Align > Two-point: trigger on scan feature A, then on real mark A, then B. A ghost previews the fit and trigger commits, baking the transform into the data (P1.6).
5. Block actors and cameras in Photo or Solid mode. Camera View renders the location. Later, place actors on scanned surfaces and teleport onto scanned floor beyond the real room (P3.5), or switch to VR walkthrough for very large locations (P4.8).
6. Export to Unreal; walls, kit and furniture placements arrive once P4.2 lands.

### Quest 3: capture the room you are in, block it, return tomorrow

1. Run Space Setup once in Quest settings.
2. Open SetView in Quest Browser and Enter AR. An empty scene opens in Dress mode, and the Scan guide chip points at Scan Room (P1.8).
3. Press Scan Room. The wheel hub shows progress and a preview, and the room lands in Ghost: walls, floor and ceiling are static, and furniture boxes can be grabbed (P0.4, P0.6, P1.8). If nothing is detected, the user is told to run Space Setup, and an explicit once-per-session 'Run Space Setup' action is offered with a warning that anchors may move (P0.5).
4. Optional: Convert room to walls makes the walls editable, with door and window openings (P3.3).
5. Block in Block mode and exit; the scene autosaves.
6. Next day, enter from anywhere. Dress > Align > Two-point, scope Everything, against the same tape marks moves scan, actors, cameras, props and walls together (P1.6, P1.7). On Quest, a persistent set-origin anchor later offers to do this automatically and falls back to manual Align on any failure (P3.4).

### Galaxy XR (Android XR Chrome): capture from planes and realign by hand

1. Enter AR in Chrome. plane-detection is requested and mesh-detection is not needed (P0.4).
2. Dress > Scan Room, then look across the floor, walls and tables while the detected planes build up in a live Ghost preview; press Scan Room again to finish (P1.8). Unlabeled planes are classified by orientation. initiateRoomCapture is never relied on, since it is a stub in Chrome.
3. Align and block exactly as on Quest.
4. Returning always uses the manual two-point Align, because Chrome has no persistent anchors (P1.6, P1.7). Every step is unverified on Galaxy XR hardware until the P0.0 probe runs there.

### Build a set from scratch on an empty stage

1. Create a new scene. It is empty over passthrough, with no LED horseshoe (P0.10).
2. Enter AR, then Dress > Build > Walls at a 10 ft height. Trigger on floor corners; each segment shows a feet-inch length and snaps to 6 in steps and 90 degrees with a haptic tick. Close the loop or press B (P2.2, P2.3). Room box makes a three- or four-wall set from two clicks.
3. Point at a wall: the radial offers Add Door, Add Window, Cycle Finish, Mark Wild and Delete. A wild wall disappears in that camera's Camera View only (P2.4).
4. Build > Set pieces: flats, 4x8 platforms at 16 in, steps and apple boxes ride the ray, snap flush to walls and to each other, and settle on the floor (P2.5, P2.6).
5. Select a wall and type 13 6 on the wrist keypad to make it 13 ft 6 in; nudge pieces 1 in at a time (P2.8).
6. Place custom uploaded models from My models (P2.7).
7. Switch to Block, place actors and cameras, and photograph or record. Each tool commit is one undo step.

### Desktop prep handed to the headset and back

1. On the desktop landing page, import a location (P1.2) or use 3DGS, ICVFX and Set Dressing Studio, which now open on the 2D page (P0.1). Save or quota failures appear as a banner (P0.9).
2. Press Send to computer on the scene row, which posts the .setview.json, with no API key inside, to the drop box (P0.15, P1.5).
3. On the Quest 2D page, import it from 'Files on your computer'. Furniture moves survive the round trip (P0.8).
4. Later, a .setviewpkg carries scan, splats and custom model binaries and re-imports in place (P4.1). A hosted relay with a pairing code and Meta Web Launch replaces the LAN step if the owner approves a backend (P4.3).

## Phase 0: Make what exists honest, and probe the platforms

Goal: Every existing scan, import and build entry point either works or says plainly why it cannot, and the unverified platform claims get checked on Quest 3 and Galaxy XR before anything depends on them. No new subsystems. Every item is S except the probe page, and each can be verified on its own.

Implemented in PR #1. The headset checks are in the PR's test plan and in `test/device-reports/README.md`.

| Item | Status |
| --- | --- |
| **P0.0** XR capability probe page | Built (test/xr-probe.html, report format in test/device-reports/README.md). Not yet run on any headset. |
| **P0.1** Studio modals usable on the 2D page, honest refusal in AR | Done. Also fixed the wrong-scene saves in every studio callback, not only Set Dressing. |
| **P0.2** Uploaded GLB/OBJ props render as models, not cubes | Done. Each upload's parse is cached and shared, every texture slot is freed on removal, and models over 5000 triangles are picked by an invisible bounds box. |
| **P0.3** Wheel prop presets spawn real catalog props where you look | Done. Spawns use a ray hit only when it is within 3 m of the viewer. |
| **P0.4** Request plane-detection; Scan Room accepts planes or meshes | Done. Scan Room waits for the auto-realign fade and for the floor estimate before capturing. |
| **P0.5** Room capture becomes an explicit, once-per-session action | Done. A reference-space reset also re-queues actor and camera anchors. Provisional until spike S6 runs. |
| **P0.6** Normalize scan labels; floors, walls and unlabeled meshes cannot be grabbed | Done. Label strings are provisional until spike S1 runs. |
| **P0.7** Location display: Ghost stays see-through, mode persists, visible in preview | Done, with per-mode materials instead of the needsUpdate toggle, and wireframe wires keyed by mesh index. S12 confirmed it in a headed desktop run (`test/ghost-opacity-smoke.html`, 2026-11-06): on `cd82a8e` Ghost after Solid or a Camera View pass, and Wireframe after Solid, draw fully opaque; with the fix every case matches the same mode drawn fresh. |
| **P0.8** Scene import and export keep what the user did | Done. |
| **P0.9** Errors and storage use visible on the 2D page | Done. Banners also show over the desktop preview. |
| **P0.10** New scenes start empty (no LED horseshoe) | Done. Approved by the owner on 2026-11-05. Existing scenes are untouched. |
| **P0.11** Remove inert and dead AR controls; make wheel routing checkable | Done. Removed the inert gizmo, the Light arm and sub-wheel, and the More pin; wired the Stance sub-wheel; added Re-align and Help sectors. |
| **P0.12** Prop carry and selection behave | Done with a changed settle rule: a released prop settles onto the ray hit only when that hit is within 0.25 m horizontally and not more than 0.1 m above the prop; otherwise it drops to the floor (settlePropY in src/props.ts). P3.5's surface query can replace this later. |
| **P0.13** 3DGS Studio save is undoable and Cancel really cancels | Done. |
| **P0.14** Splat import size guard and parser correctness | Done. The splat budget also stopped rebuilding the mesh every frame; it now rebuilds only when the effective count changes and disposes the old material. |
| **P0.15** Gemini API key out of scene data | Done. An applied AI scatter also survives Save, and AI-added props appear without a reload. |

## Phase 1: Bring a location in

Goal: A user gets a phone mesh scan or an in-headset room capture into a scene and lines it up with the real room on Quest 3 and Android XR, with no cloud backend and no new runtime dependency.

### P1.1 Pure ingest core: identify by content, convert to LocationScan

Track: import. Effort: M. Depends on: P0.6.

**Outcome.** Common scan files are recognised by their bytes, not their extension, so renamed or extensionless files from the Quest picker still import, and files too big for the headset are caught before parsing.

**Implementation.** New pure module src/sceneImport.ts, free of three and the DOM, with .ts imports. sniffSceneFile(head: Uint8Array) returns one of 'glb', 'gltf-json', 'setview-json', 'obj', 'fbx', 'ply-mesh', 'ply-3dgs', 'ply-3dgs-compressed', 'ply-points', 'spz', 'splat', 'zip', 'png', 'jpeg' or 'unknown'. It uses the glTF magic, JSON keys, the PLY header (a face element; f_dc_0, scale_0, rot_0 and opacity are all required for 3dgs; a chunk element first means compressed), 'Kaydara FBX Binary', the gzip and 'NGSP' SPZ headers, OBJ v/f lines, and .splat length % 32. conventionMatrix('RUB'|'RDF'|'ZUP') returns a column-major number[16]. buildLocationScanFromParts(parts: {positions, indices|null, matrix}[], opts) bakes each matrix with scan.ts transformPositions, generates indices for non-indexed geometry, and sanitizes (move sanitizeMeshBuffers from scanner.ts:32-64 into scan.ts). It applies unit scale and up-axis, recentres to floor y=0 and the XZ origin unless keepCoordinates is set, enforces the scan.ts caps, labels the result 'imported mesh' (static under P0.6), and returns warnings. guessUnitScale(bounds) flags centimetre or millimetre files. checkImportBudget(stats, profile) returns ok, warn or reject with a reason. It starts with placeholder caps (warn at 300k triangles, reject at 500k) until P0.0 and the mesh-budget spike set real numbers.

**Risks.** Misidentifying odd files. Axes and units are ambiguous across exporters, so the UI needs up-axis and unit overrides. The budget numbers are guesses until measured.

**Verification.** Unit tests in test/domain.test.ts with fixtures built in the test for every kind, plus renamed and extensionless inputs. Round trip: createSyntheticLocationScan through exportScanAsObj and exportScanAsPly, parsed with OBJLoader.parse and PLYLoader.parse in Node, then buildLocationScanFromParts; compare triangle counts and bounds. This also gives SetView's own scan exports a matching importer.

### P1.2 Import a location mesh on the 2D page

Track: import. Effort: M. Depends on: P1.1, P0.7, P0.8, P0.9.
Review notes: R4, R7.

**Outcome.** On desktop or the Quest 2D page, Import location turns a Polycam Free GLB, a Scaniverse FBX or mesh PLY, or any OBJ into the scene's Location, viewable in Ghost, Solid and Wireframe in AR and in the preview.

**Implementation.** Add 'Import location' (and 'Replace location' when a scan exists) to the Scene & Environment card (src/ui.ts:1088-1140), with a file input that has no accept filter, plus a drop zone. Read with File.arrayBuffer() inside try/catch; a zero-length result means 'the browser blocked reading this file, use Files on your computer'. New runtime adapter src/locationImport.ts, where three is allowed: GLTFLoader.parse with DRACOLoader, KTX2Loader and MeshoptDecoder, plus OBJLoader.parse, PLYLoader.parse and a lazily imported FBXLoader.parse, all from three/examples/jsm. Copy node_modules/three/examples/jsm/libs/draco, the basis folder and meshopt_decoder.module.js into public/decoders. It traverses meshes with updated world matrices into P1.1 parts. The src/main.ts handler stores the scan via persistence.scans.putScan, mutates this.sceneData.scan in place, calls markDirty and syncLocation, and sets locationMode. It does not use the attachSyntheticScan reload path. The card shows triangle count, warnings, the budget result, up-axis and unit overrides, and a capture-app reminder: Scaniverse Free and Plus carry no commercial rights. USDZ is left out until USDLoader is tested on RoomPlan files.

**Risks.** The Quest picker extension bug is unconfirmed for 2026, which is why P1.5 exists. Room-scale GLBs can exhaust Quest memory, and there is no decimation until P4.4. Geometry only until P1.4.

**Verification.** Node unit tests for the OBJ and PLY adapter paths. Headed smoke test/location-import-smoke.html (5174 HTTP config; IndexedDB needs a headed run on this Mac) imports a small checked-in GLB and a Draco GLB, and asserts the sceneData.scan triangle count and the LocationRenderer mesh count. On-device: the Quest 2D picker with .glb, .obj, .ply and .fbx (priority set by P0.0).

### P1.3 Separate blob database for heavy originals

Track: infra. Effort: M. Depends on: P0.9.

**Outcome.** Original scan files, and later splats, persist on the device with visible size and cleanup. Opening the prop list no longer loads every uploaded model into memory.

**Implementation.** New src/blobStore.ts on a NEW IndexedDB database, 'setview_blobs', so the 'setview' database that scanStore.ts:13-15 opens never needs a version bump. Clone ScanStore's watchdog, memory fallback and onError (scanStore.ts:29-199). Records are {id, data: Blob, format, size, createdAt}; store a Blob rather than an ArrayBuffer so the browser can keep it on disk. A pure collectBlobRefs(scene) lives in a pure module, and pruneOrphans runs at launch beside pruneOrphanScans (persistence.ts:53-60). Add PropStore.listAssetMeta, which walks a cursor and loads no binaries, and use it in the library list instead of getAll (propStore.ts:143-160).

**Risks.** Quest IndexedDB quota and eviction behaviour are unknown (spike). Undo of a delete must not prune a blob that history still references, so prune only at launch, as scans already do.

**Verification.** Node tests for collectBlobRefs and the memory backend. A headed harness modelled on test/scan-store.html for put, get, prune and estimate (headless Chrome IndexedDB hangs on this Mac). On-device: put, then get, a 100 MB Blob on Quest.

### P1.4 Photo mode for textured imports

Track: import. Effort: M. Depends on: P1.2, P1.3.
Review notes: R1, R13.

**Outcome.** A textured phone scan shows its real photo texture in AR and in the virtual camera, not just a grey box.

**Implementation.** P1.2 stores the original bytes in the blob store and records an optional sourceBlobId, format and sourceApp on ScanSummary (model.ts validator and normalizer). src/location.ts adds 'photo' to the mode cycle only when a source exists. It loads the source once through the P1.2 adapter, swaps to MeshBasicMaterial with the original map (scan textures already contain baked lighting, and unlit is the cheapest option), downsizes textures over 2048 px with a canvas at import, and merges meshes by material. Textured imports default to Photo, and beginCameraPass uses Photo when it is available, otherwise Solid. Ghost, Wireframe, furniture, exporters and the Unreal path keep the geometry-only LocationScan. Warn on export that .setview.json does not carry the texture source until P4.1.

**Risks.** Texture memory and fill rate on Quest. SetView's virtual lights do not affect an unlit location. The scene now has a second representation of the location.

**Verification.** Headed smoke: import a small textured GLB, switch to Photo, and assert that material.map.image.width <= 2048. On-device: fps in Photo mode with a real Polycam GLB, 4 actors and Camera View open.

### P1.5 LAN drop box on the dev server

Track: infra. Effort: M. Depends on: P1.1, P0.15.

**Outcome.** From a phone or laptop on the same Wi-Fi, the user uploads a scan or scene to the Mac running SetView, and the Quest landing page lists it for one-tap import. The headset can send a scene back the same way, with no file picker involved.

**Implementation.** Add a Vite plugin with apply:'serve' to vite.config.ts and vite.http.config.ts, using configureServer middleware. POST /drop/upload?name= streams the body to ./drop/ (gitignored) under a sanitized basename, with a size cap. GET /drop/list returns name, size and mtime. GET /drop/file/:name streams a file, and DELETE removes one. Put sanitizeDropName in a pure module so it can be tested. public/drop.html is a phone upload page with progress. The Landing (src/ui.ts) shows a 'Files on your computer' panel only when GET /drop/list answers, so a static build hides it. Each file is fetched as an ArrayBuffer (no picker, no blob URL) and routed by sniffSceneFile: meshes to P1.2, .setview.json to persistence.importScene, prop GLB and OBJ files to globalPropStore, and splats refused with a message until P3.2. 'Send to computer' on each scene row POSTs the exported .setview.json.

**Risks.** It exists only under npm run dev, not in vite build output; P4.3 is the hosted path. There is no auth on the LAN, so keep the size cap and never serve anything outside ./drop. The phone must accept the self-signed certificate once. Large bodies must stream to disk. Storage is per origin (localhost vs the LAN IP), which the drop box sidesteps.

**Verification.** Unit tests for sanitizeDropName: path traversal, empty names, unicode. Headed smoke: upload via fetch, then list, then import. On-device: save a Polycam GLB to Files on the iPhone, upload it with drop.html's file picker, and import it on the Quest; also have the Quest fetch a 100 to 300 MB file over the LAN.

### P1.6 Align tool in AR (grab-nudge and two-point), baked into data

Track: scan. Effort: L. Depends on: P0.6, P0.7, P0.11.
Review notes: R1, R2.

**Outcome.** In AR the user lines up a scanned or imported location with the real room, by grabbing and turning it or by tapping two matching point pairs, and the alignment is saved.

**Implementation.** In the src/wheel.ts Dress ring, replace the 'splat-studio' sector (a DOM modal that cannot show in AR) with 'align'. Align mode forces Ghost. Grip attaches location.group to the ray the way furniture grab does (src/main.ts:1783-1792); right stick X yaws slowly about world up; right stick Y lifts in 1 cm steps; locomotion is suppressed. Two-point sub-mode: trigger on scan point A (a THREE.Raycaster against location.group on trigger only, never per frame), then on the real spot (session.lastHit), then repeat for B. A pure solveTwoPoint(srcA, srcB, dstA, dstB) in the new pure src/registration.ts returns {yaw, dx, dz, residual} and rejects points closer than 0.5 m. A ghost previews the fit, trigger commits, and B cancels. On commit, a pure applyRigidToScan(scan, furniture, {dx, dy, dz, rotY}) in src/scan.ts transforms positions and furniture offsets; the result goes to putScan as a new blob, sceneData.scan is updated, the group transform is reset, and markDirty runs (undo keeps the old blob until the next-launch prune). The two real survey points are stored on the scene. Baking keeps contentRoot at identity in XZ and yaw, so the anchor convention in actors.ts reanchor and updateFromAnchors still holds, and the exporters and Unreal importer are unchanged.

**Risks.** Hand-held yaw precision: 1 degree is about 9 cm at 5 m, which is why two-point exists. Depth-based hit-test is noisy beyond about 5 m. Each commit rewrites the blob, acceptable for a rare action. The baked dy must compose with floor.ts's floorOffsetY, so compute it relative to contentRoot.

**Verification.** Unit tests: applyRigidToScan handles identity, a 90 degree yaw, a translation, consistent furniture rotation and updated bounds; solveTwoPoint recovers known transforms within 1 mm and 0.1 degree, behaves under noise, and rejects degenerate input. Headed furniture-smoke variant: apply an align, then undo it. On-device: align an imported GLB to a real corner and measure the residual at a third tape mark. The target is under 3 cm, a goal and not a known capability.

### P1.7 Re-register the whole set on return

Track: scan. Effort: L. Depends on: P1.6.
Review notes: R2, R5.

**Outcome.** Back in the same room on another day, one Align moves the scan, actors, cameras, props, walls and set dressing together, instead of lining up only the scan.

**Implementation.** Align gains a scope toggle: 'Room only' (P1.6) or 'Everything'. A new pure transformSceneRigid(scene, delta) in src/registration.ts bakes the delta into actors (position, rotationY, keyframes and marks), cameras (pose and any path or dolly points), props, lights, architecture wall endpoints, set-dressing items, audio cues, the scan (via applyRigidToScan) and splat cloud transforms. It then re-queues every actor and camera into pendingReanchorActors and pendingReanchorCams.

**Risks.** Positional fields could be missed, which the coverage test guards against. Keyframe and path semantics need care. Collaborators are not updated, because environment collab sync is out of scope.

**Verification.** Unit test: load test/sample_scene.setview.json, apply a transform, walk every Vec3-shaped field and assert each moved, so the test fails when someone adds a positional field without handling it. On-device: block on tape marks, exit, re-enter from a different spot, two-point align with Everything, and check the marks.

### P1.8 Headset capture you can see: guided scan, planes kept, Android XR path

Track: scan. Effort: L. Depends on: P0.4, P0.5, P0.6.
Review notes: R3, R7, R12.

**Outcome.** Scan Room shows what is being captured and why it might fail. On Android XR it keeps adding planes as the user looks around until they press Done. On Quest, labeled walls, doors and windows are kept for later conversion into editable walls.

**Implementation.** Move the pending-scan logic out of updatePendingScan (src/main.ts:936-987) into a pure reducer in src/scanFlow.ts. Its states are idle, waiting, previewing, captured and failed. It tracks roomCaptureUsed per session, resets the timeout when visibility returns, and cancels on Re-align or a view change. In captureScanFromFrame (src/scanner.ts:125-185), capture labeled planes alongside meshes; today planes are dropped whenever meshes exist. Bump the scan.ts codec to v2 with a per-mesh source byte (mesh or plane), keeping decodeScan able to read v1. LocationRenderer skips plane-sourced pieces when a 'global mesh' exists, so walls are not drawn twice. Replace the fan triangulation in triangulatePlanePolygon (scanner.ts:67-115) with a pure ear-clipper in scan.ts so concave polygons work. Classify unlabeled planes by orientation and height. Planes-only sessions accumulate, keyed per XRPlane and refreshed on lastChangedTime, until Scan Room is pressed again. The preview is a LineSegments with a preallocated maximum buffer and drawRange, rebuilt at most twice a second and only while scanning. Feedback goes to the wheel hub sub-label and a Scan chip in src/guide.ts (48-107), not only the wrist debug tail. Sessions open in Dress when the scene has no scan, walls or props (main.ts:1602-1610).

**Risks.** On Quest the data comes from the Space Setup snapshot, so walking the room adds nothing. Plane coverage and labels on Galaxy XR are unverified. Preview rebuilds must reuse buffers to respect the allocation rule. The codec bump touches export and import, so the Unreal importer must ignore the new byte.

**Verification.** Unit tests: scanFlow transitions, ear clipping on concave fixtures, orientation classification, v1 read compatibility and v2 round trip. test/import-test.py still passes. On-device: on Galaxy XR the room builds up over 10 to 20 s; on Quest without Space Setup the user sees instructions instead of a silent wait; on Quest with Space Setup the plane and mesh counts match the P0.0 log.

## Phase 2: Build a set in the headset

Goal: A user can block out walls, openings, flats, platforms, steps and props in AR at film-standard sizes, with feet-inch readouts, snapping and exact typed values, one undo entry per action, at 72 fps on Quest 3.

### P2.1 Walls render on the Quest budget (ArchitectureRenderer, flat Lambert, wired)

Track: build. Effort: M. Depends on: none.
Review notes: R9.

**Outcome.** Walls, doors and windows in scene data become visible in AR and in the desktop preview, including walls from 3DGS Extract Walls, at a cost that holds 72 fps.

**Implementation.** Review src/architectureRenderer.ts before building on it; it has only ever run in tests. Replace getOrCreatePbrMaterial and the canvas PBR textures (about 29-94), plus the glass and hardware MeshStandardMaterials, with cached MeshLambertMaterial: one per finish tint, and glass as transparent Lambert. Drop castShadow and receiveShadow, and merge each wall's solid parts with BufferGeometryUtils.mergeGeometries so there is about one draw call per wall. Instantiate it in src/main.ts under contentRoot, rebuild it from data.architecture in applySceneToSubsystems (994-1036) and on the existing 'architecture_' collab refresh (3566-3579), and add architecture_update and architecture_patch senders (collab.ts:299-303; receivers exist at 770-792). Tag wall meshes with userData.wallId for raycasting.

**Risks.** The renderer may hide other defects, such as leaks on update or wrong opening maths. Rebuilding ExtrudeGeometry on edits allocates, which is acceptable for user-paced edits but never per frame. Walls extracted from splats become visible for the first time and may look wrong.

**Verification.** Extend test/domain.test.ts:6114-6160: every material is MeshLambertMaterial, and a wall with a door and a window yields the expected merged mesh count. Headed preview-smoke shows synthetic walls. On-device: 72 fps with 20 to 40 walls with openings, 4 actors and Camera View open.

### P2.2 Units: feet-inch readouts over a meters-only model

Track: build. Effort: S. Depends on: none.

**Outcome.** US crews read 13 ft 6 in and metric crews read 4.11 m, and either form can be typed.

**Implementation.** New pure src/units.ts. formatLength(m, {system, fractionIn: 8|16}) and formatDims(w, h, d) produce output. parseLength accepts 13'6", '13 6', 102in, 2.6m and 260cm. The default is imperial when navigator.language is en-US, with a per-device toggle in localStorage accessed inside try/catch. SceneData stays in meters, y-up, feet-origin; the coordinate contract does not change. Use it for every new readout and for the scan summary log (src/main.ts:965-969).

**Risks.** Displaying to 1/8 in can make sums look off by 1/8 in; exact meters are always stored.

**Verification.** Unit tests: a 4x8 ft sheet is exactly 1.2192 x 2.4384 m; format and parse round-trip at 1/16 in; metric passes through unchanged; garbage input is rejected.

### P2.3 Trace walls on the floor and drag a room box

Track: build. Effort: L. Depends on: P2.1, P2.2.
Review notes: R6.

**Outcome.** The user arms Walls, clicks corners on the floor with live feet-inch lengths and snapping, and gets real walls at the chosen height. Two clicks make a three- or four-wall room.

**Implementation.** In src/wheel.ts, the Dress ring's 'sub-props' sector becomes 'Build ▸', containing Walls, Room box, Set pieces ▸, Props ▸, My models ▸, Height (8, 10 or 12 ft) and Snap. PlaceArm gains 'wall' and 'room'. New pure helpers in src/architecture.ts: snapWallVertex(prev, prevDir, candidate, opts, out), with a 6 in or 0.1 m length step, 15 degree angles with 90 degree priority via spatialInteraction.calculateAngularSnap45_90, and closing onto the first vertex within 0.25 m; buildWallsFromPolyline(points, closed, {heightM, thicknessM, finish}) via createWallData (448); and createRoomFromCorners(a, b, {heightM, openSide}). At runtime the trigger adds a vertex at session.lastHit, or where the ray meets y=0 (gizmoMath.calculatePlaneRayIntersection) beyond hit range or with no hit. A preview line and length label use preallocated objects, and the label canvas is redrawn only when its text changes. B finishes the run. Each run gets one markDirty and one architecture_patch, with a haptic tick per snap via globalSpatialFeedback. With hands, snapping is forced on and a commit needs the ray steady for 150 ms.

**Risks.** Hit-test noise, especially without Space Setup (reportedly depth-based, about 5 m range); the y=0 fallback depends on the floor estimate. Hand-ray precision has not been measured.

**Verification.** Unit tests: snapping, closure, room box open side, and wall orientation matching ArchitectureRenderer's angle convention. On-device: trace a known room on Quest 3 and Galaxy XR and compare with a tape measure.

### P2.4 Edit walls in AR: openings, finish, delete, wild walls

Track: build. Effort: M. Depends on: P2.1, P0.11.
Review notes: R8.

**Outcome.** Point at a wall to add a door or window where you pointed, cycle its finish, delete it, or mark it wild so the camera monitor sees through it while the headset still shows it.

**Implementation.** Walls join the Dress hover targets. A trigger on a wall calls contextualRadial.show('wall', id, worldPos) with the actions spatialInteraction.ts already builds (452-481). New handleContextQuickAction cases (src/main.ts:3250) cover add door or window at the hit's offset (a new pure offsetAlongWall in architecture.ts, clamped by calculateDoorOpening and calculateWindowOpening at 823 and 896), cycle finish, delete and toggle wild. WallData gains optional wild and hiddenForCameraIds fields (validator and normalizer). The existing Camera View pass hides wild walls for the active camera, mirroring LocationRenderer.beginCameraPass and endCameraPass (location.ts:323-335) and restoring in a finally block, so no extra render pass is added. The plan export draws wild walls dashed.

**Risks.** Thin walls make small ray targets. Visibility must be restored even if the pass throws.

**Verification.** Unit tests: offsetAlongWall clamping at wall ends, rejection of overlapping openings, the normalizer. On-device: add a door, cycle a finish, mark a wall wild and see through it in Camera View, delete a wall, and undo each step.

### P2.5 Film-standard kit at real sizes

Track: build. Effort: M. Depends on: P0.3, P0.12, P2.1, P2.2.

**Outcome.** Standard flats, door and window flats, platforms, steps and apple boxes are one wheel press away, at real dimensions, and flats take door and window openings.

**Implementation.** New pure src/setKit.ts with exact meter dimensions and nominal labels. Flats are 1, 2, 3 and 4 ft wide by 8, 10 and 12 ft tall, about 3 in thick; anything taller is flagged as custom, not a verified standard. Door and window flats. Platforms are 4x8, 4x4, 2x8 and 2x4 ft at 8, 16 and 24 in, plus metric decks. Step units follow rise plus run of 18 in. Apple boxes come in full, half, quarter and pancake; fix props.ts, where the quarter is labelled pancake and the 1 in pancake is missing. Flats map to WallData with an optional kitId, so they render through P2.1, take openings, and reach Unreal as walls. Platforms, steps and boxes become BUILTIN_PROPS entries drawn as Lambert boxes in propRenderer.buildProceduralProp, reusing the existing carry, undo and collab paths. The 'Set pieces ▸' sub-wheel places pieces on the ray with the P0.12 floor settle, using one reused ghost mesh per part type whose geometry changes only when the part changes.

**Risks.** The sourced standards are theatre sizes and may not match a given studio's stock, so allow custom sizes. Adding kitId touches normalizers and collab.

**Verification.** Unit tests: exact dimensions (4 ft = 1.2192 m), the 18 in rule, normalizers accepting kitId, and each new prop id rendering a non-default mesh. On-device: place a flat run and a platform and check them against a tape.

### P2.6 Snap stack and precision without a gizmo

Track: build. Effort: M. Depends on: P0.12, P2.5.
Review notes: R6, R10.

**Outcome.** Pieces click flush to corners, walls, real planes and a 1 ft grid with a visible marker and a haptic tick, and props can be scaled and nudged precisely.

**Implementation.** Add a pure resolveSnap(candidate, ctx, out) to src/spatialInteraction.ts. Priority order: connector or endpoint within 10 cm; flush, collinear or perpendicular to walls and pieces; detected real planes and the scan floor; the grid (1 ft or 10 cm by unit setting); then angle (15, 45 or 90 degrees via calculateAngularSnap45_90). It uses hysteresis at 1.5x the snap radius and preallocated candidates; add an out-parameter variant of calculateMagneticSnap, which today returns new objects. Wire it into prop and kit carry and into wall trace, with a reticle glyph per snap kind and a haptic tick. Holding grip suspends snapping, and clicking the stick toggles it. Add Scale -/+ (10 percent steps) and Nudge (1 in or 1 cm) to the prop radial via PropsManager.updateProp (propsManager.ts:131).

**Risks.** Snapping between competing candidates can feel sticky, so tune thresholds on device and keep the off toggle. Plane candidates exist only where the platform exposes planes.

**Verification.** Unit tests for each rule, the priority order and the hysteresis, plus a Node heap-delta check across 10k calls showing no allocation. On-device: build a four-flat run with no gaps.

### P2.7 Custom models from the wheel

Track: build. Effort: S. Depends on: P0.2, P1.3.

**Outcome.** Models uploaded on the 2D page, or through the drop box, can be placed from inside the headset.

**Implementation.** A 'My models ▸' sub-wheel lists up to seven uploads with paging via PropStore.listAssetMeta (P1.3) and places them like P0.3, with names truncated for wheel labels. It replaces the in-AR 'Prop Library' sector (wheel.ts:194), whose DOM modal cannot show in AR.

**Risks.** Long file names. Large GLBs still load on the main thread.

**Verification.** Unit test for listAssetMeta, including the memory fallback. Headed wheel-smoke. On-device: place an uploaded GLB from the wheel.

### P2.8 Exact numbers: wrist keypad and dimension card

Track: build. Effort: M. Depends on: P2.2, P2.3, P2.5.
Review notes: R6.

**Outcome.** Select a wall or piece to see its size in feet and inches, type 13 6 to make it 13 ft 6 in, and enter names with the system keyboard.

**Implementation.** New pure src/keypad.ts: a state machine for digits, feet and inch marks, decimal point, unit toggle, backspace, enter and cancel, producing meters via units.parseLength. New src/keypadView.ts draws it on UIPanel (src/ui.ts:433), mounted on the left palm like wheelView and parked in front with Y. Keys are at least 12 mm apart, and the panel is redrawn only on change. Selecting a wall, piece or prop shows a DimensionCard UIPanel with W, H, D and rotation; tapping a value opens the keypad. Edits go through updateProp or ArchitectureRenderer.updateWall (architectureRenderer.ts:822), then markDirty. Free text uses a hidden focused `<input>` to raise the system keyboard, and input routing and build tools pause while the session visibilityState is 'visible-blurred'.

**Risks.** System keyboard behaviour in immersive-ar is documented for Quest but unverified in SetView and unknown on Galaxy XR. Small canvas text may be hard to read.

**Verification.** Unit tests: the key sequence 1 3 ft-mark 6 in-mark Enter yields 4.1148 m. Headed smoke draws the keypad canvas and hit-tests a key through its UV. On-device: legibility, reach and a system keyboard round trip.

## Phase 3: Photoreal and automatic (each item gated on its on-device spike)

Goal: Add photoreal splat locations, automatic re-registration on Quest, conversion of scanned planes into editable walls, and placement and occlusion against the scan, only after the Phase 1 and 2 loops pass on a headset.

### P3.1 Splat clouds out of localStorage and undo history

Track: import. Effort: M. Depends on: P1.3, P0.13.

**Outcome.** Real phone splat captures survive a reload, and editing no longer re-stringifies megabytes on every change.

**Implementation.** GaussianCloudData (src/gaussianSplat.ts:27-71, model.ts:1037) is persisted as a summary {id, blobId, format, count, bounds, transform, convention}, with splats[] empty in JSON. Legacy inline clouds migrate on load by writing exportCompactSplat bytes to the P1.3 blob store. The runtime loads by id with a token guard like syncLocation (main.ts:862-890), and history snapshots carry references only. exportScene embeds the bytes as base64 until P4.1. normalizeGaussianCloud stops rebuilding every splat on undo. Lift the P0.14 refusal to the blob-store budget.

**Risks.** Migrating large inline clouds on low-memory devices could fail. Blobs must not be pruned while history still references them.

**Verification.** Unit tests: migration from an inline cloud, and history snapshot size independent of splat count. Headed: import a 200k-splat .splat, reload, and the cloud is still present.

### P3.2 Splat locations through Spark 2.4

Track: import. Effort: XL. Depends on: P3.1, P1.5, P1.6.

**Outcome.** A Scaniverse SPZ or a 3DGS PLY becomes a photoreal location in AR, with level of detail at a frame rate that holds, aligned with the same tool as meshes.

**Implementation.** Only after the Spark spike passes and the owner approves (see decisions). Add @sparkjsdev/spark >= 2.4.0: MIT, peer three >= 0.180, works with the existing WebGLRenderer, and 2.4.0 fixed XR splat size (#487), LoD projection (#488) and SPZ v4 (#484). New src/splatLayer.ts: one SparkRenderer in scene3 and one SplatMesh per cloud under contentRoot, built from blob-store bytes, with lod:true and an explicit lodSplatCount from a per-device setting measured on device. Do not trust the user-agent defaults (500K on Quest, 1M on Android). Do not use SparkXr, because session.ts owns the session. In the Camera View RTT pass, hide splats or set SparkRenderer.autoUpdate=false with a manual update() while the RTT is active. Choose antialias at renderer construction (main.ts:308) per the spike result. Up-axis presets: SPZ is RUB (identity), and 3DGS PLY is usually RDF (180 degrees about X). Level the floor with fitPlaneRansac (gaussianSplat.ts:1088-1182) instead of the Y-histogram. Route SPZ and 3DGS PLY from P1.2 and P1.5 here, align with P1.6, and show the license badge. Put gaussianRenderer.ts behind a flag, then delete it; keep gaussianSplat.ts for pure parsing and alignment.

**Risks.** Spark issue #400 (a Quest hang with MSAA, an extra per-frame pass and a SplatMesh) is open, and SetView's colour RTT plus MSAA is an untested variant of it. Spark's internal allocations and sort worker are outside SetView's control. A new dependency, with stewardship risk from AMD acquiring World Labs. Splats are fill-rate bound on top of actors. ROADMAP.md lists photoreal rendering as not planned.

**Verification.** Spike first, in test/spark-spike.html: Quest 3 with antialias:true, a 1024 RTT every frame and a SplatMesh, in a 10-minute soak; frame time at 150k, 300k and 500k splats with 4 actors and Camera View open and closed. Unit tests for the convention presets. Headed preview smoke loads a small SPZ fixture. On-device: P95 frame time from webxrProfiler.ts recorded in the device report.

### P3.3 Scanned room to editable walls

Track: scan. Effort: M. Depends on: P1.8, P2.1, P2.4.
Review notes: R8.

**Outcome.** One action turns a scanned room into walls that can be edited, marked wild, struck or extended, with its doors and windows kept as openings.

**Implementation.** New pure src/planeConvert.ts. wallsFromPlanes(planes) takes the plane-sourced pieces kept by P1.8 and turns vertical wall polygons into WallData: baseline from the bottom edge, height from the extent, default thickness 0.1 m. It merges collinear segments within 5 cm and 2 degrees, attaches door and window planes as openings on the nearest coplanar wall via offsetAlongWall, and takes floor and ceiling heights from their planes. When labels are null, as on Android XR, it falls back to orientation. Also offer fitArchitecturalPlanesFromSplats (gaussianSplat.ts:1322) for splat locations. 'Convert room to walls' previews, then commits as one history entry. The scan mesh stays for display and occlusion.

**Risks.** Quest door and window label strings are unconfirmed, and Space Setup walls are rough.

**Verification.** Unit tests with synthetic plane sets derived from createSyntheticLocationScan: four walls, a door and a window are recovered at the right offsets and sizes. On-device on Quest, using the label strings recorded by P0.0, checked against a tape.

### P3.4 Quest persistent set-origin anchor over manual Align

Track: scan. Effort: M. Depends on: P1.7.

**Outcome.** On Quest, reopening a scene in the same room offers to line everything up automatically; manual Align stays as the guaranteed fallback.

**Implementation.** Feature-detect XRAnchor.prototype.requestPersistentHandle. After an Align Everything commit, create one anchor at the scene origin through session.createAnchor (src/session.ts:302-338), and store {handle, pose at creation} per device in localStorage keyed by scene id. Never put it in SceneData or exports. At session start, call restorePersistentAnchor. Once the anchor is tracked, compute the delta from the stored pose and offer transformSceneRigid (P1.7), showing a confirm ghost. Delete superseded handles with deletePersistentAnchor and filter out blank '' handles. Any failure (InvalidStateError, the slot limit, private mode, cleared site data, a Space Setup re-run) falls back to manual Align with a clear message. Never attempt this on Android XR Chrome.

**Risks.** About 8 slots, possibly shared across origins and reportedly fewer in practice. A blank-handle regression was reported on 150.1, and deletions may not free slots. Room capture may wipe anchors.

**Verification.** On-device only: create, then restore after an app restart, after a reboot and after re-running Space Setup; exercise the limit and the blank-handle path; measure the offset against tape marks.

### P3.5 Place and walk on the scan; occlude behind real walls

Track: scan. Effort: L. Depends on: P1.2, P0.7.

**Outcome.** Actors and pieces can be placed on a scanned table or on scanned floor beyond the real room, teleport lands on scanned floor, and in AR virtual actors hide behind real walls.

**Implementation.** Add a pure triangle grid to src/scan.ts: buildTriangleGrid(positions, indices, cellM) with a capped cell count, and raycastTriangleGrid(grid, origin, dir, maxDist, out), a DDA traversal that allocates nothing per call. A SurfaceQuery in src/main.ts tries virtual surfaces first in Solid or Photo mode (location grid, walls) and real hit-test first in Hidden or Ghost, then falls back to y=0. It is used for actor placement (main.ts:1703-1708), Place:Prop, teleport (1908-1910) and the build tools, and runs only while a tool is armed. Add an 'Occlude' Room mode (colorWrite false, depthWrite true).

**Risks.** Grid memory for a 500k-triangle import, hence the cap. Quest's Scene Mesh is coarse, so occlusion edges will be rough. Depth-based hit-test can hit people.

**Verification.** Unit tests: grid raycasts match brute force on random rays over the synthetic room and a 200k-triangle fixture, and a heap-delta check across 10k calls shows no allocation. On-device: place an actor on a scanned table in Solid mode; in Occlude mode an actor behind a real wall is hidden with no fps change.

## Phase 4: Beyond the LAN and assisted authoring (owner-gated)

Goal: Make environments portable away from the dev machine, carry them into Unreal, and add assisted authoring, without disturbing the working core.

### P4.1 Portable scene package (.setviewpkg) with import-in-place

Track: infra. Effort: M. Depends on: P1.3, P3.1, P0.15.

**Outcome.** A scene with its scan, texture source, splats and custom models moves between desktop, Quest and Unreal as one file, and re-importing updates the scene instead of adding '(imported)' copies.

**Implementation.** New pure src/bundle.ts: a dependency-free STORE-only zip writer and reader with CRC32. Compression is not needed because GLB, SPZ and scan blobs are already compact. It holds scene.json, `blobs/<id>.<ext>` and custom prop binaries from PropStore. persistence.ts gains exportPackage and importPackage, built from Blob parts so Quest never concatenates huge ArrayBuffers. When the scene id already exists, offer 'Update existing' or 'Copy' (persistence.ts:285-286). Persistent-anchor handles never travel. Content/Python/import_setview.py reads .setviewpkg with zipfile and reuses its scanData path. The drop box and the relay carry packages.

**Risks.** Packages over 4 GB need zip64, so cap at 2 GB. Large packages on Quest are memory-heavy.

**Verification.** Unit tests: byte round trip and CRC32 against known vectors. test/import-test.py opens a generated package. A headless UnrealEditor-Cmd import of a package, using the verified invocation.

### P4.2 Unreal importer carries built sets, furniture moves and imported locations

Track: infra. Effort: L. Depends on: P2.1, P2.5.
Review notes: R3.

**Outcome.** What was built or captured in the headset arrives in Unreal where it was left.

**Implementation.** Content/Python/import_setview.py builds walls with openings from scene.architecture and kit pieces as sized boxes tagged with kitId. It applies scan.furniture placements through the decode and OBJ path (import_setview.py:330-427) and imports the geometry-only LocationScan of imported locations. The scan exporters (src/scanExporters.ts:166, 253, 408) apply placements. Fix the positional Rotator ordering at src/ue5Bridge.ts:1163 and the docstring claim about furniture.

**Risks.** Unreal Python API quirks; earlier imports hit Rotator argument-order bugs. The codec v2 byte from P1.8 must be handled.

**Verification.** Extend test/import-test.py (the coordinate oracle) with walls, pieces and furniture. Run a headless UnrealEditor-Cmd import against /Volumes/Unreal/SetView/SetView/SetView.uproject and check that import_report.json lists the new actors with the expected transforms.

### P4.3 Hosted relay with pairing code and Meta Web Launch

Track: infra. Effort: XL. Depends on: P1.5, P4.1, P0.15.

**Outcome.** Away from the home network, a phone uploads a scan, gets a short code, and one button opens SetView on the Quest with the scan waiting.

**Implementation.** Only if the owner approves a backend. A Cloudflare Worker plus R2. Uploads use presigned or multipart PUTs so bytes never pass through Worker body limits. A pure src/transferProtocol.ts, shared with the Worker, defines a 6-character Crockford code with a check character, a slot state machine and expiry. A 24 to 72 h lifecycle rule, no listing endpoint, rate-limited code lookups, and CORS limited to the SetView origin. The Worker also serves the production static build, so the Quest gets a trusted HTTPS origin. drop.html and the landing panel keep the P1.5 API shape. The phone page offers Web Launch (https://www.oculus.com/open_url/?url= with an encoded ?receive=CODE link) for Quest; Galaxy XR users type the code. A relay in a separate repo would need its own vault context folder per the owner's policy.

**Risks.** Privacy (location scans show private property and unreleased sets), abuse as free hosting, ongoing cost, and code brute force. Web Launch needs the headset powered on and online with the same Meta account on both devices; private LAN targets are untested.

**Verification.** wrangler dev scripted smoke: create a slot, multipart-upload 150 MB, download, check sha256, confirm an expired code returns 410 and rate limiting triggers. Deployed end to end from a phone on cellular to Quest. Web Launch opens the paired page.

### P4.4 Sender-side preparation: SPZ transcode and mesh decimation

Track: import. Effort: L. Depends on: P3.2, P1.5.

**Outcome.** Heavy captures are made headset-ready on the desktop or phone before transfer, so the Quest never parses a 500 MB PLY.

**Implementation.** A Web Worker used only on the 2D landing and send pages, never in AR. Spark's transcodeSpz (exported in 2.4.0, dist/types/spz.d.ts) converts PLY, SPLAT and KSPLAT input to SPZ with the convention transform and cropping. Meshes are decimated with meshoptimizer's simplifier (a new MIT dependency; three ships only the decoder) and re-exported with GLTFExporter. The worker reports before and after sizes and caps phone input size.

**Risks.** Phones may run out of memory on 2M-splat PLY files. SPZ quantization is lossy. Bundle size grows on the 2D page only.

**Verification.** Dev test converting a fixture PLY to SPZ and reading back the count. Headed desktop smoke. Manual tests in iOS Safari and Android Chrome.

### P4.5 Place and adjust lights in AR

Track: build. Effort: M. Depends on: P0.11.

**Outcome.** Lights can be placed and adjusted (Kelvin, power, cone) from inside the headset.

**Implementation.** Restore 'light' in nextPlaceMode and the Block-root sector. Add an onTriggerDown branch that calls createLight (src/model.ts:1233) at the hit point, aimed along the head direction. A small Lambert fixture-proxy renderer under contentRoot is rebuilt in applySceneToSubsystems; volumetrics already draws beams from data.lights. Wire 'sub-light' navigation and the light-kelvin, light-dim, light-bright and light-cone-* handlers, and broadcast light_add.

**Risks.** A new renderer, however small, and volumetric cones add fill cost.

**Verification.** Unit test for placement and aim maths. Headed wheel-smoke: the Light sub-wheel opens. On-device: place, adjust and undo a light.

### P4.6 Floor-plan underlay with calibration

Track: build. Effort: M. Depends on: P1.6, P2.3, P2.8.

**Outcome.** An art department plan lies on the stage floor at true scale, and walls can be traced over it.

**Implementation.** Import PNG or JPEG through the P1.2 card or the drop box into the blob store. Draw it as one textured floor quad (MeshBasicMaterial) under contentRoot, downscaled to 2048. Calibrate scale by picking two points and typing their distance on the keypad (a pure calibratePlanScale in src/registration.ts). Place it with P1.6 two-point align, cycle its opacity from the wheel, and trace walls with P2.3. PDF comes later.

**Risks.** Photographed plans have perspective distortion, so ask for scans or exports.

**Verification.** Unit tests for calibratePlanScale. On-device: trace a plan's 14 ft wall and measure 14 ft to within 1 in.

### P4.7 AI blockout from text or a plan, previewed before commit

Track: build. Effort: L. Depends on: P0.15, P2.3, P2.5.
Review notes: R9.

**Outcome.** Describe a set ('three-wall office 14 by 12, 10 ft walls, door stage left') and get two or three editable blockouts of walls, openings and kit pieces to choose from.

**Implementation.** Extend buildGeminiAiSystemPrompt (src/setDressingEngine.ts:1272) with a layout JSON schema: walls, openings, kit pieces and props. A new pure src/layoutSolver.ts snaps the output to kit sizes, closes loops, merges collinear walls, enforces minimum door widths and clamps to the stage or scanned room. Alternatives show as ghosts through the setDressingRenderer ghost group (253-275), and Accept is one undo step and one collab patch. The offline template grammar extends parseDeterministicNlCommand (1099). The key is per device (P0.15). Voice stays optional, feature-detected, and never the only path.

**Risks.** LLM geometry is unreliable without the solver. Network is often absent on set, which the offline grammar covers. Cost per call.

**Verification.** Unit tests for layoutSolver against messy, hand-written model outputs, and for the grammar. The live path is checked manually, with recorded responses saved as fixtures.

### P4.8 VR walkthrough mode for locations bigger than the room

Track: build. Effort: L. Depends on: P3.5.
Review notes: R11.

**Outcome.** A director walks and builds in a 30 m warehouse scan from a small office, with no passthrough and no risk of walking into real walls blind.

**Implementation.** Add an optional immersive-vr entry to src/session.ts with local-floor and no required hit-test. Placement uses the P3.5 SurfaceQuery and y=0. Fix the solar sky dome clipping (main.ts:182 has far=60, against a 450 m dome in solarRenderer.ts:241-260) by scaling the dome inside the far plane. The capability profile hides AR-only tools. Locomotion uses the existing comfort vignette.

**Risks.** Doubles the device test matrix. Many code paths assume session.lastHit exists.

**Verification.** On-device only, on both headsets: 72 fps, and every placement path works without hit-test.

## Review corrections

An independent review of this plan found the problems below. Those that applied to Phase 0 were fixed in PR #1: the auto-realign that cancelled its own scan, wrong-scene saves in every studio, the per-frame splat budget rebuild, the floor re-base during scan capture, the ignored reference-space reset, the wireframe overlay keyed by label, the prop settle point and the stale AI scatter config. The rest are still open:

- **R1 (P1.4, P1.6): Photo mode drifts after Align.** P1.6 bakes alignment into the LocationScan with applyRigidToScan, but P1.4 draws Photo mode from the original source bytes, which never receive the import recentring, the convention matrix or any Align delta. Store an accumulated sourceTransform on ScanSummary and apply it to the Photo group.
- **R2 (P1.6, P1.7): Align must respect the view state and the floor estimate.** toggleScan refuses unless the user is in Full view and not shifted; P1.6 and P1.7 need the same guard, or alignment baked while shifted is wrong after Re-align (restoreScene also skips re-anchoring while shifted). floor.ts re-bases contentRoot y, so Align should also wait for the floor estimate to commit, as Scan Room now does.
- **R3 (P1.8, P4.2): Scan codec v2 breaks the Unreal import.** Content/Python/import_setview.py returns None for any scan version other than 1 (around line 350), so v2 scans would be dropped without a warning, and scan.ts hard-codes version 1 in several places. test/import-test.py only has v1 fixtures. Either update the Python decoder and add v2 fixtures as part of P1.8, or skip the version bump and encode the source in the label (for example 'plane:wall').
- **R4 (P1.2): Import location must write to the scene it was opened for.** Landing callbacks pass a scene id, and the plan mutates this.sceneData.scan directly. Reuse the Phase 0 commitStudioEdit pattern: save that scene when it is not the current one, and only touch live subsystems when it is.
- **R5 (P1.7): transformSceneRigid needs an explicit field schema.** The plan misses solar.northHeadingDeg, the ICVFX wall center and rotationY, grip trackPoints and turretBasePos, and acoustics operatorPosition and targetPoint. The proposed 'every Vec3 moved' test misses scalar headings and would push implementers to translate local offsets (acoustics chestOffset) and Euler rotations. Test against a declared schema of world positions and headings instead.
- **R6 (P2.3, P2.6, P2.8): New controls collide with existing bindings.** Grip is already the carry button, so 'hold grip to suspend snapping' would disable snapping during every carry. Stick click on the pointer hand is teleport. The keypad on the left palm, parked with Y, collides with the wheel (left palm) and the menu button (Y). Hand-tracking users have no B button to finish a wall run. Choose the bindings before building these items.
- **R7 (P1.2, P1.8): One scan slot per scene.** SceneData.scan holds a single scan, so Scan Room silently replaces an imported location. Add a confirm guard, or a layer model.
- **R8 (P2.4, P3.3): Scanned furniture cannot be deleted or duplicated.** Delete and Duplicate on scanned furniture only log a message today. Decide whether that is acceptable before walls and kit share the same radial actions.
- **R9 (P2.1, P4.7): Set-dressing wall regions use the wrong axis.** setDressingEngine.ts builds wall regions with w.start.y and w.end.y as Z (around line 796), but WallData start and end are Vec3 with y as the floor. This goes live once Phase 2 creates walls, before P4.7 builds on it.
- **R10 (P2.6): Missing dependency.** P2.6 uses detected real planes as snap candidates, so it depends on P1.8.
- **R11 (P4.8): The sky dome would cover passthrough.** Scaling the solar sky dome inside the far plane must be limited to immersive-vr. Solar is enabled by default, so in AR the dome would hide passthrough.
- **R12 (P1.8): Plane re-triangulation must be throttled.** Re-triangulating a plane every time lastChangedTime changes becomes a per-frame allocation on Android XR, where planes keep growing. Throttle it to the same 2 Hz as the preview.
- **R13 (P1.4): Owner sign-off on unlit materials.** P1.4's MeshBasicMaterial departs from the flat Lambert rule in CLAUDE.md. It is the right choice for baked photogrammetry textures, but the owner should approve it.

Missing on-device spikes, to add to the list below:

- Hand-tracking squeeze for prop carry and for the Align grab.
- Peak memory and parse time for a 100 to 300 MB GLB on the Quest 2D page, and again when entering AR for Photo mode. S7 covers only fetch and store, and S8 only frame time.
- Phone upload to drop.html over the self-signed certificate, on iOS and Android.
- Fold into S6: whether Space Setup fires a reference-space reset, and whether the floor estimate commits before or after Scan Room captures.

Sequencing: P0.5 and P0.6 shipped before spikes S6 and S1, so treat their behaviour as provisional until the probe has run.

## Do not do

- Do not build or rely on in-AR DOM UI (studio modals, `<input type=file>`) as a path forward. dom-overlay is reportedly absent in Quest immersive-ar, and Chromium's OpenXR backend lists it as unsupported. Imports happen on the 2D page or the drop box; in-AR tools are the wheel, radial, ray and UIPanel canvas panels.
- Do not call initiateRoomCapture automatically, more than once per session, without plane-detection enabled, or on Chrome expecting a capture (it is a stub there). Meta disabled the same auto-call in IWSDK over anchor wiping.
- Do not make mesh-detection or plane-detection required features, and do not tell Android XR users to enable chrome://flags as a supported workflow.
- Do not request 'camera-access' or plan in-headset photogrammetry, splat training or TSDF fusion in this roadmap. Photoreal capture comes from phone apps.
- Do not build a Hyperscape import (no export exists) or scrape Polycam, Scaniverse or KIRI share links (no public fetch API on consumer plans).
- Do not put a live registration transform on contentRoot. Actor and camera anchors are created and read back in reference space (actors.ts reanchor, updateFromAnchors), so bake alignment into scene data with applyRigidToScan and transformSceneRigid instead.
- Do not store heavy binaries (scans, splats, meshes, textures, prop models) in localStorage, inline in SceneData, in undo snapshots or in collab patches. Store references only, and use a separate IndexedDB database rather than bumping the shared 'setview' DB version.
- Do not invest in src/gaussianRenderer.ts beyond the P0.14 fixes, and do not migrate to WebGPURenderer or three r186 GaussianSplat now. Spark 2.4 on the current WebGLRenderer is the only low-disruption path, and only after its spike.
- Do not use MeshStandardMaterial, canvas PBR textures, shadows or post-processing for walls, kit or imported locations. Use flat Lambert for built geometry and unlit materials for photogrammetry textures; merge or instance.
- Do not import three or touch the DOM in any new domain module (sceneImport, registration, scanFlow, planeConvert, setKit, units, keypad, bundle, transferProtocol, layoutSolver). Keep renderer adapters separate, use .ts import specifiers, and allocate nothing per frame in preview, carry or snap loops.
- Do not make persistent anchors the only registration path, use more than one per scene, store their handles in exports, or attempt them on Android XR Chrome.
- Do not load user files through blob: URLs, trust extensions or MIME types, or restrict pickers with a narrow accept list. Read ArrayBuffers inside try/catch and identify formats by magic bytes.
- Do not treat MDN browser-compat-data 'mirror' entries for Quest (domOverlayState, XRCamera, SpeechRecognition) as evidence of support. Probe on the device.
- Do not build a cloud backend, accounts, cross-device collab or environment collab sync before the LAN drop-box loop has been used on a headset and the owner has decided.
- Do not export, drop, package or relay scenes until the Gemini API key is out of SceneData (P0.15).
- Do not show inert controls: the unwired TransformGizmo, the Light arm and sector before P4.5, or a Snap to Grid that does nothing.
- Do not store imperial values, or present wall heights above 12 ft or theatre flat thickness as verified soundstage standards.
- Do not promise splat counts, triangle caps, alignment accuracy or Quest frame rates in UI or docs until the spikes have produced numbers, and do not trust Spark's default budgets chosen from the user agent.
- Do not make voice or AI the only way to reach any function, and do not build multi-room merging until the single-room flow is proven on hardware.

## On-device spikes

Run these before building the items they gate. The P0.0 probe page answers S1 to S7.

- **S1** (gates P0.4, P0.5, P0.6, P1.8, P3.3): run the P0.0 probe on Quest 3, Browser 154.x, with both 'plane-detection' and 'mesh-detection' optional. Are both in enabledFeatures, and is there a new permission prompt? After Space Setup, what do detectedPlanes and detectedMeshes contain: the exact semanticLabel strings (door and window variants), the bounded mesh labels, and the vertex and index count of 'global mesh'?
- **S2** (gates P0.4, P1.8, P2.3): Galaxy XR Chrome (147+). Is plane-detection granted by default? Are semanticLabel values populated or null? How fast do planes fill in as the user looks around? Is dom-overlay absent? Is hit-test on the floor reliable at 1 to 4 m?
- **S3** (gates P0.1, P2.8): Quest immersive-ar. Is session.domOverlayState null? Does focusing a hidden input raise the system keyboard, and does the session go to 'visible-blurred' and back cleanly?
- **S4** (decides whether P1.2's picker or P1.5's drop box is the primary path): on the Quest Browser 2D page, can `<input type=file>` read .glb, .json, .obj, .ply, .fbx, .spz, .splat and extensionless files via File.arrayBuffer() with correct bytes, or do they come back null, empty or ERR_ACCESS_DENIED? Are file names preserved?
- **S5** (gates P2.3, P1.6, P3.5): Quest 3 without Space Setup. Does hit-test return floor hits at once (reportedly depth-based since Browser 40.4, unconfirmed by Meta)? How noisy is it, where does it stop (about 5 m), and does it hit people?
- **S6** (gates P0.5): with plane-detection enabled, does an explicit initiateRoomCapture launch Space Setup on Quest, does the immersive session survive, do XR frames pause, and are existing actor and camera anchors invalidated?
- **S7** (sets P1.3 and P1.5 limits): can the Quest fetch a 100 to 300 MB file from the Mac's dev server over the LAN and store it as a Blob in IndexedDB? What do navigator.storage.persist() and estimate() return, and is anything evicted after a week?
- **S8** (sets P1.1 caps and the P1.4 texture limit): frame time on Quest 3 for a real Polycam Free GLB at about 150k, 300k and 600k triangles in Solid (Lambert) and Photo (unlit, 2K textures) modes, with 4 actors and the 1024 Camera View RTT open.
- **S9** (sets P2.3 and P2.6 defaults): wall-endpoint precision with controller trigger versus hand pinch at 1 m and 3 m on Quest 3 and Galaxy XR. Do gamepad.hapticActuators pulses from spatialFeedback.ts fire for short snap ticks in both browsers?
- **S10** (gates P3.2 and the MSAA decision): Spark 2.4.0 SparkRenderer plus SplatMesh inside SetView's own renderer.xr session on Quest 3, with antialias:true (main.ts:308) and the per-frame 1024 Camera View RTT. Does it hang (an untested variant of issue #400)? What frame time and P95 come out at 150k, 300k and 500k LoD splats with 4 actors? What changes with antialias:false, splats hidden in the RTT, or autoUpdate=false plus manual update()?
- **S11** (gates P3.4): Quest persistent anchors on Browser 154. Does requestPersistentHandle succeed? Does restorePersistentAnchor survive an app restart, a reboot and a Space Setup re-run? What is the real slot count, does it count across origins, and do blank '' handles appear?
- **S12** (desktop, cheap, before shipping P0.7): confirm in a headed desktop run that Ghost renders opaque after a Solid or Camera View pass (the three r180 OPAQUE define), so the fix is validated against a real repro. **Done 2026-11-06** with `test/ghost-opacity-smoke.html`: it fails on `cd82a8e` exactly as described and passes with P0.7.

## Decisions for the owner

### How should files get from a phone or desktop to the headset beyond the dev LAN?

Options: (a) LAN drop box on the Vite dev server only (no backend, works only while npm run dev runs). (b) Hosted Cloudflare Worker + R2 relay with pairing codes and Meta Web Launch (needs hosting, a privacy and retention policy, abuse controls, small ongoing cost; a separate repo needs its own vault context folder). (c) Manual moves only (Google Drive through the Quest Files app; zero build cost, poor UX).

Recommendation: Ship (a) in Phase 1 and document (c) as the fallback. Decide on (b) only after the drop-box loop has been used on a headset with real scans. If yes, keep the relay in this repo under relay/ with a 24 to 72 h TTL, no listing endpoint, and the same API shape as the drop box.

### Should SetView render Gaussian splat locations, given ROADMAP.md lists photoreal rendering as 'not planned'?

Options: (a) Adopt Spark 2.4 for splats as a budgeted reference layer and amend ROADMAP.md. (b) Stay mesh-only (Polycam GLB, Scaniverse mesh, Photo mode) and leave photoreal to Unreal. (c) Wait for three r186 GaussianSplat, which means a WebGPURenderer migration and rewriting dof.ts, the volumetrics and the vignette in TSL.

Recommendation: Default to (b) through Phase 2. Run spike S10, and adopt (a) only if Spark holds 72 fps alongside actors and Camera View without the #400-style hang. Reword ROADMAP.md to 'splats as reference, not final pixels'. Reject (c) for now.

### If the splat spike shows the Quest hang or a frame-time problem, which MSAA policy should apply?

Options: (a) Keep antialias:true and hide or freeze splats (autoUpdate=false) during the Camera View RTT. (b) Choose antialias at page load based on whether the scene has splats (switching scenes then needs a reload). (c) Turn antialias off globally on Quest.

Recommendation: Try (a) first because it costs nothing elsewhere. Fall back to (b) if the hang persists. Use (c) only if (b) proves confusing.

### Should new scenes stop shipping the enabled 270-degree LED horseshoe (an opaque 9 m radius, 6 m tall volume) by default?

**Decided 2026-11-05: (a).** Implemented as P0.10.

Options: (a) New scenes start with ICVFX disabled (P0.10). (b) Keep the current default. (c) Ask at scene creation (empty set, LED volume, room template).

Recommendation: (a) now, since building over passthrough is impossible inside an opaque LED volume. Consider (c) later as a template picker.

### Is Android XR (Galaxy XR) a supported target for this work, given nothing has been verified on that hardware?

Options: (a) Support both headsets equally, with a Galaxy XR available for every spike. (b) Quest-first, with the cheap Android XR paths built (plane capture, manual align) and checked whenever a device is available. (c) Quest only.

Recommendation: (b). The plane path and manual align cost little and also help Quest. Do not block Quest releases on Galaxy XR checks, but run the P0.0 probe there before claiming support.

### Which AI vendor and scope for set blockout and future voice commands?

Options: (a) Keep the existing Gemini integration (setDressingEngine prompt builder and parser) with a per-device key. (b) Switch to another LLM vendor behind the same layout schema and solver. (c) Offline template grammar only, with no network calls.

Recommendation: Make the offline grammar (c) the baseline either way, because sets often lack network. Reuse the existing Gemini path (a) only after P0.15 removes the key from scene data. The pure layoutSolver keeps the vendor swappable, so the choice can wait until P4.7.

### Should an immersive-vr walkthrough or build mode be added?

Options: (a) Add it in Phase 4 after AR authoring works (P4.8). (b) Add it earlier for remote-location scouting. (c) Never; use Solid or Photo location modes inside AR.

Recommendation: (a). Solid and Photo modes cover most scouting inside AR, while VR doubles the test matrix and breaks the assumption that hit-test exists.

### What default display units, and how should free-tier capture licensing be presented?

Options: Units: imperial for en-US with a toggle, or metric only, or imperial only. Licensing: show a non-commercial badge on Scaniverse Free and Plus imports, or say nothing.

Recommendation: Imperial for en-US locales with a per-device toggle; storage always in meters. Show the license badge, since a previs tool for paid productions should not imply free-tier captures are production-usable.
