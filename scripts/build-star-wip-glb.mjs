/**
 * Star Rai WIP toon mesh (glTF binary).
 * Second-pass silhouette: strand hair, anime eye planes, fitted uniform.
 * Same bone names as Lab so talk/wave/scold/pout/shy still drive.
 * Not a booth VRM, not Sairi, not shipping Rai.
 * No kiss / blow-kiss / heart-hands. scold ≠ shy ≠ pout.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(rootDir, "public/models/star-rai-wip.glb");

const C = {
  skin: 0xc99268,
  skinShadow: 0xa87454,
  hair: 0x0c0a0e,
  hairHi: 0x2a232a,
  white: 0xf7f4ef,
  navy: 0x1a2748,
  bow: 0xd01832,
  gold: 0xd4a017,
  amber: 0xe8a51c,
  amberDeep: 0xb86a10,
  pupil: 0x160e08,
  brow: 0x14110f,
  blush: 0xe0907c,
  blushHot: 0xe06860,
  loafer: 0x6b3d24,
  loaferDark: 0x4a2818,
  lid: 0xc48a64,
  tooth: 0xf4efe8,
  liner: 0x1a1210,
};

function toon(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function mesh(geo, color, name, parent, pos, rot, scale, matOpts) {
  const m = new THREE.Mesh(geo, typeof color === "number" ? toon(color, matOpts) : color);
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

function lathe(pairs, segs = 28) {
  return new THREE.LatheGeometry(
    pairs.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

function curveOf(pts) {
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
}

function starShape(outer = 0.011, inner = 0.0046, n = 5) {
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

function almondShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.bezierCurveTo(-w * 0.55, h, w * 0.55, h, w, 0);
  s.bezierCurveTo(w * 0.5, -h * 0.62, -w * 0.5, -h * 0.62, -w, 0);
  s.closePath();
  return s;
}

/** Hair cards that face +Z so they read from the Lab camera. */
function hairRibbon(curve, width = 0.028, segs = 18) {
  const pts = curve.getSpacedPoints(segs);
  const face = new THREE.Vector3(0, 0, 1);
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const a = pts[Math.min(i + 1, segs)];
    const b = pts[Math.max(i - 1, 0)];
    tan.subVectors(a, b);
    if (tan.lengthSq() < 1e-8) tan.set(0, -1, 0);
    tan.normalize();
    side.crossVectors(face, tan);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize();
    const taper = 0.34 + 0.66 * Math.sin((i / segs) * Math.PI);
    const w = width * taper;
    const p = pts[i];
    positions.push(p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    positions.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
    uvs.push(0, i / segs, 1, i / segs);
    if (i < segs) {
      const i0 = i * 2;
      indices.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addCard(parent, pts, width, name, color = C.hair) {
  mesh(hairRibbon(curveOf(pts), width, 16), color, name, parent, null, null, null, {
    side: THREE.DoubleSide,
    roughness: 0.92,
  });
}

function addStrand(parent, pts, radius, name, color = C.hair, segs = 14) {
  mesh(new THREE.TubeGeometry(curveOf(pts), segs, radius, 6, false), color, name, parent, null, null, null, {
    roughness: 0.93,
  });
}

function pleatedSkirt(topR, botR, h, pleats = 18) {
  const geo = new THREE.CylinderGeometry(botR, topR, h, pleats * 8, 14, true);
  const pos = geo.attributes.position;
  const colors = [];
  const navy = new THREE.Color(C.navy);
  const white = new THREE.Color(C.white);
  const yMin = -h / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const wave = 1 + 0.055 * Math.abs(Math.sin(ang * pleats));
    pos.setX(i, x * wave);
    pos.setZ(i, z * wave);
    const t = (y - yMin) / h;
    const band = (t > 0.03 && t < 0.08) || (t > 0.1 && t < 0.15);
    const c = band ? white : navy;
    colors.push(c.r, c.g, c.b);
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function ribbedSock(rTop, rBot, h) {
  const geo = new THREE.CylinderGeometry(rBot, rTop, h, 22, 10, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y + h / 2) / h;
    if (t < 0.1 || t > 0.86) continue;
    if (x * x + z * z < 1e-6) continue;
    const ang = Math.atan2(z, x);
    const rib = 1 + 0.03 * Math.sin(ang * 18);
    pos.setX(i, x * rib);
    pos.setZ(i, z * rib);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function cuffBand() {
  const h = 0.032;
  const geo = new THREE.CylinderGeometry(0.041, 0.041, h, 20, 8, false);
  const pos = geo.attributes.position;
  const colors = [];
  const navy = new THREE.Color(C.navy);
  const white = new THREE.Color(C.white);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + h / 2) / h;
    const stripe = (t > 0.18 && t < 0.38) || (t > 0.62 && t < 0.82);
    const c = stripe ? white : navy;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
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
    mesh(new THREE.BoxGeometry(0.011, len, 0.01), C.skin, `waveFinger${i}`, g, [x, -0.078, 0]);
  }
  mesh(new THREE.BoxGeometry(0.012, 0.032, 0.012), C.skin, "waveThumb", g, [0.034, -0.028, 0.008], [0.2, 0, 0.7]);
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

function addBow(parent) {
  const loop = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.052, 0.03);
    s.lineTo(0.06, 0);
    s.lineTo(0.052, -0.03);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  };
  const knot = mesh(new THREE.SphereGeometry(0.016, 12, 10), C.bow, "bowKnot", parent, [0, 0.026, 0.128]);
  const left = new THREE.Mesh(loop(), toon(C.bow, { roughness: 0.55 }));
  left.name = "bowL";
  left.position.set(0.006, 0.026, 0.122);
  left.rotation.set(0.1, 0.18, 0.08);
  parent.add(left);
  const right = new THREE.Mesh(loop(), toon(C.bow, { roughness: 0.55 }));
  right.name = "bowR";
  right.position.set(-0.006, 0.026, 0.122);
  right.rotation.set(0.1, -0.18, -0.08);
  right.scale.x = -1;
  parent.add(right);
  mesh(new THREE.BoxGeometry(0.014, 0.055, 0.008), C.bow, "bowTailL", parent, [0.014, -0.012, 0.118], [0.2, 0, 0.18]);
  mesh(new THREE.BoxGeometry(0.014, 0.055, 0.008), C.bow, "bowTailR", parent, [-0.014, -0.012, 0.118], [0.2, 0, -0.18]);
  return knot;
}

function addHair(head) {
  // Top skullcap (full phi, short theta) covers the crown without reaching the eyes.
  mesh(
    new THREE.SphereGeometry(0.112, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.38),
    C.hair,
    "hairCrownCap",
    head,
    [0, 0.068, -0.008],
    [0.18, 0, 0],
    [1.24, 1.0, 1.1],
    { roughness: 0.94 },
  );
  mesh(new THREE.SphereGeometry(0.052, 14, 10), C.hair, "hairTempleL", head, [0.06, 0.118, 0.0], [0.35, 0.35, 0], [1.4, 0.78, 1.1], { roughness: 0.94 });
  mesh(new THREE.SphereGeometry(0.052, 14, 10), C.hair, "hairTempleR", head, [-0.06, 0.118, 0.0], [0.35, -0.35, 0], [1.4, 0.78, 1.1], { roughness: 0.94 });
  mesh(
    new THREE.SphereGeometry(0.112, 28, 18, Math.PI * 0.82, Math.PI * 1.36, 0, Math.PI * 0.62),
    C.hair,
    "hairCap",
    head,
    [0, 0.05, -0.03],
    [0.22, 0, 0],
    [1.08, 0.92, 1.06],
    { roughness: 0.94 },
  );
  // Back-only lathe: φ=0 is +X, φ=π/2 is -Z (back). Keep the +Z face open.
  mesh(
    new THREE.LatheGeometry(
      [
        [0.04, 0.09],
        [0.1, 0.07],
        [0.118, 0.01],
        [0.112, -0.07],
        [0.085, -0.13],
        [0.045, -0.155],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      18,
      0.4,
      Math.PI * 1.22,
    ),
    C.hair,
    "hairBackShell",
    head,
    [0, 0.018, -0.02],
    null,
    [1.04, 1, 1],
    { roughness: 0.94 },
  );

  // Side-swept bangs. Fringe covers the forehead; iris stays open.
  const bangs = [
    [[0.0, 0.148, 0.0], [0.008, 0.12, 0.06], [0.016, 0.098, 0.09], [0.02, 0.086, 0.086]],
    [[0.022, 0.146, -0.005], [0.03, 0.118, 0.055], [0.04, 0.096, 0.088], [0.048, 0.084, 0.08]],
    [[-0.016, 0.148, 0.0], [-0.006, 0.12, 0.06], [0.006, 0.098, 0.09], [0.012, 0.086, 0.084]],
    [[-0.04, 0.145, -0.005], [-0.046, 0.116, 0.052], [-0.042, 0.094, 0.08], [-0.032, 0.08, 0.068]],
    [[0.05, 0.14, -0.01], [0.062, 0.11, 0.05], [0.072, 0.08, 0.07], [0.078, 0.06, 0.055]],
    [[-0.052, 0.14, -0.01], [-0.066, 0.11, 0.048], [-0.074, 0.078, 0.062], [-0.07, 0.055, 0.045]],
    [[0.078, 0.128, -0.02], [0.095, 0.08, 0.03], [0.1, 0.03, 0.02], [0.09, -0.03, 0.0]],
    [[-0.078, 0.128, -0.02], [-0.095, 0.08, 0.028], [-0.1, 0.03, 0.016], [-0.09, -0.03, -0.004]],
    [[0.01, 0.15, -0.02], [0.02, 0.125, 0.04], [0.03, 0.1, 0.078], [0.034, 0.09, 0.082]],
    [[-0.03, 0.15, -0.02], [-0.02, 0.125, 0.04], [-0.01, 0.1, 0.078], [-0.004, 0.09, 0.08]],
  ];
  bangs.forEach((pts, i) => {
    addCard(head, pts, 0.016 + (i % 3) * 0.004, `hairBang${i}`);
    addStrand(head, pts, 0.0065 + (i % 2) * 0.0018, `hairBangStrand${i}`, i % 2 ? C.hairHi : C.hair);
  });

  const sides = [
    [[0.1, 0.11, -0.01], [0.118, 0.04, 0.02], [0.112, -0.05, 0.01], [0.095, -0.13, -0.01]],
    [[0.08, 0.1, -0.04], [0.105, 0.02, -0.015], [0.1, -0.07, -0.02], [0.08, -0.15, -0.03]],
    [[0.06, 0.12, -0.06], [0.085, 0.02, -0.07], [0.078, -0.08, -0.06], [0.055, -0.16, -0.05]],
    [[0.11, 0.08, 0.02], [0.12, 0.0, 0.03], [0.1, -0.08, 0.015], [0.078, -0.14, 0.0]],
    [[-0.1, 0.11, -0.01], [-0.118, 0.04, 0.02], [-0.112, -0.05, 0.01], [-0.095, -0.13, -0.01]],
    [[-0.08, 0.1, -0.04], [-0.105, 0.02, -0.015], [-0.1, -0.07, -0.02], [-0.08, -0.15, -0.03]],
    [[-0.06, 0.12, -0.06], [-0.085, 0.02, -0.07], [-0.078, -0.08, -0.06], [-0.055, -0.16, -0.05]],
    [[-0.11, 0.08, 0.02], [-0.12, 0.0, 0.03], [-0.1, -0.08, 0.015], [-0.078, -0.14, 0.0]],
  ];
  sides.forEach((pts, i) => {
    addCard(head, pts, 0.032, `hairSide${i}`, i % 2 ? C.hairHi : C.hair);
    addStrand(head, pts, 0.012, `hairSideStrand${i}`, i % 2 ? C.hairHi : C.hair, 16);
  });

  const back = [
    [[0.0, 0.14, -0.04], [0.0, 0.04, -0.11], [0.0, -0.06, -0.11], [0.0, -0.15, -0.07]],
    [[0.045, 0.13, -0.03], [0.055, 0.03, -0.1], [0.045, -0.07, -0.1], [0.03, -0.16, -0.06]],
    [[-0.045, 0.13, -0.03], [-0.055, 0.03, -0.1], [-0.045, -0.07, -0.1], [-0.03, -0.16, -0.06]],
    [[0.08, 0.11, -0.02], [0.075, 0.0, -0.085], [0.055, -0.1, -0.075], [0.03, -0.17, -0.04]],
    [[-0.08, 0.11, -0.02], [-0.075, 0.0, -0.085], [-0.055, -0.1, -0.075], [-0.03, -0.17, -0.04]],
  ];
  back.forEach((pts, i) => {
    addCard(head, pts, 0.038, `hairBack${i}`);
    addStrand(head, pts, 0.014, `hairBackStrand${i}`, C.hair, 16);
  });

  const crown = [
    [[-0.02, 0.125, 0.02], [0.0, 0.162, -0.01], [0.03, 0.145, -0.04]],
    [[0.03, 0.122, 0.0], [0.055, 0.16, -0.03], [0.03, 0.15, -0.06]],
    [[-0.04, 0.122, -0.01], [-0.06, 0.16, -0.03], [-0.03, 0.145, -0.06]],
    [[0.0, 0.13, -0.02], [0.01, 0.17, -0.04], [-0.02, 0.155, -0.07]],
  ];
  crown.forEach((pts, i) => addCard(head, pts, 0.028, `hairCrown${i}`, C.hairHi));

  // ONE hooked ahoge from the crown — back-left, then up.
  addStrand(
    head,
    [
      [0.0, 0.158, -0.02],
      [-0.04, 0.23, -0.045],
      [-0.08, 0.3, -0.02],
      [-0.05, 0.355, 0.03],
      [0.028, 0.375, 0.055],
    ],
    0.0055,
    "ahoge",
    C.hair,
    28,
  );
}

function build() {
  const root = new THREE.Group();
  root.name = "starRaiWip";
  root.userData = {
    title: "Star Rai WIP",
    note: "Strand-hair toon mesh. Not shipping Rai. Idle rest = glare.",
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

  mesh(
    lathe(
      [
        [0.04, 0.155],
        [0.09, 0.145],
        [0.112, 0.08],
        [0.108, 0.02],
        [0.096, -0.06],
        [0.108, -0.145],
      ],
      28,
    ),
    C.white,
    "shirt",
    chest,
    [0, 0.0, 0],
    null,
    [1, 1, 1.08],
    { roughness: 0.52 },
  );
  mesh(new THREE.CylinderGeometry(0.114, 0.108, 0.055, 24), C.white, "shirtHem", hips, [0, 0.048, 0]);
  mesh(new THREE.BoxGeometry(0.022, 0.2, 0.01), C.white, "placket", chest, [0, 0.01, 0.116]);

  const collarShape = new THREE.Shape();
  collarShape.moveTo(0, 0);
  collarShape.lineTo(0.055, 0.004);
  collarShape.lineTo(0.012, 0.048);
  collarShape.closePath();
  const collarGeo = new THREE.ExtrudeGeometry(collarShape, { depth: 0.008, bevelEnabled: false });
  const collarL = new THREE.Mesh(collarGeo, toon(C.white, { roughness: 0.48 }));
  collarL.name = "collarL";
  collarL.position.set(0.01, 0.042, 0.058);
  collarL.rotation.set(-1.15, 0.35, 0.22);
  upperChest.add(collarL);
  const collarR = new THREE.Mesh(collarGeo.clone(), toon(C.white, { roughness: 0.48 }));
  collarR.name = "collarR";
  collarR.position.set(-0.01, 0.042, 0.058);
  collarR.rotation.set(-1.15, -0.35, -0.22);
  collarR.scale.x = -1;
  upperChest.add(collarR);

  for (let i = 0; i < 5; i++) {
    mesh(new THREE.SphereGeometry(0.0076, 10, 8), C.gold, `button${i + 1}`, chest, [0, 0.1 - i * 0.038, 0.122], null, null, {
      metalness: 0.58,
      roughness: 0.32,
    });
  }

  addBow(upperChest);

  for (const [arm, lower, hand, side] of [
    [lUpperArm, lLowerArm, lHand, "L"],
    [rUpperArm, rLowerArm, rHand, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.22, 14), C.skin, `arm${side}`, arm, [0, -0.11, 0], null, null, { roughness: 0.6 });
    mesh(new THREE.SphereGeometry(0.046, 14, 12), C.white, `sleevePuff${side}`, arm, [0, -0.012, 0], null, [1.05, 0.72, 1.05], { roughness: 0.52 });
    mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.07, 16), C.white, `sleeve${side}`, arm, [0, -0.028, 0]);
    mesh(cuffBand(), C.white, `cuff${side}`, arm, [0, -0.07, 0], null, null, { vertexColors: true, roughness: 0.55 });
    mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.2, 14), C.skin, `fore${side}`, lower, [0, -0.1, 0], null, null, { roughness: 0.6 });
    mesh(new THREE.SphereGeometry(0.028, 12, 10), C.skin, `handDefault${side}`, hand, [0, -0.02, 0], null, [1, 1.15, 0.75]);
    if (side === "R") {
      addWavePalm(hand);
      addPointHand(hand);
    }
  }

  mesh(pleatedSkirt(0.118, 0.158, 0.215, 18), C.white, "skirt", hips, [0, -0.08, 0], null, null, { vertexColors: true, roughness: 0.68 });
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 20), C.navy, "waistband", hips, [0, 0.028, 0]);

  for (const [up, low, foot, side] of [
    [lUpperLeg, lLowerLeg, lFoot, "L"],
    [rUpperLeg, rLowerLeg, rFoot, "R"],
  ]) {
    mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.32, 16), C.skin, `thigh${side}`, up, [0, -0.16, 0], null, null, { roughness: 0.6 });
    mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.08, 14), C.skin, `shin${side}`, low, [0, -0.04, 0], null, null, { roughness: 0.6 });
    mesh(ribbedSock(0.04, 0.034, 0.3), C.navy, `sock${side}`, low, [0, -0.182, 0]);
    mesh(new THREE.BoxGeometry(0.072, 0.032, 0.1), C.loafer, `loafer${side}`, foot, [0, -0.002, 0.018]);
    mesh(new THREE.SphereGeometry(0.038, 14, 12), C.loafer, `toe${side}`, foot, [0, 0.0, 0.062], null, [0.98, 0.62, 1.12]);
    mesh(new THREE.BoxGeometry(0.074, 0.01, 0.04), C.loaferDark, `penny${side}`, foot, [0, 0.018, 0.032]);
    mesh(new THREE.BoxGeometry(0.074, 0.01, 0.13), C.loaferDark, `sole${side}`, foot, [0, -0.024, 0.028]);
  }

  mesh(
    lathe(
      [
        [0.018, 0.128],
        [0.072, 0.118],
        [0.102, 0.085],
        [0.11, 0.042],
        [0.1, 0.008],
        [0.098, -0.022],
        [0.082, -0.05],
        [0.05, -0.072],
        [0.016, -0.082],
      ],
      32,
    ),
    C.skin,
    "headMesh",
    head,
    [0, 0.038, 0.006],
    null,
    [0.98, 1.02, 0.88],
    { roughness: 0.55 },
  );
  mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.058, 14), C.skin, "neckMesh", neck, [0, 0.01, 0], null, null, { roughness: 0.55 });
  mesh(new THREE.SphereGeometry(0.011, 10, 8), C.skinShadow, "nose", head, [0, 0.018, 0.09], null, [0.62, 0.85, 0.7]);

  function eye(side, x) {
    const g = new THREE.Group();
    g.name = `eye${side}`;
    g.position.set(x, 0.05, 0.094);
    head.add(g);

    const sclera = new THREE.Mesh(
      new THREE.ShapeGeometry(almondShape(0.023, 0.0115)),
      toon(C.white, { roughness: 0.38, side: THREE.DoubleSide, emissive: 0x222018, emissiveIntensity: 0.08 }),
    );
    sclera.name = `sclera${side}`;
    sclera.position.z = 0.002;
    g.add(sclera);

    const irisG = new THREE.Group();
    irisG.name = `iris${side}`;
    irisG.position.set(0, -0.001, 0.004);
    g.add(irisG);
    mesh(new THREE.CircleGeometry(0.0128, 28), C.amberDeep, `irisRing${side}`, irisG, [0, 0, 0], null, null, {
      roughness: 0.35,
      emissive: C.amberDeep,
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.0106, 28), C.amber, `irisDisc${side}`, irisG, [0, 0, 0.0006], null, null, {
      roughness: 0.32,
      emissive: C.amber,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.0042, 16), C.pupil, `pupil${side}`, irisG, [0, -0.0005, 0.0012], null, null, {
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.0024, 12), C.white, `catch${side}`, irisG, [0.0034, 0.004, 0.0018], null, null, {
      roughness: 0.2,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    });

    mesh(new THREE.BoxGeometry(0.042, 0.0055, 0.008), C.liner, `liner${side}`, g, [0, 0.011, 0.003], [0.15, 0, 0]);

    mesh(new THREE.BoxGeometry(0.044, 0.009, 0.007), C.lid, `lidShade${side}`, g, [0, 0.0085, 0.0035], [0.2, 0, 0]);
    const lid = mesh(
      new THREE.SphereGeometry(0.023, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      C.lid,
      side === "L" ? "lidLeft" : "lidRight",
      g,
      [0, 0.007, 0.0],
      [0.16, 0, 0],
      [1.14, 0.5, 0.4],
    );
    lid.userData.blink = true;

    mesh(
      new THREE.BoxGeometry(0.046, 0.0065, 0.007),
      C.brow,
      `brow${side}`,
      head,
      [x, 0.082, 0.082],
      [0, 0, side === "L" ? 0.26 : -0.26],
    );
    mesh(new THREE.SphereGeometry(0.016, 10, 8), C.blush, `blush${side}`, head, [x * 1.48, 0.004, 0.078], null, [1.05, 0.38, 0.28]);
    mesh(new THREE.SphereGeometry(0.026, 10, 8), C.blushHot, `blushShy${side}`, head, [x * 1.52, 0.004, 0.08], null, [1.55, 0.7, 0.4]);
  }
  eye("L", 0.036);
  eye("R", -0.036);

  mesh(new THREE.BoxGeometry(0.026, 0.0032, 0.0055), C.brow, "mouthIdle", head, [0, -0.016, 0.088]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.005), C.brow, "mouthCornerL", head, [0.015, -0.02, 0.086], [0, 0, 0.48]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.005), C.brow, "mouthCornerR", head, [-0.015, -0.02, 0.086], [0, 0, -0.48]);

  const mouthOpen = mesh(new THREE.SphereGeometry(0.016, 12, 8), C.bow, "mouthOpen", head, [0, -0.022, 0.088], null, [1.55, 0.42, 0.75]);
  mesh(new THREE.BoxGeometry(0.026, 0.007, 0.004), C.tooth, "teethTalk", mouthOpen, [0, 0.007, 0.006]);
  const mouthSmirk = mesh(new THREE.BoxGeometry(0.024, 0.0038, 0.005), C.brow, "mouthSmirk", head, [0.007, -0.014, 0.09], [0, 0, -0.28]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.004), C.brow, "smirkLift", mouthSmirk, [0.013, 0.004, 0]);
  const mouthGrit = mesh(new THREE.SphereGeometry(0.016, 12, 8), C.bow, "mouthGrit", head, [0, -0.026, 0.084], null, [1.0, 0.62, 0.72]);
  mesh(new THREE.BoxGeometry(0.016, 0.005, 0.004), C.tooth, "teethGrit", mouthGrit, [0, 0.01, 0.005]);
  mesh(new THREE.SphereGeometry(0.013, 10, 8), C.skinShadow, "mouthPout", head, [0, -0.022, 0.094], null, [1.2, 0.58, 0.72]);
  mesh(new THREE.BoxGeometry(0.02, 0.0034, 0.005), C.brow, "mouthShy", head, [0.004, -0.018, 0.089], [0, 0, 0.12]);

  const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.0032, bevelEnabled: false });
  starGeo.center();
  const earL = mesh(new THREE.SphereGeometry(0.02, 12, 10), C.skin, "earL", head, [0.1, 0.028, 0.012], [0, 0.45, 0], [0.62, 1.08, 0.52]);
  const earR = mesh(new THREE.SphereGeometry(0.02, 12, 10), C.skin, "earR", head, [-0.1, 0.028, 0.012], [0, -0.45, 0], [0.62, 1.08, 0.52]);
  const studL = new THREE.Mesh(starGeo, toon(C.gold, { metalness: 0.62, roughness: 0.28 }));
  studL.name = "starStudL";
  studL.position.set(0.016, -0.004, 0.01);
  studL.rotation.y = -0.55;
  earL.add(studL);
  const studR = new THREE.Mesh(starGeo.clone(), toon(C.gold, { metalness: 0.62, roughness: 0.28 }));
  studR.name = "starStudR";
  studR.position.set(-0.016, -0.004, 0.01);
  studR.rotation.y = 0.55;
  earR.add(studR);

  addHair(head);

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
const glb = await exporter.parseAsync(scene, { binary: true, maxTextureSize: 256 });
const buf = Buffer.from(glb);
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${buf.length} bytes)`);
