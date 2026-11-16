import type { GraphConfig, GraphData, GraphKind, OpName, OpRequest } from './types.ts';
import { CONFIGS } from './engine.ts';

/** Fixed picture slots for the labels A–H (SVG viewBox 480 × 300). Positions never move, so every step is easy to compare. */
export const SLOTS: Record<string, [number, number]> = {
  A: [110, 70], B: [370, 70], C: [370, 230], D: [110, 230], E: [240, 38], F: [440, 150], G: [240, 262], H: [40, 150]
};

export interface GuideStep { request: OpRequest; title: string; intro: string; watch: string }

export interface KindContent {
  kind: GraphKind;
  config: GraphConfig;
  name: string;
  headline: string;
  definition: string[];
  formal: string;
  properties: { term: string; text: string }[];
  matrixNote: string;
  listNote: string;
  start: GraphData;
  guide: GuideStep[];
  siblings: { kind: GraphKind; label: string }[];
}

const g = (vertices: string[], edges: [string, string, number?][]): GraphData => ({
  vertices, edges: edges.map(([from, to, weight]) => (weight === undefined ? { from, to } : { from, to, weight }))
});

const commonProperties = [
  { term: 'Path', text: 'A sequence of vertices where each consecutive pair is joined by an edge.' },
  { term: 'Cycle', text: 'A path that starts and ends at the same vertex without reusing an edge.' },
  { term: 'Sparse vs. dense', text: 'A graph is sparse when it has far fewer edges than the maximum possible, and dense when it has close to the maximum. Here, more than half of the possible edges counts as dense.' }
];

