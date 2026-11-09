import type { DfsState, Graph, RunResult, TraceFrame } from "../../shared/types.js";
import { Recorder, adjacency, edgeName, labelOf, requireVertex, sortedVertexIds, validateGraph } from "./common.js";

export interface DfsInput {
  startId?: string;
}

/**
 * Iterative DFS with an explicit stack of {vertexId, nextNeighborIndex} frames,
 * mirroring the call frames of the recursive version.
 */
export function runDfs(graph: Graph, input: DfsInput): { frames: TraceFrame<DfsState>[]; result: RunResult } {
  validateGraph(graph);
  const start = requireVertex(graph, input.startId, "start");
  const L = (id: string) => labelOf(graph, id);
  const adj = adjacency(graph);
  const ids = sortedVertexIds(graph);

  const stack: DfsState["stack"] = [];
  const visited: string[] = [];
  const discoveryOrder: string[] = [];
  const finished: string[] = [];
  const treeEdges: string[] = [];
  let current: string | null = null;

  const rec = new Recorder<DfsState>();
  const state = (): DfsState => ({ algorithm: "dfs", stack, visited, discoveryOrder, finished, current });
  const base = () => ({
    discovered: visited.filter((id) => !finished.includes(id)),
    completed: [...finished],
    chosenEdges: [...treeEdges],
  });
  const push = (id: string) =>
    stack.push({ vertexId: id, nextNeighborIndex: 0, neighborCount: adj.get(id)!.length });

  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: { current: [start] },
    title: `Explore as deep as possible from ${L(start)}`,
    changed: "Nothing has been visited yet.",
    why: "Depth-first search follows one branch until it runs out of new vertices, then backs up to the most recent vertex that still has untried neighbours. The stack below plays the role of recursive calls.",
  });

  visited.push(start);
  discoveryOrder.push(start);
  push(start);
  current = start;
  rec.emit({
    event: "init",
    lineId: "f1",
    state: state(),
    highlights: { ...base(), current: [start] },
    title: `Visit ${L(start)} and push it`,
    changed: `${L(start)} is marked visited and becomes the only frame on the stack.`,
    why: "Exploration starts at the start vertex, like calling dfs(start).",
  });

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const u = top.vertexId;
    current = u;
    const neighbors = adj.get(u)!;
    if (top.nextNeighborIndex < neighbors.length) {
      const { to: v, edge } = neighbors[top.nextNeighborIndex];
      top.nextNeighborIndex += 1;
      const name = edgeName(graph, edge);
      if (visited.includes(v)) {
        rec.emit({
          event: "skip",
          lineId: "f6",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `${L(v)} is already visited`,
          changed: `${L(u)} moves past ${name}; nothing is pushed.`,
          why: `Going back into ${L(v)} would revisit explored ground (and could loop forever on a cycle).`,
        });
        continue;
      }
      visited.push(v);
      discoveryOrder.push(v);
      treeEdges.push(edge.id);
      push(v);
      current = v;
      rec.emit({
        event: "discover",
        lineId: "f6",
        state: state(),
        highlights: { ...base(), current: [v], currentEdges: [edge.id] },
        title: `Go deeper: visit ${L(v)} via ${name}`,
        changed: `${L(v)} is marked visited and pushed on top of ${L(u)}.`,
        why: `${L(v)} is the first untried, unvisited neighbour of ${L(u)}. DFS commits to it immediately instead of finishing ${L(u)}'s other neighbours.`,
      });
      continue;
    }

    stack.pop();
    finished.push(u);
    const below = stack[stack.length - 1]?.vertexId ?? null;
    current = below;
    rec.emit({
      event: "backtrack",
      lineId: "f7",
      state: state(),
      highlights: { ...base(), current: below ? [below] : [], completed: [...finished] },
      title: below ? `Backtrack from ${L(u)} to ${L(below)}` : `Finish ${L(u)}; the stack is empty`,
      changed: below
        ? `${L(u)} has no untried neighbours left, so its frame is popped and ${L(below)} resumes where it left off.`
        : `${L(u)} has no untried neighbours left. Popping it empties the stack.`,
      why: below
        ? `This is the "return" of a recursive call: ${L(below)} is the most recent vertex that might still have unexplored neighbours.`
        : "There is nowhere left to return to, so the traversal from the start is complete.",
    });
  }
  current = null;

  const unreached = ids.filter((id) => !visited.includes(id));
  rec.emit({
    event: "done",
    lineId: "f8",
    state: state(),
    highlights: { ...base(), resultVertices: [...discoveryOrder], resultEdges: [...treeEdges] },
    title: `Discovery order: ${discoveryOrder.map(L).join(", ")}`,
    changed: unreached.length
      ? `${unreached.map(L).join(" and ")} ${unreached.length === 1 ? "was" : "were"} never visited.`
      : "Every vertex was visited.",
    why: unreached.length
      ? `No edge connects ${L(start)}'s component to ${unreached.map(L).join(" or ")}. DFS from one start only covers the component it starts in.`
      : `The graph is connected, so one DFS from ${L(start)} reaches everything.`,
  });
  return { frames: rec.frames, result: { kind: "traversal", order: [...discoveryOrder], unreached } };
}
