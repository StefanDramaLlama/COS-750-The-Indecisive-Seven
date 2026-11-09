import type { Graph, KahnState, RunResult, TraceFrame } from "../../shared/types.js";
import { Recorder, adjacency, byId, edgeName, labelOf, sortedVertexIds, validateGraph } from "./common.js";

export interface KahnInput {
  /**
   * decisions[i] chooses which ready vertex is placed i-th. Missing entries take the
   * front of the ready queue. A decision for a vertex that is not ready is rejected.
   */
  decisions?: (string | undefined)[];
}

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

export function runKahn(graph: Graph, input: KahnInput = {}): { frames: TraceFrame<KahnState>[]; result: RunResult } {
  validateGraph(graph, { directed: true });
  const L = (id: string) => labelOf(graph, id);
  const adj = adjacency(graph);
  const ids = sortedVertexIds(graph);
  const decisions = input.decisions ?? [];

  const inDegree: Record<string, number> = {};
  for (const id of ids) inDegree[id] = 0;
  const ready: string[] = [];
  const output: string[] = [];
  const placedEdges: string[] = [];
  let current: string | null = null;

  const rec = new Recorder<KahnState>();
  const state = (): KahnState => ({ algorithm: "topological-sort", inDegree, ready, output, current });
  const base = () => ({ discovered: [...ready], completed: [...output], chosenEdges: [...placedEdges] });

  rec.emit({
    event: "open",
    lineId: null,
    state: state(),
    highlights: {},
    title: "Order the tasks so every dependency comes first",
    changed: "Nothing has been placed yet.",
    why: "An arrow X → Y means X must happen before Y. Kahn's algorithm repeatedly places a task that has no unfinished prerequisites.",
  });

  for (const e of graph.edges) inDegree[e.to] += 1;
  rec.emit({
    event: "count",
    lineId: "k1",
    state: state(),
    highlights: base(),
    title: "Count incoming edges",
    changed: ids.map((id) => `${L(id)}: ${inDegree[id]}`).join(", ") + ".",
    why: "A vertex's in-degree is the number of prerequisites it is still waiting on.",
  });

  for (const id of ids) if (inDegree[id] === 0) ready.push(id);
  rec.emit({
    event: "seed",
    lineId: "k2",
    state: state(),
    highlights: base(),
    title: ready.length ? `Ready: ${ready.map(L).join(", ")}` : "Nothing is ready",
    changed: ready.length
      ? `${ready.map(L).join(", ")} ${ready.length === 1 ? "has" : "have"} in-degree 0 and join${ready.length === 1 ? "s" : ""} the ready queue.`
      : "Every vertex has at least one incoming edge.",
    why: "Only a task with no prerequisites can go first.",
  });

  while (ready.length > 0) {
    const step = output.length;
    const wanted = decisions[step];
    let pick = 0;
    if (wanted !== undefined) {
      pick = ready.indexOf(wanted);
      if (pick < 0) throw new DecisionError(`${L(wanted)} is not ready at step ${step + 1}.`);
    }
    const choiceNote =
      ready.length > 1
        ? ` ${ready.filter((r) => r !== ready[pick]).map(L).join(", ")} ${ready.length === 2 ? "was" : "were"} also ready; any ready vertex is a valid choice.`
        : "";
    const [u] = ready.splice(pick, 1);
    output.push(u);
    current = u;
    rec.emit({
      event: "place",
      lineId: "k5",
      state: state(),
      highlights: { ...base(), current: [u] },
      title: `Place ${L(u)}`,
      changed: `${L(u)} leaves the ready queue and becomes item ${output.length} of the order.${choiceNote}`,
      why: `${L(u)} has no unplaced prerequisites, so putting it next cannot break any dependency.`,
    });

    for (const { to: v, edge } of adj.get(u)!) {
      inDegree[v] -= 1;
      placedEdges.push(edge.id);
      const name = edgeName(graph, edge);
      if (inDegree[v] === 0) {
        ready.push(v);
        rec.emit({
          event: "ready",
          lineId: "k8",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `${L(v)} becomes ready`,
          changed: `Removing ${name} drops ${L(v)}'s in-degree to 0, so ${L(v)} joins the ready queue.`,
          why: `Every prerequisite of ${L(v)} has now been placed.`,
        });
      } else {
        rec.emit({
          event: "decrement",
          lineId: "k7",
          state: state(),
          highlights: { ...base(), current: [u], currentEdges: [edge.id] },
          title: `${L(v)} still waits (${inDegree[v]} left)`,
          changed: `Removing ${name} drops ${L(v)}'s in-degree to ${inDegree[v]}.`,
          why: `${L(v)} still has ${inDegree[v]} unplaced prerequisite${inDegree[v] === 1 ? "" : "s"}, so it cannot be placed yet.`,
        });
      }
    }
    ready.sort(byId);
  }
  current = null;

  const blocked = ids.filter((id) => !output.includes(id));
  if (blocked.length > 0) {
    rec.emit({
      event: "cycle",
      lineId: "k9",
      state: state(),
      highlights: { ...base(), rejectedEdges: graph.edges.filter((e) => blocked.includes(e.to)).map((e) => e.id) },
      title: "Stuck: no full ordering exists",
      changed: `The ready queue is empty, but ${blocked.map(L).join(", ")} ${blocked.length === 1 ? "is" : "are"} still waiting.`,
      why: "Some of the waiting vertices form a cycle, so each waits on another and none reaches in-degree 0. Anything downstream of the cycle stays blocked too.",
    });
    return {
      frames: rec.frames,
      result: {
        kind: "diagnostic",
        code: "cycle",
        message: `A cycle blocks ${blocked.map(L).join(", ")}.`,
        partial: { order: [...output], blocked },
      },
    };
  }

  rec.emit({
    event: "done",
    lineId: "k9",
    state: state(),
    highlights: { ...base(), resultVertices: [...output] },
    title: `Order: ${output.map(L).join(" → ")}`,
    changed: "Every vertex has been placed.",
    why: "Each vertex was placed only after all its prerequisites, so every arrow points forward in this order.",
  });
  return { frames: rec.frames, result: { kind: "order", order: [...output] } };
}

/** True when every edge points forward in the given order. */
export function respectsEdges(graph: Graph, order: string[]): boolean {
  if (order.length !== graph.vertices.length) return false;
  const pos = new Map(order.map((id, i) => [id, i]));
  return graph.edges.every((e) => (pos.get(e.from) as number) < (pos.get(e.to) as number));
}