export const CONTENT: Record<GraphKind, KindContent> = {
  undirected: {
    kind: 'undirected', config: CONFIGS.undirected, name: 'Undirected graph',
    headline: 'Connections that work both ways, like friendships or two-way roads.',
    definition: [
      'A graph G = (V, E) is a set V of vertices and a set E of edges. In an undirected graph each edge is an unordered pair {u, v}: if u is joined to v, then v is joined to u.',
      'The Graph ADT hides how this is stored. It promises operations such as addVertex, addEdge, neighbors and hasEdge, and any representation that keeps those promises is a valid implementation.'
    ],
    formal: 'G = (V, E),  E ⊆ { {u, v} : u, v ∈ V, u ≠ v }',
    properties: [
      { term: 'Undirected', text: 'An edge {A, B} is the same as {B, A}. There are no arrows.' },
      { term: 'Unweighted', text: 'An edge only says “connected”. It carries no cost or distance.' },
      { term: 'Degree', text: 'The number of edges touching a vertex. Adding up every degree gives exactly 2·|E|, because each edge has two ends.' },
      { term: 'Connected', text: 'Every vertex can be reached from every other vertex. Otherwise the graph splits into separate components.' },
      ...commonProperties,
      { term: 'Maximum edges', text: 'With n vertices there can be at most n(n − 1) / 2 edges.' }
    ],
    matrixNote: 'The matrix is symmetric: the cell [u][v] always equals [v][u]. A 1 means “edge”, a 0 means “no edge”, and the diagonal stays 0.',
    listNote: 'Every edge appears twice: v is in u’s list and u is in v’s list. The total length of all lists is 2·|E|.',
    start: g(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]),
    guide: [
      { request: { op: 'addVertex', a: 'D' }, title: 'Add a vertex', intro: 'Add a new, isolated vertex D.', watch: 'The matrix gains a row and a column. The list gains an empty row.' },
      { request: { op: 'addEdge', a: 'C', b: 'D' }, title: 'Add an edge', intro: 'Connect C and D.', watch: 'Two matrix cells change, [C][D] and [D][C], and the edge is stored in two lists.' },
      { request: { op: 'addEdge', a: 'A', b: 'C' }, title: 'Close a cycle', intro: 'Connect A and C. A–B–C–A is now a cycle.', watch: 'The Facts panel changes from “no cycle” to “has a cycle”.' },
      { request: { op: 'neighbors', a: 'C' }, title: 'Query the neighbours', intro: 'Ask for every neighbour of C.', watch: 'The matrix scans a whole row. The list only reads C’s own list.' },
      { request: { op: 'bfs', a: 'A' }, title: 'Traverse breadth-first', intro: 'Visit the graph from A, one ring of neighbours at a time.', watch: 'The queue at the top of the log, and the order of the visited vertices.' },
      { request: { op: 'removeEdge', a: 'A', b: 'B' }, title: 'Remove an edge', intro: 'Remove the edge between A and B. Both vertices stay.', watch: 'Both mirrored matrix cells reset, and both lists lose an entry.' },
      { request: { op: 'removeVertex', a: 'C' }, title: 'Remove a vertex', intro: 'Remove C. Every edge that touched C must go with it.', watch: 'A matrix row and column disappear, and every list is scanned for C.' }
    ],
    siblings: [{ kind: 'directed', label: 'Directed graphs' }, { kind: 'weighted', label: 'Weighted undirected graphs' }, { kind: 'weighted-directed', label: 'Weighted directed graphs' }]
  },
  directed: {
    kind: 'directed', config: CONFIGS.directed, name: 'Directed graph',
    headline: 'Connections with a direction, like links between web pages or one-way streets.',
    definition: [
      'A directed graph (digraph) G = (V, E) is a set V of vertices and a set E of edges, where each edge is an ordered pair (u, v) drawn as an arrow from u to v. The arrow from u to v says nothing about a way back.',
      'The Graph ADT operations stay the same, but their meaning changes: neighbors(v) lists where v points to, and degree splits into an out-degree and an in-degree.'
    ],
    formal: 'G = (V, E),  E ⊆ V × V  with  (u, v) ≠ (v, u)',
    properties: [
      { term: 'Directed', text: 'The edge (A, B) is not the same as (B, A). Both may exist together.' },
      { term: 'Out-degree and in-degree', text: 'Out-degree counts arrows leaving a vertex, in-degree counts arrows arriving. Each sum equals |E|.' },
      { term: 'Weakly vs. strongly connected', text: 'Weakly connected: connected if arrow directions are ignored. Strongly connected: a directed path exists from every vertex to every other.' },
      ...commonProperties,
      { term: 'Directed cycle', text: 'A cycle that follows the arrows. Graphs without one are called DAGs, and they can be put in a dependency order.' },
      { term: 'Maximum edges', text: 'With n vertices there can be at most n(n − 1) edges, since each ordered pair can have its own arrow.' }
    ],
    matrixNote: 'Row = the vertex an arrow leaves, column = the vertex it enters. Cell [u][v] = 1 means u → v. The matrix is not symmetric unless every arrow has a partner.',
    listNote: 'Each edge is stored once, in the list of its source vertex. Out-neighbours are easy to read; in-neighbours need a scan of every list.',
    start: g(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]),
    guide: [
      { request: { op: 'addVertex', a: 'D' }, title: 'Add a vertex', intro: 'Add a new, isolated vertex D.', watch: 'A row and a column appear in the matrix, and an empty list in the adjacency list.' },
      { request: { op: 'addEdge', a: 'C', b: 'D' }, title: 'Add an arrow', intro: 'Add the arrow C → D.', watch: 'Only one matrix cell changes: row C, column D. D’s list is untouched.' },
      { request: { op: 'addEdge', a: 'C', b: 'A' }, title: 'Close a directed cycle', intro: 'Add C → A so A → B → C → A forms a cycle.', watch: 'Facts now reports a cycle, and the matrix is still not symmetric.' },
      { request: { op: 'hasEdge', a: 'B', b: 'A' }, title: 'Direction matters', intro: 'Ask whether B → A exists. A → B does, but that is a different edge.', watch: 'Cell [B][A] is 0 even though [A][B] is 1.' },
      { request: { op: 'degree', a: 'C' }, title: 'In-degree and out-degree', intro: 'Ask for the degree of C. It has one arrow in and two out.', watch: 'The matrix reads a row and a column. The list reads one list, then scans them all.' },
      { request: { op: 'dfs', a: 'A' }, title: 'Traverse depth-first', intro: 'Follow the arrows from A as deep as possible, then back up.', watch: 'The call stack grows with each visit and shrinks when DFS backtracks.' },
      { request: { op: 'removeEdge', a: 'C', b: 'A' }, title: 'Remove an arrow', intro: 'Remove C → A. The cycle is broken.', watch: 'Only one cell resets, and only C’s list changes.' },
      { request: { op: 'removeVertex', a: 'B' }, title: 'Remove a vertex', intro: 'Remove B together with every arrow into or out of it.', watch: 'Arrows in both directions disappear, and every list is scanned for B.' }
    ],
    siblings: [{ kind: 'undirected', label: 'Undirected graphs' }, { kind: 'weighted', label: 'Weighted undirected graphs' }, { kind: 'weighted-directed', label: 'Weighted directed graphs' }]
  },
  weighted: {
    kind: 'weighted', config: CONFIGS.weighted, name: 'Weighted undirected graph',
    headline: 'Two-way connections with a cost, like the distance along a road you can travel in either direction.',
    definition: [
      'A weighted undirected graph G = (V, E, w) is an undirected graph together with a weight function w that gives every edge a number, such as a distance, a cost or a time. The edge {A, B} has one weight, and it applies in both directions.',
      'The Graph ADT gains one operation, updateWeight, and the representations must now store a number for every edge instead of just “present or not”. For arrows that can point one way and carry their own weight, open Weighted directed graphs.'
    ],
    formal: 'G = (V, E, w),  w : E → ℤ  (here 1 ≤ w ≤ 99)',
    properties: [
      { term: 'Weighted', text: 'Each edge stores a weight. The weight belongs to the edge, so two edges can have different weights between different pairs of vertices.' },
      { term: 'Path cost', text: 'The cost of a path is the sum of the weights of its edges. The cheapest path is not always the one with the fewest edges.' },
      { term: 'No edge ≠ weight 0', text: 'Since 0 could be a real weight, a matrix needs a different marker for “no edge”. This page uses ∞.' },
      { term: 'Degree', text: 'Degree still counts edges, not weights. A vertex with two heavy edges has degree 2.' },
      ...commonProperties,
      { term: 'Total weight', text: 'The sum of every edge weight, shown in the Facts panel. It is useful when comparing spanning trees later in the unit.' }
    ],
    matrixNote: 'A cell holds the weight of the edge, or ∞ when there is no edge. The matrix is still symmetric because the edges are undirected.',
    listNote: 'Each list entry is a pair (neighbour, weight). Each edge is stored twice, and both entries must carry the same weight.',
    start: g(['A', 'B', 'C'], [['A', 'B', 4], ['B', 'C', 2]]),
    guide: [
      { request: { op: 'addVertex', a: 'D' }, title: 'Add a vertex', intro: 'Add a new, isolated vertex D.', watch: 'New matrix cells start as ∞ (no edge), not 0.' },
      { request: { op: 'addEdge', a: 'C', b: 'D', weight: 7 }, title: 'Add a weighted edge', intro: 'Connect C and D with weight 7.', watch: 'The weight 7 is written into two matrix cells and two list entries.' },
      { request: { op: 'addEdge', a: 'A', b: 'C', weight: 5 }, title: 'Add a shortcut', intro: 'Connect A and C with weight 5.', watch: 'Total weight in the Facts panel goes up by 5.' },
      { request: { op: 'updateWeight', a: 'A', b: 'C', weight: 3 }, title: 'Update a weight', intro: 'Lower the weight of A–C from 5 to 3.', watch: 'No row, column or list entry is added or removed. Only stored values change.' },
      { request: { op: 'neighbors', a: 'C' }, title: 'Query the neighbours', intro: 'Ask for the neighbours of C.', watch: 'The list entries show each neighbour together with its weight.' },
      { request: { op: 'bfs', a: 'A' }, title: 'Traverse breadth-first', intro: 'Visit the graph from A. BFS ignores the weights.', watch: 'BFS orders vertices by number of edges, not by cost.' },
      { request: { op: 'removeEdge', a: 'A', b: 'B' }, title: 'Remove an edge', intro: 'Remove the edge A–B (weight 4).', watch: 'The cells go back to ∞, and the list entries disappear.' },
      { request: { op: 'removeVertex', a: 'D' }, title: 'Remove a vertex', intro: 'Remove D and its edge to C.', watch: 'Total weight drops by 7.' }
    ],
    siblings: [{ kind: 'undirected', label: 'Undirected graphs' }, { kind: 'directed', label: 'Directed graphs' }, { kind: 'weighted-directed', label: 'Weighted directed graphs' }]
  },
  'weighted-directed': {
    kind: 'weighted-directed', config: CONFIGS['weighted-directed'], name: 'Weighted directed graph',
    headline: 'One-way connections with a cost, like a flight time or the hours a task takes before the next one can start.',
    definition: [
      'A weighted directed graph G = (V, E, w) has arrows, and each arrow has its own weight. The edge (u, v) with weight w(u, v) goes from u to v. It does not create an arrow back, and a reverse arrow can carry a different weight.',
      'neighbors and degree keep their directed meanings: neighbors(v) lists where v points, and degree splits into out-degree and in-degree. updateWeight changes the number on one arrow. The matrix and the list each store that number once.'
    ],
    formal: 'G = (V, E, w),  E ⊆ { (u, v) : u, v ∈ V, u ≠ v },  w : E → ℤ',
    properties: [
      { term: 'Directed and weighted', text: 'Each edge is an arrow with its own weight. (A, B) with weight 4 is not the same as (B, A), even when that arrow also exists.' },
      { term: 'Path cost', text: 'The cost of a directed path is the sum of the weights on its arrows. The cheapest path is not always the one with the fewest arrows, and it can only follow the arrows.' },
      { term: 'No edge ≠ weight 0', text: 'A matrix cell uses ∞ for “no arrow”. A stored number, even 0, would mean the arrow exists. This page uses weights from 1 to 99.' },
      { term: 'Out-degree and in-degree', text: 'Degree counts arrows, not weights. Out-degree counts arrows leaving a vertex and in-degree counts arrows arriving. Each sum equals |E|.' },
      { term: 'Weakly vs. strongly connected', text: 'Weakly connected: connected if arrow directions are ignored. Strongly connected: a directed path exists from every vertex to every other.' },
      ...commonProperties,
      { term: 'Maximum edges', text: 'With n vertices there can be at most n(n − 1) weighted arrows, one for each ordered pair.' },
      { term: 'Total weight', text: 'The sum of every arrow’s weight. Changing one arrow changes the total by exactly the difference in its weight.' }
    ],
    matrixNote: 'Row = the vertex an arrow leaves, column = the vertex it enters. The cell holds that arrow’s weight, or ∞ when there is no arrow. [u][v] and [v][u] are independent, so the matrix is not symmetric.',
    listNote: 'Each arrow is stored once, as a pair (neighbour, weight) in the list of its source. A reverse arrow is a different entry, in the other list, and can have a different weight.',
    start: g(['A', 'B', 'C'], [['A', 'B', 4], ['B', 'C', 2]]),
    guide: [
      { request: { op: 'addVertex', a: 'D' }, title: 'Add a vertex', intro: 'Add a new, isolated vertex D.', watch: 'New matrix cells start as ∞ (no arrow), not 0.' },
      { request: { op: 'addEdge', a: 'C', b: 'D', weight: 7 }, title: 'Add a weighted arrow', intro: 'Add the arrow C → D with weight 7.', watch: 'The weight 7 is written into one matrix cell, row C column D, and into C’s list only.' },
      { request: { op: 'addEdge', a: 'C', b: 'A', weight: 5 }, title: 'Close a directed cycle', intro: 'Add C → A with weight 5, so A → B → C → A forms a cycle.', watch: 'Facts reports a cycle. Cell [A][C] stays ∞, so the matrix is not symmetric.' },
      { request: { op: 'updateWeight', a: 'C', b: 'A', weight: 3 }, title: 'Update one arrow’s weight', intro: 'Lower the weight of C → A from 5 to 3.', watch: 'Only cell [C][A] and C’s list entry change. No arrow from A to C appears.' },
      { request: { op: 'hasEdge', a: 'B', b: 'A' }, title: 'Direction matters', intro: 'Ask whether B → A exists. A → B does, with weight 4, but that is a different arrow.', watch: 'Cell [B][A] is ∞ even though [A][B] holds 4.' },
      { request: { op: 'degree', a: 'C' }, title: 'In-degree and out-degree', intro: 'Ask for the degree of C. It has one arrow in and two out. The weights do not count.', watch: 'The matrix reads a row and a column. The list reads one list, then scans them all.' },
      { request: { op: 'bfs', a: 'A' }, title: 'Traverse breadth-first', intro: 'Visit the graph from A. BFS follows the arrows and ignores the weights.', watch: 'The visit order counts hops along arrows, not cost.' },
      { request: { op: 'removeVertex', a: 'D' }, title: 'Remove a vertex', intro: 'Remove D and the arrow C → D, whose weight is 7.', watch: 'Total weight drops by 7, and only C’s list loses an entry.' }
    ],
    siblings: [{ kind: 'undirected', label: 'Undirected graphs' }, { kind: 'directed', label: 'Directed graphs' }, { kind: 'weighted', label: 'Weighted undirected graphs' }]
  }
};

