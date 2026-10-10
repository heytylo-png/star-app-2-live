import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  HIP_CLIP_FRAMES,
  HIP_CLIP_LAST,
  HIP_CLIP_RETRY_MS,
  HIP_CLIP_WAIT_MAX_MS,
  HipClipDriver,
  HipClipPlayer,
  hipClipSupported,
  hipClipTimeMs,
  loadHipClip,
  type ClipView,
} from "@/lib/hip-clip";
import {
  blinkPassInFlight,
  canIdleBlink,
  canIdleMouth,
  deferredSpriteUrls,
  IDLE_BLINK_ENABLED,
  IDLE_MOUTH_ENABLED,
  IDLE_REST_LAYER_ID,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  bridgeFrameSrc,
  hipClipSrc,
  idleRestSrc,
  isRetiredBlinkSrc,
  layersFor,
  DEFAULT_EMOTION,
  SPRITES,
  holdsSmugBeat,
  holdsWaveBeat,
  holdsPoutBeat,
  isSmugPathSheetSrc,
  isWavePathSheetSrc,
  isPoutPathSheetSrc,
  openRestFallback,
  POSE_CROSSFADE_MS,
  priorityPoseSrc,
  stagePreloadOrder,
  smugBeatSheetUrls,
  smugClipUrls,
  waveClipUrls,
  poutClipUrls,
  type PosePhase,
  USE_EXPO_TALK_BUST,
  type EmotionId,
  type PoseId,
  type SpriteLayer,
} from "@/lib/rai";
import {
  IDLE_BEAT_FADE_MS,
  IDLE_BLINK_FIRST_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  idleBlinkSchedule,
  idleBlinkStepName,
  idleMouthStepName,
  idleMouthSyllable,
  isHypeLine,
  puppetIdleMotion,
  puppetRigTransform,
  type IdleBlinkFrame,
  type IdleMouthFrame,
  type IdleMouthStep,
} from "@/lib/rai-motion";
import {
  BRIDGE_WAIT_MAX_MS,
  BRIDGE_WAIT_RETRY_MS,
  BridgeDriver,
  PoseBridge,
  bridgeGate,
  bridgeDwellsFor,
  bridgeKeyOfPlates,
  SmugReleaseGate,
  type SmugGateStep,
  bridgeWantsFrames,
  parseClipFrame,
  SMUG_CLIP_BOX,
  WAVE_CLIP_BOX,
  POUT_CLIP_BOX,
  SMUG_CLIP_SHEET,
  SMUG_IN_CLIP,
  SMUG_OUT_CLIP,
  WAVE_IN_CLIP,
  WAVE_OUT_CLIP,
  POUT_IN_CLIP,
  POUT_OUT_CLIP,
  type BridgeTimers,
  type ClipPair,
} from "@/lib/pose-bridge";
import { SmugClipPlayer, smugClipPlayerSupported } from "@/lib/smug-clip-player";
import type { BridgeClipPlayer } from "@/lib/pose-bridge";
import { PoseCrossfadePool, type CrossfadeLayer } from "@/lib/pose-crossfade";
import { punchedSpriteUrl } from "@/lib/punch-white";
import { decodeSheet } from "@/lib/sheet-decode";
import { sheetBox } from "@/lib/rai-sheet-box";
import { HipClipLayer } from "@/components/hip-clip-layer";
import { paintHipPicture } from "@/lib/hip-clip-paint";
import { buildId, debugOverlayOn } from "@/lib/build-id";
import {
  readSmugRelease,
  setPoseStageMounted,
  setPosePhase,
  setSmugReleasePending,
  subscribeSmugRelease,
} from "@/lib/pose-phase";
import { cn } from "@/lib/utils";

/** Bridge canvases on the stage: smug in/out, wave win/wout, pout pin/pout. */
type BridgeStageKey = "in" | "out" | "win" | "wout" | "pin" | "pout";
/** Each clip pair's [intro, rest] canvases. */
const BRIDGE_STAGE_KEYS: Record<ClipPair, readonly [BridgeStageKey, BridgeStageKey]> = {
  smug: ["in", "out"],
  wave: ["win", "wout"],
  pout: ["pin", "pout"],
};
/** An intro canvas is on stage (1085 / 1126 / 1158 still coming in). */
function isIntroStageKey(key: BridgeStageKey | null): boolean {
  return key === "in" || key === "win" || key === "pin";
}

type PuppetProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  /** Line she is saying. Only read for the hype (05 wide) mouth gate. */
  spokenLine?: string;
  /**
   * Frame from real TTS loudness. `null` keeps the timed chew.
   * A number (including 0, the rest frame) replaces the timer.
   */
  audioMouth?: IdleMouthFrame | null;
  className?: string;
};

type DisplayLayer = CrossfadeLayer;

const LOOK_LERP = 6.5; // higher = snappier; frame-rate independent
const AMP_LERP = 10;
const DEADZONE = 0.04;
/** Immediate jaw kick when talk starts so first frames aren't stuck closed. */
const TALK_AMP_KICK = 0.42;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expApproach(current: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return lerp(current, target, k);
}

/** Synthetic jaw so visemes cycle even when TTS amp is flat/near-zero. */
function syntheticJaw(t: number): number {
  return 0.25 + 0.55 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.3));
}

function isInstantLayer(layer: SpriteLayer, talking: boolean): boolean {
  if (layer.role === "eyes") return true;
  return talking && (layer.id === "talk" || layer.role === "talk");
}

/** off = pose timing. snap = cut to the new sheet when a blink is cancelled. */
type BlinkFadeMode = "off" | "snap";

function fadeMsFor(layer: SpriteLayer, talking: boolean, blinkMode: BlinkFadeMode): number {
  if (isInstantLayer(layer, talking)) return 0;
  if (layer.id.startsWith("idle-beat")) return IDLE_BEAT_FADE_MS;
  if (layer.id === "expo-talk") return 180;
  // Pose / talk / emotion swap mid-blink: cut, don't ease the closed frame out.
  if (blinkMode === "snap") return 0;
  return POSE_CROSSFADE_MS;
}

/**
 * Star Rai 2D puppet — planted idle life, look-at lean, talk/mood sheets.
 * Studio-white cards are punched to alpha. Layers crossfade by stable id.
 * Spoken bubble holds talk/mood through the line; frown idle is rest-only.
 * Rest idle is one full-frame image. Blink is on (IDLE_BLINK_ENABLED):
 * hard cuts 02 → 03 → 04 → 03 → 02 in ~300ms, then hold 01.
 * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
 * No eye strip, no hole overlay, no second <img> for lids. Expo bust
 * mouth/eye crops stay off. Dedicated poses do not blink.
 * Talking on the idle pose (IDLE_MOUTH_ENABLED) hard-cuts the same rest
 * <img> through the baked idle_mouth sheets; blink waits until she is done.
 */
/**
 * Calls `fn` at the start of the next animation frame, i.e. once the commit that
 * set the bridge frame has reached a paint (the frame it is drawn in), with a
 * 500 ms timer backstop for a page whose frames are throttled.
 */
/** Idle sits this long after 1084 has painted before the next pose takes the stage (≈150 ms idle on screen with the paint + crossfade start). */
const SMUG_EXIT_LAND_MS = 70;

/** Plain idle rest (closed mouth, open eyes): where 1084 lands before the next pose. */
function smugExitRestPlates(reducedMotion: boolean): SpriteLayer[] {
  return layersFor({
    pose: "idle",
    emotion: DEFAULT_EMOTION,
    talking: false,
    amplitude: 0,
    angle: 0,
    talkPhase: 0,
    blink: 0,
    mouth: 0,
    idleBeat: "none",
    reducedMotion,
  }).filter((layer) => layer.role !== "eyes" && !isRetiredBlinkSrc(layer.src));
}

function afterPaintFrame(fn: () => void): () => void {
  let done = false;
  let raf = 0;
  let backstop = 0;
  const cancel = () => {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    if (backstop) window.clearTimeout(backstop);
  };
  const run = () => {
    if (done) return;
    cancel();
    fn();
  };
  raf = requestAnimationFrame(() => {
    raf = 0;
    run();
  });
  backstop = window.setTimeout(run, 500);
  return cancel;
}

