import { describe, expect, it } from "vitest";
import type { Graph } from "../src/shared/types.js";
import { GraphInputError, validateGraph } from "../src/server/algorithms/common.js";
import { runBfs } from "../src/server/algorithms/bfs.js";
import { runDfs } from "../src/server/algorithms/dfs.js";
import { runDijkstra } from "../src/server/algorithms/dijkstra.js";
import { DecisionError, respectsEdges, runKahn } from "../src/server/algorithms/kahn.js";
import { runKruskal } from "../src/server/algorithms/kruskal.js";
import { runPrim } from "../src/server/algorithms/prim.js";
import { graph, withWeight } from "../src/server/lessons/define.js";

const weightedDiamond = graph(false, ["A", "B", "C", "D"], [
  ["A", "B", 5],
  ["A", "C", 2],
  ["B", "D", 2],
  ["C", "D", 10],
]);
const diamond = graph(false, ["A", "B", "C", "D"], [
  ["A", "B"],
  ["A", "C"],
  ["B", "D"],
  ["C", "D"],
]);
const sites = graph(false, ["A", "B", "C", "D"], [
  ["A", "B", 1],
  ["B", "C", 2],
  ["A", "C", 3],
  ["C", "D", 4],
]);
const plan = graph(true, ["A", "B", "C", "D", "E"], [
  ["A", "B"],
  ["A", "C"],
  ["B", "D"],
  ["C", "D"],
  ["D", "E"],
]);

describe("validateGraph", () => {
  const ok = graph(false, ["A", "B"], [["A", "B", 1]]);
  it("accepts a small valid graph", () => expect(() => validateGraph(ok)).not.toThrow());
  it("rejects a missing endpoint", () => {
    const g: Graph = { ...ok, edges: [{ id: "x", from: "A", to: "Z" }] };
    expect(() => validateGraph(g)).toThrow(GraphInputError);
  });
  it("rejects duplicate vertex and edge ids", () => {
    expect(() => validateGraph({ ...ok, vertices: [...ok.vertices, { id: "A", label: "A" }] })).toThrow(/Duplicate vertex/);
    expect(() => validateGraph({ ...ok, edges: [...ok.edges, { id: "A-B", from: "B", to: "A" }] })).toThrow(/Duplicate edge/);
  });
  it("rejects parallel edges and self-loops", () => {
    expect(() => validateGraph({ ...ok, edges: [...ok.edges, { id: "z", from: "B", to: "A" }] })).toThrow(/duplicates/);
    expect(() => validateGraph({ ...ok, edges: [{ id: "z", from: "A", to: "A" }] })).toThrow(/self-loop/);
  });
  it("allows opposite arcs in a directed graph", () => {
    const g = graph(true, ["A", "B"], [["A", "B"], ["B", "A"]]);
    expect(() => validateGraph(g)).not.toThrow();
  });
  it("enforces integer weights within bounds", () => {
    expect(() => validateGraph(withWeight(ok, "A-B", 1.5))).toThrow(/integer/);
    expect(() => validateGraph(withWeight(ok, "A-B", 2_000_000))).toThrow(/integer/);
  });
  it("enforces size limits", () => {
    const many = graph(false, Array.from({ length: 13 }, (_, i) => `V${i}`), []);
    expect(() => validateGraph(many)).toThrow(/12 vertices/);
  });
});

