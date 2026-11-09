import type { Example } from "../../shared/types.js";
import { runKruskal } from "../algorithms/kruskal.js";
import { runPrim } from "../algorithms/prim.js";
import { type LessonDef, before, findFrame, graph, is, lazy, withWeight } from "./define.js";

// Shared fixtures for Kruskal and Prim: four sites, links A–B 1, B–C 2, A–C 3, C–D 4.

const sitePositions = {
  A: { x: 90, y: 65 },
  B: { x: 90, y: 240 },
  C: { x: 260, y: 150 },
  D: { x: 420, y: 150 },
};

const sites = graph(false, ["A", "B", "C", "D"], [
  ["A", "B", 1],
  ["B", "C", 2],
  ["A", "C", 3],
  ["C", "D", 4],
]);

const islands = graph(false, ["A", "B", "C", "D", "E"], [
  ["A", "B", 1],
  ["B", "C", 2],
  ["A", "C", 3],
  ["D", "E", 2],
]);
const islandPositions = {
  A: { x: 70, y: 65 },
  B: { x: 70, y: 240 },
  C: { x: 220, y: 150 },
  D: { x: 350, y: 75 },
  E: { x: 425, y: 235 },
};

const siteAssumptions = ["Links are undirected.", "Weights are installation costs; ties go to the smaller edge id."];

function workedSites(lesson: string): Example {
  return {
    id: "four-sites",
    kind: "worked",
    title: "Four sites",
    scenario: "Connect four sites with network links as cheaply as possible. Every site must be reachable from every other.",
    assumptions: siteAssumptions,
    graph: sites,
    positions: sitePositions,
    ...(lesson === "prim" ? { startId: "A" } : {}),
  };
}

function islandExample(lesson: string): Example {
  return {
    id: "two-islands",
    kind: "variant",
    title: "Two islands",
    scenario: "Sites D and E sit on an island with no link to A, B or C.",
    assumptions: ["No edge joins {A, B, C} to {D, E}."],
    graph: islands,
    positions: islandPositions,
    ...(lesson === "prim" ? { startId: "A" } : {}),
  };
}

/* ------------------------------------------------------------------ Kruskal */

const kWorked = workedSites("kruskal");
const kIslands = islandExample("kruskal");
const kPractice: Example = {
  id: "free-a-c",
  kind: "practice",
  title: "A–C becomes free",
  scenario: "A–C already has spare fibre, so it now costs 0. Rebuild the cheapest network.",
  assumptions: ["Only A–C has changed.", ...siteAssumptions],
  graph: withWeight(sites, "A-C", 0),
  positions: sitePositions,
};

const kRun = (ex: Example) => runKruskal(ex.graph);
const kWorkedTrace = lazy(() => kRun(kWorked));
const kPracticeTrace = lazy(() => kRun(kPractice));

