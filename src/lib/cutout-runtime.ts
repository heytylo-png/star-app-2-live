/**
 * Tiny Spine-shaped 2D cutout runtime (animation track #2).
 *
 * Not Esoteric spine-ts and not DragonBones — those need a paid Spine license
 * or a stale MIT stack + Pixi. This player is original, Canvas-friendly, and
 * loads a simplified JSON (bones / slots / region-or-shape attachments /
 * rotate-translate-scale timelines). Official Spine JSON can replace it later
 * behind the same `?spine=1` flag; see SPINE.md.
 *
 * Missing attachments → caller falls back to the PNG puppet.
 */

export type CutoutBone = {
  name: string;
  parent?: string;
  x: number;
  y: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  length?: number;
};

export type CutoutShape =
  | {
      type: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "polygon";
      points: number[];
      fill: string;
      stroke?: string;
      strokeWidth?: number;
    };

export type CutoutAttachment = {
  name: string;
  x?: number;
  y?: number;
  rotation?: number;
  width?: number;
  height?: number;
  path?: string;
  shapes?: CutoutShape[];
};

export type CutoutSlot = {
  name: string;
  bone: string;
  attachment?: string;
  attachments: Record<string, CutoutAttachment>;
};

export type CutoutKeyframe = {
  time: number;
  value: number;
};

export type CutoutBoneTimeline = {
  rotate?: CutoutKeyframe[];
  x?: CutoutKeyframe[];
  y?: CutoutKeyframe[];
  scaleX?: CutoutKeyframe[];
  scaleY?: CutoutKeyframe[];
};

export type CutoutClip = {
  duration: number;
  loop?: boolean;
  bones?: Record<string, CutoutBoneTimeline>;
  slots?: Record<string, { attachment?: Array<{ time: number; name: string }> }>;
};

export type CutoutTalk = {
  bone: string;
  slot?: string;
  closed?: string;
  open?: string;
  maxDeg: number;
};

export type CutoutSkeleton = {
  name: string;
  width: number;
  height: number;
  fps?: number;
  bones: CutoutBone[];
  slots: CutoutSlot[];
  animations: Record<string, CutoutClip>;
  poseToAnimation?: Record<string, string>;
  talk?: CutoutTalk;
  /** Human-facing: this rig is not Star Rai. */
  demo?: boolean;
};

export type EvaluatedSlot = {
  name: string;
  bone: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  attachment: CutoutAttachment;
};

export type BoneLocals = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export const CUTOUT_MIX_S = 0.38;

export type CutoutRigStatus = {
  ready: boolean;
  missing: string[];
  demo: boolean;
};

export function boneOrder(bones: CutoutBone[]): string[] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const bone = byName.get(name);
    if (!bone) return;
    if (bone.parent) visit(bone.parent);
    seen.add(name);
    out.push(name);
  };
  for (const bone of bones) visit(bone.name);
  return out;
}

export function restLocals(bone: CutoutBone): BoneLocals {
  return {
    x: bone.x,
    y: bone.y,
    rotation: bone.rotation ?? 0,
    scaleX: bone.scaleX ?? 1,
    scaleY: bone.scaleY ?? 1,
  };
}

export function sampleKeys(keys: CutoutKeyframe[] | undefined, time: number, duration: number, loop: boolean): number | undefined {
  if (!keys?.length) return undefined;
  if (keys.length === 1) return keys[0]!.value;
  let t = time;
  if (loop && duration > 0) {
    t = time % duration;
    if (t < 0) t += duration;
  } else if (duration > 0) {
    t = Math.min(time, duration);
  }
  if (t <= keys[0]!.time) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (t >= last.time) {
    if (!loop) return last.value;
    const first = keys[0]!;
    const span = duration - last.time + first.time;
    if (span <= 1e-6) return last.value;
    const u = (t - last.time) / span;
    return last.value + (first.value - last.value) * u;
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const u = span <= 1e-6 ? 0 : (t - a.time) / span;
      return a.value + (b.value - a.value) * u;
    }
  }
  return last.value;
}

