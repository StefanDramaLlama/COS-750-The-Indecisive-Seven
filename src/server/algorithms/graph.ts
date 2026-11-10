import type { Edge, EdgeId, Example, Graph, LessonId, VertexId } from '../../shared/contracts.ts';

export const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const compareEdge = (a: Edge, b: Edge): number => (a.weight ?? 0) - (b.weight ?? 0) || compareId(a.id, b.id);
export const edgeLabel = (edge: Edge, directed = false): string => `${edge.from}${directed ? ' → ' : '–'}${edge.to}`;

export class GraphInputError extends Error {}

export function validateGraph(graph: Graph, lesson: LessonId, start?: VertexId, goal?: VertexId): void {
  if (typeof graph.directed !== 'boolean' || !Array.isArray(graph.vertices) || !Array.isArray(graph.edges)) {
    throw new GraphInputError('Provide a direction flag, vertices, and edges.');
  }
  if (!graph.vertices.length || graph.vertices.length > 12 || graph.edges.length > 36) {
    throw new GraphInputError('Use 1 to 12 vertices and at most 36 edges.');
  }
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id);
  const ids = new Set<VertexId>();
  for (const vertex of graph.vertices) {
    if (!vertex || !validId(vertex.id) || ids.has(vertex.id) || typeof vertex.label !== 'string' || !vertex.label.trim()) {
      throw new GraphInputError('Each vertex needs a unique ID and a label.');
    }
    ids.add(vertex.id);
  }
  const edgeIds = new Set<EdgeId>();
  const pairs = new Set<string>();
  const weighted = ['dijkstra', 'prim', 'kruskal'].includes(lesson);
  for (const edge of graph.edges) {
    if (!edge || !validId(edge.id) || edgeIds.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) {
      throw new GraphInputError('Each edge needs a unique ID and two distinct existing endpoints.');
    }
    edgeIds.add(edge.id);
    const pair = (graph.directed ? [edge.from, edge.to] : [edge.from, edge.to].sort(compareId)).join(':');
    if (pairs.has(pair)) throw new GraphInputError('Use at most one edge for each pair of endpoints in the same direction.');
    pairs.add(pair);
    if (edge.weight !== undefined && (!Number.isInteger(edge.weight) || Math.abs(edge.weight) > 1_000_000)) {
      throw new GraphInputError('Use integer edge weights between −1,000,000 and 1,000,000.');
    }
    if (weighted && edge.weight === undefined) throw new GraphInputError('This lesson requires a weight on every edge.');
    if (lesson === 'dijkstra' && edge.weight! < 0) throw new GraphInputError('Dijkstra requires nonnegative edge weights.');
    if (lesson === 'bfs' && edge.weight !== undefined) throw new GraphInputError('Use an unweighted graph to find the fewest hops with BFS.');
  }
  if (lesson === 'topological-sort' && !graph.directed) throw new GraphInputError('Topological sorting requires directed edges.');
  if ((lesson === 'prim' || lesson === 'kruskal') && graph.directed) throw new GraphInputError('Use an undirected graph for the spanning tree lesson.');
  if (['dijkstra', 'bfs', 'dfs', 'prim'].includes(lesson) && (start === undefined || !ids.has(start))) {
    throw new GraphInputError('Select an existing start vertex.');
  }
  if ((goal !== undefined && !ids.has(goal)) || (lesson === 'dijkstra' && goal === undefined)) {
    throw new GraphInputError('Select an existing goal vertex.');
  }
}

export function adjacency(graph: Graph) {
  const neighbors = new Map(graph.vertices.map(({ id }) => [id, [] as { to: VertexId; edge: Edge }[]]));
  for (const edge of graph.edges) {
    neighbors.get(edge.from)!.push({ to: edge.to, edge });
    if (!graph.directed) neighbors.get(edge.to)!.push({ to: edge.from, edge });
  }
  for (const list of neighbors.values()) list.sort((a, b) => compareId(a.to, b.to));
  return neighbors;
}

export function vertexValues<T>(example: Example, initial: T): Record<VertexId, T> {
  return Object.fromEntries(example.graph.vertices.map(({ id }) => [id, initial]));
}

export function recoverPath(graph: Graph, source: VertexId, goal: VertexId, predecessors: Record<VertexId, EdgeId | null>) {
  const vertices = [goal];
  const edges: EdgeId[] = [];
  const byId = new Map(graph.edges.map(edge => [edge.id, edge]));
  let at = goal;
  while (at !== source) {
    const edge = byId.get(predecessors[at] ?? '');
    if (!edge) throw new Error('Missing predecessor for a reached vertex');
    at = edge.to === at ? edge.from : edge.to;
    vertices.push(at);
    edges.push(edge.id);
  }
  return { vertices: vertices.reverse(), edges: edges.reverse() };
}
