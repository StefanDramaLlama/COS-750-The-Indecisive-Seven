import type { DijkstraState, Graph, RunResult, TraceFrame } from "../../shared/types.js";
import {
  Recorder,
  adjacency,
  byId,
  edgeName,
  fmt,
  labelOf,
  requireVertex,
  sortedVertexIds,
  validateGraph,
} from "./common.js";

export interface DijkstraInput {
  startId?: string;
  goalId?: string;
}

/**
 * Table-scan Dijkstra, O(V² + E). One frame per teachable event:
 * initialise, select the minimum, consider each edge (relax / keep / skip settled), finish.
 */
export function runDijkstra(
  graph: Graph,
  input: DijkstraInput,
): { frames: TraceFrame<DijkstraState>[]; result: RunResult } {
  validateGraph(graph, { weighted: true, nonNegative: true });
  const start = requireVertex(graph, input.startId, "start");
  const goal = requireVertex(graph, input.goalId, "goal");
  const L = (id: string) => labelOf(graph, id);
  const adj = adjacency(graph);
  const ids = sortedVertexIds(graph);

  const dist: Record<string, number | null> = {};
  const prev: Record<string, string | null> = {};
  const prevEdge: Record<string, string | null> = {};
  const settled: string[] = [];
  let current: string | null = null;
  for (const id of ids) {
    dist[id] = null;
    prev[id] = null;
    prevEdge[id] = null;
  }

  const rec = new Recorder<DijkstraState>();
  const state = (): DijkstraState => ({ algorithm: "dijkstra", dist, prev, prevEdge, settled, current });
  const base = () => ({
    discovered: ids.filter((id) => dist[id] !== null && !settled.includes(id)),
    completed: [...settled],
    chosenEdges: ids.map((id) => prevEdge[id]).filter((e): e is string => e !== null),
  });

  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: { current: [start] },
    title: `Find the cheapest route from ${L(start)} to ${L(goal)}`,
    changed: "Nothing has been computed yet.",
    why: `Dijkstra grows a set of settled vertices outward from ${L(start)}, always settling the closest one next. Every weight here is non-negative, which is what makes that greedy choice safe.`,
  });

  rec.emit({
    event: "init",
    lineId: "d1",
    state: state(),
    highlights: base(),
    title: "Every distance starts unknown",
    changed: "Each vertex gets dist = ∞ and no predecessor.",
    why: "Before exploring, no route to any vertex is known, so every estimate is infinite.",
  });

  dist[start] = 0;
  rec.emit({
    event: "init-start",
    lineId: "d2",
    state: state(),
    highlights: { ...base(), current: [start] },
    title: `dist[${L(start)}] = 0`,
    changed: `${L(start)}'s estimate drops from ∞ to 0.`,
    why: "The route from the start to itself costs nothing.",
  });

  let reachedGoal = false;
  for (;;) {
    const candidates = ids.filter((id) => dist[id] !== null && !settled.includes(id));
    if (candidates.length === 0) break;
    const u = candidates.reduce((best, id) =>
      (dist[id] as number) < (dist[best] as number) || ((dist[id] as number) === dist[best] && byId(id, best) < 0)
        ? id
        : best,
    );
    current = u;
    settled.push(u);
    const others = candidates.filter((c) => c !== u);
    const competing = others.length
      ? ` The other candidates were ${others.map((c) => `${L(c)} (${fmt(dist[c])})`).join(", ")}.`
      : "";
    rec.emit({
      event: "select",
      lineId: "d4",
      state: state(),
      highlights: { ...base(), current: [u] },
      title: `Select ${L(u)} and settle it`,
      changed: `${L(u)} has the smallest tentative distance (${fmt(dist[u])}) among unsettled vertices, so it is settled.${competing}`,
      why: `Any other route to ${L(u)} would have to leave the settled set through a vertex that is already at least as far away, and weights cannot be negative, so ${fmt(dist[u])} is final.`,
    });

    if (u === goal) {
      reachedGoal = true;
      rec.emit({
        event: "goal",
        lineId: "d5",
        state: state(),
        highlights: { ...base(), current: [u] },
        title: `${L(goal)} is settled, so stop`,
        changed: `The search ends with dist[${L(goal)}] = ${fmt(dist[goal])}.`,
        why: "Once the goal is settled its distance can never improve, so the remaining vertices do not matter for this route.",
      });
      break;
    }

    for (const { to: v, edge } of adj.get(u)!) {
      const w = edge.weight as number;
      const name = edgeName(graph, edge);
      if (settled.includes(v)) {
        rec.emit({
          event: "skip-settled",
          lineId: "d6",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `Skip ${name}`,
          changed: `${L(v)} is already settled; nothing changes.`,
          why: `A settled vertex already has its final distance, so a route through ${L(u)} cannot beat it.`,
        });
        continue;
      }
      const old = dist[v];
      const candidate = (dist[u] as number) + w;
      if (old === null || candidate < old) {
        dist[v] = candidate;
        prev[v] = u;
        prevEdge[v] = edge.id;
        rec.emit({
          event: "relax",
          lineId: "d8",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `Relax ${name}: dist[${L(v)}] = ${candidate}`,
          changed:
            old === null
              ? `${L(v)}'s estimate drops from ∞ to ${candidate}, with predecessor ${L(u)}.`
              : `${L(v)}'s estimate improves from ${old} to ${candidate}. Its predecessor edge switches to ${name}.`,
          why: `${fmt(dist[u])} + ${w} = ${candidate}, which is less than ${fmt(old)}, so going through ${L(u)} is cheaper than the best route known so far.`,
        });
      } else {
        rec.emit({
          event: "keep",
          lineId: "d7",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `Keep dist[${L(v)}] = ${old}`,
          changed: `Nothing changes; ${L(v)} keeps its estimate of ${old}.`,
          why: `${fmt(dist[u])} + ${w} = ${candidate}, which is not less than ${old}, so this edge does not offer a cheaper route.`,
        });
      }
    }
  }
  current = null;

  if (!reachedGoal) {
    rec.emit({
      event: "unreachable",
      lineId: "d3",
      state: state(),
      highlights: base(),
      title: `${L(goal)} cannot be reached`,
      changed: `No unsettled vertex has a finite distance, and ${L(goal)} is still ∞.`,
      why: `Every route out of ${L(start)} has been explored. No edge leads into ${L(goal)}'s part of the graph.`,
    });
    return {
      frames: rec.frames,
      result: {
        kind: "diagnostic",
        code: "unreachable",
        message: `${L(goal)} is not reachable from ${L(start)}.`,
        partial: { order: [...settled] },
      },
    };
  }

  const path: string[] = [];
  const pathEdges: string[] = [];
  for (let at: string | null = goal; at !== null; at = prev[at]) {
    path.unshift(at);
    if (prevEdge[at]) pathEdges.unshift(prevEdge[at] as string);
  }
  const cost = dist[goal] as number;
  rec.emit({
    event: "done",
    lineId: "d9",
    state: state(),
    highlights: { ...base(), resultVertices: path, resultEdges: pathEdges },
    title: `Route: ${path.map(L).join(" → ")}, cost ${cost}`,
    changed: `Following predecessors back from ${L(goal)}: ${[...path].reverse().map(L).join(" ← ")}.`,
    why: "Each vertex remembers which edge gave it its best distance, so the route is rebuilt backwards from the goal.",
  });
  return { frames: rec.frames, result: { kind: "path", path, pathEdges, cost, unit: "weight" } };
}
