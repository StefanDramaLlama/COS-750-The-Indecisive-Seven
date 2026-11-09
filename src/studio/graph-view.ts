import type { Edge, Graph, Highlights, Positions } from "../shared/types.js";
import { s } from "./dom.js";

const NODE_H = 38;

let uid = 0;

export function nodeWidth(label: string): number {
  return label.length <= 2 ? NODE_H : Math.round(label.length * 8.4 + 24);
}

/** Distance from a node's centre to its outline along unit direction (ux, uy). */
function boundary(w: number, ux: number, uy: number): number {
  if (w === NODE_H) return NODE_H / 2;
  const hw = w / 2;
  const hh = NODE_H / 2;
  const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

export function edgeLabel(graph: Graph, e: Edge): string {
  const L = (id: string) => graph.vertices.find((v) => v.id === id)?.label ?? id;
  return `${L(e.from)}${graph.directed ? "→" : "–"}${L(e.to)}`;
}

export interface GraphViewOptions {
  title: string;
  startId?: string;
  goalId?: string;
  /** Smaller marks for thumbnails such as primers. */
  compact?: boolean;
}

/**
 * A stable SVG for one example. Vertex and edge groups are created once;
 * update() only toggles classes, markers and note text.
 */
export class GraphView {
  readonly root: SVGSVGElement;
  private vertexEls = new Map<string, { g: SVGGElement; note: SVGTextElement }>();
  private edgeEls = new Map<string, { g: SVGGElement; base: SVGLineElement }>();
  private markerIdle: string;
  private markerInk: string;

  constructor(
    private graph: Graph,
    positions: Positions,
    opts: GraphViewOptions,
  ) {
    const id = ++uid;
    this.markerIdle = `gw-arrow-idle-${id}`;
    this.markerInk = `gw-arrow-ink-${id}`;
    const hatchId = "gw-hatch";

    const xs = graph.vertices.map((v) => positions[v.id].x);
    const ys = graph.vertices.map((v) => positions[v.id].y);
    const maxW = Math.max(...graph.vertices.map((v) => nodeWidth(v.label)));
    const padX = maxW / 2 + 20;
    const minX = Math.min(...xs) - padX;
    const minY = Math.min(...ys) - (opts.compact ? 30 : 44);
    const width = Math.max(...xs) + padX - minX;
    const height = Math.max(...ys) + (opts.compact ? 30 : 50) - minY;

    const arrow = (mid: string, cls: string) =>
      s(
        "marker",
        { id: mid, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" },
        s("path", { d: "M0 0.5 10 5 0 9.5z", class: cls }),
      );

    this.root = s(
      "svg",
      {
        viewBox: `${minX} ${minY} ${width} ${height}`,
        role: "img",
        "aria-label": opts.title,
        preserveAspectRatio: "xMidYMid meet",
      },
      s(
        "defs",
        {},
        arrow(this.markerIdle, "m-idle"),
        arrow(this.markerInk, "m-ink"),
        // One shared hatch pattern; duplicate ids across SVGs resolve to the same look.
        s(
          "pattern",
          { id: hatchId, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
          s("rect", { width: 6, height: 6, class: "gw-hatch-bg" }),
          s("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "gw-hatch-line" }),
        ),
      ),
    );

    const edgeLayer = s("g", { class: "g-edges" });
    const vertexLayer = s("g", { class: "g-vertices" });
    this.root.append(edgeLayer, vertexLayer);

    const widthOf = new Map(graph.vertices.map((v) => [v.id, nodeWidth(v.label)]));

    for (const e of graph.edges) {
      const p = positions[e.from];
      const q = positions[e.to];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const a = boundary(widthOf.get(e.from)!, ux, uy);
      const b = boundary(widthOf.get(e.to)!, ux, uy) + (graph.directed ? 3 : 0);
      const x1 = p.x + ux * a;
      const y1 = p.y + uy * a;
      const x2 = q.x - ux * b;
      const y2 = q.y - uy * b;
      // Put the weight on the upper / left side of the line.
      let nx = -uy;
      let ny = ux;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
        nx = -nx;
        ny = -ny;
      }
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const base = s("line", {
        class: "e-base",
        x1,
        y1,
        x2,
        y2,
        "marker-end": graph.directed ? `url(#${this.markerIdle})` : null,
      });
      const g = s(
        "g",
        { class: "g-edge", "data-id": e.id },
        base,
        s("line", { class: "e-inner", x1, y1, x2, y2 }),
        e.weight !== undefined ? s("text", { class: "e-weight", x: mx + nx * 13, y: my + ny * 13 }, String(e.weight)) : null,
        s("text", { class: "e-mark", x: mx - nx * 12, y: my - ny * 12, "aria-hidden": "true" }, "✕"),
      );
      edgeLayer.append(g);
      this.edgeEls.set(e.id, { g, base });
    }

    for (const v of graph.vertices) {
      const { x, y } = positions[v.id];
      const w = widthOf.get(v.id)!;
      const role = v.id === opts.startId ? "start" : v.id === opts.goalId ? "goal" : null;
      const note = s("text", { class: "v-note", x, y: y + NODE_H / 2 + 16 });
      const g = s(
        "g",
        { class: "g-vertex", "data-id": v.id },
        s("rect", { class: "v-halo", x: x - w / 2 - 5, y: y - NODE_H / 2 - 5, width: w + 10, height: NODE_H + 10, rx: (NODE_H + 10) / 2 }),
        s("rect", { class: "v-body", x: x - w / 2, y: y - NODE_H / 2, width: w, height: NODE_H, rx: NODE_H / 2 }),
        s("text", { class: "v-label", x, y: y + 1 }, v.label),
        role ? s("text", { class: "v-role", x, y: y - NODE_H / 2 - 10 }, role) : null,
        note,
      );
      vertexLayer.append(g);
      this.vertexEls.set(v.id, { g, note });
    }
  }

  update(h: Highlights | null, notes: Record<string, string> = {}, changedNotes: Set<string> = new Set()): void {
    const has = (list: string[] | undefined, id: string) => !!list && list.includes(id);
    for (const [id, { g, note }] of this.vertexEls) {
      g.classList.toggle("is-current", has(h?.current, id));
      g.classList.toggle("is-discovered", has(h?.discovered, id));
      g.classList.toggle("is-completed", has(h?.completed, id));
      g.classList.toggle("is-result", has(h?.resultVertices, id));
      note.textContent = notes[id] ?? "";
      note.classList.toggle("is-changed", changedNotes.has(id));
    }
    for (const [id, { g, base }] of this.edgeEls) {
      const current = has(h?.currentEdges, id);
      const result = has(h?.resultEdges, id);
      const chosen = has(h?.chosenEdges, id);
      g.classList.toggle("is-current", current);
      g.classList.toggle("is-chosen", chosen);
      g.classList.toggle("is-rejected", has(h?.rejectedEdges, id));
      g.classList.toggle("is-frontier", has(h?.frontierEdges, id));
      g.classList.toggle("is-result", result);
      if (this.graph.directed) {
        base.setAttribute("marker-end", `url(#${current || result || chosen ? this.markerInk : this.markerIdle})`);
      }
    }
  }
}
