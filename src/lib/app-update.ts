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

/** Reload only when nothing would be cut: visible, no send/reply/speech in flight, no call. */
export function updateSafeNow(s: { visible: boolean; sending: boolean; talking: boolean; callActive: boolean }): boolean {
  return s.visible && !s.sending && !s.talking && !s.callActive;
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

/** One reload attempt per target build per tab, so a CDN lag can never loop. */
export function mayTryUpdate(live: string, store: Pick<Storage, "getItem"> | null): boolean {
  try {
    return store?.getItem(UPDATE_TRIED_KEY) !== live;
  } catch {
    return true;
  }
}

export function applyUpdate(live: string, draft: string): void {
  try {
    sessionStorage.setItem(UPDATE_TRIED_KEY, live);
    if (draft) sessionStorage.setItem(UPDATE_DRAFT_KEY, draft);
  } catch {
    /* private mode: reload anyway */
  }
  location.replace(updateUrl(live));
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
