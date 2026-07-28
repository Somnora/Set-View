"""
SetView -> Unreal Engine 5.8 Asset Importer (`import_people.py`)
------------------------------------------------------------------
Imports 3D character models (MetaHumans, GLB/FBX people) and scanned/generated
furniture models into `/Game/SetView/People` and `/Game/SetView/Furniture`.

Fed by the SDXL / Hunyuan3D asset pipeline or standard GLB/FBX downloads.
"""

import os
import sys
import argparse
from typing import Optional, List

try:
    import unreal # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False


def import_character_assets(
    source_dir: str,
    target_path: str = "/Game/SetView/People",
    verbose: bool = True
) -> List[str]:
    """
    Imports GLB / FBX / OBJ character assets from a directory into Unreal Engine.
    """
    imported_assets: List[str] = []

    if not IN_UNREAL:
        print(f"[import_people] Standalone verification mode — scanning '{source_dir}'...")
        if os.path.exists(source_dir):
            for fname in os.listdir(source_dir):
                if fname.lower().endswith(('.glb', '.gltf', '.fbx', '.obj')):
                    print(f"  - Found character asset: {fname}")
                    imported_assets.append(os.path.join(source_dir, fname))
        return imported_assets

    if not os.path.exists(source_dir):
        print(f"[import_people] Error: Source directory '{source_dir}' does not exist.")
        return imported_assets

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks: List[Any] = []

    for fname in os.listdir(source_dir):
        if fname.lower().endswith(('.glb', '.gltf', '.fbx', '.obj')):
            full_path = os.path.join(source_dir, fname)
            asset_name = os.path.splitext(fname)[0].replace(' ', '_').replace('-', '_')

            task = unreal.AssetImportTask()
            task.filename = full_path
            task.destination_path = target_path
            task.destination_name = f"SK_{asset_name}"
            task.automated = True
            task.save = True
            tasks.append(task)

    if tasks:
        print(f"[import_people] Importing {len(tasks)} character assets into '{target_path}'...")
        asset_tools.import_asset_tasks(tasks)
        for t in tasks:
            asset_full_name = f"{target_path}/{t.destination_name}"
            imported_assets.append(asset_full_name)
            if verbose:
                print(f"  ✓ Imported: {asset_full_name}")

    return imported_assets


def import_furniture_assets(
    source_dir: str,
    target_path: str = "/Game/SetView/Furniture",
    verbose: bool = True
) -> List[str]:
    """
    Imports furniture models (couch, chair, table, etc.) into Unreal Engine.
    """
    imported_assets: List[str] = []

    if not IN_UNREAL:
        print(f"[import_people] Standalone verification mode — scanning furniture in '{source_dir}'...")
        if os.path.exists(source_dir):
            for fname in os.listdir(source_dir):
                if fname.lower().endswith(('.glb', '.gltf', '.fbx', '.obj')):
                    print(f"  - Found furniture asset: {fname}")
                    imported_assets.append(os.path.join(source_dir, fname))
        return imported_assets

    if not os.path.exists(source_dir):
        print(f"[import_people] Error: Source directory '{source_dir}' does not exist.")
        return imported_assets

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    tasks: List[Any] = []

    for fname in os.listdir(source_dir):
        if fname.lower().endswith(('.glb', '.gltf', '.fbx', '.obj')):
            full_path = os.path.join(source_dir, fname)
            asset_name = os.path.splitext(fname)[0].replace(' ', '_').replace('-', '_')

            task = unreal.AssetImportTask()
            task.filename = full_path
            task.destination_path = target_path
            task.destination_name = f"SM_{asset_name}"
            task.automated = True
            task.save = True
            tasks.append(task)

    if tasks:
        print(f"[import_people] Importing {len(tasks)} furniture assets into '{target_path}'...")
        asset_tools.import_asset_tasks(tasks)
        for t in tasks:
            asset_full_name = f"{target_path}/{t.destination_name}"
            imported_assets.append(asset_full_name)
            if verbose:
                print(f"  ✓ Imported: {asset_full_name}")

    return imported_assets


def main():
    parser = argparse.ArgumentParser(description="SetView -> Unreal Asset Importer")
    parser.add_argument("--people-dir", help="Directory containing GLB/FBX character models")
    parser.add_argument("--furniture-dir", help="Directory containing GLB/FBX furniture models")
    args = parser.parse_args()

    if args.people_dir:
        import_character_assets(args.people_dir)

    if args.furniture_dir:
        import_furniture_assets(args.furniture_dir)

    if not args.people_dir and not args.furniture_dir:
        print("Usage: python3 import_people.py --people-dir /path/to/people --furniture-dir /path/to/furniture")


if __name__ == "__main__":
    main()
