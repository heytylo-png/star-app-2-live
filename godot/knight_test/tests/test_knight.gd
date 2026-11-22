# Headless test for knight_godot.glb.
#   godot --headless --path godot/knight_test --import
#   godot --headless --path godot/knight_test -s res://tests/test_knight.gd
# Exit code 0 = pass, 1 = fail (a clip is missing, or Walk produces no root motion).
extends SceneTree

const GLB := "res://knight_godot.glb"
const REQUIRED_CLIPS := ["Idle", "Walk", "Run", "Attack"]
const ROOT_BONE := "root"
const PLAY_SECONDS := 2.0
const STEP := 1.0 / 60.0
const MIN_DISTANCE := 0.01  # metres; anything below counts as "no root motion"


func _init() -> void:
	var failures: Array[String] = []

	var packed := load(GLB) as PackedScene
	if packed == null:
		_finish(["could not load %s (was the project imported?)" % GLB])
		return
	var scene := packed.instantiate()
	root.add_child(scene)

	var players := scene.find_children("*", "AnimationPlayer", true, false)
	if players.is_empty():
		_finish(["no AnimationPlayer in %s" % GLB])
		return
	var player := players[0] as AnimationPlayer

	var clips := Array(player.get_animation_list())
	print("Clips: ", clips)
	for clip in REQUIRED_CLIPS:
		if not clips.has(clip):
			failures.append("missing clip: %s" % clip)

	var skeletons := scene.find_children("*", "Skeleton3D", true, false)
	if skeletons.is_empty():
		failures.append("no Skeleton3D in %s" % GLB)
	elif clips.has("Walk"):
		var skeleton := skeletons[0] as Skeleton3D
		if skeleton.find_bone(ROOT_BONE) == -1:
			failures.append("skeleton has no '%s' bone" % ROOT_BONE)
		else:
			var dist := _walk_root_motion(player, skeleton)
			if dist < MIN_DISTANCE:
				failures.append("Walk root motion is zero (%.4f m in %.1f s)" % [dist, PLAY_SECONDS])

	_finish(failures)


# Plays Walk (looping) for PLAY_SECONDS with root motion extracted from the root bone,
# and returns the total distance the root travelled.
func _walk_root_motion(player: AnimationPlayer, skeleton: Skeleton3D) -> float:
	var anim_root := player.get_node(player.root_node)
	player.root_motion_track = NodePath("%s:%s" % [anim_root.get_path_to(skeleton), ROOT_BONE])
	player.get_animation("Walk").loop_mode = Animation.LOOP_LINEAR
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.play("Walk")

	var total := Vector3.ZERO
	var steps := int(round(PLAY_SECONDS / STEP))
	for i in steps:
		player.advance(STEP)
		total += player.get_root_motion_position()

	var dist := total.length()
	print("Root motion track: ", player.root_motion_track)
	print("Walk for %.1f s: root moved %.3f m  (vector %s, %.2f m/s)"
		% [PLAY_SECONDS, dist, total, dist / PLAY_SECONDS])
	return dist


func _finish(failures: Array[String]) -> void:
	if failures.is_empty():
		print("PASS")
		quit(0)
	else:
		for f in failures:
			printerr("FAIL: ", f)
		quit(1)
