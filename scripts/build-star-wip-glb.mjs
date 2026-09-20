/**
 * Author a Star Rai WIP toon mesh (glTF binary).
 * Honest low-poly stand-in matching the canon checklist — not a booth VRM,
 * not Sairi, not shipping Rai.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(rootDir, "public/models/star-rai-wip.glb");

const C = {
  skin: 0xc99570,
  skinShadow: 0xb07d5c,
  hair: 0x141014,
  hairHi: 0x2a2228,
  white: 0xf7f4f0,
  navy: 0x1a2748,
  bow: 0xc81e3a,
  gold: 0xd4a017,
  amber: 0xe0a01a,
  amberDark: 0x8a5a10,
  pupil: 0x1a1008,
  brow: 0x1a1412,
  blush: 0xe08a78,
  loafer: 0x6a3d26,
  loaferDark: 0x4a2a18,
  line: 0x2a1c16,
  lid: 0xc48a68,
  tooth: 0xf4efe8,
};

function toon(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    ...opts,
  });
}

function mesh(geo, color, name, parent, pos, rot, scale) {
  const m = new THREE.Mesh(geo, toon(color));
  m.name = name;
  m.castShadow = false;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  parent.add(m);
  return m;
}

function bone(name, parent, x, y, z) {
  const b = new THREE.Group();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

function starShape(outer = 0.011, inner = 0.0045, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function pleatedSkirt(topR, botR, h, pleats = 18) {
  const geo = new THREE.CylinderGeometry(botR, topR, h, pleats * 4, 3, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const wave = 1 + 0.07 * Math.abs(Math.sin(ang * pleats));
    pos.setX(i, x * wave);
    pos.setZ(i, z * wave);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function build() {
  const root = new THREE.Group();
  root.name = "starRaiWip";
  root.userData = {
    title: "Star Rai WIP",
    note: "Custom toon mesh. Not shipping Rai. Idle rest = glare.",
  };

  const hips = bone("hips", root, 0, 0.92, 0);
  const spine = bone("spine", hips, 0, 0.06, 0);
  const chest = bone("chest", spine, 0, 0.14, 0);
  const upperChest = bone("upperChest", chest, 0, 0.08, 0.01);
  const neck = bone("neck", upperChest, 0, 0.08, 0);
  const head = bone("head", neck, 0, 0.07, 0.01);

  const lShoulder = bone("leftShoulder", upperChest, 0.09, 0.04, 0);
  const rShoulder = bone("rightShoulder", upperChest, -0.09, 0.04, 0);
  const lUpperArm = bone("leftUpperArm", lShoulder, 0.07, -0.02, 0);
  const rUpperArm = bone("rightUpperArm", rShoulder, -0.07, -0.02, 0);
  const lLowerArm = bone("leftLowerArm", lUpperArm, 0.01, -0.22, 0);
  const rLowerArm = bone("rightLowerArm", rUpperArm, -0.01, -0.22, 0);
  const lHand = bone("leftHand", lLowerArm, 0, -0.2, 0);
  const rHand = bone("rightHand", rLowerArm, 0, -0.2, 0);

  const lUpperLeg = bone("leftUpperLeg", hips, 0.07, -0.04, 0);
  const rUpperLeg = bone("rightUpperLeg", hips, -0.07, -0.04, 0);
  const lLowerLeg = bone("leftLowerLeg", lUpperLeg, 0, -0.32, 0);
  const rLowerLeg = bone("rightLowerLeg", rUpperLeg, 0, -0.32, 0);
  const lFoot = bone("leftFoot", lLowerLeg, 0, -0.34, 0.02);
  const rFoot = bone("rightFoot", rLowerLeg, 0, -0.34, 0.02);

  // --- torso / pointed-collar blouse (NOT sailor) ---
  mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.28, 20), C.white, "shirt", chest, [0, 0.02, 0]);
  mesh(new THREE.CylinderGeometry(0.118, 0.105, 0.08, 20), C.white, "shirtHem", hips, [0, 0.08, 0]);

  const collarShape = new THREE.Shape();
  collarShape.moveTo(0, 0);
  collarShape.lineTo(0.07, 0.012);
  collarShape.lineTo(0.012, 0.078);
  collarShape.closePath();
  const collarGeo = new THREE.ExtrudeGeometry(collarShape, { depth: 0.012, bevelEnabled: false });
  const collarL = new THREE.Mesh(collarGeo, toon(C.white));
  collarL.name = "collarL";
  collarL.position.set(0.012, 0.042, 0.05);
  collarL.rotation.set(-0.85, 0.55, 0.35);
  upperChest.add(collarL);
  const collarR = new THREE.Mesh(collarGeo.clone(), toon(C.white));
  collarR.name = "collarR";
  collarR.position.set(-0.012, 0.042, 0.05);
  collarR.rotation.set(-0.85, -0.55, -0.35);
  collarR.scale.x = -1;
  upperChest.add(collarR);

  for (let i = 0; i < 5; i++) {
    mesh(
      new THREE.SphereGeometry(0.007, 10, 8),
      C.gold,
      `button${i + 1}`,
      chest,
      [0, 0.1 - i * 0.038, 0.108],
    );
  }

  // Red FRONT bow only
  mesh(new THREE.SphereGeometry(0.016, 12, 10), C.bow, "bowKnot", upperChest, [0, 0.03, 0.12]);
  mesh(
    new THREE.BoxGeometry(0.055, 0.028, 0.012),
    C.bow,
    "bowL",
    upperChest,
    [0.038, 0.03, 0.118],
    [0, 0.35, 0.2],
  );
  mesh(
    new THREE.BoxGeometry(0.055, 0.028, 0.012),
    C.bow,
    "bowR",
    upperChest,
    [-0.038, 0.03, 0.118],
    [0, -0.35, -0.2],
  );
  mesh(new THREE.BoxGeometry(0.012, 0.04, 0.006), C.bow, "bowTailL", upperChest, [0.012, -0.01, 0.115]);
  mesh(new THREE.BoxGeometry(0.012, 0.04, 0.006), C.bow, "bowTailR", upperChest, [-0.012, -0.01, 0.115]);

  // --- arms: short sleeves + navy cuff + DOUBLE stripe ---
  for (const [arm, lower, hand, side] of [
    [lUpperArm, lLowerArm, lHand, "L"],
    [rUpperArm, rLowerArm, rHand, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.22, 12), C.skin, `arm${side}`, arm, [0, -0.11, 0]);
    mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.09, 12), C.white, `sleeve${side}`, arm, [0, -0.02, 0]);
    mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.028, 14), C.navy, `cuff${side}`, arm, [0, -0.068, 0]);
    mesh(new THREE.TorusGeometry(0.039, 0.003, 8, 16), C.white, `cuffStripeA${side}`, arm, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.TorusGeometry(0.039, 0.003, 8, 16), C.white, `cuffStripeB${side}`, arm, [0, -0.074, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.2, 12), C.skin, `fore${side}`, lower, [0, -0.1, 0]);
    mesh(new THREE.SphereGeometry(0.028, 10, 8), C.skin, `hand${side}`, hand, [0, -0.02, 0], null, [1, 1.15, 0.75]);
  }

  // --- skirt: navy pleats + TWO white hem stripes ---
  mesh(pleatedSkirt(0.125, 0.2, 0.22, 16), C.navy, "skirt", hips, [0, -0.08, 0]);
  mesh(new THREE.TorusGeometry(0.198, 0.006, 8, 32), C.white, "hemStripe1", hips, [0, -0.175, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.TorusGeometry(0.205, 0.006, 8, 32), C.white, "hemStripe2", hips, [0, -0.192, 0], [Math.PI / 2, 0, 0]);

  // --- legs / navy mid-calf socks / brown penny loafers ---
  for (const [up, low, foot, side] of [
    [lUpperLeg, lLowerLeg, lFoot, "L"],
    [rUpperLeg, rLowerLeg, rFoot, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.32, 12), C.skin, `thigh${side}`, up, [0, -0.16, 0]);
    mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.16, 12), C.skin, `shin${side}`, low, [0, -0.08, 0]);
    mesh(new THREE.CylinderGeometry(0.036, 0.033, 0.22, 14), C.navy, `sock${side}`, low, [0, -0.23, 0]);
    mesh(new THREE.BoxGeometry(0.068, 0.038, 0.09), C.loafer, `loafer${side}`, foot, [0, -0.006, 0.01]);
    mesh(new THREE.SphereGeometry(0.036, 12, 10), C.loafer, `toe${side}`, foot, [0, -0.004, 0.055], null, [0.95, 0.7, 1.05]);
    mesh(new THREE.BoxGeometry(0.07, 0.01, 0.036), C.loaferDark, `penny${side}`, foot, [0, 0.016, 0.028]);
    mesh(new THREE.BoxGeometry(0.07, 0.01, 0.12), C.loaferDark, `sole${side}`, foot, [0, -0.028, 0.022]);
  }

  // --- head / glare idle face ---
  mesh(new THREE.SphereGeometry(0.105, 24, 18), C.skin, "headMesh", head, [0, 0.04, 0], null, [0.95, 1.08, 0.92]);
  mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.055, 12), C.skin, "neckMesh", neck, [0, 0.01, 0]);

  function eye(side, x) {
    const g = new THREE.Group();
    g.name = `eye${side}`;
    g.position.set(x, 0.045, 0.082);
    head.add(g);
    mesh(new THREE.SphereGeometry(0.022, 16, 12), C.white, `sclera${side}`, g, [0, 0, 0], null, [1.05, 0.78, 0.45]);
    mesh(new THREE.SphereGeometry(0.013, 14, 12), C.amber, `iris${side}`, g, [0, -0.002, 0.012]);
    mesh(new THREE.SphereGeometry(0.006, 10, 8), C.pupil, `pupil${side}`, g, [0, -0.002, 0.022]);
    mesh(new THREE.SphereGeometry(0.0035, 8, 6), C.white, `shine${side}`, g, [0.005, 0.004, 0.026]);
    // half-lid (idle glare) + blink mesh
    const lid = mesh(
      new THREE.SphereGeometry(0.023, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      C.lid,
      side === "L" ? "lidLeft" : "lidRight",
      g,
      [0, 0.006, 0.002],
      [0.15, 0, 0],
      [1.05, 0.7, 0.55],
    );
    lid.userData.blink = true;
    mesh(
      new THREE.BoxGeometry(0.042, 0.006, 0.008),
      C.brow,
      `brow${side}`,
      head,
      [x, 0.078, 0.08],
      [0, 0, side === "L" ? 0.22 : -0.22],
    );
    mesh(new THREE.SphereGeometry(0.016, 10, 8), C.blush, `blush${side}`, head, [x * 1.35, 0.012, 0.078], null, [1.2, 0.55, 0.4]);
  }
  eye("L", 0.034);
  eye("R", -0.034);

  // Idle glare mouth (flat / slight frown) — default rest
  mesh(new THREE.BoxGeometry(0.03, 0.004, 0.006), C.brow, "mouthIdle", head, [0, -0.012, 0.09]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.005), C.brow, "mouthCornerL", head, [0.016, -0.015, 0.088], [0, 0, 0.45]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.005), C.brow, "mouthCornerR", head, [-0.016, -0.015, 0.088], [0, 0, -0.45]);

  // Talk: open-mouth smile + teeth
  const mouthOpen = mesh(
    new THREE.SphereGeometry(0.016, 12, 8),
    C.bow,
    "mouthOpen",
    head,
    [0, -0.02, 0.088],
    null,
    [1.25, 0.22, 0.65],
  );
  mesh(new THREE.BoxGeometry(0.022, 0.006, 0.004), C.tooth, "teethTalk", mouthOpen, [0, 0.006, 0.006]);

  // Wave: small closed-mouth smirk (asymmetric)
  const mouthSmirk = mesh(
    new THREE.BoxGeometry(0.022, 0.004, 0.005),
    C.brow,
    "mouthSmirk",
    head,
    [0.006, -0.01, 0.091],
    [0, 0, -0.28],
  );
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.004), C.brow, "smirkLift", mouthSmirk, [0.012, 0.004, 0]);

  // Scold: grit / shout (wide open, not a smile)
  const mouthGrit = mesh(
    new THREE.SphereGeometry(0.015, 12, 8),
    C.bow,
    "mouthGrit",
    head,
    [0, -0.022, 0.086],
    null,
    [1.05, 0.55, 0.7],
  );
  mesh(new THREE.BoxGeometry(0.018, 0.005, 0.004), C.tooth, "teethGrit", mouthGrit, [0, 0.007, 0.005]);

  // Pout: pushed-out frown (not shy)
  const mouthPout = mesh(
    new THREE.SphereGeometry(0.012, 10, 8),
    C.skinShadow,
    "mouthPout",
    head,
    [0, -0.018, 0.094],
    null,
    [1.15, 0.55, 0.7],
  );
  // Face extras stay visible in the file; Lab hides all but the rest glare.

  // gold STAR studs (not hoops / dangles)
  const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.003, bevelEnabled: false });
  starGeo.center();
  const earL = mesh(new THREE.SphereGeometry(0.018, 10, 8), C.skin, "earL", head, [0.1, 0.03, 0], [0, 0.4, 0], [0.7, 1, 0.6]);
  const earR = mesh(new THREE.SphereGeometry(0.018, 10, 8), C.skin, "earR", head, [-0.1, 0.03, 0], [0, -0.4, 0], [0.7, 1, 0.6]);
  const studL = new THREE.Mesh(starGeo, toon(C.gold));
  studL.name = "starStudL";
  studL.position.set(0.018, 0, 0.006);
  studL.rotation.y = -0.6;
  earL.add(studL);
  const studR = new THREE.Mesh(starGeo.clone(), toon(C.gold));
  studR.name = "starStudR";
  studR.position.set(-0.018, 0, 0.006);
  studR.rotation.y = 0.6;
  earR.add(studR);

  // --- hair: mid-length messy black + ONE hooked ahoge from crown ---
  mesh(new THREE.SphereGeometry(0.112, 20, 16), C.hair, "hairCap", head, [0, 0.055, -0.01], null, [1.02, 0.95, 1.0]);
  mesh(new THREE.SphereGeometry(0.08, 14, 12), C.hair, "hairCrown", head, [0, 0.11, -0.02], null, [1.15, 0.7, 1.05]);
  // side-swept bangs, both eyes visible
  mesh(new THREE.SphereGeometry(0.05, 12, 10), C.hair, "bangC", head, [0.01, 0.095, 0.08], [0.5, 0.2, 0], [1.3, 0.45, 0.55]);
  mesh(new THREE.SphereGeometry(0.045, 12, 10), C.hair, "bangL", head, [0.055, 0.09, 0.07], [0.4, -0.4, 0.2], [1.1, 0.4, 0.5]);
  mesh(new THREE.SphereGeometry(0.042, 12, 10), C.hair, "bangR", head, [-0.05, 0.088, 0.068], [0.35, 0.5, -0.15], [1.05, 0.38, 0.48]);
  // side / back to collarbone (not waist)
  mesh(new THREE.SphereGeometry(0.07, 12, 10), C.hair, "sideL", head, [0.09, 0.0, -0.01], [0.2, 0, 0.15], [0.7, 1.35, 0.85]);
  mesh(new THREE.SphereGeometry(0.07, 12, 10), C.hair, "sideR", head, [-0.09, 0.0, -0.01], [0.2, 0, -0.15], [0.7, 1.35, 0.85]);
  mesh(new THREE.SphereGeometry(0.09, 14, 12), C.hair, "hairBack", head, [0, -0.02, -0.07], [0.35, 0, 0], [1.05, 1.2, 0.75]);
  mesh(new THREE.SphereGeometry(0.05, 10, 8), C.hairHi, "layerL", head, [0.07, 0.06, 0.04], null, [0.8, 0.5, 0.6]);
  mesh(new THREE.SphereGeometry(0.05, 10, 8), C.hairHi, "layerR", head, [-0.06, 0.055, 0.03], null, [0.75, 0.45, 0.55]);

  const ahogeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.01, 0.14, -0.01),
    new THREE.Vector3(-0.02, 0.2, -0.03),
    new THREE.Vector3(-0.055, 0.24, -0.02),
    new THREE.Vector3(-0.04, 0.3, 0.01),
    new THREE.Vector3(-0.01, 0.34, 0.03),
  ]);
  mesh(new THREE.TubeGeometry(ahogeCurve, 28, 0.007, 8, false), C.hair, "ahoge", head);

  // A-pose: arms already hang from hierarchy (negative Y). Slight outward.
  lUpperArm.rotation.z = 0.18;
  rUpperArm.rotation.z = -0.18;
  lLowerArm.rotation.z = 0.06;
  rLowerArm.rotation.z = -0.06;

  return root;
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    result = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        this.onloadend?.();
      });
    }
  };
}

const scene = build();
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(scene, { binary: true, maxTextureSize: 512 });
const buf = Buffer.from(glb);
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${buf.length} bytes)`);
