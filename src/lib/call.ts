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

/** Empty / whitespace STT → keep the mic hot; do not invent a user line. */
export function callTranscriptAction(transcript: string | null | undefined): CallTranscriptAction {
  return transcript?.trim() ? "send" : "keep_listening";
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
export const MIC_UNBLOCK_STEPS = `Chrome ⋮ or the lock icon → Site settings → Microphone → Allow for ${CALL_PAGES_HOST}`;

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

/**
 * SpeechRecognition error after a mic grant.
 * Empty / no-speech / aborted → keep the listen loop. Permission errors surface.
 */
export function speechRecErrorAction(
  error: string | undefined,
  micGranted: boolean,
): "restart" | "denied" | "ignore" {
  const err = (error ?? "").toLowerCase();
  if (err === "no-speech" || err === "aborted") return "restart";
  if (err === "network") return "restart";
  if (err === "audio-capture" && micGranted) return "restart";
  if (err === "not-allowed" || err === "service-not-allowed") return "denied";
  if (err === "audio-capture") return "denied";
  if (!err) return "ignore";
  return "restart";
}

export type CallGumFn = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

/**
 * Start getUserMedia on the tap itself (no setTimeout / await before this call).
 * Android Chrome shows the mic prompt for gUM, not for SpeechRecognition alone.
 */
export function beginCallMicRequest(getUserMedia: CallGumFn): Promise<MediaStream> {
  return getUserMedia({ audio: true });
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
