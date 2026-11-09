import type { BfsState, Graph, RunResult, TraceFrame } from "../../shared/types.js";
import { Recorder, adjacency, edgeName, labelOf, requireVertex, sortedVertexIds, validateGraph } from "./common.js";

export interface BfsInput {
  startId?: string;
  goalId?: string;
}

/** Array queue with a read index. Discovery is marked at enqueue time, so no vertex enters twice. */
export function runBfs(graph: Graph, input: BfsInput): { frames: TraceFrame<BfsState>[]; result: RunResult } {
  validateGraph(graph, { weighted: false });
  const start = requireVertex(graph, input.startId, "start");
  const goal = input.goalId ? requireVertex(graph, input.goalId, "goal") : undefined;
  const L = (id: string) => labelOf(graph, id);
  const adj = adjacency(graph);
  const ids = sortedVertexIds(graph);

  const queue: string[] = [];
  let head = 0;
  const discovered: string[] = [];
  const hops: Record<string, number | null> = {};
  const prev: Record<string, string | null> = {};
  const prevEdge: Record<string, string | null> = {};
  const visitOrder: string[] = [];
  let current: string | null = null;
  for (const id of ids) {
    hops[id] = null;
    prev[id] = null;
    prevEdge[id] = null;
  }

  const rec = new Recorder<BfsState>();
  const state = (): BfsState => ({ algorithm: "bfs", queue, head, discovered, hops, prev, visitOrder, current });
  const base = () => ({
    discovered: discovered.filter((id) => !visitOrder.includes(id)),
    completed: [...visitOrder],
    chosenEdges: ids.map((id) => prevEdge[id]).filter((e): e is string => e !== null),
  });

  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: { current: [start] },
    title: goal ? `Explore outward from ${L(start)} to reach ${L(goal)}` : `Explore outward from ${L(start)}`,
    changed: "Nothing has been discovered yet.",
    why: "Breadth-first search visits vertices in rings: everything one edge away, then two, and so on. A first-in, first-out queue keeps those rings in order.",
  });

  discovered.push(start);
  hops[start] = 0;
  queue.push(start);
  rec.emit({
    event: "init",
    lineId: "b1",
    state: state(),
    highlights: { ...base(), current: [start] },
    title: `Discover ${L(start)} and enqueue it`,
    changed: `${L(start)} is marked discovered at 0 hops. Queue: [${L(start)}].`,
    why: "The start is zero edges from itself and is the first vertex to process.",
  });

  while (head < queue.length) {
    const u = queue[head++];
    current = u;
    visitOrder.push(u);
    const waiting = queue.slice(head).map(L);
    rec.emit({
      event: "dequeue",
      lineId: "b3",
      state: state(),
      highlights: { ...base(), current: [u] },
      title: `Dequeue ${L(u)}`,
      changed: `${L(u)} leaves the front of the queue (${hops[u]} hop${hops[u] === 1 ? "" : "s"} from ${L(start)}).${
        waiting.length ? ` Still waiting: ${waiting.join(", ")}.` : " The queue is now empty."
      }`,
      why: "The queue is first-in, first-out, so the vertex discovered earliest is processed next. That keeps closer vertices ahead of farther ones.",
    });

    for (const { to: v, edge } of adj.get(u)!) {
      const name = edgeName(graph, edge);
      if (discovered.includes(v)) {
        rec.emit({
          event: "already",
          lineId: "b5",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `${L(v)} is already discovered`,
          changed: `Nothing changes; ${L(v)} is not enqueued again.`,
          why: `${L(v)} was discovered by a route at least as short, so ${name} offers nothing new. Marking at enqueue time is what stops duplicates.`,
        });
        continue;
      }
      discovered.push(v);
      hops[v] = (hops[u] as number) + 1;
      prev[v] = u;
      prevEdge[v] = edge.id;
      queue.push(v);
      rec.emit({
        event: "discover",
        lineId: "b6",
        state: state(),
        highlights: { ...base(), current: [u], currentEdges: [edge.id] },
        title: `Discover ${L(v)} via ${name}`,
        changed: `${L(v)} gets ${hops[v]} hop${hops[v] === 1 ? "" : "s"} and predecessor ${L(u)}, and joins the back of the queue.`,
        why: `${L(v)} is first reached from ${L(u)}, which is ${hops[u]} hop${hops[u] === 1 ? "" : "s"} out, so ${L(v)} is one more.`,
      });
    }
  }
  current = null;

  const unreached = ids.filter((id) => !discovered.includes(id));
  if (!goal) {
    rec.emit({
      event: "done",
      lineId: "b2",
      state: state(),
      highlights: { ...base(), resultVertices: [...visitOrder] },
      title: "The queue is empty",
      changed: `Visit order: ${visitOrder.map(L).join(", ")}.`,
      why: "Every vertex reachable from the start has been dequeued.",
    });
    return { frames: rec.frames, result: { kind: "traversal", order: [...visitOrder], unreached } };
  }

  if (hops[goal] === null) {
    rec.emit({
      event: "unreachable",
      lineId: "b2",
      state: state(),
      highlights: base(),
      title: `${L(goal)} was never discovered`,
      changed: "The queue is empty and the goal has no hop count.",
      why: `No sequence of edges leads from ${L(start)} to ${L(goal)}.`,
    });
    return {
      frames: rec.frames,
      result: {
        kind: "diagnostic",
        code: "unreachable",
        message: `${L(goal)} is not reachable from ${L(start)}.`,
        partial: { order: [...visitOrder] },
      },
    };
  }

  const path: string[] = [];
  const pathEdges: string[] = [];
  for (let at: string | null = goal; at !== null; at = prev[at]) {
    path.unshift(at);
    if (prevEdge[at]) pathEdges.unshift(prevEdge[at] as string);
  }
  rec.emit({
    event: "done",
    lineId: "b7",
    state: state(),
    highlights: { ...base(), resultVertices: path, resultEdges: pathEdges },
    title: `Path: ${path.map(L).join(" → ")}, ${hops[goal]} hops`,
    changed: `Visit order: ${visitOrder.map(L).join(", ")}. Following predecessors back from ${L(goal)} gives the path.`,
    why: "BFS reaches every vertex first along a route with the fewest edges, so this path is a shortest one. Another route of equal length can exist; the tie went to the neighbour with the smaller id.",
  });
  return {
    frames: rec.frames,
    result: { kind: "path", path, pathEdges, cost: hops[goal] as number, unit: "hops", order: [...visitOrder] },
  };
}
