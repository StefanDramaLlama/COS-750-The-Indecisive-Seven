import type {
  EdgeData, Facts, Frame, GraphConfig, GraphData, GraphKind, Highlights, ListView, MatrixView, OpName, OpRequest,
  OpSpan, Pane, Session, Snapshot, Sound, Traversal
} from './types.ts';
import { LABELS, MAX_VERTICES, MAX_WEIGHT, MIN_WEIGHT } from './types.ts';

export const CONFIGS: Record<GraphKind, GraphConfig> = {
  undirected: { kind: 'undirected', directed: false, weighted: false },
  directed: { kind: 'directed', directed: true, weighted: false },
  weighted: { kind: 'weighted', directed: false, weighted: true },
  'weighted-directed': { kind: 'weighted-directed', directed: true, weighted: true }
};

/* ---------- Graph helpers ---------- */

export const emptyHighlights = (): Highlights => ({
  graphVertices: {}, graphEdges: {}, matrixCells: {}, matrixRows: {}, matrixCols: {}, listRows: {}, listItems: {}
});

export function cloneGraph(graph: GraphData): GraphData {
  return { vertices: [...graph.vertices], edges: graph.edges.map(edge => ({ ...edge })) };
}

/** Undirected edges are stored once with from < to. Directed edges keep their direction. */
export function orient(config: GraphConfig, a: string, b: string): [string, string] {
  return !config.directed && a > b ? [b, a] : [a, b];
}
export const edgeKey = (edge: { from: string; to: string }) => `${edge.from}-${edge.to}`;
export function findEdge(config: GraphConfig, graph: GraphData, a: string, b: string): EdgeData | undefined {
  const [from, to] = orient(config, a, b);
  return graph.edges.find(edge => edge.from === from && edge.to === to);
}
export const sortedVertices = (vertices: string[]) => [...vertices].sort();
export const nextFreeLabel = (graph: GraphData) => LABELS.find(label => !graph.vertices.includes(label));

/** Out-neighbours in alphabetical order. */
export function neighborsOf(config: GraphConfig, graph: GraphData, vertex: string): { to: string; weight?: number }[] {
  const found: { to: string; weight?: number }[] = [];
  for (const edge of graph.edges) {
    const item = (to: string) => found.push(edge.weight === undefined ? { to } : { to, weight: edge.weight });
    if (edge.from === vertex) item(edge.to);
    else if (!config.directed && edge.to === vertex) item(edge.from);
  }
  return found.sort((x, y) => x.to.localeCompare(y.to));
}
export function inNeighborsOf(config: GraphConfig, graph: GraphData, vertex: string): string[] {
  if (!config.directed) return neighborsOf(config, graph, vertex).map(item => item.to);
  return graph.edges.filter(edge => edge.to === vertex).map(edge => edge.from).sort();
}

export function matrixOf(config: GraphConfig, graph: GraphData): MatrixView {
  const labels = graph.vertices;
  const empty = config.weighted ? null : 0;
  const cells = labels.map(() => labels.map(() => empty as number | null));
  for (const edge of graph.edges) {
    const i = labels.indexOf(edge.from);
    const j = labels.indexOf(edge.to);
    const value = config.weighted ? edge.weight ?? 1 : 1;
    cells[i][j] = value;
    if (!config.directed) cells[j][i] = value;
  }
  return { rowLabels: [...labels], colLabels: [...labels], cells };
}

export function listOf(config: GraphConfig, graph: GraphData): ListView {
  return { rows: graph.vertices.map(vertex => ({ vertex, items: neighborsOf(config, graph, vertex) })) };
}

export function snapshotOf(config: GraphConfig, graph: GraphData): Snapshot {
  return { graph: cloneGraph(graph), matrix: matrixOf(config, graph), list: listOf(config, graph) };
}

const cloneMatrix = (m: MatrixView): MatrixView => ({ rowLabels: [...m.rowLabels], colLabels: [...m.colLabels], cells: m.cells.map(row => [...row]) });
const cloneList = (l: ListView): ListView => ({ rows: l.rows.map(row => ({ vertex: row.vertex, items: row.items.map(item => ({ ...item })) })) });
const cloneHighlights = (h: Highlights): Highlights => ({
  graphVertices: { ...h.graphVertices }, graphEdges: { ...h.graphEdges }, matrixCells: { ...h.matrixCells },
  matrixRows: { ...h.matrixRows }, matrixCols: { ...h.matrixCols }, listRows: { ...h.listRows }, listItems: { ...h.listItems }
});

/* ---------- Facts about a graph ---------- */

export function computeFacts(config: GraphConfig, graph: GraphData): Facts {
  const n = graph.vertices.length;
  const e = graph.edges.length;
  const maxEdges = config.directed ? n * (n - 1) : (n * (n - 1)) / 2;
  const density = maxEdges === 0 ? 0 : e / maxEdges;
  const degrees: Facts['degrees'] = {};
  for (const v of graph.vertices) {
    const out = graph.edges.filter(edge => edge.from === v || (!config.directed && edge.to === v)).length;
    const inn = config.directed ? graph.edges.filter(edge => edge.to === v).length : out;
    degrees[v] = { in: inn, out, total: config.directed ? out + inn : out };
  }
  const reach = (start: string, mode: 'out' | 'both'): Set<string> => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const v = stack.pop()!;
      for (const edge of graph.edges) {
        const next = edge.from === v ? edge.to : edge.to === v && (!config.directed || mode === 'both') ? edge.from : undefined;
        if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    return seen;
  };
  const connected = n === 0 ? null : reach(graph.vertices[0], 'both').size === n;
  const stronglyConnected = !config.directed || n === 0 ? null : graph.vertices.every(v => reach(v, 'out').size === n);
  return {
    vertexCount: n, edgeCount: e, maxEdges, density,
    densityLabel: density > 0.5 ? 'dense' : 'sparse',
    connected, stronglyConnected, hasCycle: detectCycle(config, graph), degrees,
    totalWeight: config.weighted ? graph.edges.reduce((sum, edge) => sum + (edge.weight ?? 0), 0) : null
  };
}