describe("Dijkstra", () => {
  it("finds A → B → D at cost 7 after first estimating D = 12 via C", () => {
    const { frames, result } = runDijkstra(weightedDiamond, { startId: "A", goalId: "D" });
    expect(result).toMatchObject({ kind: "path", path: ["A", "B", "D"], cost: 7 });
    const dHistory = frames.map((f) => (f.state.algorithm === "dijkstra" ? f.state.dist.D : undefined));
    const firstFinite = dHistory.findIndex((d) => d !== null);
    expect(dHistory[firstFinite]).toBe(12);
    expect(frames[firstFinite].state).toMatchObject({ prevEdge: { D: "C-D" } });
    const improved = dHistory.indexOf(7);
    expect(improved).toBeGreaterThan(firstFinite);
    expect(frames[improved].state).toMatchObject({ prevEdge: { D: "B-D" } });
    expect(frames[improved].why).toContain("5 + 2 = 7");
    // Back restores the earlier state: the frame before still shows 12 via C.
    expect(frames[improved - 1].state).toMatchObject({ dist: { D: 12 }, prevEdge: { D: "C-D" } });
  });

  it("reaches the initialise checkpoint with A = 0 and the rest ∞", () => {
    const { frames } = runDijkstra(weightedDiamond, { startId: "A", goalId: "D" });
    const init = frames.find((f) => f.event === "init-start")!;
    expect(init.state).toMatchObject({ dist: { A: 0, B: null, C: null, D: null }, settled: [] });
  });

  it("practice variant: C–D = 3 gives A → C → D at cost 5", () => {
    const { result } = runDijkstra(withWeight(weightedDiamond, "C-D", 3), { startId: "A", goalId: "D" });
    expect(result).toMatchObject({ kind: "path", path: ["A", "C", "D"], cost: 5 });
  });

  it("reports an unreachable goal", () => {
    const g = { ...weightedDiamond, vertices: [...weightedDiamond.vertices, { id: "E", label: "E" }] };
    const { result, frames } = runDijkstra(g, { startId: "A", goalId: "E" });
    expect(result).toMatchObject({ kind: "diagnostic", code: "unreachable" });
    expect(frames.at(-1)!.event).toBe("unreachable");
  });

  it("rejects negative weights and unweighted graphs", () => {
    expect(() => runDijkstra(withWeight(weightedDiamond, "A-B", -1), { startId: "A", goalId: "D" })).toThrow(/negative/);
    expect(() => runDijkstra(diamond, { startId: "A", goalId: "D" })).toThrow(/weight/);
  });

  it("handles zero-weight edges and equal candidates by id", () => {
    const g = graph(false, ["A", "B", "C"], [["A", "B", 0], ["A", "C", 0]]);
    const { frames } = runDijkstra(g, { startId: "A", goalId: "C" });
    const selects = frames.filter((f) => f.event === "select").map((f) => f.highlights.current[0]);
    expect(selects).toEqual(["A", "B", "C"]);
  });
});

describe("BFS", () => {
  it("visits A, B, C, D and recovers A → B → D in two hops", () => {
    const { result } = runBfs(diamond, { startId: "A", goalId: "D" });
    expect(result).toMatchObject({ kind: "path", path: ["A", "B", "D"], cost: 2, unit: "hops", order: ["A", "B", "C", "D"] });
  });

  it("enqueues a vertex with two discovery opportunities only once", () => {
    const { frames } = runBfs(diamond, { startId: "A", goalId: "D" });
    const last = frames.at(-1)!.state;
    expect(last.algorithm === "bfs" && last.queue.filter((v) => v === "D")).toHaveLength(1);
    expect(frames.some((f) => f.event === "already" && f.highlights.currentEdges.includes("C-D"))).toBe(true);
  });

  it("practice: from D, B is dequeued after D and A is 2 hops away", () => {
    const { frames, result } = runBfs(diamond, { startId: "D", goalId: "A" });
    const dequeues = frames.filter((f) => f.event === "dequeue").map((f) => f.highlights.current[0]);
    expect(dequeues.slice(0, 2)).toEqual(["D", "B"]);
    expect(result).toMatchObject({ cost: 2 });
  });

  it("rejects weighted input", () => {
    expect(() => runBfs(weightedDiamond, { startId: "A" })).toThrow(/unweighted/);
  });
});

describe("DFS", () => {
  const branching = graph(false, ["A", "B", "C", "D"], [["A", "B"], ["B", "C"], ["A", "D"]]);
  it("discovers A, B, C, D and backtracks C → B → A before D", () => {
    const { frames, result } = runDfs(branching, { startId: "A" });
    expect(result).toMatchObject({ kind: "traversal", order: ["A", "B", "C", "D"], unreached: [] });
    const events = frames.map((f) => `${f.event}:${f.highlights.current.join("")}`);
    const dIndex = events.indexOf("discover:D");
    const backtracks = events.slice(0, dIndex).filter((e) => e.startsWith("backtrack"));
    expect(backtracks).toEqual(["backtrack:B", "backtrack:A"]);
  });

  it("on the split graph reaches A and B only", () => {
    const split = graph(false, ["A", "B", "C", "D"], [["A", "B"], ["C", "D"]]);
    const { result } = runDfs(split, { startId: "A" });
    expect(result).toMatchObject({ order: ["A", "B"], unreached: ["C", "D"] });
  });
});

describe("Kahn", () => {
  it("orders the project plan", () => {
    const { result } = runKahn(plan);
    expect(result).toEqual({ kind: "order", order: ["A", "B", "C", "D", "E"] });
  });

  it("accepts either ready vertex as a decision and both orders respect every edge", () => {
    for (const choice of ["B", "C"]) {
      const { result } = runKahn(plan, { decisions: [undefined, choice] });
      expect(result.kind).toBe("order");
      if (result.kind === "order") {
        expect(result.order[1]).toBe(choice);
        expect(respectsEdges(plan, result.order)).toBe(true);
      }
    }
  });

  it("rejects a decision for a vertex that is not ready", () => {
    expect(() => runKahn(plan, { decisions: [undefined, "D"] })).toThrow(DecisionError);
  });

  it("diagnoses a cycle: A and C placed, B, D, E blocked", () => {
    const cyclic = { ...plan, edges: [...plan.edges, { id: "D>B", from: "D", to: "B" }] };
    const { result } = runKahn(cyclic);
    expect(result).toMatchObject({ kind: "diagnostic", code: "cycle", partial: { order: ["A", "C"], blocked: ["B", "D", "E"] } });
  });

  it("requires directed input", () => {
    expect(() => runKahn(diamond)).toThrow(/directed/);
  });
});

