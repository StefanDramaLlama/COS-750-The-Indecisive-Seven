import type { Graph, KruskalState, RunResult, TraceFrame } from "../../shared/types.js";
import { Recorder, byId, edgeName, labelOf, sortedVertexIds, validateGraph } from "./common.js";

/** Sort by weight then ID, union-find for components, stop at V − 1 edges. */
export function runKruskal(graph: Graph): { frames: TraceFrame<KruskalState>[]; result: RunResult } {
  validateGraph(graph, { weighted: true, directed: false });
  const L = (id: string) => labelOf(graph, id);
  const ids = sortedVertexIds(graph);
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));

  const parent: Record<string, string> = {};
  for (const id of ids) parent[id] = id;
  const find = (x: string): string => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  // Component labels shown to learners: the smallest vertex id in each set.
  const component: Record<string, string> = {};
  const refreshLabels = () => {
    const smallest: Record<string, string> = {};
    for (const id of ids) {
      const r = find(id);
      if (!smallest[r] || byId(id, smallest[r]) < 0) smallest[r] = id;
    }
    for (const id of ids) component[id] = smallest[find(id)];
  };

  const sortedEdges: string[] = [];
  let cursor = -1;
  const selected: string[] = [];
  const rejected: string[] = [];
  let total = 0;
  const target = ids.length - 1;

  const rec = new Recorder<KruskalState>();
  const state = (): KruskalState => ({
    algorithm: "kruskal",
    sortedEdges,
    cursor,
    component,
    selected,
    rejected,
    total,
  });
  const treeVertices = () =>
    ids.filter((id) => selected.some((eid) => edgeById.get(eid)!.from === id || edgeById.get(eid)!.to === id));
  const base = () => ({ completed: treeVertices(), chosenEdges: [...selected], rejectedEdges: [...rejected] });

  refreshLabels();
  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: {},
    title: "Connect every vertex as cheaply as possible",
    changed: "No edges have been chosen yet.",
    why: "A minimum spanning tree links all vertices using V − 1 edges with the smallest total weight. Kruskal builds it by always taking the cheapest edge that does not close a cycle.",
  });

  sortedEdges.push(
    ...[...graph.edges]
      .sort((a, b) => (a.weight as number) - (b.weight as number) || byId(a.id, b.id))
      .map((e) => e.id),
  );
  rec.emit({
    event: "sort",
    lineId: "r1",
    state: state(),
    highlights: base(),
    title: "Sort the edges by weight",
    changed: `Order: ${sortedEdges.map((id) => `${edgeName(graph, edgeById.get(id)!)} (${edgeById.get(id)!.weight})`).join(", ")}.`,
    why: "Considering edges cheapest-first means each accepted edge is the cheapest safe way to join two pieces.",
  });

  rec.emit({
    event: "components",
    lineId: "r2",
    state: state(),
    highlights: base(),
    title: "Every vertex starts in its own component",
    changed: `${ids.length} separate components: ${ids.map(L).join(", ")}.`,
    why: "Components show which vertices the chosen edges already connect. An edge inside one component would close a cycle.",
  });

  let stopped = false;
  for (cursor = 0; cursor < sortedEdges.length; cursor++) {
    const e = edgeById.get(sortedEdges[cursor])!;
    const name = edgeName(graph, e);
    const ru = find(e.from);
    const rv = find(e.to);
    if (ru !== rv) {
      const before = [component[e.from], component[e.to]].map(L);
      parent[rv] = ru;
      refreshLabels();
      selected.push(e.id);
      total += e.weight as number;
      rec.emit({
        event: "accept",
        lineId: "r5",
        state: state(),
        highlights: { ...base(), currentEdges: [e.id], current: [e.from, e.to] },
        title: `Accept ${name} (${e.weight})`,
        changed: `Components ${before[0]} and ${before[1]} merge. Tree weight is now ${total}.`,
        why: `${L(e.from)} and ${L(e.to)} were in different components, so ${name} joins them without creating a cycle, and nothing cheaper is left that could.`,
      });
    } else {
      rejected.push(e.id);
      rec.emit({
        event: "reject",
        lineId: "r6",
        state: state(),
        highlights: { ...base(), currentEdges: [e.id], current: [e.from, e.to] },
        title: `Skip ${name} (${e.weight})`,
        changed: `${name} is skipped; the tree is unchanged.`,
        why: `${L(e.from)} and ${L(e.to)} are both already in component ${L(component[e.from])}. Adding ${name} would close a cycle.`,
      });
    }
    if (selected.length === target) {
      stopped = true;
      rec.emit({
        event: "stop",
        lineId: "r7",
        state: state(),
        highlights: base(),
        title: `${target} edges chosen, so stop`,
        changed:
          cursor + 1 < sortedEdges.length
            ? `The remaining edges (${sortedEdges.slice(cursor + 1).map((id) => edgeName(graph, edgeById.get(id)!)).join(", ")}) are never examined.`
            : "Every edge has been examined.",
        why: `A spanning tree on ${ids.length} vertices always has exactly ${target} edges.`,
      });
      break;
    }
  }
  if (!stopped) cursor = sortedEdges.length;

  if (selected.length < target) {
    const groups = new Set(Object.values(component)).size;
    rec.emit({
      event: "disconnected",
      lineId: "r8",
      state: state(),
      highlights: { ...base(), resultEdges: [...selected] },
      title: `Only a forest: ${groups} pieces remain`,
      changed: `The edge list is exhausted with ${selected.length} of ${target} edges chosen.`,
      why: "No edge joins the remaining components, so no spanning tree exists. Kruskal returns a minimum spanning forest: one tree per component.",
    });
    return {
      frames: rec.frames,
      result: {
        kind: "diagnostic",
        code: "disconnected",
        message: `The graph is disconnected; the forest has ${groups} components.`,
        partial: { edges: [...selected], weight: total },
      },
    };
  }

  rec.emit({
    event: "done",
    lineId: "r8",
    state: state(),
    highlights: { ...base(), resultEdges: [...selected], resultVertices: [...ids] },
    title: `Minimum spanning tree, weight ${total}`,
    changed: `Tree edges: ${selected.map((id) => edgeName(graph, edgeById.get(id)!)).join(", ")}.`,
    why: "Every accepted edge was the cheapest one that connected two separate components.",
  });
  return { frames: rec.frames, result: { kind: "tree", edges: [...selected], weight: total } };
}
