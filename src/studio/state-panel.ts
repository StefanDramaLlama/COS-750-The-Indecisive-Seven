import type { AlgorithmState, Graph, LessonId, RunResult, TraceFrame } from "../shared/types.js";
import { h, s } from "./dom.js";
import { edgeLabel } from "./graph-view.js";

const inf = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : String(n));

function labeler(graph: Graph) {
  const byId = new Map(graph.vertices.map((v) => [v.id, v.label]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  return {
    v: (id: string | null | undefined) => (id ? (byId.get(id) ?? id) : "—"),
    e: (id: string) => {
      const e = edges.get(id);
      return e ? edgeLabel(graph, e) : id;
    },
    w: (id: string) => edges.get(id)?.weight,
    ids: graph.vertices.map((v) => v.id).sort(),
  };
}

/* --------------------------------------------------------- vertex notes */

/** Short per-vertex annotations drawn under each node (distance, hops, in-degree…). */
export function vertexNotes(state: AlgorithmState | undefined, graph: Graph): Record<string, string> {
  const out: Record<string, string> = {};
  if (!state) return out;
  const L = labeler(graph);
  for (const id of L.ids) {
    switch (state.algorithm) {
      case "dijkstra":
        out[id] = `d=${inf(state.dist[id])}`;
        break;
      case "bfs":
        out[id] = state.hops[id] === null ? "" : `${state.hops[id]} hop${state.hops[id] === 1 ? "" : "s"}`;
        break;
      case "dfs": {
        const i = state.discoveryOrder.indexOf(id);
        out[id] = i < 0 ? "" : `#${i + 1}`;
        break;
      }
      case "topological-sort": {
        const i = state.output.indexOf(id);
        out[id] = i >= 0 ? `#${i + 1}` : `in ${state.inDegree[id]}`;
        break;
      }
      case "kruskal":
        out[id] = `set ${L.v(state.component[id])}`;
        break;
      case "prim":
        out[id] = state.inTree.includes(id) ? "in tree" : "";
        break;
    }
  }
  return out;
}

export function changedKeys(now: Record<string, string>, before: Record<string, string> | null): Set<string> {
  const out = new Set<string>();
  if (!before) return out;
  for (const k of Object.keys(now)) if (now[k] !== before[k] && now[k] !== "") out.add(k);
  return out;
}

/* --------------------------------------------------------------- legend */

type Swatch = "current" | "discovered" | "completed" | "result" | "edge-current" | "edge-chosen" | "edge-rejected" | "edge-frontier" | "edge-result";

const LEGENDS: Record<LessonId, [Swatch, string][]> = {
  dijkstra: [
    ["current", "being processed"],
    ["discovered", "tentative distance"],
    ["completed", "settled"],
    ["edge-current", "edge being relaxed"],
    ["edge-chosen", "predecessor edge"],
    ["edge-result", "cheapest route"],
  ],
  bfs: [
    ["current", "being processed"],
    ["discovered", "in the queue"],
    ["completed", "dequeued"],
    ["edge-current", "edge being checked"],
    ["edge-chosen", "discovery edge"],
    ["edge-result", "shortest path"],
  ],
  dfs: [
    ["current", "top of the stack"],
    ["discovered", "on the stack"],
    ["completed", "finished"],
    ["edge-current", "edge being tried"],
    ["edge-chosen", "tree edge"],
    ["result", "visited"],
  ],
  "topological-sort": [
    ["current", "just placed"],
    ["discovered", "ready"],
    ["completed", "in the output"],
    ["edge-current", "edge being removed"],
    ["edge-chosen", "removed edge"],
    ["edge-rejected", "blocked by a cycle"],
  ],
  kruskal: [
    ["current", "ends of the edge"],
    ["completed", "touched by the tree"],
    ["edge-current", "edge being considered"],
    ["edge-chosen", "accepted"],
    ["edge-rejected", "skipped (cycle)"],
    ["edge-result", "minimum spanning tree"],
  ],
  prim: [
    ["current", "just added"],
    ["completed", "in the tree"],
    ["edge-frontier", "crossing edge"],
    ["edge-current", "edge being added"],
    ["edge-chosen", "tree edge"],
    ["edge-result", "minimum spanning tree"],
  ],
};

function swatch(kind: Swatch): SVGSVGElement {
  if (kind.startsWith("edge-")) {
    const cls = { "edge-current": "is-current", "edge-chosen": "is-chosen", "edge-rejected": "is-rejected", "edge-frontier": "is-frontier", "edge-result": "is-result" }[kind as Exclude<Swatch, "current" | "discovered" | "completed" | "result">];
    return s(
      "svg",
      { viewBox: "0 0 30 22", "aria-hidden": "true" },
      s("g", { class: `g-edge ${cls}` }, s("line", { class: "e-base", x1: 2, y1: 11, x2: 28, y2: 11 }), s("line", { class: "e-inner", x1: 2, y1: 11, x2: 28, y2: 11 })),
    );
  }
  return s(
    "svg",
    { viewBox: "0 0 30 22", "aria-hidden": "true" },
    s(
      "g",
      { class: `g-vertex is-${kind}` },
      s("rect", { class: "v-halo", x: 5, y: 1, width: 20, height: 20, rx: 10 }),
      s("rect", { class: "v-body", x: 8, y: 4, width: 14, height: 14, rx: 7 }),
    ),
  );
}

export function renderLegend(lessonId: LessonId): HTMLUListElement {
  return h("ul", { class: "legend", "aria-label": "Legend" }, LEGENDS[lessonId].map(([k, text]) => h("li", {}, swatch(k), text)));
}

/* ----------------------------------------------------------- state view */

function cell(now: string, before: string | undefined, prevKnown: boolean) {
  const changed = prevKnown && before !== undefined && before !== now;
  return h("td", { class: changed ? "is-changed" : "" }, now, changed ? h("span", { class: "was" }, `was ${before}`) : "");
}

function strip(items: string[], opts: { gone?: number; frontIndex?: number; newItems?: Set<string>; empty: string; label: string }) {
  if (items.length === 0) return h("ul", { class: "strip strip--empty", "aria-label": opts.label }, opts.empty);
  return h(
    "ol",
    { class: "strip", "aria-label": opts.label },
    items.map((it, i) =>
      h(
        "li",
        {
          class: [
            i < (opts.gone ?? 0) ? "is-gone" : "",
            i === opts.frontIndex ? "is-front" : "",
            opts.newItems?.has(it) ? "is-new" : "",
          ].join(" "),
        },
        it,
      ),
    ),
  );
}

function block(title: string, ...children: (Node | null)[]) {
  return h("section", {}, h("h3", {}, title), ...children);
}

export function renderState(frame: TraceFrame | null, prev: TraceFrame | null, graph: Graph): HTMLElement {
  const root = h("div", { class: "state" });
  if (!frame) return root;
  const L = labeler(graph);
  const st = frame.state;
  const pv = prev?.state.algorithm === st.algorithm ? prev.state : null;
  const known = pv !== null;

  switch (st.algorithm) {
    case "dijkstra": {
      const p = pv as typeof st | null;
      root.append(
        block(
          "Distance table",
          h(
            "table",
            { class: "tbl" },
            h("thead", {}, h("tr", {}, h("th", {}, "Vertex"), h("th", {}, "dist"), h("th", {}, "prev"), h("th", {}, "Settled"))),
            h(
              "tbody",
              {},
              L.ids.map((id) =>
                h(
                  "tr",
                  { class: st.current === id ? "is-current" : "" },
                  h("th", { scope: "row" }, L.v(id)),
                  cell(inf(st.dist[id]), p ? inf(p.dist[id]) : undefined, known),
                  cell(L.v(st.prev[id]), p ? L.v(p.prev[id]) : undefined, known),
                  h("td", { class: "tick" }, st.settled.includes(id) ? `✓ ${st.settled.indexOf(id) + 1}` : ""),
                ),
              ),
            ),
          ),
        ),
      );
      break;
    }
    case "bfs": {
      const p = pv as typeof st | null;
      const prevQueue = new Set(p?.queue ?? []);
      root.append(
        h(
          "div",
          { class: "state-grid" },
          block(
            "Queue (front → back)",
            strip(st.queue.map(L.v), {
              gone: st.head,
              frontIndex: st.head < st.queue.length ? st.head : -1,
              newItems: known ? new Set(st.queue.filter((q) => !prevQueue.has(q)).map(L.v)) : undefined,
              empty: "empty",
              label: "Queue",
            }),
            h("p", { class: "strip__caption" }, "Struck-through entries have already been dequeued."),
          ),
          block("Visit order", strip(st.visitOrder.map(L.v), { empty: "nothing yet", label: "Visit order" })),
        ),
        block(
          "Hop table",
          h(
            "table",
            { class: "tbl" },
            h("thead", {}, h("tr", {}, h("th", {}, "Vertex"), h("th", {}, "hops"), h("th", {}, "prev"), h("th", {}, "Discovered"))),
            h(
              "tbody",
              {},
              L.ids.map((id) =>
                h(
                  "tr",
                  { class: st.current === id ? "is-current" : "" },
                  h("th", { scope: "row" }, L.v(id)),
                  cell(inf(st.hops[id]), p ? inf(p.hops[id]) : undefined, known),
                  cell(L.v(st.prev[id]), p ? L.v(p.prev[id]) : undefined, known),
                  h("td", { class: "tick" }, st.discovered.includes(id) ? "✓" : ""),
                ),
              ),
            ),
          ),
        ),
      );
      break;
    }
    case "dfs": {
      const stackEl = st.stack.length
        ? h(
            "ol",
            { class: "stack", "aria-label": "Stack, bottom to top" },
            st.stack.map((f) => h("li", {}, h("span", {}, L.v(f.vertexId)), h("span", {}, `tried ${f.nextNeighborIndex}/${f.neighborCount}`))),
          )
        : h("p", { class: "stack-empty" }, "empty");
      const unvisited = L.ids.filter((id) => !st.visited.includes(id));
      root.append(
        h(
          "div",
          { class: "state-grid" },
          block("Stack (top is active)", stackEl),
          h(
            "div",
            { class: "state" },
            block("Discovery order", strip(st.discoveryOrder.map(L.v), { empty: "nothing yet", label: "Discovery order" })),
            block("Finished", strip(st.finished.map(L.v), { empty: "none yet", label: "Finished" })),
            block("Not visited", strip(unvisited.map(L.v), { empty: "none", label: "Not visited" })),
          ),
        ),
      );
      break;
    }
    case "topological-sort": {
      const p = pv as typeof st | null;
      root.append(
        h(
          "div",
          { class: "state-grid" },
          block(
            "In-degree",
            h(
              "table",
              { class: "tbl" },
              h("thead", {}, h("tr", {}, h("th", {}, "Task"), h("th", {}, "waiting on"), h("th", {}, "Placed"))),
              h(
                "tbody",
                {},
                L.ids.map((id) =>
                  h(
                    "tr",
                    { class: st.current === id ? "is-current" : "" },
                    h("th", { scope: "row" }, L.v(id)),
                    cell(String(st.inDegree[id]), p ? String(p.inDegree[id]) : undefined, known),
                    h("td", { class: "tick" }, st.output.includes(id) ? `#${st.output.indexOf(id) + 1}` : ""),
                  ),
                ),
              ),
            ),
          ),
          h(
            "div",
            { class: "state" },
            block("Ready", strip(st.ready.map(L.v), { frontIndex: 0, empty: "nothing is ready", label: "Ready" })),
            block("Output order", strip(st.output.map(L.v), { empty: "nothing yet", label: "Output" })),
          ),
        ),
      );
      break;
    }
    case "kruskal": {
      const groups = new Map<string, string[]>();
      for (const id of L.ids) groups.set(st.component[id], [...(groups.get(st.component[id]) ?? []), L.v(id)]);
      root.append(
        h(
          "div",
          { class: "state-grid" },
          block(
            "Sorted edges",
            st.sortedEdges.length
              ? h(
                  "ol",
                  { class: "edge-list" },
                  st.sortedEdges.map((eid, i) => {
                    const accepted = st.selected.includes(eid);
                    const rejected = st.rejected.includes(eid);
                    return h(
                      "li",
                      { class: [i === st.cursor ? "is-cursor" : "", accepted ? "is-accepted" : "", rejected ? "is-rejected" : ""].join(" ") },
                      h("span", { class: "e-name" }, `${L.e(eid)}  ${L.w(eid)}`),
                      h("span", { class: "e-status" }, accepted ? "accepted" : rejected ? "skipped" : i === st.cursor ? "now" : ""),
                    );
                  }),
                )
              : h("p", { class: "strip--empty" }, "not sorted yet"),
          ),
          h(
            "div",
            { class: "state" },
            block("Components", strip([...groups.values()].map((g) => `{${g.join(", ")}}`), { empty: "—", label: "Components" })),
            block("Tree weight", h("p", { class: "total" }, String(st.total), h("small", {}, `${st.selected.length} of ${L.ids.length - 1} edges`))),
          ),
        ),
      );
      break;
    }
    case "prim": {
      const outside = L.ids.filter((id) => !st.inTree.includes(id));
      root.append(
        h(
          "div",
          { class: "state-grid" },
          block(
            "Crossing edges (cheapest first)",
            st.crossing.length
              ? h(
                  "ol",
                  { class: "edge-list" },
                  st.crossing.map((eid, i) =>
                    h("li", { class: i === 0 ? "is-cursor" : "" }, h("span", { class: "e-name" }, `${L.e(eid)}  ${L.w(eid)}`), h("span", { class: "e-status" }, i === 0 ? "cheapest" : "")),
                  ),
                )
              : h("p", { class: "strip--empty" }, "not scanned this round"),
          ),
          h(
            "div",
            { class: "state" },
            block("In the tree", strip(st.inTree.map(L.v), { empty: "empty", label: "In the tree" })),
            block("Outside", strip(outside.map(L.v), { empty: "none", label: "Outside the tree" })),
            block("Tree weight", h("p", { class: "total" }, String(st.total), h("small", {}, `${st.selected.length} of ${L.ids.length - 1} edges`))),
          ),
        ),
      );
      break;
    }
  }
  return root;
}

/* --------------------------------------------------------------- result */

export function describeResult(result: RunResult, graph: Graph): { headline: string; detail: string; diagnostic: boolean } {
  const L = labeler(graph);
  switch (result.kind) {
    case "path":
      return {
        headline: `${result.path.map(L.v).join(" → ")}`,
        detail: result.unit === "hops" ? `${result.cost} edges` : `total cost ${result.cost}`,
        diagnostic: false,
      };
    case "traversal":
      return {
        headline: `Visited ${result.order.map(L.v).join(", ")}`,
        detail: result.unreached.length ? `Never reached: ${result.unreached.map(L.v).join(", ")}` : "Every vertex was reached.",
        diagnostic: false,
      };
    case "order":
      return { headline: result.order.map(L.v).join(" → "), detail: "Every edge points forward.", diagnostic: false };
    case "tree":
      return { headline: `Tree weight ${result.weight}`, detail: result.edges.map(L.e).join(", "), diagnostic: false };
    case "diagnostic":
      return {
        headline: result.message,
        detail: [
          result.partial.order ? `Partial order: ${result.partial.order.map(L.v).join(", ")}` : "",
          result.partial.edges ? `Edges kept: ${result.partial.edges.map(L.e).join(", ") || "none"} (weight ${result.partial.weight ?? 0})` : "",
        ]
          .filter(Boolean)
          .join(". "),
        diagnostic: true,
      };
  }
}

export function renderResult(result: RunResult, graph: Graph, title = "Result"): HTMLElement {
  const r = describeResult(result, graph);
  return h(
    "div",
    { class: `result-box${r.diagnostic ? " is-diagnostic" : ""}` },
    h("span", { class: "label" }, r.diagnostic ? `${title} · no complete answer` : title),
    h("strong", {}, r.headline),
    r.detail ? h("span", {}, r.detail) : null,
  );
}

/* --------------------------------------------------- text alternative */

export function textSummary(graph: Graph, frame: TraceFrame | null): HTMLElement {
  const L = labeler(graph);
  const hl = frame?.highlights;
  const words = (id: string) =>
    [
      hl?.current.includes(id) && "current",
      hl?.discovered.includes(id) && "discovered or ready",
      hl?.completed.includes(id) && "completed",
      hl?.resultVertices.includes(id) && "part of the result",
    ]
      .filter(Boolean)
      .join(", ");
  const ewords = (id: string) =>
    [
      hl?.currentEdges.includes(id) && "being considered",
      hl?.chosenEdges.includes(id) && "kept",
      hl?.rejectedEdges.includes(id) && "skipped",
      hl?.frontierEdges.includes(id) && "crossing",
      hl?.resultEdges.includes(id) && "in the result",
    ]
      .filter(Boolean)
      .join(", ");
  const notes = vertexNotes(frame?.state, graph);
  return h(
    "div",
    {},
    h("p", {}, `${graph.directed ? "Directed" : "Undirected"} graph with ${graph.vertices.length} vertices and ${graph.edges.length} edges.`),
    frame ? h("p", {}, `Step ${frame.index + 1}: ${frame.title}.`) : null,
    h(
      "ul",
      {},
      graph.vertices.map((v) => {
        const w = words(v.id);
        const n = notes[v.id];
        return h("li", {}, `Vertex ${v.label}${n ? ` (${n})` : ""}${w ? `: ${w}` : ""}`);
      }),
      graph.edges.map((e) => {
        const w = ewords(e.id);
        return h("li", {}, `Edge ${L.e(e.id)}${e.weight !== undefined ? `, weight ${e.weight}` : ""}${w ? `: ${w}` : ""}`);
      }),
    ),
  );
}