/** Checks that edges form a spanning tree: V − 1 edges, connected, acyclic. */
function isSpanningTree(g: Graph, edgeIds: string[]): boolean {
  if (edgeIds.length !== g.vertices.length - 1) return false;
  const parent = new Map(g.vertices.map((v) => [v.id, v.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const id of edgeIds) {
    const e = g.edges.find((x) => x.id === id)!;
    const a = find(e.from);
    const b = find(e.to);
    if (a === b) return false;
    parent.set(a, b);
  }
  return true;
}

describe("Kruskal", () => {
  it("skips A–C and finishes at cost 7", () => {
    const { frames, result } = runKruskal(sites);
    expect(result).toMatchObject({ kind: "tree", weight: 7 });
    expect(frames.some((f) => f.event === "reject" && f.highlights.currentEdges.includes("A-C"))).toBe(true);
    if (result.kind === "tree") expect(isSpanningTree(sites, result.edges)).toBe(true);
  });

  it("practice: A–C = 0 rejects B–C and costs 5", () => {
    const g = withWeight(sites, "A-C", 0);
    const { frames, result } = runKruskal(g);
    expect(result).toMatchObject({ kind: "tree", weight: 5 });
    expect(frames.some((f) => f.event === "reject" && f.highlights.currentEdges.includes("B-C"))).toBe(true);
  });

  it("reports a forest on a disconnected graph", () => {
    const g = graph(false, ["A", "B", "C", "D"], [["A", "B", 1], ["C", "D", 2]]);
    const { result } = runKruskal(g);
    expect(result).toMatchObject({ kind: "diagnostic", code: "disconnected", partial: { edges: ["A-B", "C-D"], weight: 3 } });
  });

  it("requires undirected weighted input", () => {
    expect(() => runKruskal(diamond)).toThrow(/weight/);
  });
});

describe("Prim", () => {
  it("grows from A to a tree of weight 7", () => {
    const { result } = runPrim(sites, { startId: "A" });
    expect(result).toMatchObject({ kind: "tree", edges: ["A-B", "B-C", "C-D"], weight: 7 });
  });

  it("practice: C–D = 0 starts with A–B and finishes at 3", () => {
    const { result } = runPrim(withWeight(sites, "C-D", 0), { startId: "A" });
    expect(result).toMatchObject({ kind: "tree", weight: 3 });
    if (result.kind === "tree") {
      expect(result.edges[0]).toBe("A-B");
      expect(isSpanningTree(sites, result.edges)).toBe(true);
    }
  });

  it("only covers the start component on a disconnected graph", () => {
    const g = graph(false, ["A", "B", "C", "D"], [["A", "B", 1], ["C", "D", 2]]);
    const { result } = runPrim(g, { startId: "A" });
    expect(result).toMatchObject({ kind: "diagnostic", code: "disconnected", partial: { edges: ["A-B"], weight: 1 } });
  });
});

describe("trace contract", () => {
  const runs = [
    () => runDijkstra(weightedDiamond, { startId: "A", goalId: "D" }),
    () => runBfs(diamond, { startId: "A", goalId: "D" }),
    () => runDfs(diamond, { startId: "A" }),
    () => runKahn(plan),
    () => runKruskal(sites),
    () => runPrim(sites, { startId: "A" }),
  ];

  it("repeat runs give identical frames", () => {
    for (const r of runs) expect(JSON.stringify(r())).toBe(JSON.stringify(r()));
  });

  it("opens with lineId null, ends with a terminal frame, and indexes frames in order", () => {
    for (const r of runs) {
      const { frames } = r();
      expect(frames[0].lineId).toBeNull();
      frames.slice(1).forEach((f) => expect(f.lineId).not.toBeNull());
      frames.forEach((f, i) => expect(f.index).toBe(i));
      expect(["done", "unreachable", "cycle", "disconnected"]).toContain(frames.at(-1)!.event);
    }
  });

  it("earlier frames are snapshots that later steps do not mutate", () => {
    const { frames } = runDijkstra(weightedDiamond, { startId: "A", goalId: "D" });
    expect(frames[0].state).toMatchObject({ dist: { A: null, D: null }, settled: [] });
    expect(frames[1].state).not.toBe(frames[2].state);
  });
});
