import type { LessonSummary } from "../shared/types.js";
import { api } from "./api.js";
import { h } from "./dom.js";
import { NAVIGATE_EVENT, interceptLinks, parseRoute, studioUrl } from "./router.js";
import { Studio } from "./studio.js";
import { initTheme } from "./theme.js";
import { TutorPanel, captureScreen } from "./tutor.js";

const app = document.getElementById("app") as HTMLElement;
const nav = document.getElementById("course-nav") as HTMLElement;
const menu = document.querySelector<HTMLButtonElement>(".topbar__menu")!;
const lessonNav = nav.querySelector<HTMLOListElement>("[data-lesson-nav]")!;
const studioLink = nav.querySelector<HTMLAnchorElement>("[data-nav=studio]")!;

initTheme(document.querySelector<HTMLElement>(".theme")!);
interceptLinks(document.body);

/* ------------------------------------------------------------ course nav */

function setNavOpen(open: boolean) {
  nav.classList.toggle("is-open", open);
  menu.setAttribute("aria-expanded", String(open));
  if (open) nav.querySelector<HTMLElement>("a")?.focus();
}
menu.addEventListener("click", () => setNavOpen(!nav.classList.contains("is-open")));
nav.addEventListener("click", (e) => {
  if ((e.target as Element).closest("a")) setNavOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("is-open")) {
    setNavOpen(false);
    menu.focus();
  }
});

let lessons: LessonSummary[] = [];
let completed = new Set<string>();

const studio = new Studio(app, () => renderNav());
const tutor = new TutorPanel(captureScreen);

function renderNav() {
  const route = parseRoute();
  const current = route.page === "studio" ? route.lessonId : null;
  if (route.page === "studio" && !current) studioLink.setAttribute("aria-current", "page");
  else studioLink.removeAttribute("aria-current");
  lessonNav.replaceChildren(
    ...lessons.map((l) =>
      h(
        "li",
        {},
        h(
          "a",
          { href: studioUrl(l.id), "aria-current": l.id === current ? "page" : null },
          h("span", { class: "num" }, String(l.order)),
          h("span", {}, l.title),
          studio.isComplete(l) ? h("span", { class: "done", "aria-label": "practised" }, "✓") : null,
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------------- home page */

function renderHome() {
  document.title = "Graphwise · COS 212";
  app.replaceChildren(
    h(
      "div",
      { class: "page" },
      h("p", { class: "label page__eyebrow" }, "COS 212 · Pre-lecture"),
      h("h1", {}, "Graphs, one step at a time"),
      h(
        "p",
        { class: "page__lede" },
        "Before the lecture, watch six classic graph algorithms run on small examples, read each line of pseudocode as it executes, then try the next move yourself.",
      ),
      h(
        "ol",
        { class: "picker" },
        h(
          "li",
          {},
          h(
            "a",
            { href: "/algorithms" },
            h("span", { class: "num" }, "→"),
            h("span", { class: "title" }, "Algorithm Studio"),
            h("span", { class: "approach" }, "Dijkstra, BFS, DFS, topological sort, Kruskal and Prim."),
            h("span", { class: "status" }, `${lessons.filter((l) => studio.isComplete(l)).length} of ${lessons.length || 6} practised`),
          ),
        ),
        ["Graph Foundations", "Playground", "Code"].map((t) =>
          h("li", {}, h("div", { style: "display:grid;grid-template-columns:48px 1fr;padding:18px 4px;color:var(--ink-3)" }, h("span", { class: "num" }, "·"), h("span", { class: "title" }, `${t} — coming soon`))),
        ),
      ),
    ),
  );
}

/* ---------------------------------------------------------------- routing */

async function route() {
  const r = parseRoute();
  renderNav();
  if (r.page === "home") {
    renderHome();
    return;
  }
  await studio.show(r.lessonId, r.view);
  const title = lessons.find((l) => l.id === studio.currentLessonId())?.title;
  document.title = title ? `${title} · Algorithm Studio` : "Algorithm Studio · Graphwise";
  renderNav();
  tutor.refreshContext();
}

window.addEventListener("popstate", () => void route());
let lastPath = location.pathname;
window.addEventListener(NAVIGATE_EVENT, () => {
  void route();
  // Changing page (not just the view tab) moves focus to the new content.
  if (location.pathname !== lastPath) {
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  lastPath = location.pathname;
});

async function boot() {
  try {
    lessons = await api.lessons();
  } catch {
    lessons = [];
  }
  studio.setLessons(lessons);
  try {
    const progress = await api.progress();
    completed = new Set(progress.filter((p) => p.completedAt).map((p) => `${p.lessonId}@${p.lessonVersion}`));
  } catch {
    completed = new Set();
  }
  studio.setCompleted(completed);
  await route();
}

void boot();
