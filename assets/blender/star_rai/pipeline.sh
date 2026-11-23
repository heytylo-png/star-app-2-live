#!/usr/bin/env bash
# Star Rai: Tripo GLB (2M tris, 25 parts, KHR_mesh_quantization) -> 1.6 m, ~60k tris, Rigify rig,
# separated fingers + finger bones, custom hair/garment weights, QA + stress/clipping checks,
# pose clips (Idle/Wave/Peace/Point), rigged GLB and sprite-camera renders.
# Usage: pipeline.sh <star_rai_t-pose.glb> <work_dir>     (needs Blender 5.3 + the blender-* skills)
set -euo pipefail
SRC=${1:?source glb}; D=${2:?work dir}; H=$(cd "$(dirname "$0")" && pwd); K=${SKILLS:-$HOME/.claude/skills}
R="python3 $K/blender-core/scripts/run_in_blender.py"; CR=$K/blender-character-rigging/scripts
B(){ blender -b "$1" --factory-startup --python-exit-code 1 -P "$H/$2" -- "${@:3}" | grep @@JSON; }
mkdir -p "$D/shots"
blender -b --factory-startup --python-exit-code 1 -P "$H/sr_import.py" -- "$SRC" "$D/sr_00_import.blend" | grep -c @@JSON
cp "$D/sr_00_import.blend" "$D/sr_01_dec.blend"
B "$D/sr_01_dec.blend" sr_prep_decimate.py 1.6 60000 "$D/sr_01_dec.blend"      # height, triangle budget
cp "$D/sr_01_dec.blend" "$D/sr_02_rep.blend"; B "$D/sr_02_rep.blend" sr_repair.py
$R --blend "$D/sr_02_rep.blend" "$K/blender-asset-qa/scripts/qa_check.py" -- --profile game
cp "$D/sr_02_rep.blend" "$D/sr_02b_fingers.blend"; B "$D/sr_02b_fingers.blend" sr_split_fingers.py   # cut fused fingers apart
cp "$D/sr_02b_fingers.blend" "$D/sr_03_grp.blend"; B "$D/sr_03_grp.blend" sr_group_parts.py
$R --blend "$D/sr_03_grp.blend" "$CR/rigify_build.py" -- --add human --no-face --save "$D/sr_04_meta.blend"
B "$D/sr_04_meta.blend" sr_place_joints.py
$R --blend "$D/sr_04_meta.blend" "$CR/rigify_build.py" -- --metarig META_StarRai --generate --save "$D/sr_05_rig.blend"
# voxel-proxy weights: continuous across Tripo's separate shells (no knees/elbows opening)
$R --blend "$D/sr_05_rig.blend" "$CR/bind_mesh.py" -- --armature RIG_StarRai --meshes Body --method proxy --limit 4 --save "$D/sr_06_bind.blend"
cp "$D/sr_06_bind.blend" "$D/sr_07_w.blend"
B "$D/sr_07_w.blend" sr_weights.py 1.44 1.273 0.35 0.50 1.0   # hair top/bottom Z, tip neck/chest share, bikini thigh share
$R --blend "$D/sr_07_w.blend" "$CR/stress_poses.py" -- --armature RIG_StarRai --save "$D/sr_08_stress.blend"
B "$D/sr_08_stress.blend" sr_clip_check.py RIG_StarRai QA_Stress 1,10,20,30,40,50
cp "$D/sr_07_w.blend" "$D/sr_08_poses.blend"; B "$D/sr_08_poses.blend" sr_poses.py                  # Idle/Wave/Peace/Point
$R --blend "$D/sr_08_poses.blend" "$CR/rigify_build.py" -- --rig RIG_StarRai --game-skeleton --save "$D/sr_09_game.blend"
$R --blend "$D/sr_09_game.blend" "$K/blender-animation/scripts/bake_action.py" -- --source RIG_StarRai \
   --target GAME_RIG_StarRai --actions Idle Wave Peace Point --save "$D/sr_09_game.blend"
B "$D/sr_09_game.blend" sr_rename_clips.py Idle,Wave,Peace,Point
cp "$D/sr_09_game.blend" "$D/sr_10_final.blend"; B "$D/sr_10_final.blend" sr_merge.py
$R --blend "$D/sr_10_final.blend" "$K/blender-asset-qa/scripts/qa_check.py" -- --objects StarRai --profile game
$R --blend "$D/sr_10_final.blend" "$CR/rig_check.py" -- --armature GAME_RIG_StarRai --profile unity
$R --blend "$D/sr_10_final.blend" "$K/blender-export-pipelines/scripts/export_asset.py" -- --preset gltf \
   --objects GAME_RIG_StarRai --set export_def_bones=False --out "$D/star_rai_rigged.glb"
blender -b --factory-startup --python-exit-code 1 -P "$H/sr_reimport.py" -- "$D/star_rai_rigged.glb" "$D/sr_11_reimport.blend" | grep @@JSON
blender -b "$D/sr_11_reimport.blend" --factory-startup --python-exit-code 1 -P "$H/sr_sprite_render.py" -- \
   "$D/shots" star_rai front,three_quarter,side 1152 64 | grep -c Saved
for p in Idle Wave Peace Point; do
  blender -b "$D/sr_11_reimport.blend" --factory-startup --python-exit-code 1 -P "$H/sr_sprite_render.py" -- \
     "$D/shots" "pose_$p" front,three_quarter 1152 64 "$p" GAME_RIG_StarRai 1 | grep -c Saved
done
