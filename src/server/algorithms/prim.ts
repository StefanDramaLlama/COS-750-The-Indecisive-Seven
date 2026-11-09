import type { Graph, PrimState, RunResult, TraceFrame } from "../../shared/types.js";
import { Recorder, byId, edgeName, labelOf, requireVertex, sortedVertexIds, validateGraph } from "./common.js";

export interface PrimInput {
  startId?: string;
}

/** Simple Prim: rescan the edge list for crossing edges each round, O(VE). */
export function runPrim(graph: Graph, input: PrimInput): { frames: TraceFrame<PrimState>[]; result: RunResult } {
  validateGraph(graph, { weighted: true, directed: false });
  const start = requireVertex(graph, input.startId, "start");
  const L = (id: string) => labelOf(graph, id);
  const ids = sortedVertexIds(graph);
  const label = (eid: string) => {
    const e = graph.edges.find((x) => x.id === eid)!;
    return `${edgeName(graph, e)} (${e.weight})`;
  };

  const inTree: string[] = [];
  let crossing: string[] = [];
  const selected: string[] = [];
  let total = 0;
  let current: string | null = null;

  const rec = new Recorder<PrimState>();
  const state = (): PrimState => ({ algorithm: "prim", inTree, crossing, selected, total, current });
  const base = () => ({ completed: [...inTree], chosenEdges: [...selected] });

  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: { current: [start] },
    title: `Grow one tree outward from ${L(start)}`,
    changed: "The tree is empty.",
    why: "Prim keeps a single connected tree and, each round, adds the cheapest edge that leaves it. That edge is always safe to include in a minimum spanning tree.",
  });

  inTree.push(start);
  current = start;
  rec.emit({
    event: "init",
    lineId: "p1",
    state: state(),
    highlights: { ...base(), current: [start] },
    title: `Start the tree at ${L(start)}`,
    changed: `Tree = {${L(start)}}, total weight 0.`,
    why: "Any vertex can be the root; the finished tree has the same total weight.",
  });

  while (inTree.length < ids.length) {
    crossing = graph.edges
      .filter((e) => inTree.includes(e.from) !== inTree.includes(e.to))
      .sort((a, b) => (a.weight as number) - (b.weight as number) || byId(a.id, b.id))
      .map((e) => e.id);
    current = null;
    if (crossing.length === 0) break;

    rec.emit({
      event: "scan",
      lineId: "p3",
      state: state(),
      highlights: { ...base(), frontierEdges: [...crossing] },
      title: "Find the edges leaving the tree",
      changed: `Crossing edges: ${crossing.map(label).join(", ")}.`,
      why: "Only an edge with exactly one end in the tree can grow it. Edges inside the tree would close a cycle, and edges entirely outside it are not attached yet.",
    });

    const e = graph.edges.find((x) => x.id === crossing[0])!;
    const v = inTree.includes(e.from) ? e.to : e.from;
    inTree.push(v);
    selected.push(e.id);
    total += e.weight as number;
    current = v;
    const passedOver = crossing.slice(1);
    crossing = [];
    rec.emit({
      event: "add",
      lineId: "p6",
      state: state(),
      highlights: { ...base(), current: [v], currentEdges: [e.id] },
      title: `Add ${label(e.id)}`,
      changed: `${L(v)} joins the tree. Total weight is now ${total}.`,
      why: passedOver.length
        ? `It is the cheapest crossing edge; ${passedOver.map(label).join(", ")} cost at least as much.`
        : "It is the only edge leaving the tree.",
    });
  }
  current = null;

  if (inTree.length < ids.length) {
    const outside = ids.filter((id) => !inTree.includes(id));
    rec.emit({
      event: "disconnected",
      lineId: "p4",
      state: state(),
      highlights: { ...base(), resultEdges: [...selected] },
      title: "No edge leaves the tree",
      changed: `${outside.map(L).join(", ")} ${outside.length === 1 ? "is" : "are"} still outside, with no crossing edge.`,
      why: `The graph is disconnected. Prim only ever grows ${L(start)}'s tree, so the result spans just that component.`,
    });
    return {
      frames: rec.frames,
      result: {
        kind: "diagnostic",
        code: "disconnected",
        message: `${outside.map(L).join(", ")} cannot be reached from ${L(start)}.`,
        partial: { edges: [...selected], weight: total },
      },
    };
  }

  rec.emit({
    event: "done",
    lineId: "p7",
    state: state(),
    highlights: { ...base(), resultEdges: [...selected], resultVertices: [...inTree] },
    title: `Minimum spanning tree, weight ${total}`,
    changed: `Edges in the order added: ${selected.map(label).join(", ")}.`,
    why: "Every vertex is in the tree, and each addition was the cheapest way to extend it.",
  });
  return { frames: rec.frames, result: { kind: "tree", edges: [...selected], weight: total } };
}
