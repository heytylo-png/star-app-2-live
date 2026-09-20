import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  DataTexture,
  Euler,
  Group,
  MeshToonMaterial,
  NearestFilter,
  NoColorSpace,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  RedFormat,
  type Mesh,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { EmotionId, PoseId } from "@/lib/rai";
import { publicUrl } from "@/lib/utils";
import {
  expT,
  lerpEuler,
  rigFor,
  rootYawFor,
  RIG_BONES,
  WIP_GLB_FILE,
  ZERO,
  wipFaceFor,
  type BoneEuler,
  type RigBoneName,
  type WipFace,
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
          camera={{ position: [0.18, 0.92, 2.55], fov: 32, near: 0.1, far: 24 }}
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
          <hemisphereLight args={["#fff4e8", "#cfc8bc", 1.05]} />
          <directionalLight position={[0.55, 2.3, 2.2]} intensity={1.15} color="#fff7ef" />
          <directionalLight position={[-1.7, 0.9, 0.5]} intensity={0.2} color="#c4ceda" />
          <StarWip
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
          Lab mesh
        </p>
      ) : null}
    </StageShell>
  );
}

function PresenceCamera() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(0.16, 0.88, 2.45);
    camera.lookAt(0.0, 0.86, 0);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 32;
      camera.updateProjectionMatrix();
    }
  }, [camera]);
  return null;
}

function StarWip({
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
  const vrmLike = useRef<Group | null>(null);
  const bonesRef = useRef<Map<RigBoneName, BoneState>>(new Map());
  const lookSmooth = useRef({ x: 0, y: 0 });
  const yawSmooth = useRef(0.12);
  const blinkRef = useRef({ t: 0, next: 2.2, value: 0 });
  const extraQuat = useRef(new Quaternion());
  const extraEuler = useRef(new Euler());
  const lidL = useRef<Object3D | null>(null);
  const lidR = useRef<Object3D | null>(null);
  const mouthOpen = useRef<Object3D | null>(null);
  const mouthIdle = useRef<Object3D | null>(null);
  const mouthSmirk = useRef<Object3D | null>(null);
  const mouthGrit = useRef<Object3D | null>(null);
  const mouthPout = useRef<Object3D | null>(null);
  const blushL = useRef<Object3D | null>(null);
  const blushR = useRef<Object3D | null>(null);
  const browL = useRef<Object3D | null>(null);
  const browR = useRef<Object3D | null>(null);
  const rootRef = useRef<Group>(null);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  const [scene, setScene] = useState<Group | null>(null);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    const url = publicUrl(WIP_GLB_FILE);

    loader
      .loadAsync(url)
      .then((gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        const gradient = makeToonGradient();
        root.traverse((obj) => {
          obj.frustumCulled = false;
          const mesh = obj as Mesh;
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mesh.material = mats.map((mat) => {
              const color = "color" in mat && mat.color instanceof Color ? mat.color : new Color("#ccc");
              return new MeshToonMaterial({ color: color.clone(), gradientMap: gradient });
            });
          }
        });

        const bones = new Map<RigBoneName, BoneState>();
        for (const name of RIG_BONES) {
          const node = root.getObjectByName(name);
          if (!node) continue;
          bones.set(name, {
            node,
            rest: node.quaternion.clone(),
            current: { ...ZERO },
          });
        }
        bonesRef.current = bones;
        lidL.current = root.getObjectByName("lidLeft") ?? null;
        lidR.current = root.getObjectByName("lidRight") ?? null;
        mouthOpen.current = root.getObjectByName("mouthOpen") ?? null;
        mouthIdle.current = root.getObjectByName("mouthIdle") ?? null;
        mouthSmirk.current = root.getObjectByName("mouthSmirk") ?? null;
        mouthGrit.current = root.getObjectByName("mouthGrit") ?? null;
        mouthPout.current = root.getObjectByName("mouthPout") ?? null;
        blushL.current = root.getObjectByName("blushL") ?? null;
        blushR.current = root.getObjectByName("blushR") ?? null;
        browL.current = root.getObjectByName("browL") ?? null;
        browR.current = root.getObjectByName("browR") ?? null;
        applyWipFace("glare", 0, {
          idle: mouthIdle.current,
          talk: mouthOpen.current,
          smirk: mouthSmirk.current,
          grit: mouthGrit.current,
          pout: mouthPout.current,
          blushL: blushL.current,
          blushR: blushR.current,
          browL: browL.current,
          browR: browR.current,
          cornerL: root.getObjectByName("mouthCornerL") ?? null,
          cornerR: root.getObjectByName("mouthCornerR") ?? null,
        });

        vrmLike.current = root;
        setScene(root);
        onReadyRef.current();
      })
      .catch(() => {
        if (!cancelled) onFailRef.current();
      });

    return () => {
      cancelled = true;
      vrmLike.current = null;
    };
  }, []);

  useFrame((_, delta) => {
    const root = vrmLike.current;
    if (!root) return;
    const dt = Math.min(0.05, delta);
    const intent = intentRef.current;
    const reduced = reducedRef.current;
    const look = lookRef.current;
    const now = performance.now() / 1000;

    lookSmooth.current.x += (look.x - lookSmooth.current.x) * expT(LOOK_LERP, dt);
    lookSmooth.current.y += (look.y - lookSmooth.current.y) * expT(LOOK_LERP, dt);

    const blink = stepBlink(blinkRef.current, dt, reduced);
    for (const lid of [lidL.current, lidR.current]) {
      if (!lid) continue;
      lid.rotation.x = 0.15 + blink * 1.05;
    }
    applyWipFace(
      wipFaceFor(intent.pose, intent.talking || intent.pose === "talk"),
      intent.amplitude,
      {
        idle: mouthIdle.current,
        talk: mouthOpen.current,
        smirk: mouthSmirk.current,
        grit: mouthGrit.current,
        pout: mouthPout.current,
        blushL: blushL.current,
        blushR: blushR.current,
        browL: browL.current,
        browR: browR.current,
        cornerL: vrmLike.current?.getObjectByName("mouthCornerL") ?? null,
        cornerR: vrmLike.current?.getObjectByName("mouthCornerR") ?? null,
      },
    );

    const targetRig = rigFor(intent.pose, intent.emotion, true);
    const waveBoost = intent.pose === "wave" && !reduced ? Math.sin(now * 8.2) * 0.45 : 0;

    for (const name of RIG_BONES) {
      const state = bonesRef.current.get(name);
      if (!state) continue;
      const goal = { ...(targetRig[name] ?? ZERO) };
      if (name === WAVE_BONE) goal.y += waveBoost;
      if (name === "head") {
        goal.y += lookSmooth.current.x * 0.38;
        goal.x += lookSmooth.current.y * 0.22;
      }
      if (name === "neck") {
        goal.y += lookSmooth.current.x * 0.12;
      }
      if (name === "spine" && !reduced) {
        goal.x += Math.sin(now * 1.05) * 0.04;
      }
      state.current = lerpEuler(state.current, goal, expT(RIG_LERP, dt));
      state.node.quaternion
        .copy(state.rest)
        .multiply(extraQuatFrom(state.current, extraEuler.current, extraQuat.current));
    }

    const yawGoal = rootYawFor(intent.pose);
    yawSmooth.current += (yawGoal - yawSmooth.current) * expT(4.2, dt);
    const sway = reduced ? 0 : Math.sin(now * 0.55) * 0.03 + lookSmooth.current.x * -0.04;
    const breatheY = reduced ? 0 : Math.sin(now * 1.05) * 0.012;
    const talkBob = reduced || !intent.talking ? 0 : Math.sin(now * 7.5) * intent.amplitude * 0.01;
    const wrap = rootRef.current;
    if (wrap) {
      wrap.rotation.y = yawSmooth.current;
      wrap.rotation.z = sway;
      wrap.position.y = breatheY + talkBob;
      wrap.scale.setScalar(reduced ? 1 : 1 + Math.sin(now * 1.05) * 0.006);
    }
  });

  if (!scene) return null;
  return (
    <group ref={rootRef}>
      <primitive object={scene} />
    </group>
  );
}

