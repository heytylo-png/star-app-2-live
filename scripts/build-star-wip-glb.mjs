/**
 * Author a Star Rai WIP toon mesh (glTF binary).
 * Honest low-poly stand-in matching the canon checklist — not a booth VRM,
 * not Sairi, not shipping Rai.
 * Idle silhouette first (uniform + glare), then talk / wave / scold / pout / shy
 * as separate slots. No kiss / blow-kiss / heart-hands. scold ≠ shy ≠ pout.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(rootDir, "public/models/star-rai-wip.glb");

const C = {
  skin: 0xce9a6e,
  skinShadow: 0xb07d5c,
  hair: 0x121014,
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
  blushHot: 0xe07068,
  loafer: 0x6a3d26,
  loaferDark: 0x4a2a18,
  line: 0x2a1c16,
  lid: 0xc48a68,
  tooth: 0xf4efe8,
  liner: 0x1a1210,
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

function starShape(outer = 0.013, inner = 0.0052, n = 5) {
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
    const wave = 1 + 0.08 * Math.abs(Math.sin(ang * pleats));
    pos.setX(i, x * wave);
    pos.setZ(i, z * wave);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function ribbedSock(rTop, rBot, h) {
  const geo = new THREE.CylinderGeometry(rBot, rTop, h, 20, 10, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const rib = 1 + 0.045 * Math.sin(ang * 18);
    pos.setX(i, x * rib);
    pos.setZ(i, z * rib);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function pointedCollar() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.082, 0.01);
  s.lineTo(0.018, 0.092);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false });
}

function addWavePalm(hand) {
  const g = new THREE.Group();
  g.name = "handWaveR";
  hand.add(g);
  mesh(new THREE.BoxGeometry(0.058, 0.072, 0.016), C.skin, "palmR", g, [0, -0.038, 0]);
  const span = 0.042;
  for (let i = 0; i < 4; i++) {
    const x = -span / 2 + (i * span) / 3;
    const len = i === 1 || i === 2 ? 0.048 : 0.042;
    mesh(
      new THREE.BoxGeometry(0.011, len, 0.01),
      C.skin,
      `waveFinger${i}`,
      g,
      [x, -0.078 - (len - 0.042) * 0.4, 0],
    );
  }
  mesh(
    new THREE.BoxGeometry(0.012, 0.032, 0.012),
    C.skin,
    "waveThumb",
    g,
    [0.034, -0.028, 0.008],
    [0.2, 0, 0.7],
  );
  return g;
}

function addPointHand(hand) {
  const g = new THREE.Group();
  g.name = "handPointR";
  hand.add(g);
  mesh(new THREE.SphereGeometry(0.026, 10, 8), C.skin, "fistR", g, [0, -0.018, 0], null, [1, 1.05, 0.82]);
  mesh(new THREE.CylinderGeometry(0.007, 0.006, 0.07, 8), C.skin, "indexPointR", g, [0, -0.068, 0.004]);
  mesh(new THREE.SphereGeometry(0.007, 8, 6), C.skin, "indexTipR", g, [0, -0.104, 0.004]);
  return g;
}

function build() {
  const root = new THREE.Group();
  root.name = "starRaiWip";
  root.userData = {
    title: "Star Rai WIP",
    note: "Custom toon mesh. Not shipping Rai. Idle rest = glare. Moods: talk/wave/scold/pout/shy.",
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

  // --- pointed-collar button-up (NOT sailor) ---
  mesh(new THREE.CylinderGeometry(0.112, 0.1, 0.16, 22), C.white, "shirtUpper", chest, [0, 0.06, 0]);
  mesh(new THREE.CylinderGeometry(0.1, 0.108, 0.15, 22), C.white, "shirtWaist", chest, [0, -0.085, 0]);
  mesh(new THREE.CylinderGeometry(0.118, 0.108, 0.07, 22), C.white, "shirtHem", hips, [0, 0.085, 0]);

  const collarGeo = pointedCollar();
  const collarL = new THREE.Mesh(collarGeo, toon(C.white));
  collarL.name = "collarL";
  collarL.position.set(0.01, 0.046, 0.052);
  collarL.rotation.set(-0.92, 0.52, 0.32);
  upperChest.add(collarL);
  const collarR = new THREE.Mesh(collarGeo.clone(), toon(C.white));
  collarR.name = "collarR";
  collarR.position.set(-0.01, 0.046, 0.052);
  collarR.rotation.set(-0.92, -0.52, -0.32);
  collarR.scale.x = -1;
  upperChest.add(collarR);

  for (let i = 0; i < 5; i++) {
    mesh(
      new THREE.SphereGeometry(0.0085, 10, 8),
      C.gold,
      `button${i + 1}`,
      chest,
      [0, 0.11 - i * 0.04, 0.106],
    );
  }

  // Red FRONT school bow only (none on the back)
  mesh(new THREE.SphereGeometry(0.018, 12, 10), C.bow, "bowKnot", upperChest, [0, 0.028, 0.128]);
  mesh(
    new THREE.SphereGeometry(0.034, 12, 10),
    C.bow,
    "bowL",
    upperChest,
    [0.044, 0.03, 0.122],
    [0, 0.28, 0.18],
    [1.35, 0.72, 0.32],
  );
  mesh(
    new THREE.SphereGeometry(0.034, 12, 10),
    C.bow,
    "bowR",
    upperChest,
    [-0.044, 0.03, 0.122],
    [0, -0.28, -0.18],
    [1.35, 0.72, 0.32],
  );
  mesh(new THREE.BoxGeometry(0.016, 0.055, 0.007), C.bow, "bowTailL", upperChest, [0.014, -0.012, 0.118], [0, 0, 0.18]);
  mesh(new THREE.BoxGeometry(0.016, 0.055, 0.007), C.bow, "bowTailR", upperChest, [-0.014, -0.012, 0.118], [0, 0, -0.18]);

  // --- short sleeves + navy cuff + DOUBLE white stripe ---
  for (const [arm, lower, hand, side] of [
    [lUpperArm, lLowerArm, lHand, "L"],
    [rUpperArm, rLowerArm, rHand, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.22, 12), C.skin, `arm${side}`, arm, [0, -0.11, 0]);
    mesh(new THREE.CylinderGeometry(0.04, 0.037, 0.095, 14), C.white, `sleeve${side}`, arm, [0, -0.018, 0]);
    mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 16), C.navy, `cuff${side}`, arm, [0, -0.068, 0]);
    mesh(
      new THREE.TorusGeometry(0.041, 0.0032, 8, 18),
      C.white,
      `cuffStripeA${side}`,
      arm,
      [0, -0.058, 0],
      [Math.PI / 2, 0, 0],
    );
    mesh(
      new THREE.TorusGeometry(0.041, 0.0032, 8, 18),
      C.white,
      `cuffStripeB${side}`,
      arm,
      [0, -0.076, 0],
      [Math.PI / 2, 0, 0],
    );
    mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.2, 12), C.skin, `fore${side}`, lower, [0, -0.1, 0]);
    mesh(
      new THREE.SphereGeometry(0.028, 10, 8),
      C.skin,
      `handDefault${side}`,
      hand,
      [0, -0.02, 0],
      null,
      [1, 1.15, 0.75],
    );
    if (side === "R") {
      addWavePalm(hand);
      addPointHand(hand);
    }
  }

  // --- navy pleats + TWO white hem bands ---
  mesh(pleatedSkirt(0.126, 0.2, 0.23, 16), C.navy, "skirt", hips, [0, -0.085, 0]);
  mesh(
    new THREE.TorusGeometry(0.198, 0.007, 8, 40),
    C.white,
    "hemStripe1",
    hips,
    [0, -0.178, 0],
    [Math.PI / 2, 0, 0],
  );
  mesh(
    new THREE.TorusGeometry(0.206, 0.007, 8, 40),
    C.white,
    "hemStripe2",
    hips,
    [0, -0.198, 0],
    [Math.PI / 2, 0, 0],
  );

  // --- bare thighs, navy ribbed mid-calf socks, brown penny loafers ---
  for (const [up, low, foot, side] of [
    [lUpperLeg, lLowerLeg, lFoot, "L"],
    [rUpperLeg, rLowerLeg, rFoot, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.32, 14), C.skin, `thigh${side}`, up, [0, -0.16, 0]);
    mesh(new THREE.CylinderGeometry(0.04, 0.033, 0.15, 12), C.skin, `shin${side}`, low, [0, -0.075, 0]);
    mesh(ribbedSock(0.037, 0.033, 0.235), C.navy, `sock${side}`, low, [0, -0.228, 0]);
    mesh(new THREE.BoxGeometry(0.07, 0.036, 0.092), C.loafer, `loafer${side}`, foot, [0, -0.004, 0.012]);
    mesh(
      new THREE.SphereGeometry(0.038, 12, 10),
      C.loafer,
      `toe${side}`,
      foot,
      [0, -0.002, 0.058],
      null,
      [0.96, 0.68, 1.08],
    );
    mesh(new THREE.BoxGeometry(0.072, 0.01, 0.038), C.loaferDark, `penny${side}`, foot, [0, 0.018, 0.03]);
    mesh(new THREE.BoxGeometry(0.072, 0.01, 0.125), C.loaferDark, `sole${side}`, foot, [0, -0.026, 0.024]);
  }

  // --- head / idle glare ---
  mesh(new THREE.SphereGeometry(0.108, 26, 20), C.skin, "headMesh", head, [0, 0.038, 0.008], null, [0.92, 1.04, 0.88]);
  mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.055, 12), C.skin, "neckMesh", neck, [0, 0.01, 0]);

  function eye(side, x) {
    const g = new THREE.Group();
    g.name = `eye${side}`;
    g.position.set(x, 0.048, 0.092);
    head.add(g);
    mesh(new THREE.SphereGeometry(0.024, 16, 12), C.white, `sclera${side}`, g, [0, 0, 0], null, [1.08, 0.8, 0.42]);
    mesh(new THREE.SphereGeometry(0.0145, 14, 12), C.amber, `iris${side}`, g, [0, -0.002, 0.012]);
    mesh(new THREE.SphereGeometry(0.0062, 10, 8), C.pupil, `pupil${side}`, g, [0, -0.002, 0.022]);
    mesh(new THREE.SphereGeometry(0.0036, 8, 6), C.white, `shine${side}`, g, [0.005, 0.004, 0.026]);
    mesh(
      new THREE.BoxGeometry(0.046, 0.006, 0.01),
      C.liner,
      `liner${side}`,
      g,
      [0, 0.014, 0.01],
      [0.15, 0, 0],
    );
    const lid = mesh(
      new THREE.SphereGeometry(0.025, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      C.lid,
      side === "L" ? "lidLeft" : "lidRight",
      g,
      [0, 0.007, 0.002],
      [0.15, 0, 0],
      [1.08, 0.72, 0.55],
    );
    lid.userData.blink = true;
    mesh(
      new THREE.BoxGeometry(0.046, 0.007, 0.008),
      C.brow,
      `brow${side}`,
      head,
      [x, 0.082, 0.082],
      [0, 0, side === "L" ? 0.26 : -0.26],
    );
    mesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      C.blush,
      `blush${side}`,
      head,
      [x * 1.4, 0.01, 0.08],
      null,
      [1.25, 0.55, 0.4],
    );
    mesh(
      new THREE.SphereGeometry(0.024, 10, 8),
      C.blushHot,
      `blushShy${side}`,
      head,
      [x * 1.42, 0.008, 0.082],
      null,
      [1.45, 0.7, 0.45],
    );
  }
  eye("L", 0.036);
  eye("R", -0.036);

  // Idle glare mouth (flat / slight frown) — default rest
  mesh(new THREE.BoxGeometry(0.032, 0.004, 0.006), C.brow, "mouthIdle", head, [0, -0.012, 0.092]);
  mesh(new THREE.BoxGeometry(0.011, 0.003, 0.005), C.brow, "mouthCornerL", head, [0.017, -0.016, 0.09], [0, 0, 0.48]);
  mesh(new THREE.BoxGeometry(0.011, 0.003, 0.005), C.brow, "mouthCornerR", head, [-0.017, -0.016, 0.09], [0, 0, -0.48]);

  // Talk: open-mouth smile + teeth (not a shout)
  const mouthOpen = mesh(
    new THREE.SphereGeometry(0.017, 12, 8),
    C.bow,
    "mouthOpen",
    head,
    [0, -0.018, 0.092],
    null,
    [1.55, 0.42, 0.75],
  );
  mesh(new THREE.BoxGeometry(0.026, 0.007, 0.004), C.tooth, "teethTalk", mouthOpen, [0, 0.007, 0.006]);

  // Wave: small closed-mouth smirk
  const mouthSmirk = mesh(
    new THREE.BoxGeometry(0.024, 0.004, 0.005),
    C.brow,
    "mouthSmirk",
    head,
    [0.007, -0.01, 0.093],
    [0, 0, -0.3],
  );
  mesh(new THREE.BoxGeometry(0.011, 0.003, 0.004), C.brow, "smirkLift", mouthSmirk, [0.013, 0.004, 0]);

  // Scold: grit / shout (tall open, not a smile)
  const mouthGrit = mesh(
    new THREE.SphereGeometry(0.016, 12, 8),
    C.bow,
    "mouthGrit",
    head,
    [0, -0.022, 0.088],
    null,
    [1.0, 0.62, 0.72],
  );
  mesh(new THREE.BoxGeometry(0.016, 0.005, 0.004), C.tooth, "teethGrit", mouthGrit, [0, 0.01, 0.005]);

  // Pout: pushed-out frown (not shy)
  mesh(
    new THREE.SphereGeometry(0.013, 10, 8),
    C.skinShadow,
    "mouthPout",
    head,
    [0, -0.018, 0.098],
    null,
    [1.2, 0.58, 0.72],
  );

  // Shy: small tight line, distinct from idle glare and pout
  mesh(new THREE.BoxGeometry(0.02, 0.0035, 0.005), C.brow, "mouthShy", head, [0.004, -0.014, 0.093], [0, 0, 0.12]);

  // Face extras stay visible in the file; Lab hides all but the rest glare.

  // gold STAR studs (not hoops / dangles)
  const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.0035, bevelEnabled: false });
  starGeo.center();
  const earL = mesh(new THREE.SphereGeometry(0.019, 10, 8), C.skin, "earL", head, [0.102, 0.028, 0], [0, 0.4, 0], [0.7, 1, 0.6]);
  const earR = mesh(new THREE.SphereGeometry(0.019, 10, 8), C.skin, "earR", head, [-0.102, 0.028, 0], [0, -0.4, 0], [0.7, 1, 0.6]);
  const studL = new THREE.Mesh(starGeo, toon(C.gold));
  studL.name = "starStudL";
  studL.position.set(0.02, 0, 0.007);
  studL.rotation.y = -0.55;
  earL.add(studL);
  const studR = new THREE.Mesh(starGeo.clone(), toon(C.gold));
  studR.name = "starStudR";
  studR.position.set(-0.02, 0, 0.007);
  studR.rotation.y = 0.55;
  earR.add(studR);

  // --- messy mid-length black hair + ONE hooked ahoge from crown ---
  // Cap sits behind the face so both amber eyes stay visible (no helmet bangs).
  mesh(new THREE.SphereGeometry(0.116, 22, 18), C.hair, "hairCap", head, [0, 0.06, -0.03], null, [1.02, 0.9, 0.86]);
  mesh(new THREE.SphereGeometry(0.084, 14, 12), C.hair, "hairCrown", head, [0, 0.122, -0.028], null, [1.16, 0.66, 1.02]);
  mesh(new THREE.SphereGeometry(0.04, 12, 10), C.hair, "bangC", head, [0.012, 0.112, 0.07], [0.55, 0.18, 0], [1.15, 0.28, 0.38]);
  mesh(new THREE.SphereGeometry(0.036, 12, 10), C.hair, "bangL", head, [0.055, 0.105, 0.058], [0.4, -0.4, 0.15], [1.0, 0.28, 0.38]);
  mesh(new THREE.SphereGeometry(0.034, 12, 10), C.hair, "bangR", head, [-0.05, 0.104, 0.056], [0.38, 0.45, -0.1], [0.95, 0.26, 0.36]);
  mesh(new THREE.SphereGeometry(0.032, 10, 8), C.hair, "bangSideL", head, [0.082, 0.078, 0.04], [0.25, -0.5, 0.18], [0.85, 0.65, 0.4]);
  mesh(new THREE.SphereGeometry(0.03, 10, 8), C.hair, "bangSideR", head, [-0.078, 0.076, 0.038], [0.24, 0.45, -0.12], [0.8, 0.6, 0.38]);
  mesh(new THREE.SphereGeometry(0.074, 12, 10), C.hair, "sideL", head, [0.096, -0.018, -0.02], [0.22, 0, 0.12], [0.7, 1.5, 0.82]);
  mesh(new THREE.SphereGeometry(0.074, 12, 10), C.hair, "sideR", head, [-0.096, -0.018, -0.02], [0.22, 0, -0.12], [0.7, 1.5, 0.82]);
  mesh(new THREE.SphereGeometry(0.094, 14, 12), C.hair, "hairBack", head, [0, -0.028, -0.082], [0.38, 0, 0], [1.06, 1.28, 0.72]);
  mesh(new THREE.SphereGeometry(0.046, 10, 8), C.hairHi, "layerL", head, [0.075, 0.06, 0.02], null, [0.75, 0.48, 0.5]);
  mesh(new THREE.SphereGeometry(0.044, 10, 8), C.hairHi, "layerR", head, [-0.068, 0.055, 0.016], null, [0.72, 0.44, 0.46]);
  mesh(new THREE.SphereGeometry(0.04, 8, 8), C.hair, "nape", head, [0, -0.055, -0.058], [0.4, 0, 0], [1.08, 0.68, 0.55]);

  const ahogeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.152, -0.018),
    new THREE.Vector3(-0.035, 0.215, -0.04),
    new THREE.Vector3(-0.072, 0.275, -0.018),
    new THREE.Vector3(-0.04, 0.335, 0.02),
    new THREE.Vector3(0.018, 0.355, 0.042),
  ]);
  mesh(new THREE.TubeGeometry(ahogeCurve, 32, 0.0065, 8, false), C.hair, "ahoge", head);

  // A-pose: arms hang from hierarchy (negative Y). Slight outward.
  lUpperArm.rotation.z = 0.16;
  rUpperArm.rotation.z = -0.16;
  lLowerArm.rotation.z = 0.05;
  rLowerArm.rotation.z = -0.05;

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
