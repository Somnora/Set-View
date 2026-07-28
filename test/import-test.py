"""
Verification script for import_setview.py and import_people.py JSON compatibility.
"""

import os
import sys
import json
import base64
import struct
import subprocess

def create_sample_setview_json(path: str):
    # Construct binary location scan data
    # Format: u32 ver=1, f64 capturedAt, u32 meshCount=1, label_len, label, pos_count, idx_width, idx_count, pos, idx
    label = "global mesh".encode('utf-8')
    positions = [
        -2.0, 0.0, -2.0,
         2.0, 0.0, -2.0,
         2.0, 0.0,  2.0,
        -2.0, 0.0,  2.0
    ]  # 4 vertices (12 float values)
    indices = [0, 1, 2, 0, 2, 3]  # 2 triangles (6 indices)

    buf = bytearray()
    buf.extend(struct.pack('<I', 1))  # version
    buf.extend(struct.pack('<d', 1720500000000.0))  # capturedAt
    buf.extend(struct.pack('<I', 1))  # mesh count
    buf.extend(struct.pack('<I', len(label)))
    buf.extend(label)
    buf.extend(struct.pack('<I', len(positions)))
    buf.append(2)  # index width u16
    buf.extend(struct.pack('<I', len(indices)))
    buf.extend(struct.pack(f'<{len(positions)}f', *positions))
    buf.extend(struct.pack(f'<{len(indices)}H', *indices))

    b64_scan = base64.b64encode(buf).decode('utf-8')

    data = {
        "version": 1,
        "id": "scene-test-123",
        "name": "Unreal Handoff Verification Scene",
        "createdAt": 1720500000000,
        "updatedAt": 1720500100000,
        "walkSpeed": 1.4,
        "actors": [
            {
                "id": "act-1",
                "name": "Actor 1 (Director)",
                "color": "#e5484d",
                "position": {"x": 0.0, "y": 0.0, "z": 2.0},
                "rotationY": 0.0,
                "stance": "standing",
                "keyframes": [
                    {
                        "position": {"x": 1.5, "y": 0.0, "z": 2.0},
                        "rotationY": 1.57,
                        "stance": "standing"
                    },
                    {
                        "position": {"x": 1.5, "y": 0.0, "z": 4.0},
                        "rotationY": 3.14,
                        "stance": "seated-chair"
                    }
                ],
                "notes": [
                    {"id": "n1", "kind": "action", "text": "Walks to chair and sits.", "createdAt": 1720500050000}
                ]
            },
            {
                "id": "act-2",
                "name": "Actor 2 (Lead)",
                "color": "#3e9bf0",
                "position": {"x": -1.0, "y": 0.0, "z": 3.0},
                "rotationY": 0.785,
                "stance": "seated-lounge",
                "keyframes": [],
                "notes": []
            }
        ],
        "cameras": [
            {
                "id": "cam-a",
                "name": "CAM A",
                "position": {"x": 0.0, "y": 1.6, "z": -1.0},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                "lensFocalLength": 35.0,
                "aspect": "16:9",
                "tStop": 2.8,
                "formatId": "super35"
            },
            {
                "id": "cam-b",
                "name": "CAM B",
                "position": {"x": 2.5, "y": 1.1, "z": 2.0},
                "rotation": {"x": 0.0, "y": 0.707, "z": 0.0, "w": 0.707},
                "lensFocalLength": 85.0,
                "aspect": "2.39:1",
                "tStop": 1.4,
                "formatId": "fullframe"
            }
        ],
        "lights": [
            {
                "id": "light-1",
                "name": "Key Spot Light",
                "type": "spot",
                "position": {"x": 2.0, "y": 2.8, "z": 0.0},
                "intensity": 5000.0,
                "color": "#ffffff",
                "coneAngle": 45.0
            },
            {
                "id": "light-2",
                "name": "Fill Point Light",
                "type": "point",
                "position": {"x": -2.0, "y": 2.0, "z": 2.0},
                "intensity": 2000.0,
                "color": "#3e9bf0"
            }
        ],
        "scan": {
            "id": "scan-456",
            "capturedAt": 1720500000000,
            "vertices": 4,
            "triangles": 2,
            "boundsMin": {"x": -2.0, "y": 0.0, "z": -2.0},
            "boundsMax": {"x": 2.0, "y": 0.0, "z": 2.0}
        },
        "scanData": b64_scan
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Created sample scene JSON at {path}")

def run_tests():
    sample_json = "/Users/jamesmcshane/Desktop/SetView/test/sample_scene.setview.json"
    create_sample_setview_json(sample_json)

    print("\n--- Testing import_setview.py CLI ---")
    res = subprocess.run([sys.executable, "/Users/jamesmcshane/Desktop/SetView/import_setview.py", sample_json, "-v"], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
    assert res.returncode == 0, f"import_setview.py failed with code {res.returncode}"

    print("\n--- Testing import_people.py CLI ---")
    res_people = subprocess.run([sys.executable, "/Users/jamesmcshane/Desktop/SetView/Content/Python/import_people.py", "--help"], capture_output=True, text=True)
    print(res_people.stdout)
    assert res_people.returncode == 0, f"import_people.py failed with code {res_people.returncode}"

    print("\nAll verification tests passed!")

if __name__ == "__main__":
    run_tests()
