export type GraphKind = 'undirected' | 'directed' | 'weighted' | 'weighted-directed';
export interface GraphConfig { kind: GraphKind; directed: boolean; weighted: boolean }

export const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const MAX_VERTICES = LABELS.length;
export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 99;

export interface EdgeData { from: string; to: string; weight?: number }
/** Vertices are always kept in alphabetical order. An undirected edge is stored once with from < to. */
export interface GraphData { vertices: string[]; edges: EdgeData[] }

/** Rows and columns can differ for a moment while a vertex is being added or removed. */
export interface MatrixView { rowLabels: string[]; colLabels: string[]; cells: (number | null)[][] }
export interface ListItem { to: string; weight?: number }
export interface ListRow { vertex: string; items: ListItem[] }
export interface ListView { rows: ListRow[] }
export interface Snapshot { graph: GraphData; matrix: MatrixView; list: ListView }

export type Mark = 'changed' | 'read' | 'removing';
export type VertexMark = Mark | 'current' | 'visited' | 'frontier';
export interface Highlights {
  graphVertices: Record<string, VertexMark>;
  graphEdges: Record<string, Mark>;
  /** Keyed `${rowLabel}|${colLabel}`. */
  matrixCells: Record<string, Mark>;
  matrixRows: Record<string, Mark>;
  matrixCols: Record<string, Mark>;
  listRows: Record<string, Mark>;
  /** Keyed `${rowLabel}>${itemLabel}`. */
  listItems: Record<string, Mark>;
}

export type OpName =
  | 'addVertex' | 'removeVertex' | 'addEdge' | 'removeEdge' | 'updateWeight'
  | 'hasEdge' | 'neighbors' | 'degree' | 'vertexCount' | 'edgeCount' | 'isEmpty'
  | 'bfs' | 'dfs';
export interface OpRequest { op: OpName; a?: string; b?: string; weight?: number }

export interface Traversal { kind: 'bfs' | 'dfs'; frontier: string[]; order: string[] }
export type Pane = 'start' | 'graph' | 'matrix' | 'list' | 'result' | 'rejected';
export type Sound = 'add' | 'remove' | 'update' | 'query' | 'error' | 'none';

export interface Frame {
  index: number;
  /** -1 for the opening frame. */
  opIndex: number;
  pane: Pane;
  title: string;
  /** One plain-words sentence for the execution log. */
  log: string;
  why?: string;
  matrixLines: string[];
  listLines: string[];
  highlights: Highlights;
  snapshot: Snapshot;
  traversal?: Traversal;
  result?: string;
  sound: Sound;
}

export interface OpSpan { request: OpRequest; first: number; last: number }
export interface Session { config: GraphConfig; frames: Frame[]; spans: OpSpan[] }

export interface Facts {
  vertexCount: number;
  edgeCount: number;
  maxEdges: number;
  density: number;
  densityLabel: 'sparse' | 'dense';
  connected: boolean | null;
  stronglyConnected: boolean | null;
  hasCycle: boolean;
  degrees: Record<string, { in: number; out: number; total: number }>;
  totalWeight: number | null;
}