function detectCycle(config: GraphConfig, graph: GraphData): boolean {
  if (config.directed) {
    const state = new Map<string, 1 | 2>();
    const visit = (v: string): boolean => {
      state.set(v, 1);
      for (const edge of graph.edges.filter(item => item.from === v)) {
        const s = state.get(edge.to);
        if (s === 1 || (s === undefined && visit(edge.to))) return true;
      }
      state.set(v, 2);
      return false;
    };
    return graph.vertices.some(v => !state.has(v) && visit(v));
  }
  const parent = new Map(graph.vertices.map(v => [v, v]));
  const root = (v: string): string => (parent.get(v) === v ? v : root(parent.get(v)!));
  for (const edge of graph.edges) {
    const a = root(edge.from);
    const b = root(edge.to);
    if (a === b) return true;
    parent.set(a, b);
  }
  return false;
}

/* ---------- Operation metadata ---------- */

export const OP_NAMES: OpName[] = [
  'addVertex', 'removeVertex', 'addEdge', 'removeEdge', 'updateWeight',
  'hasEdge', 'neighbors', 'degree', 'vertexCount', 'edgeCount', 'isEmpty', 'bfs', 'dfs'
];

export function opLabel(request: OpRequest): string {
  const args = [request.a, request.b, request.weight === undefined ? undefined : String(request.weight)].filter(arg => arg !== undefined);
  return `${request.op}(${args.join(', ')})`;
}

/* ---------- Session builder ---------- */

interface Context {
  config: GraphConfig;
  graph: GraphData;
  matrix: MatrixView;
  list: ListView;
  frames: Frame[];
  opIndex: number;
}

type FrameInput = Partial<Pick<Frame, 'why' | 'matrixLines' | 'listLines' | 'traversal' | 'result'>> & {
  pane: Pane; title: string; log: string; sound: Sound; highlights?: Highlights;
};

function emit(ctx: Context, input: FrameInput): void {
  const frame: Frame = {
    index: ctx.frames.length, opIndex: ctx.opIndex, pane: input.pane, title: input.title, log: input.log,
    matrixLines: input.matrixLines ?? [], listLines: input.listLines ?? [],
    highlights: cloneHighlights(input.highlights ?? emptyHighlights()),
    snapshot: { graph: cloneGraph(ctx.graph), matrix: cloneMatrix(ctx.matrix), list: cloneList(ctx.list) },
    sound: input.sound
  };
  if (input.why) frame.why = input.why;
  if (input.traversal) frame.traversal = { ...input.traversal, frontier: [...input.traversal.frontier], order: [...input.traversal.order] };
  if (input.result !== undefined) frame.result = input.result;
  ctx.frames.push(frame);
}

export function buildSession(config: GraphConfig, initial: GraphData, requests: OpRequest[]): Session {
  const graph = cloneGraph(initial);
  graph.vertices = sortedVertices(graph.vertices);
  const ctx: Context = { config, graph, matrix: matrixOf(config, graph), list: listOf(config, graph), frames: [], opIndex: -1 };
  const facts = computeFacts(config, graph);
  emit(ctx, {
    pane: 'start', title: 'Starting graph', sound: 'none',
    log: `Starting graph: ${plural(facts.vertexCount, 'vertex', 'vertices')} and ${plural(facts.edgeCount, 'edge')}. The matrix is ${facts.vertexCount}×${facts.vertexCount} and the list has ${plural(facts.vertexCount, 'row')}.`,
    matrixLines: ['The matrix has one row and one column for every vertex.'],
    listLines: ['The list has one row for every vertex, holding that vertex’s neighbours.']
  });
  const spans: OpSpan[] = [];
  requests.forEach((request, index) => {
    ctx.opIndex = index;
    const first = ctx.frames.length;
    runOp(ctx, request);
    spans.push({ request, first, last: ctx.frames.length - 1 });
  });
  return { config, frames: ctx.frames, spans };
}

/** The graph as it stands after the last frame (what the next operation will act on). */
export function finalGraph(session: Session): GraphData {
  return session.frames[session.frames.length - 1].snapshot.graph;
}

function plural(count: number, word: string, many?: string): string {
  return `${count} ${count === 1 ? word : many ?? `${word}s`}`;
}
const dim = (matrix: MatrixView) => `${matrix.rowLabels.length}×${matrix.colLabels.length}`;
const listText = (items: { to: string; weight?: number }[], weighted: boolean) =>
  items.length ? items.map(item => (weighted ? `${item.to}(${item.weight})` : item.to)).join(', ') : 'nothing';
const emptyCell = (config: GraphConfig) => (config.weighted ? '∞' : '0');
const edgeName = (config: GraphConfig, a: string, b: string) => `${a}${config.directed ? '→' : '–'}${b}`;
const cellValue = (config: GraphConfig, value: number | null) => (value === null ? '∞' : String(value));

function reject(ctx: Context, request: OpRequest, reason: string): void {
  emit(ctx, {
    pane: 'rejected', title: `${opLabel(request)} was rejected`, log: `Rejected: ${reason} Nothing changed.`,
    sound: 'error', result: 'rejected',
    matrixLines: ['The matrix is unchanged.'], listLines: ['The list is unchanged.'],
    why: 'An ADT operation checks its preconditions first so the structure is never left in an invalid state.'
  });
}

function validWeight(weight: number | undefined): weight is number {
  return weight !== undefined && Number.isInteger(weight) && weight >= MIN_WEIGHT && weight <= MAX_WEIGHT;
}

function needVertices(ctx: Context, request: OpRequest, ...labels: (string | undefined)[]): boolean {
  for (const label of labels) {
    if (label === undefined || label === '') { reject(ctx, request, 'that operation needs a vertex.'); return false; }
    if (!ctx.graph.vertices.includes(label)) { reject(ctx, request, `vertex ${label} does not exist.`); return false; }
  }
  return true;
}

function runOp(ctx: Context, request: OpRequest): void {
  switch (request.op) {
    case 'addVertex': return addVertex(ctx, request);
    case 'removeVertex': return removeVertex(ctx, request);
    case 'addEdge': return addEdge(ctx, request);
    case 'removeEdge': return removeEdge(ctx, request);
    case 'updateWeight': return updateWeight(ctx, request);
    case 'hasEdge': return hasEdge(ctx, request);
    case 'neighbors': return neighbors(ctx, request);
    case 'degree': return degree(ctx, request);
    case 'vertexCount': case 'edgeCount': case 'isEmpty': return counts(ctx, request);
    case 'bfs': case 'dfs': return traverse(ctx, request);
  }
}

