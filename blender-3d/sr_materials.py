"""Step 2b - Fix materials on an AI-generated anime character.

AI generators bake lighting into the albedo and ship metallic/roughness maps
that make anime skin look like wet plastic. This script:

  --mode export (default)
      Rebuilds every material on the mesh as a clean, export-safe
      Principled BSDF: base color texture only, metallic 0, roughness 0.6,
      low specular, no baked normal/AO junk. This is what .glb/.fbx carry.

  --mode toon
      Adds "<name>_Toon" copies with a cel-shaded node setup (Shader to RGB +
      constant color ramp) for Blender Eevee previews/renders, and assigns
      them. The originals are kept; sr_export.py swaps them back before
      exporting, because glTF/FBX can only carry Principled BSDF.

  --gold-from-selection
      In Edit Mode, select the star earrings' faces first. Those faces get a
      new metallic "SR_Gold" material (AI meshes fuse jewelry into the head).

Usage:
  blender -b clean.blend --python sr_materials.py -- --mode export --save mat.blend
"""

import argparse
import os
import sys

import bmesh
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
from sr_common import find_mesh, log, parse_args, save_if_requested, select_only  # noqa: E402

CONFIG = {
    "mesh": None,
    "mode": "export",            # "export" or "toon"
    "roughness": 0.6,
    "gold_from_selection": False,
    "shadow_tint": (0.80, 0.62, 0.66),  # toon shadow multiplier (warm pink skin shadow)
    "save": None,
}

GOLD = (1.0, 0.77, 0.34, 1.0)


def find_base_image(mat):
    """The image feeding Base Color, else the largest image in the material."""
    if not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            link = node.inputs["Base Color"].links
            if link:
                n = link[0].from_node
                # walk through mix/gamma nodes some importers insert
                for _ in range(4):
                    if n.type == "TEX_IMAGE":
                        return n.image
                    ins = [i for i in n.inputs if i.links]
                    if not ins:
                        break
                    n = ins[0].links[0].from_node
    imgs = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    return max(imgs, key=lambda i: i.size[0] * i.size[1], default=None)


def set_input(node, names, value):
    for n in names:  # input names changed between Blender 3.x and 4.x
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def build_export_material(mat, roughness):
    img = find_base_image(mat)
    alpha_blend = getattr(mat, "blend_method", "OPAQUE") in ("BLEND", "HASHED", "CLIP")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    set_input(bsdf, ["Metallic"], 0.0)
    set_input(bsdf, ["Roughness"], roughness)
    set_input(bsdf, ["Specular IOR Level", "Specular"], 0.2)

    if img:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.location = (-300, 0)
        tex.image = img
        img.colorspace_settings.name = "sRGB"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_blend:  # keep hair-card transparency if the source had it
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    log(f"export material '{mat.name}' <- {img.name if img else 'no texture'}")


def rgba_socket(sockets, name):
    """Mix node has float/vector/color sockets with the same name; pick color."""
    return next(s for s in sockets if s.name == name and s.type == "RGBA")


def build_toon_material(src, shadow_tint):
    name = f"{src.name}_Toon"
    mat = bpy.data.materials.get(name) or src.copy()
    mat.name = name
    mat["sr_export_source"] = src.name
    img = find_base_image(src)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse"); diffuse.location = (-200, 200)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB"); to_rgb.location = (0, 200)
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (200, 200)
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*shadow_tint, 1.0)
    ramp.color_ramp.elements[1].position = 0.35
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    mix = nt.nodes.new("ShaderNodeMix"); mix.location = (500, 0)
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    emit = nt.nodes.new("ShaderNodeEmission"); emit.location = (700, 0)

    nt.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], rgba_socket(mix.inputs, "B"))
    if img:
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.location = (200, -200)
        tex.image = img
        nt.links.new(tex.outputs["Color"], rgba_socket(mix.inputs, "A"))
    nt.links.new(rgba_socket(mix.outputs, "Result"), emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def assign_gold_to_selection(obj):
    gold = bpy.data.materials.get("SR_Gold") or bpy.data.materials.new("SR_Gold")
    gold.use_nodes = True
    bsdf = next(n for n in gold.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    set_input(bsdf, ["Base Color"], GOLD)
    set_input(bsdf, ["Metallic"], 1.0)
    set_input(bsdf, ["Roughness"], 0.25)
    if gold.name not in obj.data.materials:
        obj.data.materials.append(gold)
    idx = list(obj.data.materials).index(gold)

    was_edit = obj.mode == "EDIT"
    if not was_edit:
        select_only(obj)
        bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    n = 0
    for f in bm.faces:
        if f.select:
            f.material_index = idx
            n += 1
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"SR_Gold assigned to {n} selected faces" if n else
        "no faces selected - select the earrings in Edit Mode first")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mesh")
    p.add_argument("--mode", choices=["export", "toon"])
    p.add_argument("--roughness", type=float)
    p.add_argument("--gold-from-selection", dest="gold_from_selection", action="store_true")
    p.add_argument("--save")
    cfg = parse_args(p, CONFIG)

    obj = find_mesh(cfg.mesh)
    if cfg.gold_from_selection:
        assign_gold_to_selection(obj)

    slots = obj.material_slots
    if cfg.mode == "export":
        for slot in slots:
            m = slot.material
            if m is None:
                continue
            if "sr_export_source" in m:  # swap a toon copy back first
                slot.material = bpy.data.materials[m["sr_export_source"]]
                m = slot.material
            if m.name != "SR_Gold":
                build_export_material(m, cfg.roughness)
    else:
        for slot in slots:
            m = slot.material
            if m is None or m.name == "SR_Gold" or "sr_export_source" in m:
                continue
            slot.material = build_toon_material(m, cfg.shadow_tint)
        log("toon materials assigned (Eevee preview only; sr_export.py restores originals)")
    save_if_requested(cfg.save)


if __name__ == "__main__":
    main()
