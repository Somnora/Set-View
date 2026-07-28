# SetView -> Unreal Engine 5.8 Handoff Guide

This document describes the workflow, coordinate system contract, and Python bridge scripts (`import_setview.py` and `import_people.py`) used to export scenes from **SetView** (WebXR AR previz & blocking) into **Unreal Engine 5.8** (or UE 5.x) for high-fidelity photoreal rendering.

---

## Architecture & Overview

SetView is designed as a fast, in-location spatial blocking tool. Directors and DPs stand in a physical room, place virtual actors and cameras, record blocking keyframes, and frame shots using physically accurate camera optics.

Once a scene is authored and exported to `.setview.json`, the Unreal Engine importer recreates the complete set in Unreal Engine:
- **CineCameraActors**: Matches exact sensor width (Super 35, Full Frame, Super 16, Anamorphic 2×), aspect ratio (2.39:1, 16:9, 4:3), free focal length (mm), T-stop aperture, and physical camera transform.
- **Skeletal / MetaHuman Actors**: Placed at exact positions, facing headings, scales, and stance targets (10 body poses).
- **LevelSequence Assets**: Generated automatically at SetView's configured walk speed (`walkSpeed` in m/s) driving actor keyframe motion, stance holds, and camera cuts over the timeline.
- **Cine Light Actors**: Spot, Point, and Rect lights created matching SetView light placements, intensities, color temperatures, and cone angles.
- **Location Scan Static Meshes**: Decodes embedded WebXR room mesh binary geometry (`scanData`) into a `StaticMeshActor` with movable furniture placements (`scan.furniture`).

---

## Coordinate System Contract

SetView and Unreal Engine 5 use different coordinate conventions and length units:

| Dimension | SetView (WebXR / Three.js) | Unreal Engine 5 | Importer Conversion Formula |
| :--- | :--- | :--- | :--- |
| **Units** | Meters ($m$) | Centimeters ($cm$) | $1\,m = 100\,cm$ |
| **Up Axis** | $+Y$ | $+Z$ | $Z_{UE} = Y_{SV} \times 100$ |
| **Right Axis** | $+X$ | $+Y$ | $Y_{UE} = X_{SV} \times 100$ |
| **Forward Axis** | $-Z$ ($+Z$ is towards camera) | $+X$ | $X_{UE} = Z_{SV} \times 100$ |
| **Actor Heading** | $\text{rotationY}$ rad around $+Y$ ($0 = +Z$) | $\text{Yaw}$ deg around $+Z$ ($0 = +X$) | $\text{Yaw}_{UE} = \text{degrees}(\text{rotationY}_{SV})$ |

---

## Optics & Sensor Format Mapping

SetView models physical camera gates verbatim:

| Sensor Format ID | Format Name | Gate Width ($mm$) | Squeeze | Unreal Filmback Sensor Width ($mm$) |
| :--- | :--- | :--- | :--- | :--- |
| `super35` | Super 35 | 24.89 | 1.0× | $24.89\,mm$ |
| `fullframe` | Full Frame / VistaVision | 36.00 | 1.0× | $36.00\,mm$ |
| `super16` | Super 16 | 12.52 | 1.0× | $12.52\,mm$ |
| `anamorphic35` | S35 Anamorphic 2× | 24.89 | 2.0× | $24.89\,mm$ |

The camera aspect ratio determines the vertical sensor height:
$$\text{Sensor Height} = \frac{\text{Gate Width}}{\text{Aspect Ratio}}$$

The CineCameraComponent's `current_focal_length` and `current_aperture` are set directly from the `.setview.json` values.

---

## Python Bridge Scripts

The repository contains two Python scripts located under `Content/Python/` (and linked at root):

### 1. `import_setview.py`
The primary scene importer script.

#### Standalone Verification / CLI Mode (No Unreal required):
Verify and inspect any `.setview.json` file on your local machine:
```bash
python3 import_setview.py /path/to/scene.setview.json --verbose
```
This parses the JSON, validates all data types, decodes binary scan data, computes all Unreal Engine transforms, and outputs a complete diagnostic report.

#### Running inside Unreal Engine 5.8:
In Unreal Engine Output Log (Python tab) or Editor Utility Widget:
```python
import import_setview
import_setview.import_scene_to_unreal_from_file("/path/to/scene.setview.json")
```

Or via Unreal Engine Command Line / Headless:
```bash
UnrealEditor.exe "C:\Projects\MySetViewProject.uproject" -ExecutePythonScript="import_setview.py" --json="C:\Exports\my-scene.setview.json"
```

### 2. `import_people.py`
Asset pipeline utility for batch-importing character models (MetaHumans, GLB/FBX avatars) and 3D furniture models into `/Game/SetView/People` and `/Game/SetView/Furniture`.

#### Usage:
```bash
python3 Content/Python/import_people.py --people-dir /path/to/avatars --furniture-dir /path/to/furniture
```

---

## Step-by-Step Handoff Workflow

1. **Author Scene in SetView**:
   - Open SetView on Meta Quest or desktop browser.
   - Scan room or set up blocking, place actors with stances, place cameras with target optics.
   - Click **Export JSON** on the prep panel or wrist menu to download `scene-name.setview.json`.

2. **Run Importer in Unreal Engine**:
   - Open your UE 5.8 project.
   - Run `import_setview.py` passing the path to `scene-name.setview.json`.

3. **Review & Render**:
   - Inspect the spawned `CineCameraActor` instances under World Outliner.
   - Open the generated `LevelSequence` asset under `/Game/SetView/{SceneName}/Sequences/` to scrub actor blocking and camera cuts.
   - Assign MetaHuman materials/rigs or lighting passes for final output render.