export const kruskalLesson: LessonDef = {
  id: "kruskal",
  order: 5,
  version: 1,
  title: "Kruskal's algorithm",
  approach: "Minimum spanning tree, edge by edge",
  blurb: "Take edges cheapest-first and skip any that would close a cycle.",
  prerequisites: ["Weighted undirected graphs", "Cycles", "Connected components"],
  objectives: [
    "Explain why an edge inside one component must be skipped.",
    "Trace sorted edges, component labels and the running total.",
    "Apply Kruskal after a weight change and check the tree has V − 1 edges.",
  ],
  vocabulary: [
    { term: "Spanning tree", meaning: "Edges that connect every vertex with no cycle. On V vertices it has V − 1 edges." },
    { term: "Minimum spanning tree", meaning: "A spanning tree with the smallest possible total weight." },
    { term: "Component", meaning: "A group of vertices already joined by chosen edges, labelled here by its smallest id." },
    { term: "Union-find", meaning: "A structure that answers 'same component?' and merges two components quickly." },
  ],
  primers: ["weighted", "cycle", "connectivity"],
  pseudocode: [
    { id: "r1", indent: 0, text: "sort edges by weight (ties by edge id)", explanation: "Cheapest first. Each accepted edge is then the cheapest safe way to join two pieces." },
    { id: "r2", indent: 0, text: "put every vertex in its own component", explanation: "With no edges chosen, every vertex stands alone." },
    { id: "r3", indent: 0, text: "for each edge (u, v, w) in sorted order:", explanation: "Each edge is examined once, in order." },
    { id: "r4", indent: 1, text: "if find(u) ≠ find(v):", explanation: "Different components means the edge connects something new. The same component means u and v are already linked." },
    { id: "r5", indent: 2, text: "accept edge; union(u, v); total ← total + w", explanation: "Take the edge and merge the two components into one." },
    { id: "r6", indent: 1, text: "else: skip edge   // would close a cycle", explanation: "u and v are already connected through chosen edges, so this edge would make a loop." },
    { id: "r7", indent: 1, text: "stop once the tree has V − 1 edges", explanation: "A spanning tree on V vertices has exactly V − 1 edges, so later edges cannot be needed." },
    { id: "r8", indent: 0, text: "accepted edges form the minimum spanning tree (or forest)", explanation: "If the graph is disconnected, the edges run out first and the result is one tree per component." },
  ],
  complexity: "O(E log E) to sort, then near-constant time per find/union. Sorting dominates.",
  examples: [kWorked, kIslands, kPractice],
  run: kRun,
  practice: {
    exampleId: kPractice.id,
    reflection:
      "A–C was skipped in the worked run but accepted first here. What changed, and which rule decides whether Kruskal keeps an edge?",
    build() {
      const trace = kPracticeTrace();
      const f = trace.frames;
      const w = kWorkedTrace().frames;
      return {
        trace,
        checkpoints: [
          {
            id: "first-edge",
            frameIndex: before(f, is("accept"), "the first edge is accepted"),
            question: "The edges are sorted and every site is its own component. Which edge does Kruskal take first?",
            options: [
              { id: "A-C", label: "A–C (0)", feedback: "Right. A–C is now the cheapest edge, and A and C are in different components." },
              { id: "A-B", label: "A–B (1)", feedback: "A–B was first in the worked run, but A–C now costs 0." },
              { id: "C-D", label: "C–D (4)", feedback: "C–D is the most expensive edge. Kruskal goes cheapest-first." },
            ],
            correct: ["A-C"],
            hint: "Read the sorted edge list from the top.",
            walkthrough: { exampleId: kWorked.id, frame: findFrame(w, is("sort"), "worked sort") },
          },
          {
            id: "b-c",
            frameIndex: before(f, is("reject", { edge: "B-C" }), "B–C is examined"),
            question: "A–C and A–B have been accepted. Should Kruskal accept B–C (2)?",
            options: [
              { id: "skip", label: "Skip it. B and C are already in one component.", feedback: "Right. B reaches C through A, so B–C would close the cycle A–B–C." },
              { id: "accept-cheap", label: "Accept it. It is the next cheapest edge.", feedback: "Being cheap is not enough. Check the components: B and C are already joined through A." },
              { id: "accept-c", label: "Accept it. C needs a second edge.", feedback: "A tree needs every vertex connected, not a set number of edges per vertex. C is already connected through A–C." },
            ],
            correct: ["skip"],
            hint: "Compare the component labels of B and C.",
            walkthrough: { exampleId: kWorked.id, frame: findFrame(w, is("reject", { edge: "A-C" }), "worked reject A–C") },
          },
          {
            id: "weight",
            frameIndex: before(f, is("accept", { edge: "C-D" }), "C–D is accepted"),
            question: "Accepting C–D completes the tree. What is its total weight?",
            options: [
              { id: "5", label: "5", feedback: "Right. A–C 0 + A–B 1 + C–D 4 = 5." },
              { id: "7", label: "7", feedback: "7 was the worked tree. This one uses A–C at 0 instead of B–C at 2." },
              { id: "3", label: "3", feedback: "Add every accepted edge, including C–D (4)." },
            ],
            correct: ["5"],
            hint: "Add the weights of the three accepted edges.",
            walkthrough: { exampleId: kWorked.id, frame: findFrame(w, is("done"), "worked done") },
          },
        ],
      };
    },
  },
};

/* --------------------------------------------------------------------- Prim */

const pWorked = workedSites("prim");
const pIslands = islandExample("prim");
const pPractice: Example = {
  id: "free-c-d",
  kind: "practice",
  title: "C–D becomes free",
  scenario: "The C–D link now costs 0. Grow the tree from A again.",
  assumptions: ["Only C–D has changed.", "The tree starts at A.", ...siteAssumptions],
  graph: withWeight(sites, "C-D", 0),
  positions: sitePositions,
  startId: "A",
};

const pRun = (ex: Example) => runPrim(ex.graph, { startId: ex.startId });
const pWorkedTrace = lazy(() => pRun(pWorked));
const pPracticeTrace = lazy(() => pRun(pPractice));

