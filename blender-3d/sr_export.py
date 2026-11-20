"""Step 5 - Validate and export the rigged character as .glb and/or .fbx.

Pre-export checks / fixes (all non-destructive to your .blend unless --save):
  * swaps toon preview materials back to the export materials
  * applies object transforms on meshes, checks armature scale is 1
  * limits weights to 4 influences per vertex and normalises (Unity/mobile safe)
  * removes empty vertex groups, warns about unweighted vertices
  * resets the pose to rest so the bind pose is exported cleanly

Targets:
  --glb               glTF binary: three.js / web, Godot, Blender, VRM tooling
  --fbx unity         FBX for Unity (Humanoid avatar friendly)
  --fbx unreal        FBX for Unreal (armature temporarily renamed "Armature"
                      so UE does not add an extra root bone)
  --fbx generic       plain FBX for other DCCs

Usage:
  blender -b final.blend --python sr_export.py -- --out ./export --glb --fbx unity --fbx unreal
Outputs: export/StarRai.glb, export/StarRai_unity.fbx, export/StarRai_unreal.fbx
"""

import argparse
import os
import sys

import bpy


def _script_dirs():
    try:
        yield os.path.dirname(os.path.abspath(__file__))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath:
            yield os.path.dirname(bpy.path.abspath(t.filepath))


sys.path.extend(_script_dirs())
from sr_common import find_armature, log, parse_args, save_if_requested, select_only  # noqa: E402

CONFIG = {
    "armature": None,
    "out": "//export",          # "//" = next to the .blend
    "name": "StarRai",
    "glb": False,
    "fbx": [],                  # any of "unity", "unreal", "generic"
    "max_influences": 4,
    "animations": False,        # include actions (e.g. test poses / mocap)
    "save": None,
}


def rig_meshes(arm):
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and (
        o.parent == arm or any(m.type == "ARMATURE" and m.object == arm for m in o.modifiers))]


def restore_export_materials(meshes):
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if m is not None and "sr_export_source" in m:
                slot.material = bpy.data.materials[m["sr_export_source"]]
                log(f"{o.name}: restored export material {slot.material.name}")


def validate(arm, meshes, max_infl):
    if any(abs(s - 1.0) > 1e-4 for s in arm.scale):
        log(f"WARNING: armature scale is {tuple(arm.scale)}; apply scale on the armature "
            "and mesh together (Ctrl+A > All Transforms) before export")
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)

    for o in meshes:
        select_only(o)
        # Transforms on a skinned child must be applied relative to its parent.
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if not o.vertex_groups:
            log(f"WARNING: {o.name} has no vertex groups - it is not skinned")
            continue
        bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.001)
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=max_infl)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        bones = {b.name for b in arm.data.bones}
        unweighted = sum(1 for v in o.data.vertices
                         if not any(o.vertex_groups[g.group].name in bones and g.weight > 0
                                    for g in v.groups))
        if unweighted:
            log(f"WARNING: {o.name}: {unweighted} vertices have no bone weight "
                "(they will not move) - check in Weight Paint")
        log(f"{o.name}: weights limited to {max_infl}, normalised")


def select_rig(arm, meshes):
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm


def export_glb(path, animations):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,          # applies non-armature modifiers
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_morph=True,          # shape keys
        export_morph_normal=True,
        export_animations=animations,
        export_def_bones=True,      # deform bones only (drops IK/control bones)
    )
    log(f"wrote {path}")


FBX_COMMON = dict(
    use_selection=True,
    object_types={"ARMATURE", "MESH"},
    use_mesh_modifiers=True,
    mesh_smooth_type="FACE",
    use_tspace=True,
    add_leaf_bones=False,
    use_armature_deform_only=True,
    armature_nodetype="NULL",
    path_mode="COPY",
    embed_textures=True,
    axis_forward="-Z",
    axis_up="Y",
)


def export_fbx(path, target, arm, animations):
    kw = dict(FBX_COMMON, bake_anim=animations)
    if target == "unity":
        # 1 Blender metre = 1 Unity unit, no 100x scale on the root.
        kw.update(apply_scale_options="FBX_SCALE_ALL", apply_unit_scale=True,
                  primary_bone_axis="Y", secondary_bone_axis="X")
    elif target == "unreal":
        kw.update(apply_scale_options="FBX_SCALE_NONE", apply_unit_scale=True,
                  primary_bone_axis="Y", secondary_bone_axis="X")
    else:
        kw.update(apply_scale_options="FBX_SCALE_NONE")

    old_name = arm.name
    if target == "unreal":
        # UE skips a root node named exactly "Armature" instead of adding a bone.
        clash = bpy.data.objects.get("Armature")
        if clash and clash != arm:
            clash.name = "Armature_tmp"
        arm.name = "Armature"
    try:
        bpy.ops.export_scene.fbx(filepath=path, **kw)
    finally:
        arm.name = old_name
    log(f"wrote {path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--armature")
    p.add_argument("--out")
    p.add_argument("--name")
    p.add_argument("--glb", action="store_true")
    p.add_argument("--fbx", action="append", choices=["unity", "unreal", "generic"])
    p.add_argument("--max-influences", dest="max_influences", type=int)
    p.add_argument("--animations", action="store_true")
    p.add_argument("--save")
    cfg = parse_args(p, CONFIG)
    fbx_targets = cfg.fbx or []
    if not cfg.glb and not fbx_targets:
        cfg.glb, fbx_targets = True, ["unity"]

    arm = find_armature(cfg.armature)
    meshes = rig_meshes(arm)
    if not meshes:
        raise SystemExit(f"No meshes are skinned to '{arm.name}'")
    log(f"rig '{arm.name}': {len(arm.data.bones)} bones, meshes {[o.name for o in meshes]}")

    restore_export_materials(meshes)
    validate(arm, meshes, cfg.max_influences)

    out = bpy.path.abspath(cfg.out)
    if out.startswith("//"):  # unsaved file: fall back to the working directory
        out = os.path.abspath(out[2:])
    os.makedirs(out, exist_ok=True)

    select_rig(arm, meshes)
    if cfg.glb:
        export_glb(os.path.join(out, f"{cfg.name}.glb"), cfg.animations)
    for t in fbx_targets:
        select_rig(arm, meshes)
        export_fbx(os.path.join(out, f"{cfg.name}_{t}.fbx"), t, arm, cfg.animations)
    save_if_requested(cfg.save)


if __name__ == "__main__":
    main()
