#!/usr/bin/env bash
# After pipeline_tripo.sh: author Idle/Walk/Run/Attack, bake to the game skeleton with root motion,
# keep forward-only root travel, rename clips, export the Godot GLB (root bone kept).
set -euo pipefail
D=${1:?work dir holding knight_final.blend}; H=$(cd "$(dirname "$0")" && pwd); K=${SKILLS:-$HOME/.claude/skills}
R="python3 $K/blender-core/scripts/run_in_blender.py"; B="blender --factory-startup --python-exit-code 1 -b"
cp "$D/knight_final.blend" "$D/knight_anim.blend"
$B "$D/knight_anim.blend" -P "$H/animate_knight.py" | grep @@JSON
$R --blend "$D/knight_anim.blend" "$K/blender-animation/scripts/bake_action.py" -- --source RIG_Knight --target GAME_RIG_Knight \
   --actions Idle Walk Run Attack --root-motion xy --hips spine --save "$D/knight_baked.blend"
$B "$D/knight_baked.blend" -P "$H/clean_root.py" | grep @@JSON
for c in Idle Walk Run; do
  $R --blend "$D/knight_baked.blend" "$K/blender-animation/scripts/loop_check.py" -- --object GAME_RIG_Knight \
     --action "GAME_RIG_Knight|$c" --root-motion root
done
$B "$D/knight_baked.blend" -P "$H/rename_clips.py" | grep @@JSON
$R --blend "$D/knight_baked.blend" "$K/blender-export-pipelines/scripts/export_asset.py" -- --preset godot \
   --objects GAME_RIG_Knight --set export_def_bones=False --out "$D/knight_godot.glb"
