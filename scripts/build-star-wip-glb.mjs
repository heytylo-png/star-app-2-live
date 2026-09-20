/**
 * Star Rai WIP toon mesh (glTF binary).
 * HARD STOP: head/face only vs 11-face-grid.jpg. Body/clothes frozen.
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
  skin: 0xc27854,
  skinShadow: 0xa05e3c,
  hair: 0x0b0a0e,
  hairHi: 0x242028,
  white: 0xf7f4ef,
  navy: 0x1a2748,
  bow: 0xd01832,
  gold: 0xd4a017,
  amber: 0xefaa22,
  amberDeep: 0xb45c0c,
  pupil: 0x140c08,
  brow: 0x12100e,
  blush: 0xe8a090,
  blushHot: 0xe06860,
  loafer: 0x6b3d24,
  loaferDark: 0x4a2818,
  lid: 0xc07a4e,
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

function inAlmond(x, y, w, h) {
  const xn = x / w;
  const yn = y >= 0 ? y / h : y / (h * 0.64);
  return xn * xn + yn * yn <= 1.02;
}

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function eyePixel(x, y, w, h) {
  const lidStart = h * -0.02;
  const lidFull = h * 0.38;
  const irisCx = 0;
  const irisCy = -h * 0.22;
  const irisRx = w * 0.78;
  const irisRy = h * 0.92;
  const dx = (x - irisCx) / irisRx;
  const dy = (y - irisCy) / irisRy;
  const d = Math.hypot(dx, dy);

  const liner = [0.07, 0.04, 0.03];
  const lid = [0.12, 0.07, 0.05];
  const sclera = [0.97, 0.94, 0.9];
  const amberRim = [0.55, 0.28, 0.05];
  const amber = [0.95, 0.62, 0.12];
  const amberHot = [1.0, 0.78, 0.28];
  const pupil = [0.08, 0.04, 0.02];
  const catchCol = [1, 0.98, 0.94];

  let c = sclera;
  if (d < 1) {
    const u = Math.min(1, d);
    if (d < 0.3) c = pupil;
    else if (d < 0.42) c = mix3(pupil, amber, (d - 0.3) / 0.12);
    else if (d < 0.78) c = mix3(amberHot, amber, (d - 0.42) / 0.36);
    else c = mix3(amber, amberRim, (d - 0.78) / 0.22);
    const hx = (x - w * 0.22) / (w * 0.1);
    const hy = (y - h * 0.02) / (h * 0.12);
    if (hx * hx + hy * hy < 1) c = catchCol;
    const hx2 = (x + w * 0.08) / (w * 0.045);
    const hy2 = (y + h * 0.28) / (h * 0.06);
    if (hx2 * hx2 + hy2 * hy2 < 1) c = mix3(c, [0.55, 0.32, 0.12], 0.35);
  }
  if (y > lidStart) {
    const t = Math.min(1, Math.max(0, (y - lidStart) / (lidFull - lidStart + 1e-6)));
    const soft = t * t * (3 - 2 * t);
    c = mix3(c, y > lidFull * 0.55 ? liner : lid, 0.35 + 0.65 * soft);
  }
  const edge = Math.hypot(x / w, y >= 0 ? y / h : y / (h * 0.64));
  if (edge > 0.9) c = mix3(c, liner, Math.min(1, (edge - 0.9) / 0.12));
  return c;
}

function paintedEyeGeo(w, h) {
  const nx = 52;
  const ny = 30;
  const positions = [];
  const colors = [];
  const indices = [];
  const inside = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * 2 * w - w;
      const y = (j / ny) * 2 * h - h;
      const ok = inAlmond(x, y, w, h);
      inside.push(ok);
      positions.push(x, y, 0);
      const c = ok ? eyePixel(x, y, w, h) : [0.07, 0.04, 0.03];
      colors.push(c[0], c[1], c[2]);
    }
  }
  const row = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (inside[a] && inside[b] && inside[c]) indices.push(a, c, b);
      if (inside[b] && inside[c] && inside[d]) indices.push(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function paintedIrisGeo(r) {
  const segs = 28;
  const rings = 8;
  const positions = [0, 0, 0];
  const colors = [0.08, 0.04, 0.02];
  const indices = [];
  for (let k = 1; k <= rings; k++) {
    const u = k / rings;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rr = r * u;
      positions.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.82, 0);
      let c;
      if (u < 0.32) c = [0.08, 0.04, 0.02];
      else if (u < 0.45) c = mix3([0.08, 0.04, 0.02], [1.0, 0.78, 0.28], (u - 0.32) / 0.13);
      else if (u < 0.82) c = mix3([1.0, 0.78, 0.28], [0.92, 0.55, 0.1], (u - 0.45) / 0.37);
      else c = mix3([0.92, 0.55, 0.1], [0.5, 0.24, 0.04], (u - 0.82) / 0.18);
      colors.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < segs; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % segs));
  }
  for (let k = 0; k < rings - 1; k++) {
    const a0 = 1 + k * segs;
    const b0 = 1 + (k + 1) * segs;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      indices.push(a0 + i, b0 + i, a0 + i1, a0 + i1, b0 + i, b0 + i1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Hair cards. faceDir = camera-facing (+Z) for bangs/sides from the Lab camera. */
