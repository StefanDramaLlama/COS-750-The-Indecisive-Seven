import type { Example } from "../../shared/types.js";
import { runDfs } from "../algorithms/dfs.js";
import { type LessonDef, before, findFrame, graph, is, lazy } from "./define.js";

const branching: Example = {
  id: "branching",
  kind: "worked",
  title: "Branching graph",
  scenario: "A trail splits at A: one branch runs A–B–C, the other goes to D. Explore everything reachable from A.",
  assumptions: ["Edges are undirected.", "Neighbours are tried in ascending id order."],
  graph: graph(false, ["A", "B", "C", "D"], [
    ["A", "B"],
    ["B", "C"],
    ["A", "D"],
  ]),
  positions: {
    A: { x: 80, y: 150 },
    B: { x: 230, y: 70 },
    C: { x: 400, y: 70 },
    D: { x: 230, y: 235 },
  },
  startId: "A",
};

const splitGraph = graph(false, ["A", "B", "C", "D"], [
  ["A", "B"],
  ["C", "D"],
]);
const splitPositions = {
  A: { x: 80, y: 95 },
  B: { x: 220, y: 95 },
  C: { x: 260, y: 220 },
  D: { x: 400, y: 220 },
};

const split: Example = {
  id: "split",
  kind: "variant",
  title: "Split graph",
  scenario: "Two separate pieces: A–B and C–D. Run DFS from A and see what it misses.",
  assumptions: ["No edge joins {A, B} to {C, D}."],
  graph: splitGraph,
  positions: splitPositions,
  startId: "A",
};

const practiceExample: Example = {
  id: "split-practice",
  kind: "practice",
  title: "Split graph from A",
  scenario: "Run DFS from A on the split graph A–B, C–D. Predict where it goes and what it leaves behind.",
  assumptions: ["Neighbours are tried in ascending id order.", "The stack holds one frame per active call."],
  graph: splitGraph,
  positions: splitPositions,
  startId: "A",
};

const run = (ex: Example) => runDfs(ex.graph, { startId: ex.startId });
const workedTrace = lazy(() => run(branching));
const splitTrace = lazy(() => run(split));
const practiceTrace = lazy(() => run(practiceExample));

export const dfsLesson: LessonDef = {
  id: "dfs",
  order: 3,
  version: 1,
  title: "Depth-first search",
  approach: "Depth-first traversal",
  blurb: "Follow one branch to its end, then backtrack. The stack shows exactly where DFS will return.",
  prerequisites: ["Adjacency", "Stacks: last in, first out", "Recursion as a stack of calls"],
  objectives: [
    "Explain how the stack of frames records where DFS will resume after a dead end.",
    "Trace discovery order and backtracking on a branching graph.",
    "Identify which vertices a single DFS leaves unreached on a disconnected graph.",
  ],
  vocabulary: [
    { term: "Visited", meaning: "Already entered by DFS. It will not be entered again." },
    { term: "Frame", meaning: "One stack entry: a vertex and how many of its neighbours it has tried." },
    { term: "Backtrack", meaning: "Pop a vertex with no untried neighbours and resume the one below it." },
    { term: "Component", meaning: "A group of vertices joined by paths. DFS from one start covers one component." },
  ],
  primers: ["connectivity", "cycle"],
  pseudocode: [
    { id: "f1", indent: 0, text: "mark start visited; push frame(start)", explanation: "Like calling dfs(start): the start is entered and becomes the only active call." },
    { id: "f2", indent: 0, text: "while the stack is not empty:", explanation: "Each frame is a call that has not returned yet. When none remain, the traversal is over." },
    { id: "f3", indent: 1, text: "top ← frame on top of the stack", explanation: "Always work on the most recent call. That is what makes the search go deep before wide." },
    { id: "f4", indent: 1, text: "if top has an untried neighbour v:", explanation: "Each frame remembers how far through its neighbour list it has got, so it can resume after a deeper call returns." },
    { id: "f5", indent: 2, text: "advance top past v", explanation: "Record that v has been tried, so this edge is not examined twice." },
    { id: "f6", indent: 2, text: "if v not visited: mark v visited; push frame(v)", explanation: "Go deeper straight away. An already-visited v is skipped, which prevents endless loops around a cycle." },
    { id: "f7", indent: 1, text: "else: pop top   // backtrack", explanation: "This vertex is a dead end. Popping it returns to the vertex below, which carries on with its next neighbour." },
    { id: "f8", indent: 0, text: "vertices never visited are unreachable from start", explanation: "One DFS only explores the start's component. Another component needs another start." },
  ],
  complexity: "O(V + E) time: every vertex is pushed once and every adjacency entry is tried once. O(V) extra space for the stack.",
  examples: [branching, split, practiceExample],
  run,
  practice: {
    exampleId: practiceExample.id,
    reflection:
      "DFS from A never reached C or D. Which part of the algorithm decided where to go, and what would you change to visit every vertex in the graph?",
    build() {
      const trace = practiceTrace();
      const f = trace.frames;
      const w = workedTrace().frames;
      const s = splitTrace().frames;
      return {
        trace,
        checkpoints: [
          {
            id: "first-step",
            frameIndex: before(f, is("discover", { current: "B" }), "B is discovered"),
            question: "A is visited and on the stack. Which vertex does DFS visit next?",
            options: [
              { id: "B", label: "B", feedback: "Right. B is A's first (and only) neighbour, so DFS goes there immediately." },
              { id: "C", label: "C", feedback: "There is no edge from A to C. DFS can only move along an edge." },
              { id: "D", label: "D", feedback: "D is not adjacent to A. DFS follows edges from the vertex on top of the stack." },
            ],
            correct: ["B"],
            hint: "List A's neighbours. DFS takes the first untried one.",
            walkthrough: { exampleId: branching.id, frame: findFrame(w, is("discover", { current: "B" }), "worked discover B") },
          },
          {
            id: "return",
            frameIndex: before(f, is("backtrack", { current: "A" }), "B backtracks to A"),
            question: "B has no unvisited neighbour left. Where does DFS return to?",
            options: [
              { id: "A", label: "A", feedback: "Right. A's frame sits just below B's on the stack, so popping B resumes A." },
              { id: "C", label: "C", feedback: "C was never pushed. DFS can only return to a vertex already on the stack." },
              { id: "stop", label: "It stops immediately", feedback: "Not yet. A is still on the stack and might have untried neighbours." },
            ],
            correct: ["A"],
            hint: "Look at the stack. What is directly underneath B?",
            walkthrough: { exampleId: branching.id, frame: findFrame(w, is("backtrack", { current: "B" }), "worked C → B backtrack") },
          },
          {
            id: "unreached",
            frameIndex: before(f, is("done"), "the traversal finishes"),
            question: "The stack is empty. Which vertices were never reached?",
            options: [
              { id: "CD", label: "C and D", feedback: "Right. No edge links {A, B} to {C, D}, so DFS from A cannot get there." },
              { id: "D", label: "D only", feedback: "C was never visited either. Check the discovery order." },
              { id: "none", label: "None", feedback: "Only A and B were visited. The graph has two components." },
            ],
            correct: ["CD"],
            hint: "Compare the discovery order with the full vertex list.",
            walkthrough: { exampleId: split.id, frame: findFrame(s, is("done"), "split done") },
          },
        ],
      };
    },
  },
};