/* ---------- Mutating operations ---------- */

function addVertex(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  const v = request.a;
  if (v && ctx.graph.vertices.includes(v)) return reject(ctx, request, `vertex ${v} already exists.`);
  if (ctx.graph.vertices.length >= MAX_VERTICES) return reject(ctx, request, `this demo holds at most ${MAX_VERTICES} vertices.`);
  if (!v || !(LABELS as readonly string[]).includes(v)) return reject(ctx, request, `vertex labels run from A to ${LABELS[MAX_VERTICES - 1]}.`);
  const before = ctx.graph.vertices.length;
  ctx.graph.vertices = sortedVertices([...ctx.graph.vertices, v]);
  const at = ctx.graph.vertices.indexOf(v);
  const empty = config.weighted ? null : 0;
  const hl = emptyHighlights();
  hl.graphVertices[v] = 'changed';
  emit(ctx, {
    pane: 'graph', title: `Add vertex ${v}`, sound: 'add', highlights: hl,
    log: `Vertex ${v} is added to the graph. It has no edges yet.`,
    matrixLines: [`Next, the matrix will gain a row and a column for ${v}.`],
    listLines: [`Next, the list will gain an empty row for ${v}.`],
    why: 'A new vertex starts isolated. Every representation must make room for it.'
  });
  // Matrix: first the row, then the column.
  const rowsWithNew = [...ctx.matrix.rowLabels];
  rowsWithNew.splice(at, 0, v);
  const cellsRow = ctx.matrix.cells.map(row => [...row]);
  cellsRow.splice(at, 0, ctx.matrix.colLabels.map(() => empty as number | null));
  ctx.matrix = { rowLabels: rowsWithNew, colLabels: [...ctx.matrix.colLabels], cells: cellsRow };
  const hr = emptyHighlights();
  hr.matrixRows[v] = 'changed';
  emit(ctx, {
    pane: 'matrix', title: `Matrix: add row ${v}`, sound: 'add', highlights: hr, log: `Row ${v} is added to the matrix, all set to ${emptyCell(config)}.`,
    matrixLines: [`Insert a new row for ${v} at position ${at}.`, `All ${before} cells in it start as ${emptyCell(config)}${config.weighted ? ' (no edge)' : ''}.`, `The matrix is ${dim(ctx.matrix)} for a moment: it has a row but no column yet.`],
    listLines: ['The list has not changed yet.']
  });
  const cols = [...ctx.matrix.colLabels];
  cols.splice(at, 0, v);
  ctx.matrix = { rowLabels: [...ctx.matrix.rowLabels], colLabels: cols, cells: ctx.matrix.cells.map(row => { const copy = [...row]; copy.splice(at, 0, empty as number | null); return copy; }) };
  const hc = emptyHighlights();
  hc.matrixCols[v] = 'changed';
  hc.matrixRows[v] = 'changed';
  emit(ctx, {
    pane: 'matrix', title: `Matrix: add column ${v}`, sound: 'add', highlights: hc,
    log: `Column ${v} is added to every row, all set to ${emptyCell(config)}. The matrix is now ${dim(ctx.matrix)}.`,
    matrixLines: [`Insert a cell for ${v} into each of the ${before + 1} rows.`, `The matrix is square again: ${dim(ctx.matrix)}.`, 'Every row had to be rebuilt, which is why this costs O(V²) in the worst case.'],
    listLines: ['The list has not changed yet.']
  });
  ctx.list = listOf(config, ctx.graph);
  const hl2 = emptyHighlights();
  hl2.listRows[v] = 'changed';
  emit(ctx, {
    pane: 'list', title: `List: add row ${v}`, sound: 'add', highlights: hl2,
    log: `An empty list for ${v} is added to the adjacency list.`,
    matrixLines: [`The matrix is ${dim(ctx.matrix)} and finished.`],
    listLines: [`Add one new row for ${v}; it points to nothing yet.`, 'Nothing else in the list has to move.']
  });
}