function hairRibbon(curve, width = 0.028, segs = 18, faceDir = [0, 0, 1]) {
  const pts = curve.getSpacedPoints(segs);
  const face = new THREE.Vector3(...faceDir);
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
    const t = i / segs;
    const taper = t < 0.72 ? 1 : 0.55 + 0.45 * (1 - (t - 0.72) / 0.28);
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

function addCard(parent, pts, width, name, color = C.hair, segs = 14) {
  mesh(hairRibbon(curveOf(pts), width, segs), color, name, parent, null, null, null, {
    side: THREE.DoubleSide,
    roughness: 0.93,
  });
}

function addStrand(parent, pts, radius, name, color = C.hair, segs = 14) {
  mesh(new THREE.TubeGeometry(curveOf(pts), segs, radius, 6, false), color, name, parent, null, null, null, {
    roughness: 0.93,
  });
}

function taperedTubeGeo(curve, tubularSegs, rStart, rEnd, radialSegs = 7) {
  const pts = curve.getSpacedPoints(tubularSegs);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const alt = new THREE.Vector3(1, 0, 0);
  const tan = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const ease = Math.pow(1 - t, 0.55);
    const radius = rEnd + (rStart - rEnd) * ease;
    const p = pts[i];
    const a = pts[Math.min(i + 1, tubularSegs)];
    const b = pts[Math.max(i - 1, 0)];
    tan.subVectors(a, b);
    if (tan.lengthSq() < 1e-8) tan.set(0, -1, 0);
    tan.normalize();
    N.crossVectors(up, tan);
    if (N.lengthSq() < 1e-6) N.crossVectors(alt, tan);
    N.normalize();
    B.crossVectors(tan, N).normalize();
    for (let j = 0; j <= radialSegs; j++) {
      const v = (j / radialSegs) * Math.PI * 2;
      const cx = -radius * Math.cos(v);
      const cy = radius * Math.sin(v);
      const nx = cx * N.x + cy * B.x;
      const ny = cx * N.y + cy * B.y;
      const nz = cx * N.z + cy * B.z;
      positions.push(p.x + nx, p.y + ny, p.z + nz);
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
      uvs.push(j / radialSegs, t);
    }
    if (i < tubularSegs) {
      for (let j = 0; j < radialSegs; j++) {
        const aIdx = i * (radialSegs + 1) + j;
        const bIdx = aIdx + radialSegs + 1;
        indices.push(aIdx, bIdx, aIdx + 1, bIdx, bIdx + 1, aIdx + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function addLock(parent, pts, r0, r1, name, color = C.hair, segs = 18) {
  mesh(taperedTubeGeo(curveOf(pts), segs, r0, r1, 7), color, name, parent, null, null, null, {
    roughness: 0.9,
  });
}

function displace(geo, amp, freq = 1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 17 * freq + y * 13 * freq) * Math.cos(z * 11 * freq + x * 7);
    const r = Math.hypot(x, z) || 1;
    pos.setX(i, x + (n * amp * x) / r);
    pos.setZ(i, z + (n * amp * z) / r);
    pos.setY(i, y + n * amp * 0.35);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
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

function addHair(head, withLocks) {
  // Hooked ahoge from the crown — a C, not a stick. Always kept.
  addLock(
    head,
    [
      [0.0, 0.148, -0.012],
      [-0.028, 0.198, -0.018],
      [-0.062, 0.228, 0.008],
      [-0.072, 0.212, 0.038],
      [-0.042, 0.172, 0.052],
    ],
    0.0042,
    0.0018,
    "ahoge",
    C.hair,
    22,
  );
  if (!withLocks) return;

  // 6 messy collarbone locks. Not twin-tail cards. Temples stay open.
  const locks = [
    [
      [0.07, 0.11, -0.015],
      [0.095, 0.03, -0.03],
      [0.1, -0.05, -0.04],
      [0.082, -0.12, -0.045],
    ],
    [
      [-0.068, 0.108, -0.018],
      [-0.092, 0.025, -0.032],
      [-0.098, -0.055, -0.04],
      [-0.08, -0.122, -0.044],
    ],
    [
      [0.048, 0.125, -0.04],
      [0.072, 0.015, -0.06],
      [0.06, -0.07, -0.062],
      [0.038, -0.128, -0.048],
    ],
    [
      [-0.045, 0.122, -0.038],
      [-0.07, 0.01, -0.055],
      [-0.052, -0.075, -0.06],
      [-0.028, -0.126, -0.046],
    ],
    [
      [0.01, 0.132, -0.05],
      [0.02, 0.02, -0.082],
      [0.01, -0.07, -0.072],
      [0.0, -0.12, -0.05],
    ],
    [
      [0.082, 0.09, -0.01],
      [0.1, 0.0, -0.025],
      [0.09, -0.055, -0.035],
      [0.07, -0.105, -0.04],
    ],
  ];
  locks.forEach((pts, i) => addLock(head, pts, 0.011, 0.0045, i === 0 ? "hairBang0" : `hairLock${i}`, i % 2 ? C.hairHi : C.hair, 12));
}

function build() {
  const root = new THREE.Group();
  root.name = "starRaiWip";
  root.userData = {
    title: "Star Rai WIP",
    note: "Head reset vs idle ortho grid. Not shipping Rai.",
  };

  const hips = bone("hips", root, 0, 0.92, 0);
  const spine = bone("spine", hips, 0, 0.06, 0);
  const chest = bone("chest", spine, 0, 0.14, 0);
  const upperChest = bone("upperChest", chest, 0, 0.08, 0.01);
  const neck = bone("neck", upperChest, 0, 0.032, 0);
  const head = bone("head", neck, 0, 0.038, 0.006);

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

  // Head bone world Y ≈ 1.270. Chin sits on the collar. Eyes at local 0.079.
  // Camera look-at 1.22 maps eyes → cyan / chin → red on 11-face-grid.jpg.
  mesh(
    lathe(
      [
        [0.0, 0.068],
        [0.022, 0.06],
        [0.07, 0.036],
        [0.08, 0.004],
        [0.076, -0.018],
        [0.052, -0.042],
        [0.026, -0.06],
        [0.0, -0.072],
      ],
      32,
    ),
    C.skin,
    "headMesh",
    head,
    [0, 0.072, 0.02],
    null,
    [1.02, 1.0, 0.9],
    { roughness: 0.55 },
  );
  mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.03, 14), C.skin, "neckMesh", neck, [0, 0.02, 0.008], null, null, { roughness: 0.55 });
  mesh(new THREE.SphereGeometry(0.008, 10, 8), C.skinShadow, "nose", head, [0, 0.052, 0.096], null, [0.5, 0.72, 0.48]);

  function eye(side, x) {
    const g = new THREE.Group();
    g.name = `eye${side}`;
    g.position.set(x, 0.079, 0.094);
    g.rotation.z = side === "L" ? -0.08 : 0.08;
    head.add(g);

    // Gold-circle size on the grid: iris r ≈ 0.019 world. Scale the eye UP.
    const irisR = 0.021;
    const w = 0.0225;
    const h = 0.0165;
    const liner = new THREE.Mesh(
      new THREE.ShapeGeometry(almondShape(w * 1.08, h * 1.12), 18),
      toon(C.liner, { roughness: 0.5, side: THREE.DoubleSide }),
    );
    liner.name = `liner${side}`;
    liner.position.z = 0.0002;
    g.add(liner);
    const sclera = new THREE.Mesh(
      new THREE.ShapeGeometry(almondShape(w, h), 18),
      toon(0xf3ece4, { roughness: 0.38, side: THREE.DoubleSide }),
    );
    sclera.name = `sclera${side}`;
    sclera.position.z = 0.0005;
    g.add(sclera);

    const irisG = new THREE.Group();
    irisG.name = `iris${side}`;
    irisG.position.set(0, -0.001, 0.0016);
    g.add(irisG);
    mesh(new THREE.CircleGeometry(irisR, 28), C.amber, `irisDisc${side}`, irisG, [0, 0, 0], null, [1, 0.9, 1], {
      roughness: 0.32,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.0082, 16), C.amberDeep, `irisRing${side}`, irisG, [0, -0.001, 0.0003], null, [1, 0.9, 1], {
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.0056, 12), C.pupil, `pupil${side}`, irisG, [0, -0.0012, 0.0005], null, null, {
      roughness: 0.45,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.CircleGeometry(0.003, 10), C.white, `catch${side}`, irisG, [0.0065, 0.004, 0.0008], null, null, {
      roughness: 0.18,
      side: THREE.DoubleSide,
    });

    const lid = mesh(
      new THREE.BoxGeometry(0.05, 0.01, 0.005),
      C.skin,
      side === "L" ? "lidLeft" : "lidRight",
      g,
      [0, 0.013, 0.002],
      [0.1, 0, 0],
    );
    lid.userData.blink = true;
    mesh(new THREE.BoxGeometry(0.05, 0.0022, 0.0038), C.liner, `lash${side}`, g, [0, 0.008, 0.004]);

    mesh(
      new THREE.BoxGeometry(0.044, 0.0028, 0.0045),
      C.brow,
      `brow${side}`,
      head,
      [x * 0.92, 0.094, 0.09],
      [0.05, 0, side === "L" ? 0.34 : -0.34],
    );
    mesh(new THREE.SphereGeometry(0.014, 8, 6), C.blushHot, `blushShy${side}`, head, [x * 1.35, 0.038, 0.08], null, [1.1, 0.4, 0.2]);
  }
  eye("L", 0.044);
  eye("R", -0.044);

  mesh(new THREE.BoxGeometry(0.018, 0.0015, 0.0036), C.brow, "mouthIdle", head, [0, 0.027, 0.09]);
  mesh(new THREE.BoxGeometry(0.006, 0.0015, 0.0032), C.brow, "mouthCornerL", head, [0.011, 0.025, 0.088], [0, 0, -0.45]);
  mesh(new THREE.BoxGeometry(0.006, 0.0015, 0.0032), C.brow, "mouthCornerR", head, [-0.011, 0.025, 0.088], [0, 0, 0.45]);

  const mouthOpen = mesh(new THREE.SphereGeometry(0.016, 12, 8), C.bow, "mouthOpen", head, [0, 0.024, 0.086], null, [1.55, 0.42, 0.75]);
  mesh(new THREE.BoxGeometry(0.026, 0.007, 0.004), C.tooth, "teethTalk", mouthOpen, [0, 0.007, 0.006]);
  const mouthSmirk = mesh(new THREE.BoxGeometry(0.024, 0.0038, 0.005), C.brow, "mouthSmirk", head, [0.007, 0.03, 0.088], [0, 0, -0.28]);
  mesh(new THREE.BoxGeometry(0.01, 0.003, 0.004), C.brow, "smirkLift", mouthSmirk, [0.013, 0.004, 0]);
  const mouthGrit = mesh(new THREE.SphereGeometry(0.016, 12, 8), C.bow, "mouthGrit", head, [0, 0.02, 0.084], null, [1.0, 0.62, 0.72]);
  mesh(new THREE.BoxGeometry(0.016, 0.005, 0.004), C.tooth, "teethGrit", mouthGrit, [0, 0.01, 0.005]);
  mesh(new THREE.SphereGeometry(0.013, 10, 8), C.skinShadow, "mouthPout", head, [0, 0.024, 0.092], null, [1.2, 0.58, 0.72]);
  mesh(new THREE.BoxGeometry(0.02, 0.0034, 0.005), C.brow, "mouthShy", head, [0.004, 0.027, 0.087], [0, 0, 0.12]);

  const starGeo = new THREE.ExtrudeGeometry(starShape(0.006, 0.0024), { depth: 0.0022, bevelEnabled: false });
  starGeo.center();
  const earL = mesh(new THREE.SphereGeometry(0.016, 12, 10), C.skin, "earL", head, [0.092, 0.068, 0.02], [0, 0.5, 0], [0.52, 1.0, 0.46]);
  const earR = mesh(new THREE.SphereGeometry(0.016, 12, 10), C.skin, "earR", head, [-0.092, 0.068, 0.02], [0, -0.5, 0], [0.52, 1.0, 0.46]);
  const studL = new THREE.Mesh(starGeo, toon(C.gold, { metalness: 0.55, roughness: 0.35 }));
  studL.name = "starStudL";
  studL.position.set(0.008, -0.01, 0.012);
  studL.rotation.y = -0.3;
  earL.add(studL);
  const studR = new THREE.Mesh(starGeo.clone(), toon(C.gold, { metalness: 0.55, roughness: 0.35 }));
  studR.name = "starStudR";
  studR.position.set(-0.008, -0.01, 0.012);
  studR.rotation.y = 0.3;
  earR.add(studR);

  addHair(head, true);

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
