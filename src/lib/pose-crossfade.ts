import type { SpriteLayer } from "./rai.ts";

/** A body/talk sheet on the stage, with its stacking order. */
export type CrossfadeLayer = SpriteLayer & { z: number };

/**
 * Incoming sheets sit at opacity 0 for this long (one paint) before their
 * opacity goes to target, so CSS interpolates 0 → 1 instead of cutting in.
 */
export const CROSSFADE_INCOMING_DELAY_MS = 48;

export type CrossfadeTimers = {
  set: (fn: () => void, ms: number) => number;
  clear: (handle: number) => void;
};

export type CrossfadeUpdateOpts = {
  /** Cut instead of fading (a pose/talk/emotion swap that cancelled a blink). */
  snap: boolean;
  /** Layers that always cut on (lids, talk overlay while talking). */
  isInstant: (layer: SpriteLayer) => boolean;
  /** Fade length for an outgoing layer. */
  fadeMs: (layer: SpriteLayer) => number;
  /**
   * Snapshot a sheet takes as it leaves the stage. The puppet maps the rest
   * layer to the closed 01 frame, so a pose change mid-chew (or mid-blink)
   * fades out a closed mouth, not whatever open frame was up.
   */
  outgoing?: (layer: CrossfadeLayer) => CrossfadeLayer;
};

/**
 * Crossfade pool for the PNG puppet: incoming fades from 0, outgoing fades
 * to 0, both overlap. Rest blink keeps IDLE_REST_LAYER_ID, so a frame step
 * updates that one layer. `onChange` receives the layers to render, sorted
 * by z. Timers are injected so the handoff can be tested without a DOM.
 */
export class PoseCrossfadePool {
  private prevIds = new Map<string, CrossfadeLayer>();
  private fadeTimers = new Map<string, number>();
  private fadingIn = new Set<string>();
  private fadeHandle = 0;
  /** Outgoing ids whose opacity-0 is waiting on the shared fade-in timer. */
  private pendingOutIds: string[] = [];

  private readonly timers: CrossfadeTimers;
  private readonly onChange: (layers: CrossfadeLayer[]) => void;

  constructor(timers: CrossfadeTimers, onChange: (layers: CrossfadeLayer[]) => void) {
    this.timers = timers;
    this.onChange = onChange;
  }

  /** Current layers (sorted by z), as last sent to `onChange`. */
  layers(): CrossfadeLayer[] {
    return Array.from(this.prevIds.values()).sort((a, b) => a.z - b.z);
  }

  private emit() {
    this.onChange(this.layers());
  }

  private removeLater(id: string, ms: number, dropPending: boolean) {
    const timer = this.timers.set(() => {
      this.prevIds.delete(id);
      this.fadeTimers.delete(id);
      if (dropPending) this.pendingOutIds = this.pendingOutIds.filter((pending) => pending !== id);
      this.emit();
    }, ms);
    this.fadeTimers.set(id, timer);
  }

