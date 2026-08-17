import os
import sys

try:
    import unreal
    UNREAL_AVAILABLE = True
except ImportError:
    UNREAL_AVAILABLE = False


def setup_setview_environment():
    """Configures project directories, camera assets, and sequence defaults in Unreal Editor."""
    if not UNREAL_AVAILABLE:
        print("[SetView Setup] Unreal module not available in standalone Python environment.")
        return

    unreal.log("[SetView Setup] Initializing SetView Virtual Production Workspace...")

    editor_asset_lib = unreal.EditorAssetLibrary()

    # Essential SetView content directories
    directories = [
        "/Game/SetView",
        "/Game/SetView/Cameras",
        "/Game/SetView/Sequences",
        "/Game/SetView/Scans",
        "/Game/SetView/People",
        "/Game/SetView/Furniture",
        "/Game/SetView/Materials",
    ]

    for dir_path in directories:
        if not editor_asset_lib.does_directory_exist(dir_path):
            editor_asset_lib.make_directory(dir_path)
            unreal.log(f"[SetView Setup] Created directory: {dir_path}")

    unreal.log("[SetView Setup] Workspace initialization complete.")


if __name__ == "__main__":
    setup_setview_environment()
