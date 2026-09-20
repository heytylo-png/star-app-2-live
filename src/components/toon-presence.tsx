import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MToonMaterial,
  MToonMaterialOutlineWidthMode,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
  type VRMHumanBoneName,
} from "@pixiv/three-vrm";
import {
  Color,
  Euler,
  Group,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Mesh,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { EmotionId, PoseId } from "@/lib/rai";
import { publicUrl } from "@/lib/utils";
import {
  expressionsFor,
  expT,
  lerpEuler,
  resolveExprName,
  rigFor,
  rootYawFor,
  RIG_BONES,
  STANDIN_VRM_FILE,
  ZERO,
  type BoneEuler,
  type RigBoneName,
} from "@/lib/vrm-rig";
import { PresenceFrame, StageShell } from "@/components/stage-shell";

type Intent = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
};

type ToonPresenceProps = Intent & {
  className?: string;
  onFail?: () => void;
};

const LOOK_LERP = 6.5;
const RIG_LERP = 5.2;
const DEADZONE = 0.04;
const WAVE_BONE: RigBoneName = "rightLowerArm";

type BoneState = {
  node: Object3D;
  rest: Quaternion;
  current: BoneEuler;
};

export default function ToonPresence({
  pose,
  emotion,
  talking,
  amplitude,
  className,
  onFail,
}: ToonPresenceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef({ x: 0, y: 0 });
  const intentRef = useRef<Intent>({ pose, emotion, talking, amplitude });
  const reducedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  intentRef.current = { pose, emotion, talking, amplitude };

  useEffect(() => {
    const mq =
      typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const sync = () => {
      reducedRef.current = mq?.matches ?? false;
    };
    sync();
    mq?.addEventListener("change", sync);
    return () => mq?.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      if (Math.abs(x) < DEADZONE) x = 0;
      else x = Math.sign(x) * ((Math.abs(x) - DEADZONE) / (1 - DEADZONE));
      if (Math.abs(y) < DEADZONE) y = 0;
      else y = Math.sign(y) * ((Math.abs(y) - DEADZONE) / (1 - DEADZONE));
      lookRef.current.x = Math.max(-1, Math.min(1, x));
      lookRef.current.y = Math.max(-1, Math.min(1, y));
    };
    const onLeave = () => {
      lookRef.current.x = 0;
      lookRef.current.y = 0;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <StageShell stageRef={stageRef} className={className}>
      <PresenceFrame>
        <Canvas
          camera={{ position: [0.14, 0.78, 2.55], fov: 28, near: 0.1, far: 24 }}
          dpr={[1, 1.75]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            toneMapping: NoToneMapping,
          }}
          style={{ width: "100%", height: "100%", background: "transparent" }}
          frameloop="always"
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <PresenceCamera />
          <hemisphereLight args={["#fff4e8", "#cfc8bc", 0.95]} />
          <directionalLight position={[0.55, 2.3, 2.2]} intensity={1.08} color="#fff7ef" />
          <directionalLight position={[-1.7, 0.9, 0.5]} intensity={0.22} color="#c4ceda" />
          <StarVrm
            intentRef={intentRef}
            lookRef={lookRef}
            reducedRef={reducedRef}
            onReady={() => setReady(true)}
            onFail={() => failRef.current?.()}
          />
        </Canvas>
      </PresenceFrame>
      {!ready ? (
        <p className="pointer-events-none absolute inset-x-0 top-[42%] text-center text-xs tracking-widest text-muted uppercase">
          Waking
        </p>
      ) : null}
    </StageShell>
  );
}

function PresenceCamera() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(0.14, 0.78, 2.55);
    camera.lookAt(0.02, 0.8, 0);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 28;
      camera.updateProjectionMatrix();
    }
  }, [camera]);
  return null;
}

