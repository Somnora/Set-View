"""
SetView -> Unreal Engine 5.8 Handoff Importer (Root Launcher)
--------------------------------------------------------------
Redirects to Content/Python/import_setview.py for easy execution from repository root.
"""

import os
import sys

# Ensure Content/Python is in path
script_dir = os.path.dirname(os.path.abspath(__file__))
content_python_dir = os.path.join(script_dir, "Content", "Python")

if content_python_dir not in sys.path:
    sys.path.insert(0, content_python_dir)

from import_setview import main, verify_scene_json, import_scene_to_unreal

if __name__ == "__main__":
    main()
