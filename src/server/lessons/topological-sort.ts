import type { Example } from "../../shared/types.js";
import { runKahn } from "../algorithms/kahn.js";
import { type LessonDef, before, findFrame, graph, is, lazy } from "./define.js";

const tasks: [string, string][] = [
  ["A", "Plan"],
  ["B", "Research"],
  ["C", "Sketch"],
  ["D", "Build"],
  ["E", "Ship"],
];

const positions = {
  A: { x: 60, y: 150 },
  B: { x: 180, y: 60 },
  C: { x: 180, y: 240 },
  D: { x: 310, y: 150 },
  E: { x: 425, y: 150 },
};

const planGraph = graph(true, tasks, [
  ["A", "B"],
  ["A", "C"],
  ["B", "D"],
  ["C", "D"],
  ["D", "E"],
]);

const worked: Example = {
  id: "project-plan",
  kind: "worked",
  title: "Project plan",
  scenario: "A design project: Plan comes first, Research and Sketch both need Plan, Build needs both, and Ship needs Build. Find an order that respects every dependency.",
  assumptions: ["An arrow X → Y means X must finish before Y.", "When several tasks are ready, this run takes them in id order."],
  graph: planGraph,
  positions,
};

const cycle: Example = {
  id: "project-cycle",
  kind: "variant",
  title: "Plan with a cycle",
  scenario: "Someone adds a rule that Research needs Build (Build → Research). Now Research needs Build and Build needs Research.",
  assumptions: ["Same tasks, plus the edge Build → Research."],
  graph: graph(true, tasks, [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
    ["D", "E"],
    ["D", "B"],
  ]),
  positions,
};

const practiceExample: Example = {
  id: "project-practice",
  kind: "practice",
  title: "Choose your own order",
  scenario: "Same project plan. This time you choose which ready task goes next when there is more than one.",
  assumptions: ["Any ready task is a valid choice.", "Your choice changes the rest of the order."],
  graph: planGraph,
  positions,
};

const run = (ex: Example) => runKahn(ex.graph);
const workedTrace = lazy(() => run(worked));

