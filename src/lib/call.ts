/**
 * Call mode — listen → same Chat brain → speak the line only.
 * SoT: artifacts/star-rai-call-mode.txt
 *
 * Phone icon starts a loop. Hang up leaves chat / memory / sheet intact.
 * Transcripts may enter the thread. Mic audio is never stored.
 */

import { speakable } from "./companion.ts";
import { streamLine } from "./rai.ts";

/** Never persist SpeechRecognition / TTS audio blobs. */
export const CALL_STORE_RECORDINGS = false;

export type CallTranscriptAction = "send" | "keep_listening";

/** Single filler sounds / noise blips — not a user turn. */
export const CALL_FILLER_SOUNDS = new Set([
  "uh",
  "uhh",
  "uhhh",
  "um",
  "umm",
  "ummm",
  "ah",
  "ahh",
  "er",
  "eh",
  "oh",
  "hm",
  "hmm",
  "hmmm",
  "mm",
  "mmm",
  "mhm",
  "mmhm",
  "mmhmm",
  "huh",
  "huhh",
  "uhuh",
  "unh",
  "nn",
  "nnh",
  "tch",
  "tsk",
]);

/** Ignore one-letter noise; keep real shorts like hi / ok / no / yo. */
export const CALL_MIN_ALNUM_CHARS = 2;

/**
 * Wait for a pause before sending one utterance.
 * Hot STT still doubles the first word at ~800ms ("hello hello") — 1000–1200ms
 * lets the phrase settle, then we collapse duplicate n-grams / unigrams once.
 */
export const CALL_FINAL_DEBOUNCE_MS = 1100;

/** After her TTS, wait before the mic is hot again (room echo / her line). */
export const CALL_POST_TTS_COOLDOWN_MS = 450;

/** Empty / no-speech restart delays — do not thrash start/stop. */
export const CALL_LISTEN_BACKOFF_MS = [400, 700, 1100, 1600, 2200] as const;

/** SpeechRecognition must not run while TTS plays her line. Tap still interrupts. */
export const CALL_LISTEN_DURING_TTS = false;

/**
 * Chrome-friendly capture constraints for noisy rooms / Android.
 * goog* keys are still honored on many Chromium builds; stripped on OverconstrainedError.
 */
export const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export const CALL_AUDIO_CONSTRAINTS_CHROME: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  // Chromium extras — not in the WebIDL, but Chrome Android reads them.
  googEchoCancellation: true,
  googNoiseSuppression: true,
  googAutoGainControl: true,
  googHighpassFilter: true,
  googTypingNoiseDetection: true,
} as MediaTrackConstraints;

export function nextCallListenBackoffMs(emptyCycle: number): number {
  const i = Math.max(0, Math.min(Math.floor(emptyCycle), CALL_LISTEN_BACKOFF_MS.length - 1));
  return CALL_LISTEN_BACKOFF_MS[i];
}

export function isCallFillerTranscript(transcript: string): boolean {
  const compact = transcript
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  return Boolean(compact) && CALL_FILLER_SOUNDS.has(compact);
}

/**
 * Strip empty / whitespace / filler / tiny noise. Returns "" when Call should
 * keep listening and not invent a user line.
 */