export function lerpLocals(a: BoneLocals, b: BoneLocals, t: number): BoneLocals {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    rotation: a.rotation + (b.rotation - a.rotation) * u,
    scaleX: a.scaleX + (b.scaleX - a.scaleX) * u,
    scaleY: a.scaleY + (b.scaleY - a.scaleY) * u,
  };
}

export function applyClip(skel: CutoutSkeleton, clip: CutoutClip | undefined, time: number): Map<string, BoneLocals> {
  const locals = new Map<string, BoneLocals>();
  for (const bone of skel.bones) locals.set(bone.name, restLocals(bone));
  if (!clip) return locals;
  const loop = clip.loop !== false;
  for (const [name, timeline] of Object.entries(clip.bones ?? {})) {
    const base = locals.get(name);
    if (!base) continue;
    const rot = sampleKeys(timeline.rotate, time, clip.duration, loop);
    const x = sampleKeys(timeline.x, time, clip.duration, loop);
    const y = sampleKeys(timeline.y, time, clip.duration, loop);
    const sx = sampleKeys(timeline.scaleX, time, clip.duration, loop);
    const sy = sampleKeys(timeline.scaleY, time, clip.duration, loop);
    locals.set(name, {
      x: x ?? base.x,
      y: y ?? base.y,
      rotation: rot ?? base.rotation,
      scaleX: sx ?? base.scaleX,
      scaleY: sy ?? base.scaleY,
    });
  }
  return locals;
}