export const topologicalSortLesson: LessonDef = {
  id: "topological-sort",
  order: 4,
  version: 1,
  title: "Kahn's topological sort",
  approach: "Dependency ordering",
  blurb: "Place whatever has no unfinished prerequisites. A cycle leaves some tasks waiting forever.",
  prerequisites: ["Directed edges", "In-degree: edges arriving at a vertex", "Cycles"],
  objectives: [
    "Explain why only a vertex with in-degree 0 can be placed next.",
    "Trace how placing a vertex lowers its successors' in-degrees and makes them ready.",
    "Explain why a cycle makes a full ordering impossible.",
  ],
  vocabulary: [
    { term: "In-degree", meaning: "How many edges arrive at a vertex: the prerequisites it still waits on." },
    { term: "Ready", meaning: "In-degree 0. Every prerequisite has been placed." },
    { term: "Topological order", meaning: "A list of all vertices where every edge points forward." },
    { term: "DAG", meaning: "Directed acyclic graph. Exactly the graphs that have a topological order." },
  ],
  primers: ["directed", "cycle"],
  pseudocode: [
    { id: "k1", indent: 0, text: "for each vertex v: indeg[v] ← number of edges into v", explanation: "Count prerequisites. A vertex can only be placed once this count reaches 0." },
    { id: "k2", indent: 0, text: "ready ← every vertex with indeg 0", explanation: "Tasks with no prerequisites can go first. There may be several, or none if every vertex is on or after a cycle." },
    { id: "k3", indent: 0, text: "while ready is not empty:", explanation: "Keep placing while something is unblocked." },
    { id: "k4", indent: 1, text: "u ← take any vertex from ready", explanation: "Any ready vertex works. Different choices give different, equally valid orders." },
    { id: "k5", indent: 1, text: "append u to output", explanation: "u's prerequisites are all already in the output, so placing it now keeps every edge pointing forward." },
    { id: "k6", indent: 1, text: "for each edge u → v:", explanation: "u is done, so every task that depended on it has one fewer thing to wait for." },
    { id: "k7", indent: 2, text: "indeg[v] ← indeg[v] − 1", explanation: "Remove u's edge from v's count of unplaced prerequisites." },
    { id: "k8", indent: 2, text: "if indeg[v] = 0: add v to ready", explanation: "v has just lost its last prerequisite, so it is now free to place." },
    { id: "k9", indent: 0, text: "if output has every vertex: it is a topological order, else a cycle blocks the rest", explanation: "Vertices on a cycle wait on each other, so their in-degree never reaches 0. Anything after the cycle waits too." },
  ],
  complexity: "O(V + E) time: each vertex is placed once and each edge is removed once. O(V) extra space.",
  examples: [worked, cycle, practiceExample],
  run,
  practice: {
    exampleId: practiceExample.id,
    reflection:
      "You picked one of Research and Sketch before the other. Would the opposite choice also keep every arrow pointing forward? What made a task safe to place at each step?",
    build(accepted) {
      // The first checkpoint is a runner decision: the chosen ready task is placed second.
      const choice = accepted.find((c) => c.checkpointId === "choose-next")?.optionId;
      const trace = runKahn(practiceExample.graph, { decisions: [undefined, choice] });
      const f = trace.frames;
      const w = workedTrace().frames;
      const placeFrames = f.map((fr, i) => (fr.event === "place" ? i : -1)).filter((i) => i >= 0);
      const workedPlaces = w.map((fr, i) => (fr.event === "place" ? i : -1)).filter((i) => i >= 0);
      return {
        trace,
        checkpoints: [
          {
            id: "choose-next",
            frameIndex: placeFrames[1] - 1,
            question: "Plan is placed and the ready queue holds Research and Sketch. Which task can be placed next?",
            options: [
              { id: "B", label: "Research", feedback: "Right. Research's in-degree is 0. Sketch would also have been valid, since any ready task can go next." },
              { id: "C", label: "Sketch", feedback: "Right. Sketch's in-degree is 0. Research would also have been valid, since any ready task can go next." },
              { id: "D", label: "Build", feedback: "Build still has in-degree 2: it waits on both Research and Sketch." },
              { id: "E", label: "Ship", feedback: "Ship waits on Build, which has not been placed." },
            ],
            correct: ["B", "C"],
            hint: "Only a task whose in-degree is 0 can be placed. Check the in-degree table.",
            walkthrough: { exampleId: worked.id, frame: workedPlaces[1] },
          },
          {
            id: "build-ready",
            frameIndex: before(f, is("ready", { edge: choice === "C" ? "B>D" : "C>D" }), "Build becomes ready"),
            question: "This step removes Build's last incoming edge. What happens to Build?",
            options: [
              { id: "ready", label: "Its in-degree reaches 0, so it joins the ready queue.", feedback: "Right. Both of Build's prerequisites are now placed." },
              { id: "output", label: "It is appended to the output immediately.", feedback: "Not yet. A newly ready task waits in the ready queue until it is taken." },
              { id: "blocked", label: "It stays blocked until Ship is placed.", feedback: "The arrow goes Build → Ship, so Ship waits on Build, not the other way round." },
            ],
            correct: ["ready"],
            hint: "How many prerequisites does Build have left after this edge is removed?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("ready", { edge: "C>D" }), "worked Build ready") },
          },
          {
            id: "valid-order",
            frameIndex: before(f, is("done"), "the order is complete"),
            question: "Every task has been placed. Is the output a valid topological order?",
            options: [
              { id: "yes", label: "Yes. Every arrow points forward in the order.", feedback: "Right. Each task was placed only after all its prerequisites." },
              { id: "alpha", label: "No. Research must come before Sketch.", feedback: "Research and Sketch do not depend on each other, so either order is fine." },
              { id: "ship", label: "No. Ship should come before Build.", feedback: "The arrow Build → Ship means Build comes first, which it does." },
            ],
            correct: ["yes"],
            hint: "Check each arrow: does its tail appear earlier in the output than its head?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("done"), "worked done") },
          },
        ],
      };
    },
  },
};