export function meaningfulTranscript(transcript: string | null | undefined): string {
  const trimmed = (transcript ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const alnum = trimmed.replace(/[^\p{L}\p{N}]+/gu, "");
  if (alnum.length < CALL_MIN_ALNUM_CHARS) return "";
  if (isCallFillerTranscript(trimmed)) return "";
  return trimmed;
}

/**
 * Empty / whitespace / very short / filler STT → keep the mic hot; do not invent a user line.
 * Prefer this on *final* transcripts only — never send noisy interim.
 */
export function callTranscriptAction(transcript: string | null | undefined): CallTranscriptAction {
  return meaningfulTranscript(transcript) ? "send" : "keep_listening";
}

function normCallToken(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function ngramsEqual(tokens: string[], a: number, b: number, n: number): boolean {
  for (let k = 0; k < n; k++) {
    if (normCallToken(tokens[a + k]) !== normCallToken(tokens[b + k])) return false;
  }
  return true;
}

/**
 * Collapse immediate duplicate n-grams from hot STT.
 * "who's your favorite artist" ×4 → once.
 * Immediate repeated unigrams ("hello hello") and a leading duplicate first
 * word are dropped — that was the leftover double after PR #16.
 */
export function collapseDuplicateNgrams(text: string): string {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  let tokens = raw.split(" ");
  for (let guard = 0; guard < 8; guard++) {
    const nMax = Math.floor(tokens.length / 2);
    if (nMax < 1) break;
    let did = false;
    for (let n = nMax; n >= 1 && !did; n--) {
      const out: string[] = [];
      let i = 0;
      while (i < tokens.length) {
        if (i + 2 * n <= tokens.length && ngramsEqual(tokens, i, i + n, n)) {
          let reps = 2;
          while (i + (reps + 1) * n <= tokens.length && ngramsEqual(tokens, i, i + reps * n, n)) {
            reps += 1;
          }
          out.push(...tokens.slice(i, i + n));
          i += reps * n;
          did = true;
          continue;
        }
        out.push(tokens[i]);
        i += 1;
      }
      if (did) tokens = out;
    }
    if (!did) break;
  }
  return tokens.join(" ");
}

/**
 * User bubble + send path: keep SpeechRecognition text as-is.
 * Do not rewrite tokens to memory names (Rai↔Ray or similar). She already
 * has the user name in memory — no ASR name autocorrect on shown or sent text.
 */
export function keepRawSttText(transcript: string, knownNames: readonly string[] = []): string {
  void knownNames;
  return (transcript ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCallUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameCallUtterance(a: string, b: string): boolean {
  const left = normalizeCallUtterance(a);
  const right = normalizeCallUtterance(b);
  return Boolean(left) && left === right;
}

/**
 * Append a SpeechRecognition *final* if it is a new utterance.
 * Drops empty / filler and immediate repeats of the last final.
 * Returns true when the buffer changed.
 */
export function pushCallFinal(finals: string[], piece: string): boolean {
  const cleaned = collapseDuplicateNgrams(meaningfulTranscript(piece));
  if (!cleaned) return false;
  const last = finals[finals.length - 1];
  if (last && sameCallUtterance(last, cleaned)) return false;
  const joined = finals.join(" ");
  if (joined && sameCallUtterance(collapseDuplicateNgrams(`${joined} ${cleaned}`), joined)) return false;
  finals.push(cleaned);
  return true;
}

/** Finals only. Interim is caption preview — never a user turn. One collapsed utterance. */
export function callUtteranceToSend(opts: { finals: string[]; interim?: string }): string {
  const joined = collapseDuplicateNgrams(opts.finals.join(" "));
  return keepRawSttText(meaningfulTranscript(joined));
}

export type CallSubmitGate = {
  talking: boolean;
  sending: boolean;
  listenPausedForTts: boolean;
  finals: string[];
};

/**
 * Submit gate for Call listen:
 * - one utterance per submit (collapsed finals)
 * - wait for CALL_FINAL_DEBOUNCE_MS pause in the listen loop before calling this
 * - do not send while she is speaking / thinking
 * - empty / garbage STT → keep listening, no reply
 */
export function gateCallUtterance(opts: CallSubmitGate): {
  action: CallTranscriptAction;
  text: string;
} {
  if (opts.talking || opts.sending || opts.listenPausedForTts) {
    return { action: "keep_listening", text: "" };
  }
  const text = callUtteranceToSend({ finals: opts.finals });
  if (!text) return { action: "keep_listening", text: "" };
  return { action: "send", text };
}

/**
 * Speaker mute in chrome wins. Starting a call must not flip voiceOn on.
 * Call mode still listens and shows the bubble when muted — it just skips TTS.
 */
export function shouldSpeakCallLine(opts: { voiceOn: boolean; line: string }): boolean {
  return Boolean(opts.voiceOn) && Boolean(speakable(opts.line));
}

/** Hide / unload / freeze end the call so the mic does not stay hot. */
export function shouldEndCallOnPageEvent(opts: {
  type: string;
  visibilityState?: string;
}): boolean {
  if (opts.type === "pagehide" || opts.type === "beforeunload" || opts.type === "freeze") {
    return true;
  }
  if (opts.type === "visibilitychange") return opts.visibilityState === "hidden";
  return false;
}

/**
 * TTS / bubble text from a parsed act. Prefer `line`; if the model leaked JSON
 * or a dump, extract the speakable field and refuse memory/lore lists.
 */
export function spokenCallLine(rawOrLine: string): string {
  const trimmed = rawOrLine.trim();
  if (!trimmed) return "";
  const extracted = trimmed.startsWith("{") || trimmed.startsWith("[") ? streamLine(trimmed) : trimmed;
  return speakable(extracted);
}

export type CallHangUpSnapshot = {
  callActive: boolean;
  listening: boolean;
  talking: boolean;
  threadMessageCount: number;
  memoryCount: number;
  pose: string;
};

/** Hang up aborts mic + TTS. It does not wipe the thread, memory, or sheet. */
export function hangUpCallState(before: CallHangUpSnapshot): CallHangUpSnapshot {
  return {
    callActive: false,
    listening: false,
    talking: false,
    threadMessageCount: before.threadMessageCount,
    memoryCount: before.memoryCount,
    pose: before.pose,
  };
}

/** Live Pages host — used in the unblock copy. */
export const CALL_PAGES_HOST = "heytylo-png.github.io";

export type CallMicNoticeKind =
  | "denied"
  | "unavailable"
  | "no-speech-api"
  | "insecure"
  | "busy";

export type CallMicNotice = {
  kind: CallMicNoticeKind;
  title: string;
  body: string;
};

/** Android Chrome: site settings path when the prompt never appears (blocked). */
export const MIC_UNBLOCK_STEPS = `Chrome menu or the lock icon → Site settings → Microphone → Allow for ${CALL_PAGES_HOST}`;

export function callMicNotice(kind: CallMicNoticeKind): CallMicNotice {
  if (kind === "no-speech-api") {
    return {
      kind,
      title: "This browser can't listen",
      body: "Call mode needs Chrome speech input (webkitSpeechRecognition). Type instead, or open this page in Chrome.",
    };
  }
  if (kind === "insecure") {
    return {
      kind,
      title: "Mic needs a secure page",
      body: "Open the HTTPS GitHub Pages URL in Chrome, then tap the phone again.",
    };
  }
  if (kind === "unavailable") {
    return {
      kind,
      title: "Can't use the microphone",
      body: `No mic, or another app has it. Close other recorders, then tap the phone again. If Chrome never asked: ${MIC_UNBLOCK_STEPS}.`,
    };
  }
  if (kind === "busy") {
    return {
      kind,
      title: "Mic busy",
      body: "Something else is using the microphone. Hang up other calls, then tap the phone again.",
    };
  }
  return {
    kind: "denied",
    title: "Microphone is blocked",
    body: `Chrome didn't allow the mic (no prompt, or it was denied). ${MIC_UNBLOCK_STEPS}, then tap the phone again.`,
  };
}

export function classifyGetUserMediaError(err: unknown): CallMicNoticeKind {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "unavailable";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  if (name === "OverconstrainedError") return "unavailable";
  if (name === "SecurityError") return "insecure";
  if (name === "AbortError") return "busy";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (/not allowed|permission|denied|blocked/i.test(message)) return "denied";
  return "denied";
}

export type SpeechRecErrorAction = "backoff" | "denied" | "ignore";

/**
 * SpeechRecognition error after a mic grant.
 * no-speech / aborted / network → do not start() from onerror (Chrome also fires
 * onend). Back off from onend and keep Call hot until hangup. Permission errors surface.
 */
export function speechRecErrorAction(
  error: string | undefined,
  micGranted: boolean,
): SpeechRecErrorAction {
  const err = (error ?? "").toLowerCase();
  if (err === "no-speech" || err === "aborted") return "backoff";
  if (err === "network") return "backoff";
  if (err === "audio-capture" && micGranted) return "backoff";
  if (err === "not-allowed" || err === "service-not-allowed") return "denied";
  if (err === "audio-capture") return "denied";
  if (!err) return "ignore";
  return "backoff";
}

/** Never call rec.start() from onerror — one restart path (onend + backoff). */
export function shouldStartRecognitionOnError(_action: SpeechRecErrorAction): boolean {
  return false;
}

export type CallGumFn = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

function gumErrorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
}

/**
 * Start getUserMedia on the tap itself (no setTimeout / await before this call).
 * Android Chrome shows the mic prompt for gUM, not for SpeechRecognition alone.
 * Asks for echo cancellation / noise suppression / AGC; retries without Chrome
 * extras, then `{ audio: true }`, if the device rejects the constraint set.
 */
export function beginCallMicRequest(getUserMedia: CallGumFn): Promise<MediaStream> {
  return getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS_CHROME }).catch((err) => {
    const name = gumErrorName(err);
    if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw err;
    return getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS }).catch((err2) => {
      const name2 = gumErrorName(err2);
      if (name2 !== "OverconstrainedError" && name2 !== "ConstraintNotSatisfiedError") throw err2;
      return getUserMedia({ audio: true });
    });
  });
}

/** Stop every track. Safe to call twice. Never records. */
export function stopMediaTracks(stream: { getTracks: () => { stop: () => void }[] } | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}