function removeVertex(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  const v = request.a;
  if (!needVertices(ctx, request, v)) return;
  const vertex = v!;
  const incident = ctx.graph.edges.filter(edge => edge.from === vertex || edge.to === vertex);
  const at = ctx.graph.vertices.indexOf(vertex);
  const hg = emptyHighlights();
  hg.graphVertices[vertex] = 'removing';
  for (const edge of incident) hg.graphEdges[edgeKey(edge)] = 'removing';
  emit(ctx, {
    pane: 'graph', title: `Remove vertex ${vertex}`, sound: 'remove', highlights: hg,
    log: `Vertex ${vertex} and its ${plural(incident.length, 'edge')} are marked for removal.`,
    matrixLines: [`Next, row ${vertex} and column ${vertex} will be deleted.`],
    listLines: [`Next, list ${vertex} and every entry pointing to ${vertex} will be deleted.`],
    why: 'An edge cannot exist without both end vertices, so removing a vertex removes every incident edge too.'
  });
  // Matrix: remove the row, then the column.
  ctx.matrix = { rowLabels: ctx.matrix.rowLabels.filter(l => l !== vertex), colLabels: [...ctx.matrix.colLabels], cells: ctx.matrix.cells.filter((_, i) => i !== at) };
  const hr = emptyHighlights();
  hr.matrixCols[vertex] = 'removing';
  hr.graphVertices[vertex] = 'removing';
  emit(ctx, {
    pane: 'matrix', title: `Matrix: delete row ${vertex}`, sound: 'remove', highlights: hr,
    log: `Row ${vertex} is deleted from the matrix. Column ${vertex} is still there.`,
    matrixLines: [`Delete row ${vertex}; the rows below it shift up one place.`, `The matrix is ${dim(ctx.matrix)} for a moment.`],
    listLines: ['The list has not changed yet.']
  });
  ctx.matrix = { rowLabels: [...ctx.matrix.rowLabels], colLabels: ctx.matrix.colLabels.filter(l => l !== vertex), cells: ctx.matrix.cells.map(row => row.filter((_, j) => j !== at)) };
  const survivors = ctx.graph.vertices.filter(l => l !== vertex);
  emit(ctx, {
    pane: 'matrix', title: `Matrix: delete column ${vertex}`, sound: 'remove', highlights: hr,
    log: `Column ${vertex} is deleted from every row. The matrix shrinks to ${dim(ctx.matrix)} and the other labels stay the same.`,
    matrixLines: [`Delete the cell for ${vertex} from each remaining row.`, `Matrix is ${dim(ctx.matrix)}. Labels ${survivors.join(', ') || '(none)'} keep their names.`],
    listLines: ['The list has not changed yet.']
  });
  // List: drop the row and every item pointing at it.
  const hl = emptyHighlights();
  const lines: string[] = [`Delete the row for ${vertex}.`];
  const rows = ctx.list.rows.filter(row => row.vertex !== vertex).map(row => {
    const items = row.items.filter(item => item.to !== vertex);
    if (items.length !== row.items.length) { hl.listRows[row.vertex] = 'changed'; lines.push(`Scan ${row.vertex}'s list: remove the entry for ${vertex}.`); }
    else lines.push(`Scan ${row.vertex}'s list: nothing to remove.`);
    return { vertex: row.vertex, items };
  });
  ctx.list = { rows };
  emit(ctx, {
    pane: 'list', title: `List: delete ${vertex}`, sound: 'remove', highlights: hl,
    log: `List ${vertex} is deleted and every entry pointing to ${vertex} is removed from the other lists.`,
    matrixLines: [`The matrix is ${dim(ctx.matrix)} and finished.`],
    listLines: lines.length > 1 ? lines : ['The list is now empty.'],
    why: `Every list had to be scanned for entries pointing at ${vertex}, so this costs O(V + E).`
  });
  // Finally the picture catches up.
  ctx.graph = { vertices: ctx.graph.vertices.filter(l => l !== vertex), edges: ctx.graph.edges.filter(edge => edge.from !== vertex && edge.to !== vertex) };
  emit(ctx, {
    pane: 'result', title: `Vertex ${vertex} removed`, sound: 'remove',
    log: `Vertex ${vertex} is gone. The graph now has ${plural(ctx.graph.vertices.length, 'vertex', 'vertices')} and ${plural(ctx.graph.edges.length, 'edge')}.`,
    matrixLines: [`Final matrix: ${dim(ctx.matrix)}.`], listLines: [`Final list: ${plural(ctx.list.rows.length, 'row')}.`], result: 'removed'
  });
}

function addEdge(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a, request.b)) return;
  const [a, b] = [request.a!, request.b!];
  if (a === b) return reject(ctx, request, `an edge from ${a} to itself (a self-loop) is not allowed in this demo.`);
  if (config.weighted && !validWeight(request.weight)) return reject(ctx, request, `a weighted edge needs a whole-number weight from ${MIN_WEIGHT} to ${MAX_WEIGHT}.`);
  if (findEdge(config, ctx.graph, a, b)) {
    return reject(ctx, request, `${edgeName(config, a, b)} already exists${config.weighted ? '; use updateWeight to change its weight' : ''}.`);
  }
  const [from, to] = orient(config, a, b);
  const weight = config.weighted ? request.weight! : undefined;
  const edge: EdgeData = weight === undefined ? { from, to } : { from, to, weight };
  ctx.graph.edges = [...ctx.graph.edges, edge].sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
  const value = weight ?? 1;
  const hg = emptyHighlights();
  hg.graphEdges[edgeKey(edge)] = 'changed';
  hg.graphVertices[from] = 'read';
  hg.graphVertices[to] = 'read';
  emit(ctx, {
    pane: 'graph', title: `Add edge ${edgeName(config, a, b)}`, sound: 'add', highlights: hg,
    log: `Edge ${edgeName(config, a, b)} is drawn${weight === undefined ? '' : ` with weight ${weight}`}.`,
    matrixLines: [`Next, the matrix cell${config.directed ? '' : 's'} for ${edgeName(config, a, b)} will be set.`],
    listLines: [`Next, the list${config.directed ? '' : 's'} will record the edge.`],
    why: config.directed ? `The arrow points from ${a} to ${b}: it does not mean ${b} can reach ${a}.` : `An undirected edge works both ways, so ${a} and ${b} become neighbours of each other.`
  });
  const i = ctx.matrix.rowLabels.indexOf(from);
  const j = ctx.matrix.colLabels.indexOf(to);
  ctx.matrix = cloneMatrix(ctx.matrix);
  ctx.matrix.cells[i][j] = value;
  const hm = emptyHighlights();
  hm.matrixCells[`${from}|${to}`] = 'changed';
  if (!config.directed) { ctx.matrix.cells[j][i] = value; hm.matrixCells[`${to}|${from}`] = 'changed'; }
  const shown = weight === undefined ? '1' : String(weight);
  emit(ctx, {
    pane: 'matrix', title: 'Matrix: set the cell', sound: 'add', highlights: hm,
    log: config.directed
      ? `Cell [${from}][${to}] (row ${from}, column ${to}) is set to ${shown}. Cell [${to}][${from}] stays ${emptyCell(config)} because the edge only goes one way.`
      : `Cells [${from}][${to}] and [${to}][${from}] are both set to ${shown}, so the matrix stays symmetric.`,
    matrixLines: config.directed
      ? [`Row ${from}, column ${to} := ${shown}.`, 'A single write: this is O(1).']
      : [`Row ${from}, column ${to} := ${shown}.`, `Row ${to}, column ${from} := ${shown}.`, 'Two writes, but still O(1).'],
    listLines: ['The list has not changed yet.']
  });
  ctx.list = listOf(config, ctx.graph);
  const hl = emptyHighlights();
  hl.listRows[from] = 'changed';
  hl.listItems[`${from}>${to}`] = 'changed';
  if (!config.directed) { hl.listRows[to] = 'changed'; hl.listItems[`${to}>${from}`] = 'changed'; }
  emit(ctx, {
    pane: 'list', title: 'List: record the neighbour', sound: 'add', highlights: hl,
    log: config.directed ? `${to}${weight === undefined ? '' : ` (weight ${weight})`} is added to ${from}'s list only.` : `${to} is added to ${from}'s list and ${from} is added to ${to}'s list${weight === undefined ? '' : `, both with weight ${weight}`}.`,
    matrixLines: ['The matrix is finished.'],
    listLines: config.directed ? [`Add ${to} to the list for ${from}.`, `${to}'s list is untouched.`] : [`Add ${to} to the list for ${from}.`, `Add ${from} to the list for ${to}.`, 'The edge is stored twice, once from each end.'],
    result: 'added'
  });
}

