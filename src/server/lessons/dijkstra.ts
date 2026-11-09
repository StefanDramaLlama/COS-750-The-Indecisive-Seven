import type { Example } from "../../shared/types.js";
import { runDijkstra } from "../algorithms/dijkstra.js";
import { type LessonDef, before, findFrame, graph, is, lazy, withWeight } from "./define.js";

const diamondPositions = {
  A: { x: 70, y: 150 },
  B: { x: 240, y: 55 },
  C: { x: 240, y: 245 },
  D: { x: 410, y: 150 },
};

const diamond = graph(false, ["A", "B", "C", "D"], [
  ["A", "B", 5],
  ["A", "C", 2],
  ["B", "D", 2],
  ["C", "D", 10],
]);

const worked: Example = {
  id: "weighted-diamond",
  kind: "worked",
  title: "Weighted diamond",
  scenario: "Four junctions joined by roads of different lengths. Find the cheapest route from A to D.",
  assumptions: ["Roads go both ways (undirected).", "Every length is a non-negative whole number."],
  graph: diamond,
  positions: diamondPositions,
  startId: "A",
  goalId: "D",
};

const island: Example = {
  id: "unreachable-island",
  kind: "variant",
  title: "Unreachable goal",
  scenario: "The same roads, plus junction E with no road to it. Ask for a route from A to E.",
  assumptions: ["E has no edges at all.", "Weights are unchanged from the worked example."],
  graph: { ...diamond, vertices: [...diamond.vertices, { id: "E", label: "E" }] },
  positions: { ...diamondPositions, E: { x: 410, y: 265 } },
  startId: "A",
  goalId: "E",
};

const practiceExample: Example = {
  id: "cheaper-c-d",
  kind: "practice",
  title: "C–D gets cheaper",
  scenario: "The road from C to D is resurfaced and now costs 3 instead of 10. Find the cheapest route from A to D again.",
  assumptions: ["Only C–D has changed.", "Ties between equal distances go to the smaller vertex id."],
  graph: withWeight(diamond, "C-D", 3),
  positions: diamondPositions,
  startId: "A",
  goalId: "D",
};

const run = (ex: Example) => runDijkstra(ex.graph, { startId: ex.startId, goalId: ex.goalId });
const workedTrace = lazy(() => run(worked));
const practiceTrace = lazy(() => run(practiceExample));