export function worldFromLocals(skel: CutoutSkeleton, locals: Map<string, BoneLocals>): Map<string, BoneLocals> {
  const world = new Map<string, BoneLocals>();
  const byName = new Map(skel.bones.map((b) => [b.name, b]));
  for (const name of boneOrder(skel.bones)) {
    const bone = byName.get(name);
    const local = locals.get(name);
    if (!bone || !local) continue;
    const parent = bone.parent ? world.get(bone.parent) : undefined;
    if (!parent) {
      world.set(name, { ...local });
      continue;
    }
    const rad = (parent.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    world.set(name, {
      x: parent.x + (local.x * parent.scaleX * cos - local.y * parent.scaleY * sin),
      y: parent.y + (local.x * parent.scaleX * sin + local.y * parent.scaleY * cos),
      rotation: parent.rotation + local.rotation,
      scaleX: parent.scaleX * local.scaleX,
      scaleY: parent.scaleY * local.scaleY,
    });
  }
  return world;
}

export function clipForPose(skel: CutoutSkeleton, pose: string): { name: string; clip: CutoutClip } {
  const mapped = skel.poseToAnimation?.[pose] ?? (skel.animations[pose] ? pose : "idle");
  const name = skel.animations[mapped] ? mapped : "idle";
  const clip = skel.animations[name] ?? { duration: 1, loop: true, bones: {} };
  return { name, clip };
}

export function slotAttachmentAt(slot: CutoutSlot, clip: CutoutClip | undefined, time: number): CutoutAttachment | null {
  let key = slot.attachment;
  const track = clip?.slots?.[slot.name]?.attachment;
  if (track?.length) {
    const loop = clip?.loop !== false;
    const duration = clip?.duration ?? 1;
    let t = time;
    if (loop && duration > 0) t = ((time % duration) + duration) % duration;
    let picked = track[0]!.name;
    for (const kf of track) {
      if (kf.time <= t) picked = kf.name;
    }
    key = picked;
  }
  if (!key) {
    const first = Object.values(slot.attachments)[0];
    return first ?? null;
  }
  return slot.attachments[key] ?? null;
}

export function evaluateSlots(
  skel: CutoutSkeleton,
  world: Map<string, BoneLocals>,
  clip: CutoutClip | undefined,
  time: number,
  talk?: { talking: boolean; amplitude: number },
): EvaluatedSlot[] {
  const out: EvaluatedSlot[] = [];
  for (const slot of skel.slots) {
    const bone = world.get(slot.bone);
    if (!bone) continue;
    let attachment = slotAttachmentAt(slot, clip, time);
    if (talk?.talking && skel.talk?.slot === slot.name && skel.talk.open && talk.amplitude > 0.22) {
      attachment = slot.attachments[skel.talk.open] ?? attachment;
    } else if (skel.talk?.slot === slot.name && skel.talk.closed && !talk?.talking) {
      attachment = slot.attachments[skel.talk.closed] ?? attachment;
    }
    if (!attachment) continue;
    const ar = ((attachment.rotation ?? 0) * Math.PI) / 180;
    const ax = attachment.x ?? 0;
    const ay = attachment.y ?? 0;
    const rad = (bone.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ox = ax * Math.cos(ar) - ay * Math.sin(ar);
    const oy = ax * Math.sin(ar) + ay * Math.cos(ar);
    out.push({
      name: slot.name,
      bone: slot.bone,
      x: bone.x + (ox * bone.scaleX * cos - oy * bone.scaleY * sin),
      y: bone.y + (ox * bone.scaleX * sin + oy * bone.scaleY * cos),
      rotation: bone.rotation + (attachment.rotation ?? 0),
      scaleX: bone.scaleX,
      scaleY: bone.scaleY,
      attachment,
    });
  }
  return out;
}

export function imagePaths(skel: CutoutSkeleton): string[] {
  const paths = new Set<string>();
  for (const slot of skel.slots) {
    for (const att of Object.values(slot.attachments)) {
      if (att.path) paths.add(att.path);
    }
  }
  return [...paths];
}

export function rigStatus(skel: CutoutSkeleton, present: Set<string>): CutoutRigStatus {
  const missing = imagePaths(skel).filter((p) => !present.has(p));
  const needsImages = imagePaths(skel).length > 0;
  const ready = !needsImages || missing.length === 0;
  return { ready, missing, demo: Boolean(skel.demo) };
}

export function parseCutoutSkeleton(raw: unknown): CutoutSkeleton {
  if (!raw || typeof raw !== "object") throw new Error("cutout skeleton: not an object");
  const data = raw as CutoutSkeleton;
  if (!data.name || !Array.isArray(data.bones) || !Array.isArray(data.slots)) {
    throw new Error("cutout skeleton: missing name/bones/slots");
  }
  if (!data.bones.some((b) => b.name === "root")) {
    throw new Error("cutout skeleton: root bone required");
  }
  return data;
}

export type CutoutPlayerOpts = {
  reduced?: boolean;
  look?: number;
  talking?: boolean;
  amplitude?: number;
};

export class CutoutPlayer {
  readonly skeleton: CutoutSkeleton;
  private time = 0;
  private pose = "idle";
  private clipName = "idle";
  private mixFrom: Map<string, BoneLocals> | null = null;
  private mixT = 1;
  private look = 0;
  private talking = false;
  private amplitude = 0;
  private reduced = false;

  constructor(skeleton: CutoutSkeleton) {
    this.skeleton = skeleton;
    const { name } = clipForPose(skeleton, "idle");
    this.clipName = name;
  }

  setPose(pose: string): void {
    const { name } = clipForPose(this.skeleton, pose);
    if (name === this.clipName && pose === this.pose) return;
    this.mixFrom = this.currentLocals();
    this.mixT = 0;
    this.pose = pose;
    this.clipName = name;
    this.time = 0;
  }

  setTalk(talking: boolean, amplitude: number): void {
    this.talking = talking;
    this.amplitude = Math.max(0, Math.min(1, amplitude));
  }

  setLook(look: number): void {
    this.look = Math.max(-1, Math.min(1, look));
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(dt: number): void {
    if (!this.reduced) {
      this.time += dt;
      if (this.mixT < 1) this.mixT = Math.min(1, this.mixT + dt / CUTOUT_MIX_S);
    }
  }

  evaluate(): EvaluatedSlot[] {
    const locals = this.currentLocals();
    this.applyLookAndTalk(locals);
    const world = worldFromLocals(this.skeleton, locals);
    const clip = this.skeleton.animations[this.clipName];
    return evaluateSlots(this.skeleton, world, clip, this.reduced ? 0 : this.time, {
      talking: this.talking,
      amplitude: this.amplitude,
    });
  }

  private currentLocals(): Map<string, BoneLocals> {
    const clip = this.skeleton.animations[this.clipName];
    const to = applyClip(this.skeleton, clip, this.reduced ? 0 : this.time);
    if (!this.mixFrom || this.mixT >= 1) return to;
    const mixed = new Map<string, BoneLocals>();
    for (const bone of this.skeleton.bones) {
      const a = this.mixFrom.get(bone.name) ?? restLocals(bone);
      const b = to.get(bone.name) ?? restLocals(bone);
      mixed.set(bone.name, lerpLocals(a, b, this.mixT));
    }
    return mixed;
  }

  private applyLookAndTalk(locals: Map<string, BoneLocals>): void {
    const hip = locals.get("hip");
    if (hip) {
      hip.rotation += this.look * -2.2;
      hip.x += this.look * 6;
    }
    const head = locals.get("head");
    if (head) head.rotation += this.look * 5.5;
    const ahoge = locals.get("ahoge");
    if (ahoge) ahoge.rotation += this.look * 8;
    const talk = this.skeleton.talk;
    if (talk && this.talking && !this.reduced) {
      const jaw = locals.get(talk.bone);
      if (jaw) {
        const syn = 0.25 + 0.55 * Math.abs(Math.sin(this.time * 11)) * Math.abs(Math.sin(this.time * 3.3));
        const jawAmt = Math.max(this.amplitude, syn * 0.85);
        jaw.rotation += jawAmt * talk.maxDeg;
        jaw.y += jawAmt * 2.2;
      }
    }
  }
}

export function drawAttachment(
  ctx: CanvasRenderingContext2D,
  slot: EvaluatedSlot,
  images: Map<string, CanvasImageSource>,
): void {
  const { attachment } = slot;
  ctx.save();
  ctx.translate(slot.x, slot.y);
  ctx.rotate((slot.rotation * Math.PI) / 180);
  ctx.scale(slot.scaleX, slot.scaleY);
  if (attachment.path) {
    const img = images.get(attachment.path);
    if (img) {
      const w = attachment.width ?? ("width" in img ? Number(img.width) : 0);
      const h = attachment.height ?? ("height" in img ? Number(img.height) : 0);
      ctx.drawImage(img as CanvasImageSource, -w / 2, -h / 2, w, h);
    }
  }
  for (const shape of attachment.shapes ?? []) {
    ctx.beginPath();
    if (shape.type === "ellipse") {
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    } else if (shape.type === "rect") {
      const r = shape.rx ?? 0;
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(shape.x, shape.y, shape.width, shape.height, r);
      } else {
        ctx.rect(shape.x, shape.y, shape.width, shape.height);
      }
    } else {
      const pts = shape.points;
      if (pts.length >= 4) {
        ctx.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
        ctx.closePath();
      }
    }
    ctx.fillStyle = shape.fill;
    ctx.fill();
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.strokeWidth ?? 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCutout(
  ctx: CanvasRenderingContext2D,
  skel: CutoutSkeleton,
  slots: EvaluatedSlot[],
  images: Map<string, CanvasImageSource>,
  dest: { width: number; height: number },
): void {
  ctx.clearRect(0, 0, dest.width, dest.height);
  const padX = dest.width * 0.08;
  const padY = dest.height * 0.04;
  const scale = Math.min((dest.width - padX * 2) / skel.width, (dest.height - padY * 2) / skel.height);
  const ox = (dest.width - skel.width * scale) / 2;
  const oy = padY + dest.height * 0.02;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  for (const slot of slots) drawAttachment(ctx, slot, images);
  ctx.restore();
}
