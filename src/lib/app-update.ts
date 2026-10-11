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

/** The URL the reload goes to: a fresh `?v=` so no HTTP or CDN cache can hand back the old index. */
export function updateUrl(live: string): string {
  return `${APP_BASE}?v=${encodeURIComponent(live)}`;
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
export function noteUpdateTry(live: string, store: Pick<Storage, "getItem" | "setItem"> | null, nowMs: number = Date.now()): void {
  try {
    const t = readTried(store);
    const n = t && t.build === live ? t.n + 1 : 1;
    store?.setItem(UPDATE_TRIED_KEY, JSON.stringify({ build: live, at: nowMs, n }));
  } catch {
    /* private mode */
  }
}

export function applyUpdate(live: string, draft: string): void {
  try {
    if (draft) sessionStorage.setItem(UPDATE_DRAFT_KEY, draft);
  } catch {
    /* private mode: reload anyway */
  }
  location.replace(updateUrl(live));
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
  reload?: (live: string, draft: string) => void;
};

/**
 * The stale-build guard's decisions, kept out of React so every check reads live state.
 * onVisibility() on every visibilitychange / persisted pageshow; poll() on the slow timer;
 * settle() whenever a turn or call ends.
 */
export class StaleBuildGuard {
  private live: string | null = null;
  private lastCheck = Number.NEGATIVE_INFINITY;
  private resumeAt = Number.NEGATIVE_INFINITY;
  private readonly d: Required<StaleBuildGuardDeps>;
  constructor(deps: StaleBuildGuardDeps) {
    this.d = {
      now: () => performance.now(),
      wallNow: () => Date.now(),
      store: safeSession,
      reload: applyUpdate,
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
  /** Try to apply now. Returns true when a reload was started. */
  settle(): boolean {
    const live = this.live;
    if (!live) return false;
    if (this.d.now() - this.resumeAt > UPDATE_RESUME_WINDOW_MS) return false;
    if (!updateSafeLive(this.d.busy(), this.d.visibility())) return false;
    if (!mayTryUpdate(live, this.d.store(), this.d.wallNow())) return false;
    this.live = null;
    noteUpdateTry(live, this.d.store(), this.d.wallNow());
    this.d.reload(live, this.d.draft());
    return true;
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