function removeEdge(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a, request.b)) return;
  const [a, b] = [request.a!, request.b!];
  const edge = findEdge(config, ctx.graph, a, b);
  if (!edge) {
    const reverse = config.directed && findEdge(config, ctx.graph, b, a);
    return reject(ctx, request, `there is no edge ${edgeName(config, a, b)}${reverse ? ` (only ${edgeName(config, b, a)} exists, and direction matters)` : ''}.`);
  }
  const { from, to } = edge;
  const hg = emptyHighlights();
  hg.graphEdges[edgeKey(edge)] = 'removing';
  emit(ctx, {
    pane: 'graph', title: `Remove edge ${edgeName(config, from, to)}`, sound: 'remove', highlights: hg,
    log: `Edge ${edgeName(config, from, to)} is marked for removal. Both vertices stay.`,
    matrixLines: [`Next, the matrix cell${config.directed ? '' : 's'} will be reset to ${emptyCell(config)}.`],
    listLines: [`Next, the entr${config.directed ? 'y' : 'ies'} will be removed from the list${config.directed ? '' : 's'}.`],
    why: 'Removing an edge never removes its vertices.'
  });
  const i = ctx.matrix.rowLabels.indexOf(from);
  const j = ctx.matrix.colLabels.indexOf(to);
  ctx.matrix = cloneMatrix(ctx.matrix);
  const empty = config.weighted ? null : 0;
  ctx.matrix.cells[i][j] = empty;
  const hm = emptyHighlights();
  hm.matrixCells[`${from}|${to}`] = 'changed';
  if (!config.directed) { ctx.matrix.cells[j][i] = empty; hm.matrixCells[`${to}|${from}`] = 'changed'; }
  emit(ctx, {
    pane: 'matrix', title: 'Matrix: reset the cell', sound: 'remove', highlights: hm,
    log: config.directed ? `Cell [${from}][${to}] is reset to ${emptyCell(config)}.` : `Cells [${from}][${to}] and [${to}][${from}] are both reset to ${emptyCell(config)}.`,
    matrixLines: [`Row ${from}, column ${to} := ${emptyCell(config)}.`, ...(config.directed ? [] : [`Row ${to}, column ${from} := ${emptyCell(config)}.`]), 'No rows or columns move: O(1).'],
    listLines: ['The list has not changed yet.']
  });
  ctx.graph = { vertices: ctx.graph.vertices, edges: ctx.graph.edges.filter(item => item !== edge) };
  ctx.list = listOf(config, ctx.graph);
  const hl = emptyHighlights();
  hl.listRows[from] = 'changed';
  if (!config.directed) hl.listRows[to] = 'changed';
  emit(ctx, {
    pane: 'list', title: 'List: remove the neighbour', sound: 'remove', highlights: hl,
    log: config.directed ? `${to} is removed from ${from}'s list.` : `${to} is removed from ${from}'s list and ${from} is removed from ${to}'s list.`,
    matrixLines: ['The matrix is finished.'],
    listLines: [`Find ${to} in the list for ${from} and unlink it.`, ...(config.directed ? [] : [`Find ${from} in the list for ${to} and unlink it.`]), 'Finding it means walking the list: O(degree).']
  });
  emit(ctx, {
    pane: 'graph', title: `Edge ${edgeName(config, from, to)} removed`, sound: 'remove',
    log: `The edge disappears from the picture. The graph now has ${plural(ctx.graph.edges.length, 'edge')}.`,
    matrixLines: ['Matrix and list agree with the picture.'], listLines: ['Matrix and list agree with the picture.'], result: 'removed'
  });
}

