/**
 * Stale-build guard for the installed PWA.
 *
 * Android keeps an installed PWA's page alive in the background for days. Resuming it does not
 * navigate, so the JS it runs is whatever build it first loaded: new deploys (pose clips, sheet
 * maps) never reach it until the app is killed. The service worker cannot help: it only answers
 * navigations, and a resume is not one.
 *
 * So the app asks for the live index.html when it comes back to the foreground (and on a slow
 * timer while open), reads its `<meta name="star-rai-build">` stamp, and if it differs from the
 * running build, reloads onto the new build at a safe moment: page visible, no turn in flight,
 * no call. The composer draft rides across the reload in sessionStorage.
 *
 * Caching: the check is `cache: "no-store"`, so the browser HTTP cache is never used, and the
 * service worker leaves `?build-check=` to the network. GitHub Pages' CDN ignores the query
 * string (Cache-Control: max-age=600), and there is no per-deploy unique path to fetch, so the
 * CDN copy decides. Pages purges that copy when a deploy finishes, so a check normally sees the new
 * stamp straight away. If an edge still holds the old copy, a check can lag a deploy by up to
 * ~10 min. A reload that lands on a stale copy is retried after 2 min, at most 3 times
 * (mayTryUpdate), so it never loops.
 */
import { buildId } from "./build-id.ts";

export const APP_BASE = "/star-app-2-live/";
/** Query flag the service worker leaves to the network (never cached). */
export const BUILD_CHECK_PARAM = "build-check";
export const UPDATE_DRAFT_KEY = "star-rai-update-draft";
const UPDATE_TRIED_KEY = "star-rai-update-tried";
/** Foreground resumes closer together than this share one check. */
export const BUILD_CHECK_MIN_GAP_MS = 5_000;
/** While the app stays open and visible. */
export const BUILD_CHECK_EVERY_MS = 10 * 60_000;

