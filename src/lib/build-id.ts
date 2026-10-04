/** The deploy stamp (`<meta name="star-rai-build">`, added by the gh-pages publish); "dev" locally. */
export function buildId(): string {
  if (typeof document === "undefined") return "dev";
  return document.querySelector('meta[name="star-rai-build"]')?.getAttribute("content") || "dev";
}

/** `?debug=1` only. Nothing else turns the debug readout on. */
export function debugOverlayOn(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}