function updateWeight(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!config.weighted) return reject(ctx, request, 'this graph is not weighted, so edges have no weight to update.');
  if (!needVertices(ctx, request, request.a, request.b)) return;
  const [a, b] = [request.a!, request.b!];
  const edge = findEdge(config, ctx.graph, a, b);
  if (!edge) return reject(ctx, request, `there is no edge ${edgeName(config, a, b)} to update.`);
  if (!validWeight(request.weight)) return reject(ctx, request, `a weight is a whole number from ${MIN_WEIGHT} to ${MAX_WEIGHT}.`);
  if (edge.weight === request.weight) return reject(ctx, request, `${edgeName(config, a, b)} already has weight ${request.weight}.`);
  const old = edge.weight;
  const { from, to } = edge;
  const next = request.weight;
  const both = !config.directed;
  ctx.graph = { vertices: ctx.graph.vertices, edges: ctx.graph.edges.map(item => (item === edge ? { ...item, weight: next } : item)) };
  const hg = emptyHighlights();
  hg.graphEdges[edgeKey(edge)] = 'changed';
  emit(ctx, {
    pane: 'graph', title: `Update ${edgeName(config, from, to)}`, sound: 'update', highlights: hg,
    log: `The weight on ${edgeName(config, from, to)} changes from ${old} to ${next}. The edge itself stays.`,
    matrixLines: [both ? 'Next, both matrix cells holding the weight will change.' : 'Next, the one matrix cell holding this arrow’s weight will change.'],
    listLines: [both ? 'Next, both list entries holding the weight will change.' : 'Next, the one list entry holding this arrow’s weight will change.'],
    why: 'Updating a weight is not a remove followed by an add: the structure stays the same and only the stored value changes.'
  });
  const i = ctx.matrix.rowLabels.indexOf(from);
  const j = ctx.matrix.colLabels.indexOf(to);
  ctx.matrix = cloneMatrix(ctx.matrix);
  ctx.matrix.cells[i][j] = next;
  if (both) ctx.matrix.cells[j][i] = next;
  const hm = emptyHighlights();
  hm.matrixCells[`${from}|${to}`] = 'changed';
  if (both) hm.matrixCells[`${to}|${from}`] = 'changed';
  emit(ctx, {
    pane: 'matrix', title: 'Matrix: overwrite the weight', sound: 'update', highlights: hm,
    log: both
      ? `Cells [${from}][${to}] and [${to}][${from}] are overwritten: ${old} becomes ${next}.`
      : `Cell [${from}][${to}] is overwritten: ${old} becomes ${next}. Cell [${to}][${from}] is left alone, because that would be the opposite arrow.`,
    matrixLines: both
      ? [`Row ${from}, column ${to} := ${next}.`, `Row ${to}, column ${from} := ${next}.`, 'Direct access by index: O(1).']
      : [`Row ${from}, column ${to} := ${next}.`, `Row ${to}, column ${from} stays as it was.`, 'Direct access by index: O(1).'],
    listLines: ['The list has not changed yet.']
  });
  ctx.list = listOf(config, ctx.graph);
  const hl = emptyHighlights();
  hl.listItems[`${from}>${to}`] = 'changed';
  if (both) hl.listItems[`${to}>${from}`] = 'changed';
  emit(ctx, {
    pane: 'list', title: 'List: overwrite the weight', sound: 'update', highlights: hl,
    log: both
      ? `The entry for ${to} in ${from}'s list and the entry for ${from} in ${to}'s list now store weight ${next}.`
      : `The entry for ${to} in ${from}'s list now stores weight ${next}. ${to}'s list is unchanged.`,
    matrixLines: ['The matrix is finished.'],
    listLines: both
      ? [`Walk ${from}'s list to ${to} and change its weight.`, `Walk ${to}'s list to ${from} and change its weight.`, 'Order and links do not change.']
      : [`Walk ${from}'s list to ${to} and change its weight.`, `${to}'s list is not part of this arrow.`, 'Order and links do not change.'],
    result: 'updated'
  });
}

/* ---------- Queries ---------- */

function queryHighlights(ctx: Context, vertices: Record<string, 'current' | 'frontier' | 'read'>): Highlights {
  const hl = emptyHighlights();
  Object.assign(hl.graphVertices, vertices);
  return hl;
}

function hasEdge(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a, request.b)) return;
  const [a, b] = [request.a!, request.b!];
  const edge = findEdge(config, ctx.graph, a, b);
  const present = edge !== undefined;
  const value = ctx.matrix.cells[ctx.matrix.rowLabels.indexOf(a)][ctx.matrix.colLabels.indexOf(b)];
  const base = queryHighlights(ctx, { [a]: 'current', [b]: 'frontier' });
  const hm = cloneHighlights(base);
  hm.matrixCells[`${a}|${b}`] = 'read';
  emit(ctx, {
    pane: 'matrix', title: `Matrix: look at [${a}][${b}]`, sound: 'query', highlights: hm,
    log: `Read cell [${a}][${b}]: it holds ${cellValue(config, value)}, so ${present ? 'the edge exists' : 'there is no edge'}.`,
    matrixLines: [`Go straight to row ${a}, column ${b}.`, 'One look, no searching: O(1).'], listLines: []
  });
  const row = ctx.list.rows.find(item => item.vertex === a)!;
  const position = row.items.findIndex(item => item.to === b);
  const checks = position === -1 ? row.items.length : position + 1;
  const hl = cloneHighlights(base);
  hl.listRows[a] = 'read';
  row.items.slice(0, checks).forEach(item => { hl.listItems[`${a}>${item.to}`] = 'read'; });
  emit(ctx, {
    pane: 'list', title: `List: search ${a}'s list`, sound: 'query', highlights: hl,
    log: present ? `Walk ${a}'s list: found ${b} after ${plural(checks, 'comparison')}.` : `Walk ${a}'s list: reached the end without finding ${b} (${plural(checks, 'comparison')}).`,
    matrixLines: [], listLines: [row.items.length ? `Start at the head of ${a}'s list and compare each entry with ${b}.` : `${a}'s list is empty, so ${b} cannot be in it.`, 'The cost grows with the degree of the vertex: O(degree).']
  });
  const finalHl = cloneHighlights(base);
  if (edge) finalHl.graphEdges[edgeKey(edge)] = 'read';
  emit(ctx, {
    pane: 'result', title: `hasEdge(${a}, ${b})`, sound: 'query', highlights: finalHl, result: String(present),
    log: `hasEdge(${a}, ${b}) returns ${present}.${config.directed && !present && findEdge(config, ctx.graph, b, a) ? ` (${b}→${a} exists, but direction matters.)` : ''}`,
    matrixLines: [], listLines: []
  });
}

function neighbors(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a)) return;
  const v = request.a!;
  const found = neighborsOf(config, ctx.graph, v);
  const names = found.map(item => item.to);
  const vertices: Record<string, 'current' | 'frontier'> = { [v]: 'current' };
  names.forEach(n => { vertices[n] = 'frontier'; });
  const hm = queryHighlights(ctx, vertices);
  hm.matrixRows[v] = 'read';
  names.forEach(n => { hm.matrixCells[`${v}|${n}`] = 'read'; });
  emit(ctx, {
    pane: 'matrix', title: `Matrix: scan row ${v}`, sound: 'query', highlights: hm,
    log: `Scan all ${ctx.matrix.colLabels.length} cells of row ${v}: ${names.length ? `the cells for ${names.join(', ')} are not ${emptyCell(config)}` : 'every cell is empty'}.`,
    matrixLines: [`Every column must be checked, even empty ones: O(V).`], listLines: []
  });
  const hl = queryHighlights(ctx, vertices);
  hl.listRows[v] = 'read';
  names.forEach(n => { hl.listItems[`${v}>${n}`] = 'read'; });
  emit(ctx, {
    pane: 'list', title: `List: read ${v}'s list`, sound: 'query', highlights: hl,
    log: names.length ? `Read ${v}'s list: ${listText(found, config.weighted)}. The neighbours are already stored together.` : `${v}'s list is empty, so there are no neighbours.`,
    matrixLines: [], listLines: ['Only real neighbours are visited: O(degree).']
  });
  emit(ctx, {
    pane: 'result', title: `neighbors(${v})`, sound: 'query', highlights: queryHighlights(ctx, vertices), result: `[${names.join(', ')}]`,
    log: `neighbors(${v}) returns [${names.join(', ')}]${config.directed ? ' (the vertices ' + v + ' points to)' : ''}.`, matrixLines: [], listLines: []
  });
}