export const primLesson: LessonDef = {
  id: "prim",
  order: 6,
  version: 1,
  title: "Prim's algorithm",
  approach: "Minimum spanning tree, vertex by vertex",
  blurb: "Grow one tree from a start vertex, always adding the cheapest edge that leaves it.",
  prerequisites: ["Weighted undirected graphs", "Kruskal's algorithm (same graph, same answer)"],
  objectives: [
    "Explain what a crossing edge is and why only crossing edges can extend the tree.",
    "Trace the frontier, selected edges and running total as the tree grows.",
    "Contrast Prim's choice of the next edge with Kruskal's.",
  ],
  vocabulary: [
    { term: "Tree set", meaning: "The vertices already joined into Prim's single growing tree." },
    { term: "Crossing edge", meaning: "An edge with exactly one end in the tree. Only these can grow it." },
    { term: "Frontier", meaning: "All the crossing edges at the current step." },
  ],
  primers: ["weighted", "connectivity"],
  pseudocode: [
    { id: "p1", indent: 0, text: "tree ← {start}; total ← 0", explanation: "Prim keeps one connected tree from the start. Any start gives the same total weight." },
    { id: "p2", indent: 0, text: "while some vertex is outside the tree:", explanation: "Each round adds exactly one vertex." },
    { id: "p3", indent: 1, text: "crossing ← edges with exactly one end in the tree", explanation: "This simple version rescans the edge list every round, which is O(E) per round and O(VE) overall." },
    { id: "p4", indent: 1, text: "if crossing is empty: stop   // rest unreachable", explanation: "No edge leaves the tree, so the remaining vertices are in another component." },
    { id: "p5", indent: 1, text: "(u, v, w) ← cheapest crossing edge", explanation: "The cheapest edge leaving the tree is always safe to add to some minimum spanning tree (the cut property)." },
    { id: "p6", indent: 1, text: "add v and the edge to the tree; total ← total + w", explanation: "v is the endpoint outside the tree. The tree stays connected and gains no cycle." },
    { id: "p7", indent: 0, text: "the selected edges form the minimum spanning tree", explanation: "Every vertex was added by the cheapest available edge." },
  ],
  complexity: "This rescanning version takes O(VE) time. A binary heap of crossing edges brings it to O(E log V).",
  examples: [pWorked, pIslands, pPractice],
  run: pRun,
  practice: {
    exampleId: pPractice.id,
    reflection:
      "C–D was the cheapest edge in the whole graph, yet Prim added it last. Why does Prim ignore it until C joins the tree, and which edge would Kruskal take first?",
    build() {
      const trace = pPracticeTrace();
      const f = trace.frames;
      const w = pWorkedTrace().frames;
      const scans = f.map((fr, i) => (fr.event === "scan" ? i : -1)).filter((i) => i >= 0);
      const workedScans = w.map((fr, i) => (fr.event === "scan" ? i : -1)).filter((i) => i >= 0);
      const notCrossing =
        "C–D is the cheapest edge in the graph, but neither C nor D is in the tree yet, so it does not cross. Prim can only extend the tree it has.";
      return {
        trace,
        checkpoints: [
          {
            id: "first-edge",
            frameIndex: scans[0],
            question: "The tree is {A}. Which edge can Prim add first?",
            options: [
              { id: "A-B", label: "A–B (1)", feedback: "Right. A–B and A–C are the only crossing edges, and A–B is cheaper." },
              { id: "C-D", label: "C–D (0)", feedback: notCrossing },
              { id: "A-C", label: "A–C (3)", feedback: "A–C does cross, but A–B is a cheaper crossing edge." },
              { id: "B-C", label: "B–C (2)", feedback: "Neither B nor C is in the tree yet, so B–C does not cross." },
            ],
            correct: ["A-B"],
            hint: "Only the dotted crossing edges are candidates. Pick the cheapest of those.",
            walkthrough: { exampleId: pWorked.id, frame: workedScans[0] },
          },
          {
            id: "second-edge",
            frameIndex: scans[1],
            question: "The tree is {A, B}. Which edge comes next?",
            options: [
              { id: "B-C", label: "B–C (2)", feedback: "Right. The crossing edges are B–C (2) and A–C (3), so B–C wins." },
              { id: "A-C", label: "A–C (3)", feedback: "A–C crosses, but B–C is cheaper." },
              { id: "C-D", label: "C–D (0)", feedback: notCrossing },
            ],
            correct: ["B-C"],
            hint: "Which edges have exactly one end in {A, B}?",
            walkthrough: { exampleId: pWorked.id, frame: workedScans[1] },
          },
          {
            id: "weight",
            frameIndex: scans[2],
            question: "C–D (0) is now the only crossing edge. What will the finished tree weigh?",
            options: [
              { id: "3", label: "3", feedback: "Right. A–B 1 + B–C 2 + C–D 0 = 3." },
              { id: "7", label: "7", feedback: "7 was the worked tree, when C–D cost 4." },
              { id: "1", label: "1", feedback: "Add every selected edge: A–B, B–C and C–D." },
            ],
            correct: ["3"],
            hint: "Add C–D's weight to the current total.",
            walkthrough: { exampleId: pWorked.id, frame: findFrame(w, is("done"), "worked done") },
          },
        ],
      };
    },
  },
};