/* ---------- Operation reference ---------- */

export type OpGroup = 'update' | 'query' | 'traverse';
export interface OpDoc {
  op: OpName;
  group: OpGroup;
  signature: string;
  definition: string;
  changes: string;
  matrixCost: string;
  listCost: string;
  costNote?: string;
  /** Request used for the before/after picture. */
  sample: OpRequest;
}

export function opDocs(config: GraphConfig): OpDoc[] {
  const dir = config.directed;
  const w = config.weighted;
  const edge = dir ? 'the directed edge u → v' : 'the edge between u and v';
  const docs: OpDoc[] = [
    {
      op: 'addVertex', group: 'update', signature: 'addVertex(v)', definition: 'Adds a new vertex v with no edges.',
      changes: 'Changes the graph: |V| grows by 1. Rejected if v already exists.', matrixCost: 'O(V²)', listCost: 'O(1) to O(V)',
      costNote: 'The matrix needs a new row and a new column, so every row is rebuilt. The list only adds one empty list.', sample: { op: 'addVertex', a: 'D' }
    },
    {
      op: 'removeVertex', group: 'update', signature: 'removeVertex(v)', definition: 'Removes the vertex v and every edge that touches it.',
      changes: 'Changes the graph: |V| shrinks by 1 and |E| shrinks by the degree of v. Rejected if v does not exist.', matrixCost: 'O(V²)', listCost: 'O(V + E)',
      costNote: 'The matrix deletes a row and a column. The list must scan every list for entries pointing at v.', sample: { op: 'removeVertex', a: 'C' }
    },
    {
      op: 'addEdge', group: 'update', signature: w ? 'addEdge(u, v, weight)' : 'addEdge(u, v)', definition: `Adds ${edge}${w ? ' with the given weight' : ''}.`,
      changes: `Changes the graph: |E| grows by 1. Rejected if either vertex is missing, if u = v, if the edge already exists${w ? ', or if the weight is not a whole number from 1 to 99' : ''}.`,
      matrixCost: 'O(1)', listCost: 'O(degree)', costNote: 'The matrix writes directly into a cell. The list must check for a duplicate and insert into a list.', sample: w ? { op: 'addEdge', a: 'A', b: 'C', weight: 5 } : { op: 'addEdge', a: dir ? 'C' : 'A', b: dir ? 'A' : 'C' }
    },
    {
      op: 'removeEdge', group: 'update', signature: 'removeEdge(u, v)', definition: `Removes ${edge}. Both vertices stay.`,
      changes: 'Changes the graph: |E| shrinks by 1. Rejected if that edge does not exist.', matrixCost: 'O(1)', listCost: 'O(degree)', sample: { op: 'removeEdge', a: 'A', b: 'B' }
    }
  ];
  if (w) {
    docs.push({
      op: 'updateWeight', group: 'update', signature: 'updateWeight(u, v, weight)', definition: dir ? 'Replaces the weight of one existing arrow. A reverse arrow, if it exists, keeps its own weight.' : 'Replaces the weight of an existing edge. Both stored copies change together.',
      changes: 'Changes stored values only: |V| and |E| stay the same. Rejected if the edge does not exist or the weight is unchanged.', matrixCost: 'O(1)', listCost: 'O(degree)', sample: { op: 'updateWeight', a: 'A', b: 'B', weight: 9 }
    });
  }
  docs.push(
    {
      op: 'hasEdge', group: 'query', signature: 'hasEdge(u, v)', definition: `Returns true when ${edge} exists.`,
      changes: 'Does not change the graph.', matrixCost: 'O(1)', listCost: 'O(degree)', costNote: dir ? 'In a directed graph hasEdge(u, v) and hasEdge(v, u) can differ.' : undefined,
      sample: { op: 'hasEdge', a: 'A', b: 'B' }
    },
    {
      op: 'neighbors', group: 'query', signature: 'neighbors(v)', definition: dir ? 'Returns every vertex that v has an arrow to (its out-neighbours).' : 'Returns every vertex joined to v by an edge.',
      changes: 'Does not change the graph.', matrixCost: 'O(V)', listCost: 'O(degree)', costNote: 'The matrix scans a whole row, including empty cells. The list reads only the real neighbours.', sample: { op: 'neighbors', a: 'B' }
    },
    {
      op: 'degree', group: 'query', signature: 'degree(v)', definition: dir ? 'Returns the out-degree (arrows leaving v) and the in-degree (arrows entering v).' : 'Returns the number of edges touching v.',
      changes: 'Does not change the graph.', matrixCost: 'O(V)', listCost: dir ? 'O(1) out, O(V + E) in' : 'O(1) to O(degree)',
      costNote: dir ? 'A list stores only outgoing arrows, so finding the in-degree means scanning every list.' : undefined, sample: { op: 'degree', a: 'B' }
    },
    { op: 'vertexCount', group: 'query', signature: 'vertexCount()', definition: 'Returns |V|, the number of vertices.', changes: 'Does not change the graph.', matrixCost: 'O(1)', listCost: 'O(1)', costNote: 'Both can keep a stored count.', sample: { op: 'vertexCount' } },
    { op: 'edgeCount', group: 'query', signature: 'edgeCount()', definition: 'Returns |E|, the number of edges.', changes: 'Does not change the graph.', matrixCost: 'O(V²)', listCost: 'O(V)', costNote: 'Counted from scratch. Keeping a counter would make both O(1).', sample: { op: 'edgeCount' } },
    { op: 'isEmpty', group: 'query', signature: 'isEmpty()', definition: 'Returns true when the graph has no vertices.', changes: 'Does not change the graph.', matrixCost: 'O(1)', listCost: 'O(1)', sample: { op: 'isEmpty' } },
    {
      op: 'bfs', group: 'traverse', signature: 'bfs(start)', definition: 'Visits every vertex reachable from start, nearest first, using a queue.',
      changes: 'Does not change the graph. Returns the visit order.', matrixCost: 'O(V²)', listCost: 'O(V + E)', costNote: 'The matrix scans a whole row for every visited vertex.', sample: { op: 'bfs', a: 'A' }
    },
    {
      op: 'dfs', group: 'traverse', signature: 'dfs(start)', definition: 'Visits every vertex reachable from start, going as deep as possible before backtracking, using the call stack.',
      changes: 'Does not change the graph. Returns the visit order.', matrixCost: 'O(V²)', listCost: 'O(V + E)', sample: { op: 'dfs', a: 'A' }
    }
  );
  return docs;
}

export const COMPARISON = [
  { aspect: 'Space', matrix: 'O(V²)', list: 'O(V + E)', note: 'The matrix reserves a cell for every possible pair, even when most are empty.' },
  { aspect: 'Best when the graph is', matrix: 'dense', list: 'sparse', note: 'As E approaches V², the two use similar space and the matrix wins on speed.' },
  { aspect: 'Is there an edge u–v?', matrix: 'O(1)', list: 'O(degree)', note: 'The matrix jumps straight to a cell. The list searches a list.' },
  { aspect: 'List all neighbours', matrix: 'O(V)', list: 'O(degree)', note: 'The matrix checks every column, the list only reads real neighbours.' },
  { aspect: 'Add a vertex', matrix: 'O(V²)', list: 'O(1) to O(V)', note: 'Growing the matrix means rebuilding every row.' },
  { aspect: 'Traverse everything', matrix: 'O(V²)', list: 'O(V + E)', note: 'Matrix traversals pay for empty cells.' }
];

export function describeKind(kind: GraphKind): KindContent { return CONTENT[kind]; }
