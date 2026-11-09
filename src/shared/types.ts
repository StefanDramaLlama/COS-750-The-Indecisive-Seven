// Contracts shared by the browser studio and the server. Keep this file free of
// runtime imports so the browser bundle never pulls in server code.

export type LessonId = "dijkstra" | "bfs" | "dfs" | "topological-sort" | "kruskal" | "prim";

export const LESSON_IDS: readonly LessonId[] = [
  "dijkstra",
  "bfs",
  "dfs",
  "topological-sort",
  "kruskal",
  "prim",
];

export type StudioView = "walkthrough" | "pseudocode" | "practice";

/* ------------------------------------------------------------------ graphs */

export interface Vertex {
  id: string;
  label: string;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  weight?: number;
}

/** An undirected edge is stored once; both adjacency entries share its ID. */
export interface Graph {
  directed: boolean;
  vertices: Vertex[];
  edges: Edge[];
}

/** SVG coordinates keyed by vertex ID, kept apart from algorithm input. */
export type Positions = Record<string, { x: number; y: number }>;

export type ExampleKind = "worked" | "variant" | "practice";

export interface Example {
  id: string;
  kind: ExampleKind;
  title: string;
  scenario: string;
  assumptions: string[];
  graph: Graph;
  positions: Positions;
  startId?: string;
  goalId?: string;
}

/* ----------------------------------------------------------------- lessons */

export interface PseudocodeLine {
  id: string;
  text: string;
  indent: number;
  explanation: string;
}

export type PrimerId = "directed" | "cycle" | "connectivity" | "weighted";

export interface LessonSummary {
  id: LessonId;
  order: number;
  version: number;
  title: string;
  approach: string;
  blurb: string;
}

export interface PublicLesson extends LessonSummary {
  prerequisites: string[];
  objectives: string[];
  vocabulary: { term: string; meaning: string }[];
  primers: PrimerId[];
  pseudocode: PseudocodeLine[];
  complexity: string;
  examples: Example[];
  practice: {
    exampleId: string;
    scenario: string;
    assumptions: string[];
    checkpointCount: number;
  };
}

/* ------------------------------------------------------------------ traces */

export interface Highlights {
  /** The vertex the algorithm is acting on right now. */
  current: string[];
  /** The edge being considered right now. */
  currentEdges: string[];
  /** Discovered / tentative / ready / in the frontier. */
  discovered: string[];
  /** Settled / finished / placed / in the tree. */
  completed: string[];
  /** Predecessor or tree edges kept so far. */
  chosenEdges: string[];
  /** Edges skipped or rejected. */
  rejectedEdges: string[];
  /** Candidate edges (e.g. Prim's crossing edges). */
  frontierEdges: string[];
  /** Final path or tree, marked on the terminal frame. */
  resultVertices: string[];
  resultEdges: string[];
}

export interface DijkstraState {
  algorithm: "dijkstra";
  dist: Record<string, number | null>;
  prev: Record<string, string | null>;
  prevEdge: Record<string, string | null>;
  settled: string[];
  current: string | null;
}

export interface BfsState {
  algorithm: "bfs";
  queue: string[];
  head: number;
  discovered: string[];
  hops: Record<string, number | null>;
  prev: Record<string, string | null>;
  visitOrder: string[];
  current: string | null;
}

export interface DfsState {
  algorithm: "dfs";
  stack: { vertexId: string; nextNeighborIndex: number; neighborCount: number }[];
  visited: string[];
  discoveryOrder: string[];
  finished: string[];
  current: string | null;
}

export interface KahnState {
  algorithm: "topological-sort";
  inDegree: Record<string, number>;
  ready: string[];
  output: string[];
  current: string | null;
}

export interface KruskalState {
  algorithm: "kruskal";
  sortedEdges: string[];
  cursor: number;
  component: Record<string, string>;
  selected: string[];
  rejected: string[];
  total: number;
}

export interface PrimState {
  algorithm: "prim";
  inTree: string[];
  crossing: string[];
  selected: string[];
  total: number;
  current: string | null;
}

export type AlgorithmState =
  | DijkstraState
  | BfsState
  | DfsState
  | KahnState
  | KruskalState
  | PrimState;

export interface TraceFrame<S extends AlgorithmState = AlgorithmState> {
  index: number;
  event: string;
  /** null only on the opening frame. */
  lineId: string | null;
  highlights: Highlights;
  state: S;
  /** The current action, e.g. "Relax B–D". */
  title: string;
  /** What changed in this step. */
  changed: string;
  /** Why the algorithm did it. */
  why: string;
}

export type RunResult =
  | {
      kind: "path";
      path: string[];
      pathEdges: string[];
      cost: number;
      unit: "weight" | "hops";
      order?: string[];
    }
  | { kind: "traversal"; order: string[]; unreached: string[] }
  | { kind: "order"; order: string[] }
  | { kind: "tree"; edges: string[]; weight: number }
  | {
      kind: "diagnostic";
      code: "unreachable" | "cycle" | "disconnected";
      message: string;
      partial: {
        order?: string[];
        edges?: string[];
        weight?: number;
        blocked?: string[];
      };
    };

export interface Run {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  graph: Graph;
  positions: Positions;
  frames: TraceFrame[];
  result: RunResult;
}

/* ---------------------------------------------------------------- practice */

export interface AcceptedChoice {
  checkpointId: string;
  optionId: string;
}

export type PracticeAction =
  | { type: "start" }
  | { type: "hint"; checkpointId: string }
  | { type: "answer"; checkpointId: string; optionId: string };

export interface PracticeRequest {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  acceptedChoices: AcceptedChoice[];
  action: PracticeAction;
}

export interface PracticePrompt {
  checkpointId: string;
  number: number;
  total: number;
  question: string;
  options: { id: string; label: string }[];
  /** Frame in the worked walkthrough that teaches the same move. */
  walkthroughFrame: number | null;
  walkthroughExampleId: string;
}

export interface PracticeFeedback {
  tone: "correct" | "incorrect" | "hint" | "info";
  message: string;
}

export interface PracticeResponse {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  graph: Graph;
  positions: Positions;
  /** Frames revealed so far, indexes stable across responses. */
  frames: TraceFrame[];
  acceptedChoices: AcceptedChoice[];
  prompt: PracticePrompt | null;
  feedback: PracticeFeedback | null;
  status: "in-progress" | "complete";
  result?: RunResult;
  reflection?: string;
}

/* ---------------------------------------------------------------- progress */

export interface ProgressEntry {
  lessonId: string;
  lessonVersion: number;
  startedAt: string;
  completedAt: string | null;
}

export interface ApiError {
  error: { code: string; message: string };
}

/* ------------------------------------------------------------------- tutor */

export type TutorMode = "answer" | "simpler" | "deeper";

export interface TutorMessage {
  role: "user" | "model";
  text: string;
}

export interface TutorRequest {
  mode: TutorMode;
  /** Text captured from the learner's screen. */
  context: string;
  messages: TutorMessage[];
}
