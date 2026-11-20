"""Shared helpers for the Star Rai 3D pipeline scripts.

Every script in this folder can run two ways:
  1. Blender UI: open it in the Text Editor and press Run Script (edit the
     CONFIG dict at the top of the script first).
  2. Command line:
       blender -b in.blend --python sr_cleanup.py -- --height 1.65 --save out.blend
     Everything after the lone "--" is parsed by the script.

Written for Blender 4.2 LTS through 5.0 (tested headless on 5.0.1).
"""

import sys
import argparse

import bpy


def parse_args(parser: argparse.ArgumentParser, defaults: dict) -> argparse.Namespace:
    """Parse args after '--'. In the UI (no '--'), use the CONFIG defaults."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser.set_defaults(**defaults)
    return parser.parse_args(argv)


def log(msg: str) -> None:
    print(f"[star-rai] {msg}", flush=True)


def ensure_object_mode() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def select_only(obj) -> None:
    ensure_object_mode()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def find_mesh(name: str | None = None):
    """Return the named mesh, else StarRai_Body, else the biggest mesh (the AI import)."""
    if name is None and "StarRai_Body" in bpy.data.objects:
        name = "StarRai_Body"
    if name:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise SystemExit(f"Mesh '{name}' not found")
        return obj
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("No mesh objects in the scene")
    return max(meshes, key=lambda o: len(o.data.vertices))


def find_armature(name: str | None = None):
    if name:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "ARMATURE":
            raise SystemExit(f"Armature '{name}' not found")
        return obj
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    if not arms:
        raise SystemExit("No armature in the scene - import the rigged FBX first")
    return arms[0]


def save_if_requested(path: str | None) -> None:
    if path:
        bpy.ops.wm.save_as_mainfile(filepath=path)
        log(f"saved {path}")
