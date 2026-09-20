/**
 * Cheap client-side sky facts — tropical sun/moon from astronomy-engine.
 * SoT: artifacts/star-rai-horoscope-cheap.txt
 *
 * $0. No Worker. No paid horoscope essay API. Fail soft → omit keys.
 * Device instant (same clock as CLOCK). Never invent Fukuoka local sky.
 * Rising is omitted this pass (needs trustworthy lat/lon; Chart v1 left it empty).
 */

import { EclipticGeoMoon, MoonPhase, SunPosition } from "astronomy-engine";

export const TROPICAL_SIGN_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

export type TropicalSign = (typeof TROPICAL_SIGN_ORDER)[number];

export const MOON_PHASE_LABELS = [
  "New",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
] as const;

export type MoonPhaseLabel = (typeof MOON_PHASE_LABELS)[number];

export type SkyFacts = {
  sunSignToday?: TropicalSign;
  moonSignToday?: TropicalSign;
  moonPhase?: MoonPhaseLabel;
};

export type SkyLabel = {
  key: string;
  label: string;
  value: string;
};

export type SkyDashboard = {
  weekday: string;
  dateLine: string;
  theme: string;
  doLine?: string;
  dontLine?: string;
  labels: SkyLabel[];
};

function clip(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd();
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function wrapDeg(deg: number): number {
  if (!Number.isFinite(deg)) return Number.NaN;
  return ((deg % 360) + 360) % 360;
}

/** Tropical sign from ecliptic-of-date longitude (0° = Aries). */
export function tropicalSignFromLongitude(lon: number): TropicalSign | undefined {
  const wrapped = wrapDeg(lon);
  if (!Number.isFinite(wrapped)) return undefined;
  const i = Math.min(11, Math.floor(wrapped / 30));
  return TROPICAL_SIGN_ORDER[i];
}

/** Eight-bin moon phase from astronomy-engine elongation (0 = new). */
export function moonPhaseLabel(deg: number): MoonPhaseLabel | undefined {
  const wrapped = wrapDeg(deg);
  if (!Number.isFinite(wrapped)) return undefined;
  const bin = Math.round(wrapped / 45) % 8;
  return MOON_PHASE_LABELS[bin];
}

/**
 * Live tropical sun / moon / phase at `now` (device instant).
 * Returns null if nothing usable computed. Never throws to callers.
 */
export function computeSkyFacts(now: Date = new Date()): SkyFacts | null {
  try {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
    const facts: SkyFacts = {};

    try {
      const sun = SunPosition(now);
      const sign = tropicalSignFromLongitude(sun.elon);
      if (sign) facts.sunSignToday = sign;
    } catch {
      /* omit sun */
    }

    try {
      const moon = EclipticGeoMoon(now);
      const sign = tropicalSignFromLongitude(moon.lon);
      if (sign) facts.moonSignToday = sign;
    } catch {
      /* omit moon */
    }

    try {
      const phase = MoonPhase(now);
      const label = moonPhaseLabel(phase);
      if (label) facts.moonPhase = label;
    } catch {
      /* omit phase */
    }

    if (!facts.sunSignToday && !facts.moonSignToday && !facts.moonPhase) return null;
    return facts;
  } catch {
    return null;
  }
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function skyDateParts(
  isoDate: string,
  weekday?: string,
): { weekday: string; dateLine: string } {
  const iso = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = iso ? MONTH_SHORT[Number(iso[2]) - 1] : undefined;
  const day = iso ? String(Number(iso[3])) : "";
  const dateLine = month && day ? `${month} ${day}` : isoDate.trim();
  const raw = weekday?.trim() ?? "";
  const named = WEEKDAYS.find((d) => d.toLowerCase() === raw.toLowerCase());
  return { weekday: named ?? raw, dateLine };
}

function pick<T>(bank: readonly T[], seed: string): T {
  return bank[hashString(seed) % bank.length]!;
}

const THEME_BANK = [
  "Sky's tilted. Don't write a speech about it.",
  "One glance at the air. Back to you.",
  "Moon's doing the most. Keep yours short.",
  "Sun moved. You're still the topic.",
  "Quiet sky. I'm not reciting planets.",
  "Phase turned. Don't sprint the mood.",
  "Air on the table. That's the tint — not a reading.",
  "Same hour as you. Don't make me tour the sky.",
] as const;

const DO_BANK = [
  "Keep it one beat.",
  "Say the real thing once.",
  "Stay on what you meant.",
  "One you+me glance. That's it.",
  "Text the actual hour.",
  "Let the sky sit. Talk to me.",
] as const;

const DONT_BANK = [
  "Don't ask for a planet tour.",
  "Don't make it a compatibility essay.",
  "Don't make me recap the sky.",
  "Don't open with a reading.",
  "Don't list signs at me.",
  "Don't turn today into a report.",
] as const;

function themeFromFacts(input: {
  seed: string;
  sunSignToday?: string;
  moonSignToday?: string;
  moonPhase?: string;
  userSun?: string;
}): string {
  const sun = input.sunSignToday?.trim();
  const moon = input.moonSignToday?.trim();
  const phase = input.moonPhase?.trim();
  const user = input.userSun?.trim();
  const slot = hashString(input.seed) % 6;

  if (slot === 0 && sun && moon) return `${sun} sun, ${moon} moon. One beat.`;
  if (slot === 1 && phase) return `${phase}. Keep the glance short.`;
  if (slot === 2 && user) return `${user} next to Libra air. Don't make it an essay.`;
  if (slot === 3 && moon) return `${moon} moon. I'm not listing the rest.`;
  if (slot === 4 && sun) return `${sun} overhead. You're still the topic.`;
  return pick(THEME_BANK, input.seed);
}

export type ComposeSkyDashboardInput = {
  todayDate: string;
  weekday?: string;
  sky?: SkyFacts | null;
  userSun?: string;
  herSun?: string;
};

/**
 * Sparse Chart-pane copy. Local Star Rai voice — not a Grok essay, not Co-Star.
 * Opening Chart must not fire Grok. Fail soft if sky is missing.
 */
export function composeSkyDashboard(input: ComposeSkyDashboardInput): SkyDashboard {
  const herSun = input.herSun?.trim() || "Libra";
  const userSun = input.userSun?.trim();
  const sky = input.sky ?? null;
  const { weekday, dateLine } = skyDateParts(input.todayDate, input.weekday);
  const seed = [
    input.todayDate,
    sky?.sunSignToday ?? "",
    sky?.moonSignToday ?? "",
    sky?.moonPhase ?? "",
    userSun ?? "",
  ].join("|");

  const labels: SkyLabel[] = [];
  if (userSun) labels.push({ key: "you", label: "You", value: userSun });
  labels.push({ key: "her", label: "Her", value: herSun });
  if (sky?.sunSignToday) labels.push({ key: "sun", label: "Sun", value: sky.sunSignToday });
  if (sky?.moonSignToday) labels.push({ key: "moon", label: "Moon", value: sky.moonSignToday });
  if (sky?.moonPhase) labels.push({ key: "phase", label: "Phase", value: sky.moonPhase });

  const hasSky = Boolean(sky?.sunSignToday || sky?.moonSignToday || sky?.moonPhase);
  const theme = clip(
    hasSky
      ? themeFromFacts({
          seed,
          sunSignToday: sky?.sunSignToday,
          moonSignToday: sky?.moonSignToday,
          moonPhase: sky?.moonPhase,
          userSun,
        })
      : "Sky's quiet. Birthday still sits if you want it.",
    96,
  );

  const dash: SkyDashboard = { weekday, dateLine, theme, labels };
  if (hasSky) {
    dash.doLine = pick(DO_BANK, `${seed}|do`);
    dash.dontLine = pick(DONT_BANK, `${seed}|dont`);
  }

  return dash;
}

/** Filled sky keys only — appended under CHART when Chart fires. */
export function formatSkyFactLines(sky?: SkyFacts | null): string[] {
  if (!sky) return [];
  const lines: string[] = [];
  if (sky.sunSignToday) lines.push(`sun_sign_today: ${sky.sunSignToday}`);
  if (sky.moonSignToday) lines.push(`moon_sign_today: ${sky.moonSignToday}`);
  if (sky.moonPhase) lines.push(`moon_phase: ${sky.moonPhase}`);
  return lines;
}