/** The deploy stamp in an index.html, or null. */
export function buildStampFromHtml(html: string): string | null {
  const m = /<meta\s+name=["']star-rai-build["']\s+content=["']([^"']+)["']/i.exec(html);
  return m ? m[1]!.trim() || null : null;
}

/** True when the live stamp names a different deploy than the one running. Local/dev never updates. */
export function isNewerBuild(running: string, live: string | null): boolean {
  if (!live || !running || running === "dev") return false;
  return live !== running;
}

/** Reload-only query param: unique per attempt, so the browser HTTP cache can never answer it. */
export const RELOAD_PARAM = "r";

/**
 * The URL the reload goes to: `?v=<live>&r=<attempt>-<time>`. `v` names the build (as the manifest
 * start_url does); `r` makes every attempt a new URL, so a retry is never served from the
 * browser cache (max-age=600) and always reaches the network. `r` is dropped after load.
 */
export function updateUrl(live: string, attempt = 1, nowMs: number = Date.now()): string {
  return `${APP_BASE}?v=${encodeURIComponent(live)}&${RELOAD_PARAM}=${attempt}-${nowMs.toString(36)}`;
}

/** The address bar without the reload param (other params and the hash kept), or null if none. */
export function withoutReloadParam(href: string): string | null {
  const u = new URL(href);
  if (!u.searchParams.has(RELOAD_PARAM)) return null;
  u.searchParams.delete(RELOAD_PARAM);
  return `${u.pathname}${u.search}${u.hash}`;
}

/** After an update reload: drop `r` from the address bar so a later reload / share is the plain URL. */
export function stripReloadParam(): void {
  try {
    const clean = withoutReloadParam(location.href);
    if (clean != null) history.replaceState(history.state, "", clean);
  } catch {
    /* no history API */
  }
}

export async function fetchLiveBuild(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`${APP_BASE}?${BUILD_CHECK_PARAM}=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return buildStampFromHtml(await res.text());
  } catch {
    return null;
  }
}

/** Reload attempts per target build: retried after a gap (a reload can land on a stale CDN copy), capped. */
export const UPDATE_RETRY_AFTER_MS = 2 * 60_000;
export const UPDATE_MAX_TRIES = 3;
type Tried = { build: string; at: number; n: number };

function readTried(store: Pick<Storage, "getItem"> | null): Tried | null {
  try {
    const raw = store?.getItem(UPDATE_TRIED_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<Tried>;
    if (typeof t.build !== "string" || typeof t.at !== "number" || typeof t.n !== "number") return null;
    return { build: t.build, at: t.at, n: t.n };
  } catch {
    return null;
  }
}

/**
 * May this tab reload onto `live` now? First try: yes. A try that landed back on the old build
 * (stale CDN copy): again after UPDATE_RETRY_AFTER_MS, at most UPDATE_MAX_TRIES times. Never a loop.
 */
export function mayTryUpdate(live: string, store: Pick<Storage, "getItem"> | null, nowMs: number = Date.now()): boolean {
  const t = readTried(store);
  if (!t || t.build !== live) return true;
  if (t.n >= UPDATE_MAX_TRIES) return false;
  return nowMs - t.at >= UPDATE_RETRY_AFTER_MS;
}

/** Record a reload attempt onto `live` (count grows per attempt on the same target). */
export function noteUpdateTry(live: string, store: Pick<Storage, "getItem" | "setItem"> | null, nowMs: number = Date.now()): number {
  const t = readTried(store);
  const n = t && t.build === live ? t.n + 1 : 1;
  try {
    store?.setItem(UPDATE_TRIED_KEY, JSON.stringify({ build: live, at: nowMs, n }));
  } catch {
    /* private mode */
  }
  return n;
}

export function applyUpdate(live: string, draft: string, attempt = 1): void {
  try {
    if (draft) sessionStorage.setItem(UPDATE_DRAFT_KEY, draft);
  } catch {
    /* private mode: reload anyway */
  }
  location.replace(updateUrl(live, attempt));
}

function safeSession(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Live "is anything in flight" state, read at the moment of the decision (never a value saved at render). */
export type UpdateBusy = {
  sending: boolean;
  /** A reply stream is open (its AbortController is still set). */
  streaming: boolean;
  /** Speaking / TTS or text chew turn still running. */
  talking: boolean;
  callActive: boolean;
  callStarting: boolean;
};

export function updateSafeLive(busy: UpdateBusy, visibilityState: DocumentVisibilityState | string): boolean {
  return (
    visibilityState === "visible" &&
    !busy.sending &&
    !busy.streaming &&
    !busy.talking &&
    !busy.callActive &&
    !busy.callStarting
  );
}

/** A resume opens this window; a turn that is still finishing in it applies when it is done. */
export const UPDATE_RESUME_WINDOW_MS = 20_000;

export type StaleBuildGuardDeps = {
  running: () => string;
  fetchLive: () => Promise<string | null>;
  busy: () => UpdateBusy;
  visibility: () => DocumentVisibilityState | string;
  draft: () => string;
  now?: () => number;
  wallNow?: () => number;
  store?: () => Pick<Storage, "getItem" | "setItem"> | null;
  reload?: (live: string, draft: string, attempt: number) => void;
  /** Timer for the in-window re-check (tests pass a fake). */
  setTimer?: (fn: () => void, ms: number) => unknown;
};

/** While a resume window is open and a turn is still finishing, re-check this often. */
export const UPDATE_SETTLE_POLL_MS = 500;

/**
 * The stale-build guard's decisions, kept out of React so every check reads live state.
 * onVisibility() on every visibilitychange / persisted pageshow; poll() on the slow timer;
 * settle() whenever a turn or call ends.
 */
export class StaleBuildGuard {
  private live: string | null = null;
  private lastCheck = Number.NEGATIVE_INFINITY;
  private resumeAt = Number.NEGATIVE_INFINITY;
  private pollArmed = false;
  private readonly d: Required<StaleBuildGuardDeps>;
  constructor(deps: StaleBuildGuardDeps) {
    this.d = {
      now: () => performance.now(),
      wallNow: () => Date.now(),
      store: safeSession,
      reload: applyUpdate,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      ...deps,
    };
  }
  pending(): string | null {
    return this.live;
  }
  private async check(): Promise<void> {
    this.lastCheck = this.d.now();
    let live: string | null = null;
    try {
      live = await this.d.fetchLive();
    } catch {
      live = null;
    }
    // 500 / offline / no stamp: keep what we knew, never reload on it.
    if (live && isNewerBuild(this.d.running(), live)) this.live = live;
    else if (live) this.live = null;
  }
  /**
   * Try to apply now. Returns true when a reload was started. Called on resume, and by every
   * path that clears a busy ref (reply finally, TTS stop, cancel, barge-in, hang-up, call start
   * failure). As a backstop, while the window is open and only "busy" holds it back, it re-checks
   * itself every UPDATE_SETTLE_POLL_MS until the window closes.
   */
  settle(): boolean {
    const live = this.live;
    if (!live) return false;
    if (this.d.now() - this.resumeAt > UPDATE_RESUME_WINDOW_MS) return false;
    if (this.d.visibility() !== "visible") return false;
    if (!mayTryUpdate(live, this.d.store(), this.d.wallNow())) return false;
    if (!updateSafeLive(this.d.busy(), this.d.visibility())) {
      this.armPoll();
      return false;
    }
    this.live = null;
    const attempt = noteUpdateTry(live, this.d.store(), this.d.wallNow());
    this.d.reload(live, this.d.draft(), attempt);
    return true;
  }
  private armPoll(): void {
    if (this.pollArmed) return;
    this.pollArmed = true;
    this.d.setTimer(() => {
      this.pollArmed = false;
      this.settle();
    }, UPDATE_SETTLE_POLL_MS);
  }
  async onVisibility(): Promise<boolean> {
    if (this.d.visibility() !== "visible") return false;
    this.resumeAt = this.d.now();
    if (this.d.now() - this.lastCheck >= BUILD_CHECK_MIN_GAP_MS) await this.check();
    return this.settle();
  }
  async poll(): Promise<void> {
    if (this.d.visibility() === "visible") await this.check();
  }
}

/** Draft carried across an update reload (read once, then cleared). */
export function takeUpdateDraft(): string {
  try {
    const d = sessionStorage.getItem(UPDATE_DRAFT_KEY) ?? "";
    sessionStorage.removeItem(UPDATE_DRAFT_KEY);
    return d;
  } catch {
    return "";
  }
}

export function runningBuild(): string {
  return buildId();
}