/**
 * Bridge timers for the smug clips: a timer fires in the first animation frame at or after
 * its due time (4 ms of slack), so every clip frame is drawn inside an animation frame and
 * reaches the screen refresh it was due on (24 fps on 60 Hz: 3/2 refreshes, like video).
 * A hidden page runs no animation frames, so the clip holds (PoseBridge.setPaused too).
 */
function frameTimers(): BridgeTimers {
  let seq = 0;
  let raf = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const tick = () => {
    raf = 0;
    const now = performance.now();
    const fire = [...due].filter(([, t]) => t.at - 4 <= now).sort((a, b) => a[1].at - b[1].at);
    for (const [handle, t] of fire) {
      if (!due.delete(handle)) continue;
      t.fn();
    }
    if (due.size && !raf) raf = requestAnimationFrame(tick);
  };
  return {
    set: (fn, ms) => {
      seq += 1;
      due.set(seq, { at: performance.now() + ms, fn });
      if (!raf) raf = requestAnimationFrame(tick);
      return seq;
    },
    clear: (handle) => {
      due.delete(handle);
    },
    now: () => performance.now(),
  };
}

/** Evaluated once in the browser: can this page play the hip clip at all? */
const clipSupported = hipClipSupported();

export function Puppet({
  pose,
  emotion,
  talking,
  amplitude,
  spokenLine,
  audioMouth = null,
  className,
}: PuppetProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerTarget = useRef(0);
  const lookSmooth = useRef(0);
  const ampSmooth = useRef(0);
  const ampTarget = useRef(amplitude);
  const talkingRef = useRef(talking);
  const lastTs = useRef(0);
  const raf = useRef(0);
  const reducedRef = useRef(false);

  ampTarget.current = amplitude;
  talkingRef.current = talking;
  const hypeRef = useRef(false);
  /** Real TTS amplitude has arrived on this line (audio is playing). */
  const ampSeenRef = useRef(false);
  useEffect(() => {
    hypeRef.current = isHypeLine(spokenLine);
  }, [spokenLine]);
  useEffect(() => {
    if (!talking) ampSeenRef.current = false;
    else if (amplitude > 0.03) ampSeenRef.current = true;
  }, [talking, amplitude]);

  const [ampLive, setAmpLive] = useState(0);
  const [blink, setBlink] = useState<IdleBlinkFrame>(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const crossfade = useRef<PoseCrossfadePool | null>(null);
  /** Pose bridge: clip on stage ("in"/"out" = smug 1085/1084, "win"/"wout" = wave 1126/1140, "pin"/"pout" = pout 1158/1162). */
  const [bridgeClip, setBridgeClip] = useState<BridgeStageKey | null>(null);
  const bridgeClipRef = useRef<BridgeStageKey | null>(null);
  const bridgeCanvasInRef = useRef<HTMLCanvasElement>(null);
  const bridgeCanvasOutRef = useRef<HTMLCanvasElement>(null);
  const bridgeCanvasWaveInRef = useRef<HTMLCanvasElement>(null);
  const bridgeCanvasWaveOutRef = useRef<HTMLCanvasElement>(null);
  const bridgeCanvasPoutInRef = useRef<HTMLCanvasElement>(null);
  const bridgeCanvasPoutOutRef = useRef<HTMLCanvasElement>(null);
  /** Smug clips player (1085/1084). */
  const clipPlayerRef = useRef<SmugClipPlayer | null>(null);
  /** Wave clips player (1126/1140). */
  const wavePlayerRef = useRef<SmugClipPlayer | null>(null);
  /** Pout clips player (1158/1162). */
  const poutPlayerRef = useRef<SmugClipPlayer | null>(null);
  /** The clip player of a pair (refs only, so it is safe in any effect). */
  const playerFor = (pair: ClipPair | undefined): SmugClipPlayer | null =>
    pair === "wave" ? wavePlayerRef.current : pair === "pout" ? poutPlayerRef.current : clipPlayerRef.current;
  /** Either pair can never play in this browser (read in the crossfade effect). */
  const clipsUnsupportedRef = useRef(false);
  const [clipsState, setClipsState] = useState({
    in: false,
    out: false,
    win: false,
    wout: false,
    pin: false,
    pout: false,
    unsupported: false,
  });
  /**
   * Load (and prime) one pair's clips; without a pair, the startup pairs (smug + wave).
   * Pout is lazy: its worker and files only start after the startup preloads, or when a
   * Pout is wanted first. Each pair's readiness is its own.
   */
  const loadClips = useRef<(pair?: ClipPair) => Promise<boolean>>(async () => false);
  /** Starts the pout player (worker + 1158 / 1162 fetch) once; later calls are no-ops. */
  const startPoutClips = useRef<() => void>(() => {});
  const bridge = useRef<PoseBridge | null>(null);
  const bridgeDriver = useRef<BridgeDriver | null>(null);
  // Smug hold release (paste-14): the hold has no timer. The user's next send (or any
  // other pose wanted while the hold is up) first plays 1084 forward to idle; only once
  // idle has landed does the stage take the wanted pose (a new smug runs 1085 from idle).
  const smugRelease = useSyncExternalStore(subscribeSmugRelease, readSmugRelease, readSmugRelease);
  const smugGate = useRef<SmugReleaseGate | null>(null);
  /** Last gate step: anything but "wanted" means the next pose is still held back. */
  const smugGateStep = useRef<SmugGateStep>("wanted");
  if (!smugGate.current) smugGate.current = new SmugReleaseGate(smugRelease);
  const exitReleasePending = useRef(false);
  const [exitTick, setExitTick] = useState(0);
  // Hip clip (hip-clip.ts): the idle <-> smug travel and the hold, painted on one canvas.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipBitmaps = useRef<ImageBitmap[] | null>(null);
  const clipPlayer = useRef<HipClipPlayer | null>(null);
  const clipDriver = useRef<HipClipDriver | null>(null);
  const ensureClipLoad = useRef<() => void>(() => {});
  /** Bit i set once picture i has decoded. */
  const [clipBits, setClipBits] = useState(0);
  const [clipReady, setClipReady] = useState(false);
  /** The clip never became ready within its bound: the PNG bridge takes over, loudly. */
  const [clipGaveUp, setClipGaveUp] = useState(false);
  const [clipView, setClipView] = useState<ClipView>({ visible: false, index: 0, dir: "in", arrived: false });
  const clipMode = clipSupported && !clipGaveUp;
  /** Waiting for bridge frames to decode before an idle <-> smug change (bounded). */
  /** The bounded wait ran out: the change cut, loudly. */
  /** The pair whose bounded wait ran out (its change cut, loudly); null while none has. */
  const [bridgeWaitExpiredRaw, setBridgeWaitExpired] = useState<ClipPair | null>(null);
  const sheetsRef = useRef<Record<string, string>>({});
  const [blinkMode, setBlinkMode] = useState<BlinkFadeMode>("off");
  const blinkRef = useRef<IdleBlinkFrame>(0);
  const [mouth, setMouth] = useState<IdleMouthFrame>(0);
  const mouthRef = useRef<IdleMouthFrame>(0);
  const punchOneRef = useRef<(src: string) => Promise<void>>(async () => {});
  /**
   * Decoded sheet <img> objects (rest, blink, mouth, and every pose sheet),
   * held for the life of the stage. If they are dropped after decode(), the
   * browser can evict the file from its in-memory image list, and the first
   * cut to that sheet waits on a refetch (naturalWidth 0 for a few frames,
   * an empty stage) instead of swapping in place.
   */
  const decodedFrames = useRef<HTMLImageElement[]>([]);

  // Idle <-> smug (1085/1084) and idle <-> wave (1126/1140): each pair has its own worker
  // and canvases. Loaded and primed with their hold sheets at startup.
  useEffect(() => {
    const cin = bridgeCanvasInRef.current;
    const cout = bridgeCanvasOutRef.current;
    const win = bridgeCanvasWaveInRef.current;
    const wout = bridgeCanvasWaveOutRef.current;
    const pin = bridgeCanvasPoutInRef.current;
    const pout = bridgeCanvasPoutOutRef.current;
    type St = { in: boolean; out: boolean; unsupported: boolean };
    let smugSt: St = { in: false, out: false, unsupported: false };
    let waveSt: St = { in: false, out: false, unsupported: false };
    let poutSt: St = { in: false, out: false, unsupported: false };
    const publish = () => {
      const unsupported = smugSt.unsupported || waveSt.unsupported || poutSt.unsupported;
      clipsUnsupportedRef.current = unsupported;
      setClipsState((prev) => {
        const next = {
          in: smugSt.in,
          out: smugSt.out,
          win: waveSt.in,
          wout: waveSt.out,
          pin: poutSt.in,
          pout: poutSt.out,
          unsupported,
        };
        return prev.in === next.in &&
          prev.out === next.out &&
          prev.win === next.win &&
          prev.wout === next.wout &&
          prev.pin === next.pin &&
          prev.pout === next.pout &&
          prev.unsupported === next.unsupported
          ? prev
          : next;
      });
    };
    if (!cin || !cout || !win || !wout || !pin || !pout || !smugClipPlayerSupported()) {
      console.warn("[rai] bridge clips cannot play here (no OffscreenCanvas worker); pairs cut");
      smugSt = { in: false, out: false, unsupported: true };
      waveSt = { in: false, out: false, unsupported: true };
      poutSt = { in: false, out: false, unsupported: true };
      publish();
      return;
    }
    const [inUrl, outUrl] = smugClipUrls();
    const [winUrl, woutUrl] = waveClipUrls();
    const [pinUrl, poutUrl] = poutClipUrls();
    let smugPlayer: SmugClipPlayer;
    let wavePlayer: SmugClipPlayer;
    try {
      smugPlayer = SmugClipPlayer.for({
        canvases: { in: cin, out: cout },
        urls: { in: inUrl!, out: outUrl! },
        frames: { in: SMUG_IN_CLIP.frames, out: SMUG_OUT_CLIP.frames },
        box: SMUG_CLIP_BOX,
        keyOf: (file) => {
          const f = parseClipFrame(file);
          return f?.clip.pair === "smug" ? f.clip.key : null;
        },
        onState: (st) => {
          smugSt = st;
          publish();
        },
      });
      wavePlayer = SmugClipPlayer.for({
        canvases: { in: win, out: wout },
        urls: { in: winUrl!, out: woutUrl! },
        frames: { in: WAVE_IN_CLIP.frames, out: WAVE_OUT_CLIP.frames },
        box: WAVE_CLIP_BOX,
        keyOf: (file) => {
          const f = parseClipFrame(file);
          return f?.clip.pair === "wave" ? f.clip.key : null;
        },
        onState: (st) => {
          waveSt = st;
          publish();
        },
      });
    } catch (err) {
      console.warn("[rai] bridge clip player did not start; pairs cut", err);
      smugSt = { in: false, out: false, unsupported: true };
      waveSt = { in: false, out: false, unsupported: true };
      poutSt = { in: false, out: false, unsupported: true };
      publish();
      return;
    }
    clipPlayerRef.current = smugPlayer;
    wavePlayerRef.current = wavePlayer;
    // Pout (1158 / 1162) is created lazily: its worker fetches on init, so creating it here
    // would put 2.3 MB on the wire next to idle.png and the smug / wave clips on a cold phone.
    let poutPlayer: SmugClipPlayer | null = null;
    const ensurePout = (): SmugClipPlayer | null => {
      if (poutPlayer) return poutPlayer;
      try {
        poutPlayer = SmugClipPlayer.for({
          canvases: { in: pin, out: pout },
          urls: { in: pinUrl!, out: poutUrl! },
          frames: { in: POUT_IN_CLIP.frames, out: POUT_OUT_CLIP.frames },
          box: POUT_CLIP_BOX,
          keyOf: (file) => {
            const f = parseClipFrame(file);
            return f?.clip.pair === "pout" ? f.clip.key : null;
          },
          onState: (st) => {
            poutSt = st;
            publish();
          },
        });
      } catch (err) {
        console.warn("[rai] pout clip player did not start; idle <-> pout cuts", err);
        poutSt = { in: false, out: false, unsupported: true };
        publish();
        return null;
      }
      poutPlayerRef.current = poutPlayer;
      return poutPlayer;
    };
    startPoutClips.current = () => {
      ensurePout();
    };
    loadClips.current = (pair) => {
      if (pair === "pout") return ensurePout()?.load() ?? Promise.resolve(false);
      if (pair === "smug") return smugPlayer.load();
      if (pair === "wave") return wavePlayer.load();
      return Promise.all([smugPlayer.load(), wavePlayer.load()]).then((ok) => ok.every(Boolean));
    };
    return () => {
      if (clipPlayerRef.current === smugPlayer) clipPlayerRef.current = null;
      if (wavePlayerRef.current === wavePlayer) wavePlayerRef.current = null;
      if (poutPlayer && poutPlayerRef.current === poutPlayer) poutPlayerRef.current = null;
      loadClips.current = async () => false;
      startPoutClips.current = () => {};
    };
  }, []);

  // Punch studio-white cards to alpha, then decode so pose swaps never flash a plate.
  // Startup is idle.png, blink 01–04, then mouth 02–06, one file at a time.
  // Every other live pose sheet (wave, shy, talk, moods, …) is then punched and
  // decoded on requestIdleCallback (setTimeout fallback), so the first switch
  // to it is a plain cut. A pose asked for sooner jumps that queue.
  //
  // Decode before swap: no sheet enters `sheets` until decodeSheet() settles,
  // and plates only show sheets that are in `sheets`. Until then the current
  // frame (idle or the pose already up) stays on stage.
  useEffect(() => {
    let cancelled = false;
    let idleHandle = 0;
    let timeoutHandle = 0;
    const restSrc = idleRestSrc();
    const jobs = new Map<string, Promise<void>>();

    const clearSchedule = () => {
      if (idleHandle) {
        window.cancelIdleCallback(idleHandle);
        idleHandle = 0;
      }
      if (timeoutHandle) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = 0;
      }
    };

    const store = (src: string, url: string, aliasRest: boolean) => {
      if (cancelled) return;
      setSheets((prev) => {
        const next = { ...prev };
        let changed = false;
        if (next[src] !== url) {
          next[src] = url;
          changed = true;
        }
        // 01 open is a byte copy of idle.png. Paint that punched URL so the
        // rest layer does not wait on a second identical punch.
        if (aliasRest && next[restSrc] == null) {
          next[restSrc] = url;
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    const punchOne = (src: string, aliasRest: boolean) => {
      const existing = jobs.get(src);
      if (existing) return existing;
      const job = (async () => {
        if (isRetiredBlinkSrc(src)) return;
        const url = await punchedSpriteUrl(src);
        if (cancelled) return;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        // decoded → plain cut. loaded (decode() slow past ~400ms, or rejected on a
        // file that did load) → the stage <img> is decoding="sync", so that paint
        // decodes it: a slow frame at worst, never an empty one.
        const result = await decodeSheet(img);
        if (cancelled) return;
        const rest = aliasRest || src === restSrc;
        if (result === "failed" && !rest) {
          // Never mount a sheet that did not load: the current frame stays up
          // (blink/mouth stay off without all their frames). A later request
          // for this pose may retry.
          jobs.delete(src);
          return;
        }
        decodedFrames.current.push(img);
        store(src, url, aliasRest);
      })();
      jobs.set(src, job);
      return job;
    };
    punchOneRef.current = (src) => punchOne(src, false);

    let clipJob: Promise<void> | null = null;
    const startClipLoad = (): Promise<void> => {
      if (clipJob) return clipJob;
      if (!clipSupported || clipBitmaps.current) return Promise.resolve();
      const job: Promise<void> = (async () => {
        const bitmaps = await loadHipClip<ImageBitmap>({
          fetchBlob: async (src) => {
            const res = await fetch(src, { priority: "high" } as RequestInit);
            if (!res.ok) throw new Error(`hip clip ${res.status}`);
            return res.blob();
          },
          decode: (blob) => createImageBitmap(blob),
          srcFor: hipClipSrc,
          onFrame: (i) => {
            if (!cancelled) setClipBits((bits) => bits | (1 << i));
          },
          cancelled: () => cancelled,
        });
        if (cancelled) return;
        if (bitmaps) {
          clipBitmaps.current = bitmaps;
          setClipReady(true);
        }
      })().finally(() => {
        // Not ready (a picture never loaded): the next ask starts a fresh load.
        if (clipJob === job) clipJob = null;
      });
      clipJob = job;
      return job;
    };
    ensureClipLoad.current = () => void startClipLoad();

    const afterPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    const scheduleIdle = (run: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(
          () => {
            idleHandle = 0;
            run();
          },
          { timeout: 1500 },
        );
        return;
      }
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = 0;
        run();
      }, 1);
    };

    const run = async () => {
      // idle.png, then blink 01 (open rest frame), then the whole smug beat (1085 + 1084
      // clips loaded and primed + smug1085_hold, in parallel), then blink 02-04 and mouth.
      // A named Smug can come any moment on a cold phone; its clip must start on decoded
      // frames, so they go before anything non-essential.
      const order = stagePreloadOrder({ clip: clipSupported });
      await punchOne(order.first, order.first !== restSrc);
      if (cancelled) return;
      await afterPaint();
      for (const src of order.next) {
        if (cancelled) return;
        await punchOne(src, false);
      }
      if (cancelled) return;
      if (clipSupported) {
        // The hip clip's 18 pictures go first (parallel, high priority), ahead of the smug
        // sheet, blink and mouth. A failed picture is retried; the wait is bounded so a dead
        // link cannot hold the rest of the queue for ever.
        await Promise.race([
          startClipLoad(),
          new Promise<void>((resolve) => window.setTimeout(resolve, HIP_CLIP_WAIT_MAX_MS)),
        ]);
        if (cancelled) return;
      }
      // The clips are bounded here (a dead link must not hold blink / mouth for ever); a
      // Smug that comes before they are in waits for them on its own (bridgeGate).
      const clips = loadClips.current();
      await Promise.all([
        ...order.beat.map((src) => punchOne(src, false)),
        Promise.race([clips, new Promise<void>((resolve) => window.setTimeout(resolve, 20_000))]),
      ]);
      for (let i = 0; i < order.rest.length; i++) {
        if (cancelled) return;
        await punchOne(order.rest[i]!, false);
      }
      if (cancelled) return;
      // Pout (1158 / 1162 + its hold) is lazy: only now, after the first stage image and the
      // smug / wave preloads, so it never competes with them on a cold phone. A Pout sent
      // earlier starts it on its own (the bridge wait effect asks for the pout pair).
      startPoutClips.current();
      for (const src of order.lazy) {
        if (cancelled) return;
        await punchOne(src, false);
      }
      if (cancelled) return;
      const deferred = deferredSpriteUrls({ skipBridge: clipSupported });
      let index = 0;
      const step = () => {
        if (cancelled || index >= deferred.length) return;
        // A lid cut is 60ms, a mouth cut ~100ms. A deferred punch on that slice stretches it.
        if (blinkPassInFlight(blinkRef.current) || mouthRef.current > 1) {
          timeoutHandle = window.setTimeout(() => {
            timeoutHandle = 0;
            step();
          }, 16);
          return;
        }
        while (index < deferred.length && jobs.has(deferred[index]!)) index += 1;
        if (index >= deferred.length) return;
        const src = deferred[index]!;
        index += 1;
        void punchOne(src, false).then(() => {
          if (cancelled) return;
          scheduleIdle(step);
        });
      };
      scheduleIdle(step);
    };

    void run();
    return () => {
      cancelled = true;
      ensureClipLoad.current = () => {};
      punchOneRef.current = async () => {};
      clearSchedule();
    };
  }, []);

  useEffect(() => {
    const mq =
      typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const sync = () => {
      const on = mq?.matches ?? false;
      reducedRef.current = on;
      setReducedMotion(on);
    };
    sync();
    mq?.addEventListener("change", sync);
    return () => mq?.removeEventListener("change", sync);
  }, []);

  // Kick ampLive as soon as talking starts so first frames aren't stuck closed.
  useEffect(() => {
    if (!talking) return;
    const kick = Math.max(ampTarget.current, TALK_AMP_KICK);
    ampSmooth.current = Math.max(ampSmooth.current, kick);
    setAmpLive((prev) => Math.max(prev, kick));
  }, [talking]);

  // Expo bust blink while speaking. Official PNG does not use face_eyes_*.
  useEffect(() => {
    if (!USE_EXPO_TALK_BUST || reducedRef.current) return;
    let cancelled = false;
    let sleepTimer = 0;
    let stepTimer = 0;

    const schedule = () => {
      const wait = 1800 + Math.random() * 1200;
      sleepTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (!talkingRef.current) {
          schedule();
          return;
        }
        setBlink(1);
        stepTimer = window.setTimeout(() => {
          if (cancelled) return;
          setBlink(2);
          stepTimer = window.setTimeout(() => {
            if (cancelled) return;
            setBlink(1);
            stepTimer = window.setTimeout(() => {
              if (cancelled) return;
              setBlink(0);
              schedule();
            }, 40);
          }, 70);
        }, 40);
      }, wait);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(sleepTimer);
      window.clearTimeout(stepTimer);
      setBlink(0);
    };
  }, []);

  // Full-frame blink on rest idle only, after the four baked sheets have decoded.
  // Blink is on, approved by TyLo on 2026-09-26 (807-referenced painted lids,
  // pass 4b). The flag gate stays: a false flag returns before any timeout.
  // One body, hard-swapped lids, no second PNG.
  const restingBlink = canIdleBlink({ pose, emotion, talking, reducedMotion });
  const framesReady = idleBlinkFrameUrls().every((src) => sheets[src] != null);
  useEffect(() => {
    if (!IDLE_BLINK_ENABLED) return;
    if (USE_EXPO_TALK_BUST || !framesReady || !restingBlink) return;

    let cancelled = false;
    let timer = 0;

    const stop = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };

    const gapMs = () =>
      IDLE_BLINK_GAP_MIN_MS + Math.random() * (IDLE_BLINK_GAP_MAX_MS - IDLE_BLINK_GAP_MIN_MS);

    // Chain one timeout per step, measured from when that frame is shown.
    // A 50ms half on this long shot is over before the eye band can be read.
    const runCycle = () => {
      if (cancelled || reducedRef.current || talkingRef.current) return;
      // Mouth owns the one rest <img> while she speaks. Wait for it to hand back 01.
      if (mouthRef.current > 0) {
        timer = window.setTimeout(runCycle, IDLE_BLINK_FIRST_MS);
        return;
      }
      const steps = idleBlinkSchedule();
      const show = (index: number) => {
        if (cancelled || reducedRef.current || talkingRef.current) return;
        const step = steps[index];
        if (!step) return;
        blinkRef.current = step.blink;
        setBlink(step.blink);
        const upcoming = steps[index + 1];
        if (!upcoming) {
          timer = window.setTimeout(runCycle, gapMs());
          return;
        }
        timer = window.setTimeout(show, upcoming.at - step.at, index + 1);
      };
      show(0);
    };

    timer = window.setTimeout(runCycle, IDLE_BLINK_FIRST_MS);
    return () => {
      cancelled = true;
      stop();
      // Leaving rest (a pose, talk, or emotion) cancels the lid pass.
      // The open-frame fallback paints that same commit; this drops the lid state.
      const midBlink = blinkRef.current > 0;
      blinkRef.current = 0;
      setBlink(0);
      if (midBlink) setBlinkMode("snap");
    };
  }, [restingBlink, framesReady]);

  // Idle talking mouth. Speaking on the idle pose only, after the five mouth
  // sheets have decoded. Hard cuts on the same rest <img>: 01 → 02 → 03 → 02
  // → 01, ~90–120ms a cut, with 04/06 spice and 05 on hype lines. Blink is
  // paused for the line (canIdleBlink is false while talking); on exit this
  // drops back to 01 and the blink timer starts again from open lids.
  const talkingIdle = canIdleMouth({ pose, emotion, talking, reducedMotion });
  const mouthReady = idleMouthFrameUrls().every((src) => sheets[src] != null);
  const audioLocked = audioMouth != null;
  useEffect(() => {
    if (!audioLocked) return;
    const frame = audioMouth ?? 0;
    mouthRef.current = frame;
    setMouth(frame);
  }, [audioLocked, audioMouth]);
  useEffect(() => {
    if (!IDLE_MOUTH_ENABLED) return;
    if (!talkingIdle || !mouthReady || audioLocked) return;

    let cancelled = false;
    let timer = 0;
    let queue: IdleMouthStep[] = [];

    const show = () => {
      timer = 0;
      if (cancelled || reducedRef.current || !talkingRef.current) return;
      if (!queue.length) {
        queue = idleMouthSyllable({
          hype: hypeRef.current,
          amplitude: ampTarget.current,
          ampLive: ampSeenRef.current,
        });
      }
      const step = queue.shift()!;
      mouthRef.current = step.mouth;
      setMouth(step.mouth);
      timer = window.setTimeout(show, step.ms);
    };

    show();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      mouthRef.current = 0;
      setMouth(0);
    };
  }, [talkingIdle, mouthReady, audioLocked]);

  // Pointer → look target (normalized -1..1), deadzone kills micro-jitter.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      if (Math.abs(x) < DEADZONE) x = 0;
      else x = Math.sign(x) * ((Math.abs(x) - DEADZONE) / (1 - DEADZONE));
      pointerTarget.current = Math.max(-1, Math.min(1, x));
    };
    const onLeave = () => {
      pointerTarget.current = 0;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Sharpness: size and place the sheet box in whole device pixels (the long-shot
  // zoom used to be transform: scale on top of a composited rig, which
  // resampled the sheet twice). CSS calc() fallbacks cover the first paint.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const rig = stage?.querySelector<HTMLElement>("[data-rai-rig]");
    if (!stage || !rig) return;
    let queued = 0;
    const apply = () => {
      queued = 0;
      const cs = getComputedStyle(rig);
      const rigW = parseFloat(cs.width);
      const rigH = parseFloat(cs.height);
      const zoom = parseFloat(cs.getPropertyValue("--rai-sheet-zoom"));
      const topFrac = parseFloat(cs.getPropertyValue("--rai-sheet-top"));
      if (!(rigW > 0 && rigH > 0)) return;
      const sr = stage.getBoundingClientRect();
      const box = sheetBox({
        originX: sr.left + stage.clientLeft + (parseFloat(cs.left) || 0),
        originY: sr.top + stage.clientTop + (parseFloat(cs.top) || 0),
        rigW,
        rigH,
        zoom: Number.isFinite(zoom) ? zoom : 1,
        topFrac: Number.isFinite(topFrac) ? topFrac : 0,
        dpr: window.devicePixelRatio || 1,
      });
      rig.style.setProperty("--rai-sheet-x", `${box.x}px`);
      rig.style.setProperty("--rai-sheet-y", `${box.y}px`);
      rig.style.setProperty("--rai-sheet-w", `${box.w}px`);
      rig.style.setProperty("--rai-sheet-h", `${box.h}px`);
    };
    const schedule = () => {
      if (!queued) queued = requestAnimationFrame(apply);
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(stage);
    ro?.observe(rig);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    let mq: MediaQueryList | null = null;
    const watchDpr = () => {
      mq?.removeEventListener("change", onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener("change", onDpr);
    };
    const onDpr = () => {
      watchDpr();
      schedule();
    };
    watchDpr();
    return () => {
      if (queued) cancelAnimationFrame(queued);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      mq?.removeEventListener("change", onDpr);
    };
  }, []);

  // Idle life + look-at lean + amp smoothing — DOM transforms, minimal React.
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTs.current ? Math.min(0.05, (now - lastTs.current) / 1000) : 0.016;
      lastTs.current = now;
      const t = now / 1000;
      const reduced = reducedRef.current;

      lookSmooth.current = expApproach(
        lookSmooth.current,
        pointerTarget.current,
        LOOK_LERP,
        dt,
      );

      ampSmooth.current = expApproach(ampSmooth.current, ampTarget.current, AMP_LERP, dt);

      // Mix real TTS amp with synthetic jaw so visemes cycle even when amp is flat.
      let jaw = ampSmooth.current;
      if (talkingRef.current && !reduced) {
        const syn = syntheticJaw(t);
        jaw = Math.max(ampSmooth.current, syn * 0.85);
      } else if (!talkingRef.current) {
        jaw = ampSmooth.current;
      }

      // Amp is for the talk bob on the rig. Spoken sheets do not flap idle underneath.
      setAmpLive((prev) => (Math.abs(prev - jaw) > 0.02 ? jaw : prev));

      const motion = puppetIdleMotion(t, {
        reduced,
        look: lookSmooth.current,
        talking: talkingRef.current,
        jaw,
      });

      const node = stageRef.current?.querySelector<HTMLElement>("[data-rai-rig]");
      const ahoge = stageRef.current?.querySelector<HTMLElement>("[data-rai-ahoge]");
      if (node) {
        node.style.transform = puppetRigTransform(motion, window.devicePixelRatio || 1);
      }
      if (ahoge) {
        ahoge.style.transform = `rotate(${motion.hairDeg.toFixed(2)}deg) scaleY(${(
          1 + Math.sin(t * 2.05) * 0.03
        ).toFixed(3)})`;
      }

      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const blinkShown = !IDLE_BLINK_ENABLED
    ? 0
    : USE_EXPO_TALK_BUST
      ? blink
      : framesReady
        ? blink
        : 0;
  // Pose / talk / emotion can change a frame before the blink timer cleans up.
  // Derive snap in that render so the next sheet cuts in instead of easing from a closed frame.
  let blinkModeLive: BlinkFadeMode = blinkMode;
  if (!USE_EXPO_TALK_BUST && !restingBlink && blinkShown > 0) {
    blinkModeLive = "snap";
  }

  const mouthShown: IdleMouthFrame = talkingIdle && mouthReady ? mouth : 0;

  const desired = useMemo(() => {
    const raw = layersFor({
      pose,
      emotion,
      talking,
      amplitude: ampLive,
      angle: 0,
      talkPhase: 0,
      blink: blinkShown,
      mouth: mouthShown,
      idleBeat: "none",
      reducedMotion,
    });
    // Smug path allowlist: never paint think / peace / retired smug files / etc.
    // Illegal sheets fall back to idle rest until 1085 paints (TyLo phone FAIL).
    if (holdsSmugBeat(pose, emotion)) {
      const fallback = idleRestSrc();
      return raw.map((layer) =>
        isSmugPathSheetSrc(layer.src) ? layer : { ...layer, src: fallback },
      );
    }
    if (holdsWaveBeat(pose, emotion)) {
      const fallback = idleRestSrc();
      return raw.map((layer) =>
        isWavePathSheetSrc(layer.src) ? layer : { ...layer, src: fallback },
      );
    }
    if (holdsPoutBeat(pose, emotion)) {
      const fallback = idleRestSrc();
      return raw.map((layer) =>
        isPoutPathSheetSrc(layer.src) ? layer : { ...layer, src: fallback },
      );
    }
    return raw;
  }, [pose, emotion, talking, ampLive, blinkShown, mouthShown, reducedMotion]);
  // Both smug clips loaded and primed (their first frames decoded): a change may play.
  const smugClipsReady = clipsState.in && clipsState.out;
  const waveClipsReady = clipsState.win && clipsState.wout;
  const poutClipsReady = clipsState.pin && clipsState.pout;
  // Each pair waits only for its own clips: smug / wave never wait on the lazy pout files,
  // pout never waits on smug / wave.
  const pairClipsReady: Record<ClipPair, boolean> = { smug: smugClipsReady, wave: waveClipsReady, pout: poutClipsReady };
  const pairOf = (wantedKey: string | null, shownKey: string | null): ClipPair | null => {
    for (const k of [wantedKey, shownKey]) if (k === "smug" || k === "wave" || k === "pout") return k;
    return null;
  };
  // Pout is lazy, so it only waits for the clip it is about to play: idle -> pout needs 1158,
  // pout -> idle needs 1162 (a hold released before 1162 is in stays on the hold until it is).
  const framesReadyFor = (pair: ClipPair | null, wantedKey?: string | null): boolean => {
    if (clipMode) return clipReady;
    if (!pair) return true;
    if (pair === "pout" && wantedKey !== undefined) return wantedKey === "pout" ? clipsState.pin : clipsState.pout;
    return pairClipsReady[pair];
  };
  // No way to decode the clips in this browser: the pair hard-cuts, like reduced motion.
  const bridgeCut = reducedMotion || clipsState.unsupported;
  // Once the frames are in, an old expiry no longer applies. The clip never expires into the
  // arms-down smug sheet: after its bound the PNG bridge takes over instead (clipGaveUp).
  const expiredFor = (pair: ClipPair | null, wantedKey?: string | null): boolean =>
    !clipMode && pair != null && bridgeWaitExpiredRaw === pair && !framesReadyFor(pair, wantedKey);
  const bridgeWaitExpired = expiredFor(bridgeWaitExpiredRaw);
  const shownPlates = useRef<SpriteLayer[]>([]);
  const plates = useMemo(() => {
    // exitTick: idle landed after 1084, the wanted pose may go on (re-run only).
    void exitTick;
    void bridgeClip;
    let next = desired.filter((layer) => layer.role !== "eyes" && !isRetiredBlinkSrc(layer.src));
    const shownKey = bridgeKeyOfPlates(shownPlates.current);
    // Hold released by a send while smug1085_hold is up, or by any other pose wanted over
    // it (see SmugReleaseGate). While released, the wanted pose waits behind plain idle
    // rest: the driver sees smug -> idle, so 1084 plays forward (never a cut to idle.png).
    const step = smugGate.current!.step({
      shownKey,
      wantedKey: bridgeKeyOfPlates(next),
      release: smugRelease,
      entering: isIntroStageKey(bridgeClipRef.current),
    });
    smugGateStep.current = step;
    if (step === "keep-shown") next = shownPlates.current;
    else if (step === "exit-to-idle") next = smugExitRestPlates(reducedMotion);
    // A paired idle <-> smug change waits for its frames (bounded) instead of cutting.
    const wantedKey = bridgeKeyOfPlates(next);
    const gatePair = pairOf(wantedKey, shownKey);
    const gate = bridgeGate({
      wantedKey,
      shownKey,
      framesReady: framesReadyFor(gatePair, wantedKey),
      // Reduced motion hard-cuts but still lands on the hip picture, so with the clip it
      // waits for it like everyone else (the plain idle stays up meanwhile).
      reducedMotion: clipMode ? false : bridgeCut,
      waitExpired: expiredFor(gatePair, wantedKey),
    });
    const ready = next.length > 0 && next.every((layer) => sheets[layer.src] != null) && gate === "go";
    // Unready pose: keep the last punched plates (idle, or the frame already up).
    const chosen = ready ? next : openRestFallback(shownPlates.current, idleRestSrc());
    const prev = shownPlates.current;
    const same =
      prev.length === chosen.length &&
      prev.every(
        (layer, i) =>
          layer.id === chosen[i]!.id &&
          layer.src === chosen[i]!.src &&
          layer.opacity === chosen[i]!.opacity &&
          layer.role === chosen[i]!.role,
      );
    if (same) return prev;
    shownPlates.current = chosen;
    return chosen;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- framesReadyFor / expiredFor read clipsState, clipReady and bridgeWaitExpiredRaw
  }, [desired, sheets, reducedMotion, bridgeCut, clipsState, clipReady, bridgeWaitExpiredRaw, clipMode, smugRelease, exitTick, bridgeClip]);

  // 1084 done (bridge off) or no bridge to run (reduced motion / cut): let idle paint and
  // sit a moment, then hand the stage to the wanted pose. Never while hidden (rAF waits).
  const releaseSmugExit = useCallback(() => {
    if (!smugGate.current?.exiting() || exitReleasePending.current) return;
    exitReleasePending.current = true;
    afterPaintFrame(() => {
      window.setTimeout(() => {
        exitReleasePending.current = false;
        if (!smugGate.current?.exiting() || bridge.current?.active()) return;
        if (bridgeKeyOfPlates(shownPlates.current) !== "idle") return;
        smugGate.current.landed();
        setExitTick((n) => n + 1);
      }, SMUG_EXIT_LAND_MS);
    });
  }, []);
  // Clip frames are drawn straight onto the bridge canvas, inside the animation frame the
  // sequencer fires in (no React render per frame). The rig's data-rai-bridge-on flips the
  // canvas on and the live sheets off in one style change (styles.css), so the swap at either
  // end of a clip is the same paint; React only hears about the clip starting and ending.
  const onBridgeFrame = useCallback(
    (src: string | null) => {
      const rig = stageRef.current?.querySelector<HTMLElement>("[data-rai-rig]");
      const canvases = {
        in: bridgeCanvasInRef.current,
        out: bridgeCanvasOutRef.current,
        win: bridgeCanvasWaveInRef.current,
        wout: bridgeCanvasWaveOutRef.current,
        pin: bridgeCanvasPoutInRef.current,
        pout: bridgeCanvasPoutOutRef.current,
      };
      if (src === null) {
        bridgeClipRef.current = null;
        if (rig) delete rig.dataset.raiBridgeOn;
        for (const c of Object.values(canvases)) if (c) c.dataset.raiSheet = "off";
        setBridgeClip(null);
        releaseSmugExit();
        return;
      }
      const f = parseClipFrame(src);
      if (!f) return;
      const pairKeys = BRIDGE_STAGE_KEYS[f.clip.pair];
      const stageKey = f.clip.key === "in" ? pairKeys[0] : pairKeys[1];
      const other = stageKey === pairKeys[0] ? pairKeys[1] : pairKeys[0];
      const canvas = canvases[stageKey];
      if (canvas) canvas.dataset.raiSheet = `${stageKey}-${String(f.index).padStart(3, "0")}`;
      if (bridgeClipRef.current !== stageKey) {
        if (canvases[other]) canvases[other]!.dataset.raiSheet = "off";
        bridgeClipRef.current = stageKey;
        if (rig) rig.dataset.raiBridgeOn = stageKey;
        setBridgeClip(stageKey);
      }
    },
    [releaseSmugExit],
  );

  // Pose bridge (idle <-> smug, see pose-bridge.ts). The request is made in the
  // crossfade effect below, keyed on the shown plates, so a sheet that has not
  // decoded yet starts nothing and blink / mouth frames never look like a pose
  // change. The normal pose change runs underneath, hidden, while the in-betweens
  // play as hard cuts on one <img>. A spoken line does not gate it (the pose lands
  // as the line starts); only reduced motion or frames that have not decoded hard-cut.
  useLayoutEffect(() => {
    sheetsRef.current = sheets;
  }, [sheets]);
  useEffect(() => {
    return () => bridge.current?.dispose();
  }, []);

  // A pose asked for before its sheet is punched jumps the idle queue.
  // The punch cache makes a later queue pass a no-op. Plates show it only
  // while it is still the requested src.
  useEffect(() => {
    const src = priorityPoseSrc(desired, sheets);
    if (!src || isRetiredBlinkSrc(src)) return;
    void punchOneRef.current(src);
  }, [desired, sheets]);

  // Clips still loading when idle <-> smug is wanted: ask for them now, keep asking if a
  // load failed, and hold the old sheet until both are primed. BRIDGE_WAIT_MAX_MS is a 30 s safety valve for a frame that can never load
  // (offline, 404): it is never reached on a working device, and when it is, the change
  // cuts and says so (console + stage attribute), so a missing frame is never silent.
  useEffect(() => {
    const wantKey = smugGate.current?.exiting() ? "idle" : bridgeKeyOfPlates(desired);
    const shownKey = bridgeKeyOfPlates(shownPlates.current);
    const pair = pairOf(wantKey, shownKey);
    if (framesReadyFor(pair, wantKey) || (bridgeCut && !clipMode) || expiredFor(pair, wantKey)) return;
    if (!bridgeWantsFrames(wantKey, shownKey)) return;
    if (clipMode) {
      // Hip clip still decoding: keep asking (a failed picture is retried), show the plain
      // idle meanwhile, and after a generous bound say so loudly and fall back to the PNG
      // bridge instead of waiting for ever.
      ensureClipLoad.current();
      const clipRetry = window.setInterval(() => ensureClipLoad.current(), HIP_CLIP_RETRY_MS);
      const clipGiveUp = window.setTimeout(() => {
        console.warn("[rai] hip clip did not decode in time; falling back to the PNG pose bridge");
        setClipGaveUp(true);
      }, HIP_CLIP_WAIT_MAX_MS);
      return () => {
        window.clearInterval(clipRetry);
        window.clearTimeout(clipGiveUp);
      };
    }
    const ask = () => {
      void loadClips.current(pair ?? undefined);
    };
    ask();
    const retry = window.setInterval(ask, BRIDGE_WAIT_RETRY_MS);
    // The valve starts once the wanted sheet itself has decoded: that is the moment
    // a cut would otherwise happen. While smug is still loading nothing is shown anyway.
    if (!desired.every((layer) => sheets[layer.src] != null)) {
      return () => window.clearInterval(retry);
    }
    const giveUp = window.setTimeout(() => {
      console.warn(`[rai] ${pair ?? "bridge"} clips did not load in time; idle <-> ${pair ?? "pose"} cuts`);
      setBridgeWaitExpired(pair);
    }, BRIDGE_WAIT_MAX_MS);
    return () => {
      window.clearInterval(retry);
      window.clearTimeout(giveUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- framesReadyFor / expiredFor read clipsState, clipReady and bridgeWaitExpiredRaw
  }, [desired, sheets, clipsState, clipReady, bridgeCut, bridgeWaitExpiredRaw, clipMode]);

  // Background tab: timers are throttled or frozen, so the bridge holds its frame and
  // carries on at normal pace when the page is visible again (see PoseBridge.setPaused).
  useEffect(() => {
    const sync = () => bridge.current?.setPaused(document.visibilityState === "hidden");
    // (The hip clip needs nothing here: its dwell counts animation frames, which stop with the page.)
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // Drop snap timing once the cancelled blink has cut to the new sheet.
  useEffect(() => {
    if (blinkMode !== "snap") return;
    const timer = window.setTimeout(() => {
      setBlinkMode((mode) => (mode === "snap" ? "off" : mode));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [blinkMode]);

  const openRestReady = sheets[idleRestSrc()] != null;
  // Crossfade pool: incoming fades from 0, outgoing fades to 0, overlap both.
  // Rest blink keeps IDLE_REST_LAYER_ID, so a frame step updates that one layer.
  // An interrupted fade-in is re-armed or dropped (see PoseCrossfadePool), so a
  // quick A → B → A never strands a sheet at opacity 0.
  useEffect(() => {
    if (!crossfade.current) {
      crossfade.current = new PoseCrossfadePool(
        {
          set: (fn, ms) => window.setTimeout(fn, ms),
          clear: (handle) => window.clearTimeout(handle),
        },
        setDisplay,
      );
    }
    // Pose bridge: the shown sheet changed idle <-> smug (blink / mouth frames are all
    // "idle"). Runs in this same effect as crossfade.update, so the bridge frame and the
    // new display land in one batched render and the live layers are hidden from the
    // first frame the new sheet could show. Deduped on the key, so re-runs for talking
    // or blink-mode changes do nothing.
    if (!bridge.current) {
      const pick = (file: string | undefined) => {
        const f = file ? parseClipFrame(file) : null;
        return playerFor(f?.clip.pair);
      };
      const player: BridgeClipPlayer = {
        play: (files, start, events) => pick(files[0])?.play(files, start, events) ?? false,
        stop: () => {
          clipPlayerRef.current?.stop();
          wavePlayerRef.current?.stop();
          poutPlayerRef.current?.stop();
        },
        setPaused: (paused) => {
          clipPlayerRef.current?.setPaused(paused);
          wavePlayerRef.current?.setPaused(paused);
          poutPlayerRef.current?.setPaused(paused);
        },
      };
      bridge.current = new PoseBridge(
        frameTimers(),
        Math.random,
        onBridgeFrame,
        afterPaintFrame,
        bridgeDwellsFor,
        player,
      );
      bridge.current.setPaused(document.visibilityState === "hidden");
    }
    if (!bridgeDriver.current) bridgeDriver.current = new BridgeDriver(bridge.current);
    if (clipMode) {
      // Hip clip path retired (hipClipSupported() is false): never reached.
      if (!clipPlayer.current) {
        clipPlayer.current = new HipClipPlayer({
          raf: (cb) => window.requestAnimationFrame(cb),
          cancelRaf: (h) => window.cancelAnimationFrame(h),
          now: () => performance.now(),
          draw: (i) => paintHipPicture(canvasRef.current, clipBitmaps.current?.[i], i),
          show: () => {},
          hide: () => {},
          onView: setClipView,
        });
      }
      if (!clipDriver.current) clipDriver.current = new HipClipDriver(clipPlayer.current);
      const prevClipKey = clipDriver.current.key();
      const nextKey = bridgeKeyOfPlates(plates);
      clipDriver.current.commit(nextKey, {
        reducedMotion: reducedRef.current,
        ready: clipBitmaps.current != null,
      });
      // 1084 rest forward after the hold (PoseBridge).
      if (
        prevClipKey === "smug" &&
        nextKey === "idle" &&
        !reducedRef.current &&
        bridge.current
      ) {
        void loadClips.current();
        bridge.current.request({
          from: "smug",
          to: "idle",
          reducedMotion: false,
          srcFor: bridgeFrameSrc,
          isReady: (src) => {
            const f = parseClipFrame(src);
            const pl = playerFor(f?.clip.pair);
            return Boolean(f && f.index === 0 && pl?.ready(f.clip.key));
          },
        });
      } else if (nextKey === "smug" || reducedRef.current) {
        bridge.current?.cancel();
      }
    } else {
      // Smug clips (1085 / 1084) through PoseBridge, frame by frame (drop any hip clip).
      clipPlayer.current?.cut();
      bridgeDriver.current.commit(plates, {
        reducedMotion: reducedRef.current || clipsUnsupportedRef.current,
        srcFor: bridgeFrameSrc,
        // A clip starts on its frame 0, already painted on its hidden canvas (armed).
        isReady: (src) => {
          const f = parseClipFrame(src);
          const pl = playerFor(f?.clip.pair);
          return Boolean(f && f.index === 0 && pl?.ready(f.clip.key));
        },
      });
      // Released hold with nothing to play (reduced motion cut, or the exit already done).
      if (smugGate.current?.exiting() && bridgeKeyOfPlates(plates) === "idle" && !bridge.current.active()) {
        releaseSmugExit();
      }
    }
    const openRest = idleRestSrc();
    crossfade.current.update(plates, {
      snap: blinkModeLive === "snap",
      isInstant: (layer) => isInstantLayer(layer, talking),
      fadeMs: (layer) => fadeMsFor(layer, talking, blinkModeLive),
      // A pose change mid-chew (or mid-blink) fades out the closed 01 rest frame,
      // never the open mouth / shut lid that happened to be up. 01 is decoded at
      // startup; before that the rest layer is already 01.
      outgoing: (layer) =>
        layer.id === IDLE_REST_LAYER_ID && layer.src !== openRest && openRestReady
          ? { ...layer, src: openRest }
          : layer,
    });
  }, [plates, talking, blinkModeLive, openRestReady, clipMode, onBridgeFrame, releaseSmugExit]);

  useEffect(() => {
    return () => {
      crossfade.current?.dispose();
      clipPlayer.current?.dispose();
    };
  }, []);
  // The canvas is on screen: only now does the first picture's dwell start.
  useEffect(() => {
    if (clipView.visible) clipPlayer.current?.confirmShown();
  }, [clipView.visible]);

  const restPunched = sheets[idleRestSrc()];
  const stageReady = Boolean(restPunched);
  const talkOverlay = display.find((layer) => layer.role === "talk");
  const blinkFrame = restingBlink ? idleBlinkStepName(blinkShown) : "off";
  const mouthFrame = talkingIdle ? idleMouthStepName(mouthShown) : "off";
  // Rest blink is one full frame. Pose crossfade may still overlap a sheet on
  // the way in or out; once that handoff is done, paint only this sprite.
  const restPlate = plates.length === 1 && plates[0]?.id === IDLE_REST_LAYER_ID ? plates[0] : null;
  const poseHandoff = display.some((layer) => layer.id !== IDLE_REST_LAYER_ID && layer.opacity > 0.01);
  const restOnly = Boolean(restPlate && sheets[restPlate.src]) && !poseHandoff;
  // One list, stable keys. The rest <img> stays mounted when a pose fades in,
  // so the stage does not drop the decoded idle frame and decode it again.
  const layers: DisplayLayer[] =
    restOnly && restPlate ? [{ ...restPlate, opacity: 1, z: 1 }] : display;
  // While a clip is up, its canvas is the only visible image (rig data-rai-bridge-on).
  const bridgeFrame = bridgeClip ?? "off";
  // Smug beat phase, read off what is painted (not what was asked for).
  // oxlint-disable-next-line react/refs -- plates is the painted key; read-only, same as the layers below
  const plateKey = bridgeKeyOfPlates(plates);
  const clipOnStage = clipMode && clipView.visible;
  // Hold is the live smug/wave hold sheet. Entry/exit are bridge canvases.
  const onHoldPose = plateKey === "smug" || plateKey === "wave" || plateKey === "pout";
  const phase: PosePhase = clipMode
    ? bridgeClip
      ? "bridge-out"
      : clipOnStage
        ? "bridge-in"
        : clipView.arrived || plateKey === "smug"
          ? "hold"
          : "idle"
    : bridgeClip
      ? isIntroStageKey(bridgeClip)
        ? "bridge-in"
        : "bridge-out"
      : onHoldPose
        ? "hold"
        : "idle";
  // Hold pose wanted but not on stage yet: frames still decoding, the plain open idle stays up.
  const poseWait =
    bridgeWantsFrames(bridgeKeyOfPlates(desired), plateKey) &&
    !bridgeClip &&
    !clipOnStage &&
    (clipMode ? !clipReady : !onHoldPose);
  const clipDecode = HIP_CLIP_FRAMES.map((_, i) => ((clipBits >> i) & 1 ? "1" : "0")).join("");
  const smugDecode = clipMode
    ? `${clipDecode}${sheets[smugBeatSheetUrls().at(-1)!] != null ? "1" : "0"}`
    : `${clipsState.in ? "1" : "0"}${sheets[smugBeatSheetUrls()[0]!] != null ? "1" : "0"}${clipsState.out ? "1" : "0"}`;
  useEffect(() => {
    setPosePhase(phase);
  }, [phase]);
  // paste-15: tell the app when the next pose is let on (its pose / chew clocks start
  // then, not at line land behind 1084). Runs after every commit; only a change notifies.
  useEffect(() => {
    setSmugReleasePending(smugGateStep.current !== "wanted");
  });
  // Wink is the usual next pose after a held smug: decode it during the hold so a cold
  // slow phone has it by the time 1084 lands (it is lazy otherwise).
  useEffect(() => {
    if (phase !== "hold") return;
    void punchOneRef.current(SPRITES.poses.wink);
  }, [phase]);
  useEffect(() => {
    setPoseStageMounted(true);
    return () => setPoseStageMounted(false);
  }, []);
  return (
    <div
      ref={stageRef}
      className={cn("rai-stage", !stageReady && "rai-stage-pending", className)}
      aria-hidden="true"
      data-rai-engine="png-puppet"
      data-rai-pose={pose}
      data-rai-emotion={emotion}
      data-rai-talking={talking ? "1" : "0"}
      data-rai-blink={blinkShown > 0 && restingBlink ? "1" : "0"}
      data-rai-blink-frame={blinkFrame}
      data-rai-mouth-frame={mouthFrame}
      data-rai-bridge-frame={bridgeFrame}
      data-rai-bridge-fallback={bridgeWaitExpired ? "1" : "0"}
      data-rai-reduced={reducedMotion ? "1" : "0"}
      data-rai-pose-phase={phase}
      data-rai-pose-wait={poseWait ? "1" : "0"}
      data-rai-smug-decode={smugDecode}
      data-rai-clip={clipMode ? "1" : "0"}
      data-rai-clip-ready={clipReady ? "1" : "0"}
      data-rai-clip-frame={clipOnStage ? String(clipView.index).padStart(2, "0") : "off"}
      data-rai-clip-time={clipOnStage ? String(hipClipTimeMs(clipView.index)) : "off"}
      data-rai-clip-dir={clipOnStage ? clipView.dir : "off"}
      data-rai-hold-sheet={
        phase === "hold"
          ? plateKey === "wave"
            ? "wave1126_hold"
            : plateKey === "pout"
              ? "pout1158_hold"
              : "smug1085_hold"
          : "off"
      }
      data-rai-smug-release={smugGate.current?.exiting() ? "exit" : "off"}
      data-rai-build={buildId()}
      data-rai-talk-flap={talkOverlay ? talkOverlay.opacity.toFixed(3) : "0"}
    >
      <div data-rai-rig className="rai-rig">
        {layers.map((layer) => {
          if (layer.role === "eyes" || isRetiredBlinkSrc(layer.src)) return null;
          const src = sheets[layer.src];
          if (!src) return null;
          const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
          // A visible rest frame never opacity-blends. Src swaps are a cut.
          // Fading this sheet out for a pose still uses the pose crossfade.
          const restHardCut = layer.id === IDLE_REST_LAYER_ID && layer.opacity > 0;
          const hardCut =
            restHardCut || isInstantLayer(layer, talking) || fadeMs === 0;
          const style = hardCut
            ? { opacity: layer.opacity, zIndex: layer.z, transition: "none" }
            : {
                opacity: layer.opacity,
                zIndex: layer.z,
                transition: `opacity ${fadeMs}ms var(--ease-smooth-out)`,
              };
          // While a clip is up the live layers are hidden by the rig's data-rai-bridge-on
          // (styles.css), not unmounted, so they stay decoded and come back (mid-fade or not)
          // the moment the clip lands.
          const hidden = clipOnStage ? ({ visibility: "hidden" } as const) : null;
          return (
            <img
              key={layer.id}
              src={src}
              alt=""
              draggable={false}
              // Every sheet is decoded before it can be mounted (decodeSheet). sync
              // makes the loaded-but-not-decoded fallback paint in that frame
              // instead of showing an empty <img>.
              decoding="sync"
              className="rai-layer"
              data-rai-role={layer.role}
              data-rai-sheet={
                layer.id === IDLE_REST_LAYER_ID ? (talkingIdle ? `mouth-${mouthFrame}` : blinkFrame) : undefined
              }
              style={hidden ? { ...style, ...hidden } : style}
            />
          );
        })}
        {clipSupported ? <HipClipLayer ref={canvasRef} visible={clipOnStage} /> : null}
        {/* Bridge clips (smug in/out, wave win/wout, pout pin/pout): painted at 24 fps by the clip workers.
            Visible only while data-rai-bridge-on matches (styles.css). */}
        <canvas
          key="pose-bridge-in"
          ref={bridgeCanvasInRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="in"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        <canvas
          key="pose-bridge-out"
          ref={bridgeCanvasOutRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="out"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        <canvas
          key="pose-bridge-win"
          ref={bridgeCanvasWaveInRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="win"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        <canvas
          key="pose-bridge-wout"
          ref={bridgeCanvasWaveOutRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="wout"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        <canvas
          key="pose-bridge-pin"
          ref={bridgeCanvasPoutInRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="pin"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        <canvas
          key="pose-bridge-pout"
          ref={bridgeCanvasPoutOutRef}
          width={SMUG_CLIP_SHEET.w}
          height={SMUG_CLIP_SHEET.h}
          aria-hidden="true"
          className="rai-layer"
          data-rai-role="bridge"
          data-rai-clip="pout"
          data-rai-sheet="off"
          style={{ opacity: 1, zIndex: 60, transition: "none" }}
        />
        {/* Ahoge / hair tip proxy — rotates over the crown */}
        <span data-rai-ahoge className="rai-ahoge" />
      </div>
      {debugOverlayOn() ? (
        <pre
          data-rai-debug
          style={{
            position: "fixed",
            left: 4,
            top: 4,
            zIndex: 99999,
            margin: 0,
            padding: "4px 6px",
            font: "11px/1.3 monospace",
            color: "#0f0",
            background: "rgba(0,0,0,0.72)",
            pointerEvents: "none",
            whiteSpace: "pre",
          }}
        >
          {`build ${buildId()}\npose ${pose} / ${emotion}\nphase ${phase}${poseWait ? " (waiting for frames)" : ""}\nreduced-motion ${reducedMotion ? "on" : "off"}\n${
            clipMode
              ? `hip clip ${clipReady ? "ready" : "loading"} ${clipBits.toString(2).split("1").length - 1}/${HIP_CLIP_FRAMES.length}\nclip time ${clipOnStage ? `${hipClipTimeMs(clipView.index)} ms (pic ${clipView.index}/${HIP_CLIP_LAST}, ${clipView.dir})` : "off"}\nhold ${phase === "hold" ? "smug1085_hold.webp (hip+smirk)" : clipView.arrived ? "smug1085_hold.webp" : "off"}\nclip decode ${clipDecode} sheet ${smugDecode.slice(-1)}`
              : `smug clips 1085/1084 (24 fps)${clipsState.unsupported ? " UNSUPPORTED: cut" : ""}\nsmug decode in ${smugDecode[0]} hold ${smugDecode[1]} out ${smugDecode[2]}\nclip ${bridgeFrame}`
          }${bridgeWaitExpired ? "\nBRIDGE FALLBACK" : ""}`}
        </pre>
      ) : null}
    </div>
  );
}