type WipFaceNodes = {
  idle: Object3D | null;
  talk: Object3D | null;
  smirk: Object3D | null;
  grit: Object3D | null;
  pout: Object3D | null;
  blushL: Object3D | null;
  blushR: Object3D | null;
  browL: Object3D | null;
  browR: Object3D | null;
  cornerL: Object3D | null;
  cornerR: Object3D | null;
};

function applyWipFace(face: WipFace, amplitude: number, nodes: WipFaceNodes) {
  const show = (node: Object3D | null, on: boolean) => {
    if (node) node.visible = on;
  };
  show(nodes.idle, face === "glare" || face === "shy");
  show(nodes.cornerL, face === "glare" || face === "shy" || face === "pout");
  show(nodes.cornerR, face === "glare" || face === "shy" || face === "pout");
  show(nodes.talk, face === "talkSmile");
  show(nodes.smirk, face === "smirk");
  show(nodes.grit, face === "grit");
  show(nodes.pout, face === "pout");
  if (nodes.talk && face === "talkSmile") {
    const a = Math.max(0, Math.min(1, amplitude));
    nodes.talk.scale.set(1.25, 0.22 + a * 0.7, 0.65);
  }
  const blush = face === "shy" ? 1.55 : 1;
  for (const b of [nodes.blushL, nodes.blushR]) {
    if (b) b.scale.set(1.2 * blush, 0.55 * blush, 0.4);
  }
  if (nodes.browL && nodes.browR) {
    const extra = face === "grit" || face === "pout" ? 0.16 : 0;
    nodes.browL.rotation.z = 0.22 + extra;
    nodes.browR.rotation.z = -0.22 - extra;
  }
}

function makeToonGradient(): DataTexture {
  const data = new Uint8Array([90, 165, 255]);
  const tex = new DataTexture(data, 3, 1, RedFormat);
  tex.colorSpace = NoColorSpace;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  return tex;
}

function extraQuatFrom(e: BoneEuler, euler: Euler, quat: Quaternion): Quaternion {
  euler.set(e.x, e.y, e.z, "XYZ");
  return quat.setFromEuler(euler);
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
  if (state.t < 0.07) state.value = state.t / 0.07;
  else if (state.t < 0.16) state.value = 1 - (state.t - 0.07) / 0.09;
  else state.value = 0;
  return state.value;
}