function StarVrm({
  intentRef,
  lookRef,
  reducedRef,
  onReady,
  onFail,
}: {
  intentRef: RefObject<Intent>;
  lookRef: RefObject<{ x: number; y: number }>;
  reducedRef: RefObject<boolean>;
  onReady: () => void;
  onFail: () => void;
}) {
  const threeScene = useThree((s) => s.scene);
  const vrmRef = useRef<VRM | null>(null);
  const bonesRef = useRef<Map<RigBoneName, BoneState>>(new Map());
  const lookTarget = useRef(new Object3D());
  const lookSmooth = useRef({ x: 0, y: 0 });
  const yawSmooth = useRef(0.16);
  const blinkRef = useRef({ t: 0, next: 2.2, value: 0 });
  const namesRef = useRef<Set<string>>(new Set());
  const extraQuat = useRef(new Quaternion());
  const extraEuler = useRef(new Euler());
  const headWorld = useRef(new Vector3());
  const rootRef = useRef<Group>(null);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  const [scene, setScene] = useState<VRM["scene"] | null>(null);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

  useEffect(() => {
    const target = lookTarget.current;
    threeScene.add(target);
    return () => {
      threeScene.remove(target);
    };
  }, [threeScene]);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const url = publicUrl(STANDIN_VRM_FILE);

    loader
      .loadAsync(url)
      .then((gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) throw new Error("VRM payload missing");
        if (cancelled) {
          VRMUtils.deepDispose(vrm.scene);
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        stylizeToon(vrm);

        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });

        const bones = new Map<RigBoneName, BoneState>();
        for (const name of RIG_BONES) {
          const node = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
          if (!node) continue;
          bones.set(name, {
            node,
            rest: node.quaternion.clone(),
            current: { ...ZERO },
          });
        }
        bonesRef.current = bones;

        const names = new Set<string>();
        const em = vrm.expressionManager;
        if (em) {
          for (const key of Object.keys(em.expressionMap)) names.add(key);
        }
        namesRef.current = names;

        lookTarget.current.position.set(0.15, 1.35, 1.4);
        if (vrm.lookAt) {
          vrm.lookAt.target = lookTarget.current;
          vrm.lookAt.autoUpdate = true;
        }

        vrmRef.current = vrm;
        setScene(vrm.scene);
        onReadyRef.current();
      })
      .catch(() => {
        if (!cancelled) onFailRef.current();
      });

    return () => {
      cancelled = true;
      const vrm = vrmRef.current;
      vrmRef.current = null;
      if (vrm) VRMUtils.deepDispose(vrm.scene);
    };
  }, []);

  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const dt = Math.min(0.05, delta);
    const intent = intentRef.current;
    const reduced = reducedRef.current;
    const look = lookRef.current;
    const now = performance.now() / 1000;

    lookSmooth.current.x += (look.x - lookSmooth.current.x) * expT(LOOK_LERP, dt);
    lookSmooth.current.y += (look.y - lookSmooth.current.y) * expT(LOOK_LERP, dt);

    const blink = stepBlink(blinkRef.current, dt, reduced);
    applyExpressions(vrm, namesRef.current, intent, blink);

    const targetRig = rigFor(intent.pose, intent.emotion);
    const waveBoost = intent.pose === "wave" && !reduced ? Math.sin(now * 8.2) * 0.55 : 0;

    for (const name of RIG_BONES) {
      const state = bonesRef.current.get(name);
      if (!state) continue;
      const goal = { ...(targetRig[name] ?? ZERO) };
      if (name === WAVE_BONE) goal.y += waveBoost;
      state.current = lerpEuler(state.current, goal, expT(RIG_LERP, dt));
      state.node.quaternion
        .copy(state.rest)
        .multiply(extraQuatFrom(state.current, extraEuler.current, extraQuat.current));
    }

    const yawGoal = rootYawFor(intent.pose);
    yawSmooth.current += (yawGoal - yawSmooth.current) * expT(4.2, dt);

    const sway = reduced ? 0 : Math.sin(now * 0.55) * 0.028 + lookSmooth.current.x * -0.04;
    const breatheY = reduced ? 0 : Math.sin(now * 1.05) * 0.012 + Math.sin(now * 0.48) * 0.004;
    const talkBob = reduced || !intent.talking ? 0 : Math.sin(now * 7.5) * intent.amplitude * 0.012;

    // Do not write vrm.scene.rotation — rotateVRM0 parks VRM 0.0 at y=π.
    const root = rootRef.current;
    if (root) {
      root.rotation.y = yawSmooth.current;
      root.rotation.z = sway;
      root.position.y = breatheY + talkBob;
    }

    const head = vrm.humanoid.getNormalizedBoneNode("head");
    if (head) {
      head.getWorldPosition(headWorld.current);
      lookTarget.current.position.set(
        headWorld.current.x + lookSmooth.current.x * 0.85,
        headWorld.current.y - lookSmooth.current.y * 0.45,
        headWorld.current.z + 1.15,
      );
    }

    vrm.update(dt);
  });

  if (!scene) return null;
  return (
    <group ref={rootRef}>
      <primitive object={scene} />
    </group>
  );
}

function extraQuatFrom(e: BoneEuler, euler: Euler, quat: Quaternion): Quaternion {
  euler.set(e.x, e.y, e.z, "XYZ");
  return quat.setFromEuler(euler);
}

function applyExpressions(vrm: VRM, available: Set<string>, intent: Intent, blink: number) {
  const em = vrm.expressionManager;
  if (!em) return;
  em.resetValues();
  const weights = expressionsFor(intent.pose, intent.emotion, intent.talking, intent.amplitude, blink);
  for (const [logical, value] of Object.entries(weights)) {
    const name = resolveExprName(available, logical);
    if (name) em.setValue(name, value);
  }
}

function stepBlink(
  state: { t: number; next: number; value: number },
  dt: number,
  reduced: boolean,
): number {
  if (reduced) {
    state.value = 0;
    return 0;
  }
  state.t += dt;
  if (state.t >= state.next) {
    state.t = 0;
    state.next = 2.1 + Math.random() * 3.4;
  }
  // 0–0.07 close, 0.07–0.16 open
  if (state.t < 0.07) state.value = state.t / 0.07;
  else if (state.t < 0.16) state.value = 1 - (state.t - 0.07) / 0.09;
  else state.value = 0;
  return state.value;
}

function stylizeToon(vrm: VRM) {
  const outline = new Color("#2a1f18");
  const materials = vrm.materials ?? collectMaterials(vrm);
  for (const mat of materials) {
    if (!(mat instanceof MToonMaterial)) continue;
    mat.shadingToonyFactor = Math.max(mat.shadingToonyFactor, 0.93);
    mat.giEqualizationFactor = Math.min(mat.giEqualizationFactor, 0.62);
    if (mat.outlineWidthMode === MToonMaterialOutlineWidthMode.None) {
      mat.outlineWidthMode = MToonMaterialOutlineWidthMode.ScreenCoordinates;
      mat.outlineWidthFactor = 0.003;
      mat.outlineColorFactor.copy(outline);
      mat.outlineLightingMixFactor = 0.3;
    } else {
      mat.outlineWidthFactor = Math.max(mat.outlineWidthFactor, 0.0024);
    }
  }
}

function collectMaterials(vrm: VRM): Mesh["material"][] {
  const out: Mesh["material"][] = [];
  vrm.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    out.push(...mats);
  });
  return out;
}
