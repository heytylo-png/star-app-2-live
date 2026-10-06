import type { ClipDecoder } from "./smug-clip-frames.ts";

/** The smug clips are animated AVIF (AV1 + alpha). */
export const SMUG_CLIP_TYPE = "image/avif";

/** Raised when this browser cannot decode the clips at all (no ImageDecoder / no animated AVIF). */
export class ClipUnsupportedError extends Error {}

/**
 * Fetch a smug clip and open a WebCodecs ImageDecoder on it. Throws ClipUnsupportedError
 * when the browser has no way to decode it (the stage then hard-cuts like reduced motion);
 * any other failure (network, bad file) throws a plain error and is retried.
 */
export async function openSmugClipDecoder(url: string): Promise<ClipDecoder<VideoFrame>> {
  if (typeof ImageDecoder === "undefined") throw new ClipUnsupportedError("no ImageDecoder");
  if (!(await ImageDecoder.isTypeSupported(SMUG_CLIP_TYPE))) throw new ClipUnsupportedError(`${SMUG_CLIP_TYPE} unsupported`);
  const res = await fetch(url, { priority: "high" } as RequestInit);
  if (!res.ok) throw new Error(`smug clip ${res.status}`);
  const data = await res.arrayBuffer();
  const dec = new ImageDecoder({ data, type: SMUG_CLIP_TYPE });
  await dec.tracks.ready;
  return {
    decode: (opts) => dec.decode(opts),
    close: () => dec.close(),
    frameCount: async () => {
      await dec.completed;
      return dec.tracks.selectedTrack?.frameCount ?? 0;
    },
  };
}
