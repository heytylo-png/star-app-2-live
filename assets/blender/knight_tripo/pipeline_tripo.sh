#!/usr/bin/env bash
# Tripo knight: prep (orient/scale/weld) -> repair -> Rigify fit/place/generate -> bind -> limit 4 -> game skeleton
set -euo pipefail
SRC=${1:?tripo model.glb}; D=${2:?out dir}; H=$(cd "$(dirname "$0")" && pwd); K=${SKILLS:-$HOME/.claude/skills}
R="python3 $K/blender-core/scripts/run_in_blender.py"; CR=$K/blender-character-rigging/scripts; B="blender -b --factory-startup --python-exit-code 1"
$B -P "$H/prep_tripo.py" -- "$SRC" "$D/knight_prep.blend" -90 1.9 | grep @@JSON
blender -b "$D/knight_prep.blend" --factory-startup --python-exit-code 1 -P "$H/fix_mesh.py" | grep @@JSON
$R --blend "$D/knight_prep.blend" "$CR/rigify_build.py" -- --add basic_human --fit Knight --save "$D/knight_meta.blend"
blender -b "$D/knight_meta.blend" --factory-startup --python-exit-code 1 -P "$H/place_joints_tripo.py" | grep @@JSON
$R --blend "$D/knight_meta.blend" "$CR/rigify_build.py" -- --metarig META_Knight --generate --save "$D/knight_rig.blend"
$R --blend "$D/knight_rig.blend" "$CR/bind_mesh.py" -- --armature RIG_Knight --meshes Knight --limit 4 --save "$D/knight_bound.blend"
blender -b "$D/knight_bound.blend" --factory-startup --python-exit-code 1 -P "$H/limit_weights.py" | grep @@JSON
$R --blend "$D/knight_bound.blend" "$CR/rigify_build.py" -- --rig RIG_Knight --game-skeleton --save "$D/knight_final.blend"
