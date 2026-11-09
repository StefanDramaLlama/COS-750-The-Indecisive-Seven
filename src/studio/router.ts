import type { StudioView } from "../shared/types.js";

export type Route = { page: "home" } | { page: "studio"; lessonId: string | null; view: StudioView };

const VIEWS: StudioView[] = ["walkthrough", "pseudocode", "practice"];

export function parseRoute(loc: Location = window.location): Route {
  const path = loc.pathname.replace(/\/+$/, "");
  const m = path.match(/^\/algorithms(?:\/([^/]+))?$/);
  if (!m) return { page: "home" };
  const v = new URLSearchParams(loc.search).get("view") as StudioView | null;
  return {
    page: "studio",
    lessonId: m[1] ? decodeURIComponent(m[1]) : null,
    view: v && VIEWS.includes(v) ? v : "walkthrough",
  };
}

export function studioUrl(lessonId: string, view: StudioView = "walkthrough"): string {
  return `/algorithms/${encodeURIComponent(lessonId)}${view === "walkthrough" ? "" : `?view=${view}`}`;
}

export const NAVIGATE_EVENT = "gw:navigate";

export function navigate(url: string, replace = false): void {
  if (url === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Keep in-app links (home and /algorithms/…) inside the single-page app. */
export function interceptLinks(root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    if (url.pathname !== "/" && !url.pathname.startsWith("/algorithms")) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
}