  update(plates: readonly SpriteLayer[], opts: CrossfadeUpdateOpts) {
    const { snap, isInstant, fadeMs } = opts;
    const outgoingSnapshot = opts.outgoing ?? ((layer: CrossfadeLayer) => layer);
    if (this.fadeHandle) {
      this.timers.clear(this.fadeHandle);
      this.fadeHandle = 0;
    }

    const next = new Map<string, CrossfadeLayer>();
    plates.forEach((layer, i) => {
      // Body starts at 1 so sheets sit above .rai-rig::after (contact shadow at z 0).
      const z = layer.role === "talk" ? 20 + i : i + 1;
      next.set(layer.id, { ...layer, z });
    });

    const merged = new Map(this.prevIds);
    const incoming: Array<[string, CrossfadeLayer]> = [];
    const firstPaint = this.prevIds.size === 0;

    for (const [id, layer] of next) {
      const existingTimer = this.fadeTimers.get(id);
      if (existingTimer) {
        this.timers.clear(existingTimer);
        this.fadeTimers.delete(id);
      }
      const prev = merged.get(id);
      if (!prev) {
        if (isInstant(layer) || firstPaint || snap) {
          // First paint and cancelled blinks snap on — fading from empty left a blank or a stuck lid.
          merged.set(id, layer);
        } else {
          // Incoming on top at 0 so the outgoing PNG stays visible until the fade starts.
          merged.set(id, { ...layer, opacity: 0, z: 10 + layer.z });
          this.fadingIn.add(id);
          incoming.push([id, layer]);
        }
      } else if (this.fadingIn.has(id) && !snap) {
        // Keep the fade-in; don't snap to target when talkPhase retriggers.
        merged.set(id, { ...layer, opacity: prev.opacity, z: prev.z });
        // The shared fade-in timer was cleared at the top of update(); re-arm
        // it, or this sheet stays at opacity 0 while the old one fades out.
        incoming.push([id, layer]);
      } else {
        if (snap) this.fadingIn.delete(id);
        merged.set(id, layer);
      }
    }

    const incomingDelay = CROSSFADE_INCOMING_DELAY_MS;
    // Start the outgoing fade in the same tick as the incoming one, so a long
    // main-thread task cannot let the compositor finish the fade-out first.
    const deferOut = incoming.length > 0;
    const outgoing: string[] = [];
    const queueOut = (id: string) => {
      if (!outgoing.includes(id)) outgoing.push(id);
    };

    for (const [id, layer] of merged) {
      // A fade-in cancelled before it started (switched away within the 48ms
      // paint) is still at opacity 0. Drop it; kept, a later switch back to
      // this pose would "keep" that 0 and leave an empty stage.
      if (!next.has(id) && layer.opacity <= 0 && this.fadingIn.has(id)) {
        this.fadingIn.delete(id);
        merged.delete(id);
        const strandedTimer = this.fadeTimers.get(id);
        if (strandedTimer) this.timers.clear(strandedTimer);
        this.fadeTimers.delete(id);
        continue;
      }
      if (!next.has(id) && layer.opacity > 0) {
        this.fadingIn.delete(id);
        const leaving = outgoingSnapshot(layer);
        if (deferOut) {
          queueOut(id);
          if (leaving !== layer) merged.set(id, leaving);
        } else merged.set(id, { ...leaving, opacity: 0 });
        const existingTimer = this.fadeTimers.get(id);
        if (existingTimer) this.timers.clear(existingTimer);
        this.removeLater(id, fadeMs(layer) + 40 + (deferOut ? incomingDelay : 0), true);
      }
    }

    // A newer crossfade clears the 48ms timer. Ids still waiting must fade
    // with this one, or drop if this frame brought them back.
    for (const id of this.pendingOutIds) {
      if (next.has(id) || outgoing.includes(id)) continue;
      const layer = merged.get(id);
      if (!layer || layer.opacity <= 0) continue;
      if (deferOut) {
        queueOut(id);
        if (!this.fadeTimers.has(id)) this.removeLater(id, fadeMs(layer) + 40 + incomingDelay, true);
      } else {
        merged.set(id, { ...layer, opacity: 0 });
        if (!this.fadeTimers.has(id)) this.removeLater(id, fadeMs(layer) + 40, false);
      }
    }
    this.pendingOutIds = deferOut ? outgoing.slice() : [];

    this.prevIds = merged;
    this.emit();

    if (incoming.length) {
      const batch = outgoing.slice();
      // Wait one paint at opacity 0 so CSS can interpolate 0 → target (not a hard cut in).
      this.fadeHandle = this.timers.set(() => {
        this.fadeHandle = 0;
        for (const id of batch) {
          if (!this.pendingOutIds.includes(id)) continue;
          const layer = this.prevIds.get(id);
          if (layer) this.prevIds.set(id, { ...layer, opacity: 0 });
        }
        const dropped = new Set(batch);
        this.pendingOutIds = this.pendingOutIds.filter((id) => !dropped.has(id));
        for (const [id, layer] of incoming) {
          if (!this.prevIds.has(id)) continue;
          this.prevIds.set(id, layer);
          this.fadingIn.delete(id);
        }
        this.emit();
      }, incomingDelay);
    }
  }

  dispose() {
    for (const t of this.fadeTimers.values()) this.timers.clear(t);
    this.fadeTimers.clear();
    if (this.fadeHandle) this.timers.clear(this.fadeHandle);
    this.fadeHandle = 0;
  }
}
