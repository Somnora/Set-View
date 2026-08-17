"""
Verification script for import_setview.py and import_people.py JSON compatibility.
"""

import os
import sys
import json
import math
import base64
import struct
import subprocess

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "Content", "Python"))

import import_setview  # noqa: E402


# --- Independent Unreal oracle ------------------------------------------------

def ue_rotation_matrix(pitch_deg, yaw_deg, roll_deg):
    """
    Unreal's own FRotationMatrix, written out independently of import_setview so
    the coordinate tests below have an oracle they do not share code with.
    Returns (forward, right, up) — the three matrix rows.
    """
    sp, cp = math.sin(math.radians(pitch_deg)), math.cos(math.radians(pitch_deg))
    sy, cy = math.sin(math.radians(yaw_deg)), math.cos(math.radians(yaw_deg))
    sr, cr = math.sin(math.radians(roll_deg)), math.cos(math.radians(roll_deg))
    forward = (cp * cy, cp * sy, sp)
    right = (sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, -sr * cp)
    up = (-(cr * sp * cy + sr * sy), cy * sr - cr * sp * sy, cr * cp)
    return forward, right, up


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def run_coordinate_tests():
    """
    Locks the SetView -> Unreal handedness contract.

    SetView is right-handed (Y-up, camera looks down -Z); Unreal is left-handed
    (Z-up, +X forward, +Y right). The conversion therefore needs a determinant -1
    basis map. A determinant +1 permutation such as (x, y, z) -> (z, x, y) is a
    pure rotation: it mirrors the scene, so every screen direction reverses while
    the export still looks internally consistent.
    """
    print("\n--- Testing SetView -> Unreal coordinate handedness ---")

    m = import_setview

    # 1. Determinant of the position basis map must be -1.
    ex = m.sv_to_ue_location({"x": 1.0, "y": 0.0, "z": 0.0})
    ey = m.sv_to_ue_location({"x": 0.0, "y": 1.0, "z": 0.0})
    ez = m.sv_to_ue_location({"x": 0.0, "y": 0.0, "z": 1.0})
    s = m.SCALE_M_TO_CM
    col = lambda v: (v[0] / s, v[1] / s, v[2] / s)
    a, b, c = col(ex), col(ey), col(ez)
    det = (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - b[0] * (a[1] * c[2] - a[2] * c[1])
        + c[0] * (a[1] * b[2] - a[2] * b[1])
    )
    assert abs(det - (-1.0)) < 1e-9, f"basis map determinant must be -1 (right-handed -> left-handed), got {det}"
    print(f"  [ok] position basis map determinant = {det:.1f}")

    # 2. Up stays up: SetView +Y -> Unreal +Z.
    assert col(ey) == (0.0, 0.0, 1.0), f"SetView +Y must map to Unreal +Z, got {col(ey)}"
    assert col(ex) == (0.0, 1.0, 0.0), f"SetView +X must map to Unreal +Y, got {col(ex)}"
    assert col(ez) == (-1.0, 0.0, 0.0), f"SetView +Z must map to Unreal -X, got {col(ez)}"
    print("  [ok] up stays up (+Y_sv -> +Z_ue), +X_sv -> +Y_ue, +Z_sv -> -X_ue")

    # 3. Screen direction: identity camera at the origin, actor 5m in front and
    #    1m to the camera's RIGHT must still be in front and to the RIGHT.
    cam_ue = m.sv_to_ue_location({"x": 0.0, "y": 0.0, "z": 0.0})
    actor_ue = m.sv_to_ue_location({"x": 1.0, "y": 0.0, "z": -5.0})
    pitch, yaw, roll = m.sv_quat_to_ue_rotator({"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0})
    fwd, right, up = ue_rotation_matrix(pitch, yaw, roll)
    rel = sub(actor_ue, cam_ue)
    assert abs(dot(rel, fwd) - 500.0) < 1e-6, f"actor must stay 5m in front, got {dot(rel, fwd)}cm"
    assert dot(rel, right) > 0.0, "MIRRORED: actor 1m to camera right came out on the left"
    assert abs(dot(rel, right) - 100.0) < 1e-6, f"actor must stay 1m to the right, got {dot(rel, right)}cm"
    assert abs(dot(rel, up)) < 1e-6
    print("  [ok] screen direction preserved (5m front / 1m camera-right survives the handoff)")

    # 4. Heading round-trip: the yaw-derived facing direction must equal the
    #    SetView facing vector pushed through the position map.
    for deg in (0.0, 90.0, 180.0, 270.0, 37.5, -60.0):
        rot_y = math.radians(deg)
        facing_sv = {"x": math.sin(rot_y), "y": 0.0, "z": math.cos(rot_y)}
        facing_ue = col(m.sv_to_ue_location(facing_sv))
        yaw_deg = m.sv_heading_to_ue_yaw(rot_y)
        from_yaw = (math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg)), 0.0)
        for got, want, axis in zip(from_yaw, facing_ue, "xyz"):
            assert abs(got - want) < 1e-9, f"heading {deg}deg: yaw facing {axis} mismatch ({got} vs {want})"
    assert abs(m.sv_heading_to_ue_yaw(0.0) - 180.0) < 1e-9
    assert abs(m.sv_heading_to_ue_yaw(math.radians(90.0)) - 90.0) < 1e-9
    assert abs(m.sv_heading_to_ue_yaw(math.radians(180.0)) - 0.0) < 1e-9
    assert abs(m.sv_heading_to_ue_yaw(math.radians(270.0)) - (-90.0)) < 1e-9
    print("  [ok] heading yaw agrees with the position map for 0/90/180/270 and off-axis headings")

    # 5. Roll sign: a Three.js camera rolled +alpha about its own local +Z (which
    #    points BACKWARD) must come out as Unreal roll -alpha; the handedness flip
    #    reverses roll. Unreal roll is positive when up leans toward +Y.
    for alpha_deg in (30.0, -30.0, 12.5):
        a_rad = math.radians(alpha_deg)
        q = {"x": 0.0, "y": 0.0, "z": math.sin(a_rad / 2), "w": math.cos(a_rad / 2)}
        pitch, yaw, roll = m.sv_quat_to_ue_rotator(q)
        assert abs(pitch) < 1e-9, f"pure roll leaked into pitch: {pitch}"
        assert abs(yaw) < 1e-9, f"pure roll leaked into yaw: {yaw}"
        assert abs(roll - (-alpha_deg)) < 1e-9, f"roll sign wrong: expected {-alpha_deg}, got {roll}"
        _, _, up_v = ue_rotation_matrix(pitch, yaw, roll)
        assert math.copysign(1.0, up_v[1]) == math.copysign(1.0, -alpha_deg), "up vector leans the wrong way"
    print("  [ok] roll sign is negated by the handedness flip (three.js +30 -> Unreal -30)")

    # 6. Full rotator parity: the extracted rotator must rebuild exactly the
    #    Unreal basis you get by pushing the SetView camera basis through the map.
    for q in (
        {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
        {"x": 0.0, "y": 0.7071067811865476, "z": 0.0, "w": 0.7071067811865476},
        {"x": 0.1830127, "y": 0.6830127, "z": 0.1830127, "w": 0.6830127},
        {"x": -0.2705981, "y": 0.6532815, "z": 0.2705981, "w": 0.6532815},
    ):
        qn = math.sqrt(sum(v * v for v in q.values()))
        qx, qy, qz, qw = q["x"] / qn, q["y"] / qn, q["z"] / qn, q["w"] / qn
        f_sv = (-2.0 * (qx * qz + qw * qy), -2.0 * (qy * qz - qw * qx), -(1.0 - 2.0 * (qx * qx + qy * qy)))
        u_sv = (2.0 * (qx * qy - qw * qz), 1.0 - 2.0 * (qx * qx + qz * qz), 2.0 * (qy * qz + qw * qx))
        r_sv = (1.0 - 2.0 * (qy * qy + qz * qz), 2.0 * (qx * qy + qw * qz), 2.0 * (qx * qz - qw * qy))
        want = (
            m.sv_direction_to_ue(f_sv),
            m.sv_direction_to_ue(r_sv),
            m.sv_direction_to_ue(u_sv),
        )
        got = ue_rotation_matrix(*m.sv_quat_to_ue_rotator(q))
        for g_vec, w_vec in zip(got, want):
            for g, w in zip(g_vec, w_vec):
                assert abs(g - w) < 1e-9, f"rotator basis mismatch: {got} vs {want}"
    print("  [ok] quaternion -> rotator -> Unreal basis is exact for yaw/pitch/roll combinations")

    # 7. The OBJ scan writer must share the helper AND reverse triangle winding,
    #    otherwise the det -1 vertex map turns every face inside-out.
    import tempfile

    mesh = {
        "label": "winding",
        "positions": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        "indices": [0, 1, 2],
    }
    with tempfile.TemporaryDirectory() as tmp:
        obj_path = os.path.join(tmp, "scan.obj")
        assert m.export_scan_to_obj([mesh], obj_path)
        with open(obj_path, "r", encoding="utf-8") as fh:
            lines = [ln.strip() for ln in fh if ln.strip()]
    verts = [tuple(float(t) for t in ln.split()[1:]) for ln in lines if ln.startswith("v ")]
    faces = [ln for ln in lines if ln.startswith("f ")]
    for got, sv in zip(verts, ({"x": 0, "y": 0, "z": 0}, {"x": 1, "y": 0, "z": 0}, {"x": 0, "y": 0, "z": 1})):
        want = m.sv_to_ue_location(sv)
        assert all(abs(g - w) < 1e-6 for g, w in zip(got, want)), (
            f"OBJ vertex map diverged from sv_to_ue_location: {got} vs {want}"
        )
    assert faces[0] == "f 1 3 2", f"OBJ winding must be reversed for the det -1 map, got '{faces[0]}'"
    print("  [ok] scan OBJ writer uses the shared map and reverses triangle winding")

    # --- Actor stance orientation ------------------------------------------
    # The stance table used to carry hand-baked Unreal degrees with the wrong sign on
    # BOTH pitch and roll: an actor SetView showed lying on their back imported
    # face-down, and every lean came out mirrored. Now derived from pose.ts bodyRot
    # through the same det -1 basis map, so it cannot drift from the convention again.
    #
    # UE forward = (CP*CY, CP*SY, SP): pitch +90 points the body's forward UP (supine),
    # pitch -90 points it DOWN (prone).
    supine = m.sv_actor_rotator(0.0, "lying-up")
    prone = m.sv_actor_rotator(0.0, "lying-down")
    assert abs(supine[0] - 90.0) < 1e-6, f"lying-up must pitch +90 (face up), got {supine[0]}"
    assert abs(prone[0] + 90.0) < 1e-6, f"lying-down must pitch -90 (face down), got {prone[0]}"
    assert abs(supine[0] - prone[0]) > 1.0, "supine and prone must not import identically"
    print("  [ok] lying-up imports face UP and lying-down imports face DOWN")

    # Leans are mirror images of each other, and the handedness flip negates roll.
    left = m.sv_actor_rotator(0.0, "lean-left")
    right = m.sv_actor_rotator(0.0, "lean-right")
    assert abs(left[2] + right[2]) < 1e-6, f"lean roll must be symmetric, got {left[2]} / {right[2]}"
    assert abs(left[2] + 11.46) < 0.01, f"lean-left roll must be -11.46 after the flip, got {left[2]}"

    # Heading must compose with a 90-degree stance pitch without gimbal-coupling into
    # roll. Building (stance_pitch, heading_yaw, stance_roll) component-wise silently
    # failed this, which is why the whole basis is mapped and re-extracted instead.
    for heading_deg in (0.0, 45.0, 90.0, 180.0, 270.0):
        rot = m.sv_actor_rotator(math.radians(heading_deg), "lying-left")
        assert abs(rot[0] - 90.0) < 1e-6, (
            f"lying-left pitch must stay +90 at heading {heading_deg}, got {rot[0]}"
        )
    print("  [ok] stance orientation survives composition with heading")

    # Every stance must produce a finite, in-range rotator.
    for stance in m.STANCES:
        p, y, r = m.sv_actor_rotator(0.7, stance)
        for v, label in ((p, "pitch"), (y, "yaw"), (r, "roll")):
            assert v == v and abs(v) <= 360.0, f"{stance} produced a bad {label}: {v}"
    print(f"  [ok] all {len(m.STANCES)} stances produce finite rotators")

    print("Coordinate handedness tests passed.")


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
        "audioCues": [
            {
                "id": "cue-1",
                "name": "Lead Actor Dialogue",
                "type": "dialogue",
                "timestampS": 1.5,
                "durationS": 2.8,
                "volume": 0.9,
                "spatial": True,
                "attachedActorId": "act-1",
                "transcript": "We have to get moving before sunrise."
            },
            {
                "id": "cue-2",
                "name": "Rain Ambience",
                "type": "ambience",
                "timestampS": 0.0,
                "durationS": 10.0,
                "volume": 0.4,
                "spatial": False
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
    run_coordinate_tests()

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
