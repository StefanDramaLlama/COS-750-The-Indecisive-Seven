export type LessonId = 'basics' | 'dijkstra' | 'bfs' | 'dfs' | 'topological-sort' | 'kruskal' | 'prim';
export type VertexId = string;
export type EdgeId = string;

export interface Vertex { id: VertexId; label: string }
export interface Edge { id: EdgeId; from: VertexId; to: VertexId; weight?: number }
export interface Graph { directed: boolean; vertices: Vertex[]; edges: Edge[] }
export type Positions = Record<VertexId, readonly [number, number]>;

export interface ExampleDescriptor {
  id: string;
  kind: 'walkthrough' | 'practice';
  title: string;
  scenario: string;
}
export interface Example extends ExampleDescriptor {
  graph: Graph;
  positions: Positions;
  startId?: VertexId;
  goalId?: VertexId;
}

export interface LessonSummary {
  id: LessonId;
  name: string;
  category: string;
  version: number;
}
export interface CodeLine { id: string; text: string; explanation: string }
export type PropertyId = 'direction' | 'cycles' | 'connectivity' | 'weights';
export interface Primer {
  id: PropertyId;
  title: string;
  before: { graph: Graph; caption: string };
  after: { graph: Graph; caption: string };
  positions: Positions;
  takeaway: string;
}
export interface CodeVariant {
  id: string;            
  label: string;          
  code: CodeLine[];
}
export interface Lesson extends LessonSummary {
  title: string;
  summary: string;
  prerequisites: string;
  complexity: string;
  objectives: [string, string];
  code: CodeLine[];
  examples: ExampleDescriptor[];
  primers: Primer[];       
  variants?: CodeVariant[];     
}

type Distances = Record<VertexId, number | null>;
type Predecessors = Record<VertexId, EdgeId | null>;
export type WorkingState =
  | { kind: 'dijkstra'; distances: Distances; predecessors: Predecessors; settled: VertexId[] }
  | { kind: 'bfs'; queue: VertexId[]; distances: Distances; predecessors: Predecessors; order: VertexId[] }
  | { kind: 'dfs'; stack: { vertexId: VertexId; nextNeighborIndex: number }[]; order: VertexId[] }
  | { kind: 'topological-sort'; indegrees: Record<VertexId, number>; ready: VertexId[]; order: VertexId[] }
  | { kind: 'kruskal'; edges: EdgeId[]; components: Record<VertexId, VertexId>; selected: EdgeId[]; total: number }
  | { kind: 'prim'; tree: VertexId[]; frontier: EdgeId[]; selected: EdgeId[]; total: number };

export interface Highlights {
  vertex?: VertexId;
  edge?: EdgeId;
  skipped?: EdgeId;
  resultVertices?: VertexId[];
  resultEdges?: EdgeId[];
}
export interface TraceFrame {
  index: number;
  event: string;
  lineId: string | null;
  title: string;
  change: string;
  reason: string;
  highlights: Highlights;
  state: WorkingState;
}
export type RunResult =
  | { kind: 'path'; vertices: VertexId[]; edges: EdgeId[]; cost: number }
  | { kind: 'traversal'; order: VertexId[]; path?: VertexId[]; hops?: number }
  | { kind: 'ordering'; order: VertexId[] }
  | { kind: 'tree'; edges: EdgeId[]; weight: number }
  | { kind: 'unreachable'; target: VertexId; order?: VertexId[] }
  | { kind: 'cycle'; order: VertexId[]; blocked: VertexId[] }
  | { kind: 'disconnected'; edges: EdgeId[]; weight: number; covered: VertexId[] };

export interface Run {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  graph: Graph;
  positions: Positions;
  frames: TraceFrame[];
  result: RunResult;
}

export interface Choice { checkpointId: string; optionId: string }
export type PracticeAction = { type: 'start' } | { type: 'hint'; checkpointId: string } |
  ({ type: 'answer' } & Choice);
export interface PracticeRequest {
  lessonId: LessonId;
  exampleId: string;
  version: number;
  acceptedChoices: Choice[];
  action: PracticeAction;
}
export interface PracticePrompt {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  reviewLineId: string;
}
export interface PracticeResponse extends Omit<Run, 'result'> {
  acceptedChoices: Choice[];
  prompt: PracticePrompt | null;
  completed: boolean;
  feedback: { kind: 'correct' | 'incorrect' | 'hint'; message: string } | null;
  result?: RunResult;
}
export interface ProgressItem {
  lessonId: LessonId;
  version: number;
  startedAt: string;
  completedAt: string | null;
}
