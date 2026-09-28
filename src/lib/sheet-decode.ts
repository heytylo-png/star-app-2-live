/**
 * Decode-before-swap for stage sheets. A sheet only enters the puppet's
 * `sheets` map (and so can be shown) after this settles, so a pose swap never
 * mounts an <img> that has not painted yet. Until then the current frame stays
 * up (see `openRestFallback` in the puppet's plate choice).
 */

/** Longest wait on `decode()` before falling back to a loaded-but-undecoded sheet. */
export const SHEET_DECODE_TIMEOUT_MS = 400;

/**
 * - `decoded`: `decode()` resolved. Swap is a plain cut.
 * - `loaded`: `decode()` was slow (> timeout) or rejected, but the file loaded
 *   (naturalWidth > 0). The stage <img> is `decoding="sync"`, so the browser
 *   decodes it on that paint: at worst a slow frame, never an empty one.
 * - `failed`: the file did not load. Do not show it; keep the current frame.
 */
export type SheetDecodeResult = "decoded" | "loaded" | "failed";

export type DecodableImage = {
  decode(): Promise<void>;
  readonly complete: boolean;
  readonly naturalWidth: number;
  addEventListener(type: "load" | "error", listener: () => void): void;
  removeEventListener(type: "load" | "error", listener: () => void): void;
};

export type DecodeTimers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimers: DecodeTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function decodeSheet(
  img: DecodableImage,
  timeoutMs: number = SHEET_DECODE_TIMEOUT_MS,
  timers: DecodeTimers = defaultTimers,
): Promise<SheetDecodeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let waitingLoad = false;
    const onLoad = () => finish(img.naturalWidth > 0 ? "loaded" : "failed");
    const onError = () => finish("failed");
    const finish = (result: SheetDecodeResult) => {
      if (settled) return;
      settled = true;
      timers.clear(timer);
      if (waitingLoad) {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      }
      resolve(result);
    };
    const fallBack = () => {
      if (settled || waitingLoad) return;
      if (img.complete) {
        finish(img.naturalWidth > 0 ? "loaded" : "failed");
        return;
      }
      // Still downloading. A late decode() can still win with "decoded".
      waitingLoad = true;
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
    };
    const timer = timers.set(fallBack, timeoutMs);
    img.decode().then(
      () => finish("decoded"),
      () => fallBack(),
    );
  });
}
