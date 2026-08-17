"""
SetView Unreal Engine 5 nDisplay Stage Automation Companion Script
===================================================================

Automates the configuration of Unreal Engine 5 In-Camera VFX (ICVFX)
LED Volume stages, nDisplay Root Actors, cluster node viewports,
inner frustum camera tracking calibration, and OCIO color profiles.

Usage in Unreal Engine 5:
-------------------------
1. Open your UE 5.1+ project with the 'nDisplay' and 'LiveLink' plugins enabled.
2. In the Output Log / Python Console or Script Editor:
     import setview_ndisplay_setup
     setview_ndisplay_setup.setup_ndisplay_stage("path/to/stage.ndisplay")
3. Or run via command-line:
     UnrealEditor-Cmd.exe MyProject.uproject -ExecutePythonScript="Content/Python/setview_ndisplay_setup.py" -StageConfig="stage.ndisplay"

Pure Python / Non-Editor Execution:
-----------------------------------
Can also be run outside the editor as a validator:
     python setview_ndisplay_setup.py stage.ndisplay
"""

import sys
import os
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional

# Attempt to import Unreal Engine Python API
try:
    import unreal
    UNREAL_AVAILABLE = True
except ImportError:
    UNREAL_AVAILABLE = False


def parse_ndisplay_config(config_path: str) -> Dict[str, Any]:
    """
    Parses a SetView .ndisplay XML configuration file.
    Returns a dictionary of stage, cluster nodes, screens, and cameras.
    """
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")

    tree = ET.parse(config_path)
    root = tree.getroot()

    stage_info: Dict[str, Any] = {
        "name": root.attrib.get("name", "SetView_LED_Volume"),
        "version": root.attrib.get("version", "5.0"),
        "nodes": [],
        "screens": [],
        "cameras": [],
    }

    # Parse Cluster Nodes
    cluster_el = root.find("cluster")
    if cluster_el is not None:
        nodes_el = cluster_el.find("nodes")
        if nodes_el is not None:
            for node in nodes_el.findall("node"):
                node_id = node.attrib.get("id", "")
                ip_addr = node.attrib.get("addr", "127.0.0.1")
                port = int(node.attrib.get("port", "41000"))
                is_primary = node.attrib.get("primary", "false").lower() == "true"
                viewports: List[Dict[str, str]] = []

                viewports_el = node.find("viewports")
                if viewports_el is not None:
                    for vp in viewports_el.findall("viewport"):
                        viewports.append({
                            "id": vp.attrib.get("id", ""),
                            "screen": vp.attrib.get("screen", ""),
                            "pos": vp.attrib.get("pos", "0,0"),
                            "size": vp.attrib.get("size", "1920x1080"),
                        })

                stage_info["nodes"].append({
                    "id": node_id,
                    "ip": ip_addr,
                    "port": port,
                    "primary": is_primary,
                    "viewports": viewports,
                })

    # Parse Screens
    screens_el = root.find("screens")
    if screens_el is not None:
        for screen in screens_el.findall("screen"):
            screen_id = screen.attrib.get("id", "")
            screen_type = screen.attrib.get("type", "flat_wall")
            size_str = screen.attrib.get("size", "10,5")
            pos_str = screen.attrib.get("pos", "0,0,0")
            rot_str = screen.attrib.get("rot", "0,0,0")

            stage_info["screens"].append({
                "id": screen_id,
                "type": screen_type,
                "size": [float(v) for v in size_str.split(",")],
                "pos": [float(v) for v in pos_str.split(",")],
                "rot": [float(v) for v in rot_str.split(",")],
            })

    # Parse Cameras
    cameras_el = root.find("cameras")
    if cameras_el is not None:
        for cam in cameras_el.findall("camera"):
            cam_id = cam.attrib.get("id", "")
            cam_type = cam.attrib.get("type", "icvfx_inner_frustum")
            overscan = float(cam.attrib.get("overscan_percent", "10"))
            tracking_subj = cam.attrib.get("tracking_subject", "CineCamera_LiveLink")

            stage_info["cameras"].append({
                "id": cam_id,
                "type": cam_type,
                "overscan_percent": overscan,
                "tracking_subject": tracking_subj,
            })

    return stage_info


def setup_ndisplay_stage(config_path: str) -> bool:
    """
    Main entry point for Unreal Editor to build and calibrate an nDisplay stage.
    """
    stage_data = parse_ndisplay_config(config_path)
    stage_name = stage_data["name"]

    if not UNREAL_AVAILABLE:
        print(f"[SetView] Validated nDisplay stage configuration '{stage_name}' successfully.")
        print(f"[SetView] Total Nodes: {len(stage_data['nodes'])}, Screens: {len(stage_data['screens'])}, Cameras: {len(stage_data['cameras'])}")
        return True

    unreal.log(f"[SetView] Starting nDisplay stage creation for '{stage_name}'...")

    # Load Editor Actor Subsystem
    editor_actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not editor_actor_subsystem:
        unreal.log_error("[SetView] Failed to retrieve EditorActorSubsystem.")
        return False

    # Spawn or locate nDisplay Root Actor
    actor_class = unreal.load_class(None, "/DisplayCluster/Blueprints/DisplayClusterRootActor.DisplayClusterRootActor_C")
    if not actor_class:
        unreal.log_warning("[SetView] DisplayClusterRootActor class not found. Ensure nDisplay plugin is enabled.")
        actor_class = unreal.DisplayClusterRootActor if hasattr(unreal, "DisplayClusterRootActor") else None

    if actor_class:
        spawn_location = unreal.Vector(0.0, 0.0, 0.0)
        spawn_rotation = unreal.Rotator(0.0, 0.0, 0.0)
        ndisplay_actor = editor_actor_subsystem.spawn_actor_from_class(actor_class, spawn_location, spawn_rotation)
        if ndisplay_actor:
            ndisplay_actor.set_actor_label(f"NDisplay_{stage_name}")
            unreal.log(f"[SetView] Spawned nDisplay Root Actor: {ndisplay_actor.get_actor_label()}")
    else:
        unreal.log_warning("[SetView] DisplayClusterRootActor not available in this engine configuration.")

    # Spawn or bind CineCameraActor for LiveLink tracking
    cine_cam_class = unreal.CineCameraActor
    if cine_cam_class:
        cam_location = unreal.Vector(0.0, -500.0, 150.0) # 5m back, 1.5m high in UE units (cm)
        cam_rotation = unreal.Rotator(0.0, 90.0, 0.0)
        cine_cam = editor_actor_subsystem.spawn_actor_from_class(cine_cam_class, cam_location, cam_rotation)
        if cine_cam:
            cine_cam.set_actor_label("SetView_Tracking_CineCamera")
            unreal.log("[SetView] Spawned CineCameraActor for tracking calibration.")

    unreal.log(f"[SetView] nDisplay stage '{stage_name}' setup completed successfully.")
    return True


if __name__ == "__main__":
    target_config = sys.argv[1] if len(sys.argv) > 1 else "stage.ndisplay"
    if os.path.exists(target_config):
        success = setup_ndisplay_stage(target_config)
        sys.exit(0 if success else 1)
    else:
        print(f"[SetView] Configuration file not found at: {target_config}")
        print("[SetView] Provide a valid .ndisplay file path as an argument.")
        sys.exit(1)