function degree(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a)) return;
  const v = request.a!;
  const out = neighborsOf(config, ctx.graph, v).map(item => item.to);
  const incoming = config.directed ? inNeighborsOf(config, ctx.graph, v) : out;
  const vertices: Record<string, 'current' | 'frontier'> = { [v]: 'current' };
  out.forEach(n => { vertices[n] = 'frontier'; });
  if (config.directed) incoming.forEach(n => { vertices[n] = 'frontier'; });
  const hm = queryHighlights(ctx, vertices);
  hm.matrixRows[v] = 'read';
  out.forEach(n => { hm.matrixCells[`${v}|${n}`] = 'read'; });
  if (config.directed) { hm.matrixCols[v] = 'read'; incoming.forEach(n => { hm.matrixCells[`${n}|${v}`] = 'read'; }); }
  emit(ctx, {
    pane: 'matrix', title: `Matrix: count in row ${v}${config.directed ? ' and column ' + v : ''}`, sound: 'query', highlights: hm,
    log: config.directed ? `Count the non-empty cells in row ${v} (out-degree ${out.length}) and in column ${v} (in-degree ${incoming.length}).` : `Count the non-empty cells in row ${v}: ${out.length}.`,
    matrixLines: [config.directed ? 'Out-degree comes from a row, in-degree from a column. Each scan is O(V).' : 'Scan the row and count: O(V).'], listLines: []
  });
  const hl = queryHighlights(ctx, vertices);
  hl.listRows[v] = 'read';
  out.forEach(n => { hl.listItems[`${v}>${n}`] = 'read'; });
  if (config.directed) incoming.forEach(n => { hl.listRows[n] = 'read'; hl.listItems[`${n}>${v}`] = 'read'; });
  emit(ctx, {
    pane: 'list', title: `List: ${config.directed ? 'out-degree is the length; in-degree needs a full scan' : `length of ${v}'s list`}`, sound: 'query', highlights: hl,
    log: config.directed ? `${v}'s list has ${out.length} ${out.length === 1 ? 'entry' : 'entries'}, so the out-degree is ${out.length}. To find the in-degree, scan every list for ${v}: ${incoming.length} found.` : `${v}'s list has ${out.length} ${out.length === 1 ? 'entry' : 'entries'}, so the degree is ${out.length}.`,
    matrixLines: [], listLines: config.directed ? ['Out-degree: O(1) if the length is stored, O(degree) otherwise.', 'In-degree: every list must be scanned: O(V + E).'] : ['Count the entries (or read a stored length): O(degree).']
  });
  const result = config.directed ? `out ${out.length}, in ${incoming.length}` : String(out.length);
  emit(ctx, {
    pane: 'result', title: `degree(${v})`, sound: 'query', highlights: queryHighlights(ctx, vertices), result,
    log: config.directed ? `degree(${v}) returns out-degree ${out.length} and in-degree ${incoming.length} (total ${out.length + incoming.length}).` : `degree(${v}) returns ${out.length}.`,
    matrixLines: [], listLines: []
  });
}

function counts(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  const n = ctx.graph.vertices.length;
  const e = ctx.graph.edges.length;
  const hm = emptyHighlights();
  const hl = emptyHighlights();
  const label = request.op;
  let matrixLog = '';
  let listLog = '';
  let result = '';
  if (label === 'vertexCount') {
    ctx.matrix.rowLabels.forEach(v => { hm.matrixRows[v] = 'read'; });
    ctx.list.rows.forEach(row => { hl.listRows[row.vertex] = 'read'; });
    matrixLog = `Count the rows: ${n}. (A stored size would make this O(1).)`;
    listLog = `Count the rows: ${n}.`;
    result = String(n);
  } else if (label === 'edgeCount') {
    const filled = ctx.matrix.cells.flat().filter(cell => cell !== null && cell !== 0).length;
    ctx.matrix.cells.forEach((row, i) => row.forEach((cell, j) => { if (cell !== null && cell !== 0) hm.matrixCells[`${ctx.matrix.rowLabels[i]}|${ctx.matrix.colLabels[j]}`] = 'read'; }));
    ctx.list.rows.forEach(row => { if (row.items.length) hl.listRows[row.vertex] = 'read'; });
    const entries = ctx.list.rows.reduce((sum, row) => sum + row.items.length, 0);
    matrixLog = config.directed ? `Count the non-empty cells in the whole matrix: ${filled} edges.` : `Count the non-empty cells: ${filled}. Each undirected edge fills two cells, so divide by 2: ${e} edges.`;
    listLog = config.directed ? `Add up the length of every list: ${entries} edges.` : `Add up the length of every list: ${entries}. Each edge is stored twice, so divide by 2: ${e} edges.`;
    result = String(e);
  } else {
    ctx.matrix.rowLabels.forEach(v => { hm.matrixRows[v] = 'read'; });
    matrixLog = n === 0 ? 'The matrix has no rows, so the graph is empty.' : `The matrix has ${n} ${n === 1 ? 'row' : 'rows'}, so the graph is not empty.`;
    listLog = n === 0 ? 'The list has no rows, so the graph is empty.' : `The list has ${n} ${n === 1 ? 'row' : 'rows'}, so the graph is not empty.`;
    result = String(n === 0);
  }
  emit(ctx, { pane: 'matrix', title: `Matrix: ${label}`, sound: 'query', highlights: hm, log: matrixLog, matrixLines: [matrixLog], listLines: [] });
  emit(ctx, { pane: 'list', title: `List: ${label}`, sound: 'query', highlights: hl, log: listLog, matrixLines: [], listLines: [listLog] });
  emit(ctx, { pane: 'result', title: `${label}()`, sound: 'query', result, log: `${label}() returns ${result}.`, matrixLines: [], listLines: [] });
}

