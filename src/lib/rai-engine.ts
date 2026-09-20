/**
 * Presence engine flag (animation track #2).
 *
 * Default is always the official PNG puppet. Spine/cutout is opt-in via query
 * so Call/Chat and the live face cannot accidentally ship a Lab/3D body.
 * `lab` / `3d` / mesh flags are ignored — 3D identity stays paused.
 */

export const RAI_ENGINES = ["png-puppet", "spine", "spine-rai"] as const;
export type RaiEngineId = (typeof RAI_ENGINES)[number];

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function param(search: string, key: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get(key)?.trim().toLowerCase() ?? "";
}

/**
 * Parse a location search string (`?spine=1`, `?engine=spine`, `?spine=rai`).
 * Unknown / missing → png-puppet.
 */
export function parseRaiEngine(search: string): RaiEngineId {
  const engine = param(search, "engine");
  const spine = param(search, "spine");
  const cutout = param(search, "cutout");

  if (engine === "png" || engine === "png-puppet" || engine === "puppet") {
    return "png-puppet";
  }
  if (engine === "rai" || spine === "rai" || engine === "spine-rai") {
    return "spine-rai";
  }
  if (
    engine === "spine" ||
    engine === "cutout" ||
    engine === "dragonbones" ||
    TRUTHY.has(spine) ||
    TRUTHY.has(cutout)
  ) {
    return "spine";
  }
  return "png-puppet";
}

export function isSpineDemoEngine(engine: RaiEngineId): engine is "spine" | "spine-rai" {
  return engine === "spine" || engine === "spine-rai";
}

/** 3D Lab / mesh identity is not a presence engine. Never map these on. */
export function isPausedIdentityFlag(search: string): boolean {
  const lab = param(search, "lab");
  const mesh = param(search, "mesh");
  const three = param(search, "3d");
  return TRUTHY.has(lab) || TRUTHY.has(mesh) || TRUTHY.has(three);
}

export function withBasePath(rel: string): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL || "/";
  const left = base.endsWith("/") ? base : `${base}/`;
  const right = rel.replace(/^\//, "");
  return `${left}${right}`;
}
