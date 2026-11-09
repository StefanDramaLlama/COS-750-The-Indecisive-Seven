import type { Example } from "../../shared/types.js";
import { runBfs } from "../algorithms/bfs.js";
import { type LessonDef, before, findFrame, graph, is, lazy } from "./define.js";

const positions = {
  A: { x: 70, y: 150 },
  B: { x: 240, y: 55 },
  C: { x: 240, y: 245 },
  D: { x: 410, y: 150 },
};

const diamond = graph(false, ["A", "B", "C", "D"], [
  ["A", "B"],
  ["A", "C"],
  ["B", "D"],
  ["C", "D"],
]);

const worked: Example = {
  id: "unweighted-diamond",
  kind: "worked",
  title: "Unweighted diamond",
  scenario: "Four rooms joined by doorways. Every doorway counts as one step. Find a route from A to D with the fewest doorways.",
  assumptions: ["Edges are undirected and unweighted.", "Neighbours are visited in ascending id order, so B is examined before C."],
  graph: diamond,
  positions,
  startId: "A",
  goalId: "D",
};

const practiceExample: Example = {
  id: "start-at-d",
  kind: "practice",
  title: "Start from D",
  scenario: "Same rooms, but now you start in D and want to reach A.",
  assumptions: ["Neighbours are still visited in ascending id order.", "A vertex is marked discovered when it is enqueued."],
  graph: diamond,
  positions,
  startId: "D",
  goalId: "A",
};

const run = (ex: Example) => runBfs(ex.graph, { startId: ex.startId, goalId: ex.goalId });
const workedTrace = lazy(() => run(worked));
const practiceTrace = lazy(() => run(practiceExample));

export const bfsLesson: LessonDef = {
  id: "bfs",
  order: 2,
  version: 1,
  title: "Breadth-first search",
  approach: "Traversal and unweighted shortest path",
  blurb: "A first-in, first-out queue explores the graph in rings and finds routes with the fewest edges.",
  prerequisites: ["Adjacency: which vertices share an edge", "Queues: first in, first out"],
  objectives: [
    "Explain why a FIFO queue makes BFS visit vertices in order of hop count.",
    "Trace discovery, predecessors and hop counts as each vertex is dequeued.",
    "Explain why marking at enqueue time stops a vertex entering the queue twice.",
  ],
  vocabulary: [
    { term: "Discovered", meaning: "Seen and placed in the queue. It is not processed until it reaches the front." },
    { term: "Hop count", meaning: "The number of edges on the route found to a vertex." },
    { term: "Queue", meaning: "First in, first out. BFS adds to the back and takes from the front." },
    { term: "Predecessor", meaning: "The vertex that discovered this one. Following predecessors rebuilds the path." },
  ],
  primers: ["connectivity", "weighted"],
  pseudocode: [
    { id: "b1", indent: 0, text: "mark start discovered; hops[start] ← 0; enqueue start", explanation: "The start is zero edges from itself and is the first vertex to process." },
    { id: "b2", indent: 0, text: "while the queue is not empty:", explanation: "Every discovered vertex waits in the queue. When it empties, everything reachable has been processed." },
    { id: "b3", indent: 1, text: "u ← dequeue", explanation: "Take the vertex at the front: the one discovered earliest. This is what keeps BFS ring by ring." },
    { id: "b4", indent: 1, text: "for each neighbour v of u (ascending id):", explanation: "Look at every vertex sharing an edge with u. The fixed order makes ties predictable." },
    { id: "b5", indent: 2, text: "if v is not discovered:", explanation: "Skip vertices already in the queue or processed. They were reached by a route at least as short." },
    { id: "b6", indent: 3, text: "mark v discovered; hops[v] ← hops[u] + 1; prev[v] ← u; enqueue v", explanation: "Marking here, at enqueue time rather than dequeue time, is what guarantees each vertex enters the queue once." },
    { id: "b7", indent: 0, text: "rebuild the path from goal by following prev", explanation: "Walk predecessors back from the goal. Each step goes one ring closer to the start." },
  ],
  complexity: "O(V + E) time: each vertex is enqueued once and each adjacency list is read once. O(V) extra space for the queue and tables.",
  examples: [worked, practiceExample],
  run,
  practice: {
    exampleId: practiceExample.id,
    reflection:
      "D → B → A and D → C → A both use two edges. Why does BFS report the route through B, and what would change if neighbours were visited in descending order?",
    build() {
      const trace = practiceTrace();
      const f = trace.frames;
      const w = workedTrace().frames;
      return {
        trace,
        checkpoints: [
          {
            id: "next-dequeue",
            frameIndex: before(f, is("dequeue", { current: "B" }), "B is dequeued"),
            question: "D has been processed. Its neighbours B and C are both in the queue. Which vertex leaves the queue next?",
            options: [
              { id: "B", label: "B", feedback: "Right. B was enqueued first (ascending id), and a queue serves the earliest arrival first." },
              { id: "C", label: "C", feedback: "C is waiting too, but it joined after B. A queue is first in, first out." },
              { id: "A", label: "A", feedback: "A has not been discovered yet. Only vertices already in the queue can leave it." },
            ],
            correct: ["B"],
            hint: "Read the queue strip from the front. Which vertex joined it first?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("dequeue", { current: "B" }), "worked dequeue B") },
          },
          {
            id: "hops-to-a",
            frameIndex: before(f, is("discover", { current: "B", edge: "A-B" }), "A is discovered"),
            question: "B is being processed and A is its undiscovered neighbour. How many hops from D does A get?",
            options: [
              { id: "2", label: "2", feedback: "Right. B is 1 hop from D, so A is 1 + 1 = 2." },
              { id: "1", label: "1", feedback: "1 is B's own hop count. A is one edge further on." },
              { id: "3", label: "3", feedback: "Count the edges on D → B → A: there are two." },
            ],
            correct: ["2"],
            hint: "hops[v] = hops[u] + 1. What is B's hop count?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("discover", { current: "B", edge: "B-D" }), "worked discover D") },
          },
          {
            id: "second-route",
            frameIndex: before(f, is("already", { current: "C", edge: "A-C" }), "C looks at A"),
            question: "C is dequeued and looks at its neighbour A. What happens to A?",
            options: [
              { id: "nothing", label: "Nothing. A is already discovered.", feedback: "Right. A was marked when B enqueued it, so it is not added again and keeps predecessor B." },
              { id: "enqueue", label: "A is enqueued a second time.", feedback: "That is the bug marking at enqueue time prevents. A is already discovered, so it is skipped." },
              { id: "repoint", label: "A's predecessor switches to C.", feedback: "BFS never revisits a discovered vertex. The route through C is no shorter, so nothing changes." },
            ],
            correct: ["nothing"],
            hint: "Is A in the discovered set right now?",
            walkthrough: { exampleId: worked.id, frame: findFrame(w, is("already", { current: "C", edge: "C-D" }), "worked C sees D") },
          },
        ],
      };
    },
  },
};
