/**
 * Chart pane “her day” Grok fetch — local sky copy first, optional once per local day.
 * Never posts to Chat. Fail soft. $0 / offline when there is no key.
 */

import { applyHerDayGrokRaw, formatHerDayFactsBlock, localHerDay } from "./chart.ts";
import { getStoredXaiKey, streamGrok } from "./grok.ts";
import type { HerDayCopy, SkyFacts } from "./sky.ts";

const HER_DAY_ASK = "Chart/her-day";

const inflight = new Map<string, Promise<HerDayCopy>>();

/**
 * Local immediately. If an xAI key exists, try the same Grok path with a
 * Chart/her-day ask. Fail / CORS / timeout / banned copy → local.
 */
export async function requestHerDayCopy(opts: {
  todayDate: string;
  sky?: SkyFacts | null;
  signal?: AbortSignal;
}): Promise<HerDayCopy> {
  const local = localHerDay(opts);
  if (!getStoredXaiKey()) return local;

  const existing = inflight.get(opts.todayDate);
  if (existing) return existing;

  const pending = (async () => {
    try {
      let raw = "";
      await streamGrok(
        {
          messages: [{ role: "user", content: HER_DAY_ASK }],
          systemExtra: formatHerDayFactsBlock({
            todayDate: opts.todayDate,
            sky: opts.sky,
          }),
        },
        (delta) => {
          raw += delta;
        },
        opts.signal,
      );
      return applyHerDayGrokRaw(raw, local, opts.sky);
    } catch {
      return local;
    } finally {
      inflight.delete(opts.todayDate);
    }
  })();

  inflight.set(opts.todayDate, pending);
  return pending;
}

export { localHerDay };
