import type { Graph, Highlights, Positions, PrimerId } from "../shared/types.js";
import { h } from "./dom.js";
import { GraphView } from "./graph-view.js";

// Authored before/after fixtures. Vertex positions never move; one property changes.

interface Side {
  graph: Graph;
  highlights?: Partial<Highlights>;
  caption: string;
}

interface Primer {
  title: string;
  positions: Positions;
  before: Side;
  after: Side;
}

const tri: Positions = { A: { x: 40, y: 40 }, B: { x: 160, y: 40 }, C: { x: 100, y: 120 } };
const line4: Positions = { A: { x: 30, y: 60 }, B: { x: 100, y: 60 }, C: { x: 170, y: 60 }, D: { x: 240, y: 60 } };
const V = (...ids: string[]) => ids.map((id) => ({ id, label: id }));
const E = (from: string, to: string, weight?: number) => ({ id: `${from}-${to}`, from, to, ...(weight === undefined ? {} : { weight }) });

const PRIMERS: Record<PrimerId, Primer> = {
  directed: {
    title: "Direction",
    positions: tri,
    before: { graph: { directed: false, vertices: V("A", "B", "C"), edges: [E("A", "B"), E("B", "C")] }, caption: "A plain edge can be crossed either way." },
    after: {
      graph: { directed: true, vertices: V("A", "B", "C"), edges: [E("A", "B"), E("B", "C")] },
      highlights: { chosenEdges: ["A-B", "B-C"] },
      caption: "An arrow goes one way only: A → B, never B → A.",
    },
  },
  cycle: {
    title: "Cycles",
    positions: tri,
    before: { graph: { directed: false, vertices: V("A", "B", "C"), edges: [E("A", "B"), E("B", "C")] }, caption: "A path: there is one way between any two vertices." },
    after: {
      graph: { directed: false, vertices: V("A", "B", "C"), edges: [E("A", "B"), E("B", "C"), E("C", "A")] },
      highlights: { currentEdges: ["C-A"] },
      caption: "Adding C–A closes a loop, so A → B → C → A is a cycle.",
    },
  },
  connectivity: {
    title: "Connectivity",
    positions: line4,
    before: {
      graph: { directed: false, vertices: V("A", "B", "C", "D"), edges: [E("A", "B"), E("B", "C"), E("C", "D")] },
      highlights: { currentEdges: ["B-C"] },
      caption: "One component: every vertex can reach every other.",
    },
    after: {
      graph: { directed: false, vertices: V("A", "B", "C", "D"), edges: [E("A", "B"), E("C", "D")] },
      highlights: { completed: ["A", "B"] },
      caption: "Removing B–C splits it: {A, B} can no longer reach {C, D}.",
    },
  },
  weighted: {
    title: "Weights",
    positions: tri,
    before: { graph: { directed: false, vertices: V("A", "B", "C"), edges: [E("A", "B"), E("B", "C"), E("A", "C")] }, caption: "Unweighted: every edge counts as one step." },
    after: {
      graph: { directed: false, vertices: V("A", "B", "C"), edges: [E("A", "B", 4), E("B", "C", 1), E("A", "C", 2)] },
      caption: "Same edges, now with costs. The direct A–B (4) costs more than A–C–B (3).",
    },
  },
};

function primerCard(id: PrimerId): HTMLElement {
  const p = PRIMERS[id];
  const figure = h("div", {});
  const caption = h("p", { class: "primer__caption" });
  const beforeBtn = h("button", { type: "button", "aria-pressed": "true" }, "Before");
  const afterBtn = h("button", { type: "button", "aria-pressed": "false" }, "After");
  const show = (which: "before" | "after") => {
    const side = p[which];
    const view = new GraphView(side.graph, p.positions, { title: `${p.title}, ${which}: ${side.caption}`, compact: true });
    view.update({ current: [], currentEdges: [], discovered: [], completed: [], chosenEdges: [], rejectedEdges: [], frontierEdges: [], resultVertices: [], resultEdges: [], ...side.highlights });
    figure.replaceChildren(view.root);
    caption.textContent = side.caption;
    beforeBtn.setAttribute("aria-pressed", String(which === "before"));
    afterBtn.setAttribute("aria-pressed", String(which === "after"));
  };
  beforeBtn.addEventListener("click", () => show("before"));
  afterBtn.addEventListener("click", () => show("after"));
  show("before");
  return h(
    "div",
    { class: "primer" },
    h("div", { class: "primer__head" }, h("span", { class: "primer__title" }, p.title), h("span", { class: "toggle", role: "group", "aria-label": `${p.title}: before or after` }, beforeBtn, afterBtn)),
    figure,
    caption,
  );
}

export function renderPrimers(ids: PrimerId[]): HTMLElement {
  return h("section", { class: "primers" }, h("h3", {}, "Property primers"), h("div", { class: "primers__row" }, ids.map(primerCard)));
}