/* ---------- Traversals ---------- */

function traverse(ctx: Context, request: OpRequest): void {
  const { config } = ctx;
  if (!needVertices(ctx, request, request.a)) return;
  const kind = request.op as 'bfs' | 'dfs';
  const start = request.a!;
  const order: string[] = [];
  const treeEdges: Record<string, 'read'> = {};
  const discovered = new Set<string>();
  const mark = (current: string | undefined, frontier: string[], extra: Partial<Highlights> = {}): Highlights => {
    const hl = emptyHighlights();
    order.forEach(v => { hl.graphVertices[v] = 'visited'; });
    frontier.forEach(v => { hl.graphVertices[v] = 'frontier'; });
    if (current) hl.graphVertices[current] = 'current';
    Object.assign(hl.graphEdges, treeEdges);
    for (const key of Object.keys(extra) as (keyof Highlights)[]) Object.assign(hl[key], extra[key]);
    return hl;
  };
  const scanMarks = (v: string, names: string[]) => {
    const part = emptyHighlights();
    part.matrixRows[v] = 'read';
    part.listRows[v] = 'read';
    names.forEach(n => { part.matrixCells[`${v}|${n}`] = 'read'; part.listItems[`${v}>${n}`] = 'read'; });
    return part;
  };
  const treeEdge = (a: string, b: string) => { const [f, t] = orient(config, a, b); treeEdges[`${f}-${t}`] = 'read'; };
  const traversal = (frontier: string[]): Traversal => ({ kind, frontier, order });
  const structure = kind === 'bfs' ? 'queue' : 'call stack';

  if (kind === 'bfs') {
    const queue = [start];
    discovered.add(start);
    emit(ctx, {
      pane: 'graph', title: `Start BFS at ${start}`, sound: 'query', highlights: mark(undefined, queue), traversal: traversal(queue),
      log: `Start at ${start}: mark it discovered and put it in the queue. Queue: [${queue.join(', ')}].`,
      matrixLines: ['Nothing is read yet.'], listLines: ['Nothing is read yet.'],
      why: 'Breadth-first search visits vertices in rings: first the start, then everything one edge away, then two, and so on. A queue keeps that order.'
    });
    while (queue.length) {
      const v = queue.shift()!;
      order.push(v);
      const nbrs = neighborsOf(config, ctx.graph, v).map(item => item.to);
      const fresh = nbrs.filter(n => !discovered.has(n));
      fresh.forEach(n => { discovered.add(n); queue.push(n); treeEdge(v, n); });
      const part = scanMarks(v, nbrs);
      emit(ctx, {
        pane: 'graph', title: `Visit ${v}`, sound: 'query', highlights: mark(v, queue, part), traversal: traversal(queue),
        log: `Take ${v} from the front of the queue and visit it. ${fresh.length ? `Add its new neighbours ${fresh.join(', ')} to the back.` : nbrs.length ? 'All of its neighbours were already discovered.' : 'It has no neighbours to add.'} Queue: [${queue.join(', ')}].`,
        matrixLines: [`Scan row ${v}: neighbours are ${nbrs.join(', ') || 'none'}.`], listLines: [`Read ${v}'s list: ${nbrs.join(', ') || 'empty'}.`],
        why: fresh.length ? 'A neighbour is marked discovered as soon as it joins the queue, so it can never be queued twice.' : undefined
      });
    }
  } else {
    const stack: { v: string; nbrs: string[]; next: number }[] = [];
    const enter = (v: string, from?: string) => {
      discovered.add(v);
      order.push(v);
      if (from) treeEdge(from, v);
      const nbrs = neighborsOf(config, ctx.graph, v).map(item => item.to);
      stack.push({ v, nbrs, next: 0 });
      const names = stack.map(item => item.v);
      emit(ctx, {
        pane: 'graph', title: `Visit ${v}`, sound: 'query', highlights: mark(v, names, scanMarks(v, nbrs)), traversal: traversal(names),
        log: `Visit ${v} and push it onto the call stack. Stack: [${names.join(', ')}].`,
        matrixLines: [`Scan row ${v}: neighbours are ${nbrs.join(', ') || 'none'}.`], listLines: [`Read ${v}'s list: ${nbrs.join(', ') || 'empty'}.`],
        why: from ? `${v} was unvisited, so DFS goes deeper instead of finishing ${from}'s other neighbours first.` : 'Depth-first search follows one path as far as it goes before backing up.'
      });
    };
    enter(start);
    while (stack.length) {
      const top = stack[stack.length - 1];
      while (top.next < top.nbrs.length && discovered.has(top.nbrs[top.next])) top.next++;
      if (top.next < top.nbrs.length) {
        const n = top.nbrs[top.next++];
        enter(n, top.v);
      } else {
        stack.pop();
        const parent = stack[stack.length - 1];
        const names = stack.map(item => item.v);
        if (parent) {
          emit(ctx, {
            pane: 'graph', title: `Back up from ${top.v}`, sound: 'query', highlights: mark(parent.v, names), traversal: traversal(names),
            log: `${top.v} has no unvisited neighbours left, so pop it and return to ${parent.v}. Stack: [${names.join(', ')}].`,
            matrixLines: [`Row ${top.v} is finished; continue scanning row ${parent.v} where we stopped.`], listLines: [`${top.v}'s list is finished; continue along ${parent.v}'s list.`],
            why: 'Backtracking is just returning from a recursive call.'
          });
        }
      }
    }
  }
  const unreached = ctx.graph.vertices.filter(v => !order.includes(v));
  emit(ctx, {
    pane: 'result', title: `${kind}(${start}) finished`, sound: 'query', highlights: mark(undefined, []), traversal: traversal([]),
    result: order.join(' → '),
    log: `${kind.toUpperCase()} visit order: ${order.join(' → ')}.${unreached.length ? ` Not reached: ${unreached.join(', ')} (${config.directed ? 'no path from ' + start : 'a different component'}).` : ' Every vertex was reached.'}`,
    matrixLines: [`The ${structure} is empty, so the traversal is finished.`], listLines: []
  });
}