export const dijkstraLesson: LessonDef = {
  id: "dijkstra",
  order: 1,
  version: 1,
  title: "Dijkstra's algorithm",
  approach: "Weighted shortest path",
  blurb: "Settle the closest vertex, relax its edges, repeat. Watch D's estimate drop from 12 to 7.",
  prerequisites: ["Vertices, edges and edge weights", "Paths and path cost"],
  objectives: [
    "Explain why Dijkstra settles the unsettled vertex with the smallest tentative distance.",
    "Trace how relaxing an edge can improve a distance and replace a predecessor edge.",
    "Apply the algorithm to a changed weight and recover the route from the predecessors.",
  ],
  vocabulary: [
    { term: "Tentative distance", meaning: "The cheapest cost to a vertex found so far. It can still improve until the vertex is settled." },
    { term: "Relax", meaning: "Check whether going through u gives v a cheaper cost, and update v if it does." },
    { term: "Settled", meaning: "A vertex whose distance is final. Dijkstra settles exactly one per round." },
    { term: "Predecessor", meaning: "The vertex (and edge) that gave a vertex its current best distance." },
  ],
  primers: ["weighted", "directed"],
  pseudocode: [
    { id: "d1", indent: 0, text: "for each vertex v: dist[v] ← ∞; prev[v] ← none", explanation: "No route is known yet, so every estimate starts infinite and nothing has a predecessor." },
    { id: "d2", indent: 0, text: "dist[start] ← 0", explanation: "Reaching the start from itself costs nothing. This is the only finite estimate at first." },
    { id: "d3", indent: 0, text: "while some unsettled vertex has finite dist:", explanation: "Keep going while there is a reachable vertex whose distance is not final. If this fails before the goal is settled, the goal is unreachable." },
    { id: "d4", indent: 1, text: "u ← unsettled vertex with smallest dist", explanation: "The greedy choice. With non-negative weights, no undiscovered detour can make u cheaper, so its distance is final. This table scan costs O(V) per round." },
    { id: "d5", indent: 1, text: "mark u settled; if u = goal: stop", explanation: "Once the goal is settled its distance can never change, so the search can end early." },
    { id: "d6", indent: 1, text: "for each edge (u, v, w) with v unsettled:", explanation: "Look along every edge out of u. Edges into settled vertices are skipped because those distances are already final." },
    { id: "d7", indent: 2, text: "if dist[u] + w < dist[v]:", explanation: "The relaxation test: is the route through u strictly cheaper than the best route known to v? If not, v keeps its estimate." },
    { id: "d8", indent: 3, text: "dist[v] ← dist[u] + w; prev[v] ← u", explanation: "Record the cheaper estimate and remember u as v's predecessor. A later improvement overwrites both." },
    { id: "d9", indent: 0, text: "rebuild the path from goal by following prev", explanation: "Walk predecessors back from the goal to the start, then reverse to read the route forwards." },
  ],
  complexity: "With a table scan for the minimum: O(V² + E) time, O(V) extra space. A binary heap brings this to O((V + E) log V).",
  examples: [worked, island, practiceExample],
  run,
  practice: {
    exampleId: practiceExample.id,
    reflection:
      "In the worked run D improved from 12 to 7 through B. This time D got 5 through C and B–D could not beat it. Which comparison decides whether an edge updates dist[v], and why did B–D fail it here?",
    build() {
      const trace = practiceTrace();
      const f = trace.frames;
      const w = workedTrace().frames;
      return {
        trace,
        checkpoints: [
          {
            id: "select-next",
            frameIndex: before(f, is("select", { current: "C" }), "C is selected"),
            question: "A is settled and its edges are relaxed. Which vertex does Dijkstra select next?",
            options: [
              { id: "C", label: "C", feedback: "Right. C has the smallest tentative distance (2) of the unsettled vertices, so it is settled next." },
              { id: "B", label: "B", feedback: "B has an estimate of 5, but C's is 2. Dijkstra always takes the smallest tentative distance, not the first vertex alphabetically." },
              { id: "D", label: "D", feedback: "D is still ∞: no edge from A reaches it. Dijkstra only selects vertices that already have a finite estimate." },
              { id: "A", label: "A", feedback: "A is already settled. A settled vertex is never selected again." },
            ],
            correct: ["C"],
            hint: "Look at the dist column for the vertices that are not settled. Which is smallest?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("select", { current: "C" }), "worked select C") },
          },
          {
            id: "relax-c-d",
            frameIndex: before(f, is("relax", { edge: "C-D" }), "C–D is relaxed"),
            question: "C is settled with dist 2. C–D now weighs 3. What becomes D's estimate?",
            options: [
              { id: "5", label: "5", feedback: "Right. dist[C] + 3 = 2 + 3 = 5, which beats ∞, so D gets 5 with predecessor C." },
              { id: "3", label: "3", feedback: "3 is the edge weight alone. Relaxation adds the weight to dist[C], the cost of reaching C first." },
              { id: "12", label: "12", feedback: "12 came from the old weight of 10. The road now costs 3." },
              { id: "inf", label: "∞ (unchanged)", feedback: "Any finite route beats ∞, so this edge must improve D." },
            ],
            correct: ["5"],
            hint: "New estimate = dist[C] + weight(C–D). Compare it with D's current value.",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("relax", { edge: "C-D" }), "worked relax C–D") },
          },
          {
            id: "route",
            frameIndex: before(f, is("done"), "the route is rebuilt"),
            question: "D is settled. Which route and cost does Dijkstra report?",
            options: [
              { id: "acd-5", label: "A → C → D, cost 5", feedback: "Right. D's predecessor is C and C's is A. B–D offered 5 + 2 = 7, which is not less than 5, so it was kept out." },
              { id: "abd-7", label: "A → B → D, cost 7", feedback: "That was the answer before the change. When B was processed, 5 + 2 = 7 was not less than D's 5, so D kept predecessor C." },
              { id: "acd-12", label: "A → C → D, cost 12", feedback: "Right route, old cost. C–D now weighs 3." },
            ],
            correct: ["acd-5"],
            hint: "Follow prev back from D. Each step names the vertex that gave the current best distance.",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("done"), "worked done") },
          },
        ],
      };
    },
  },
};
