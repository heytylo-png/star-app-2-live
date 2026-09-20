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
