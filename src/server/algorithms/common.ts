import type { AlgorithmState, Edge, Graph, Highlights, TraceFrame } from "../../shared/types.js";

export const LIMITS = { vertices: 12, edges: 36, weight: 1_000_000 } as const;

/** Raised for graph inputs the prototype does not support (HTTP 422). */
export class GraphInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphInputError";
  }
}

export interface GraphRules {
  weighted?: boolean;
  directed?: boolean;
  nonNegative?: boolean;
}

export const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Validate structure, then any algorithm-specific requirements. Throws GraphInputError. */
export function validateGraph(graph: Graph, rules: GraphRules = {}): void {
  const fail = (msg: string): never => {
    throw new GraphInputError(msg);
  };
  if (!graph || !Array.isArray(graph.vertices) || !Array.isArray(graph.edges)) {
    fail("Graph needs vertices and edges arrays.");
  }
  if (graph.vertices.length === 0) fail("Graph needs at least one vertex.");
  if (graph.vertices.length > LIMITS.vertices) fail(`At most ${LIMITS.vertices} vertices are supported.`);
  if (graph.edges.length > LIMITS.edges) fail(`At most ${LIMITS.edges} edges are supported.`);

  const vertexIds = new Set<string>();
  for (const v of graph.vertices) {
    if (!v.id) fail("Every vertex needs an id.");
    if (vertexIds.has(v.id)) fail(`Duplicate vertex id ${v.id}.`);
    vertexIds.add(v.id);
  }

  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const e of graph.edges) {
    if (!e.id) fail("Every edge needs an id.");
    if (edgeIds.has(e.id)) fail(`Duplicate edge id ${e.id}.`);
    edgeIds.add(e.id);
    if (!vertexIds.has(e.from) || !vertexIds.has(e.to)) fail(`Edge ${e.id} has an endpoint that does not exist.`);
    if (e.from === e.to) fail(`Edge ${e.id} is a self-loop; self-loops are not supported.`);
    const key = graph.directed ? `${e.from}>${e.to}` : [e.from, e.to].sort(byId).join("~");
    if (pairs.has(key)) fail(`Edge ${e.id} duplicates another edge between the same vertices.`);
    pairs.add(key);
    if (e.weight !== undefined) {
      if (!Number.isInteger(e.weight) || Math.abs(e.weight) > LIMITS.weight) {
        fail(`Edge ${e.id} needs an integer weight between −${LIMITS.weight} and ${LIMITS.weight}.`);
      }
    }
  }

  if (rules.directed !== undefined && graph.directed !== rules.directed) {
    fail(rules.directed ? "This algorithm needs a directed graph." : "This algorithm needs an undirected graph.");
  }
  if (rules.weighted === true && graph.edges.some((e) => e.weight === undefined)) {
    fail("Every edge needs a weight for this algorithm.");
  }
  if (rules.weighted === false && graph.edges.some((e) => e.weight !== undefined)) {
    fail("This lesson uses an unweighted graph.");
  }
  if (rules.nonNegative && graph.edges.some((e) => (e.weight ?? 0) < 0)) {
    fail("Dijkstra's algorithm does not support negative edge weights.");
  }
}

export function requireVertex(graph: Graph, id: string | undefined, role: string): string {
  if (!id) throw new GraphInputError(`A ${role} vertex is required.`);
  if (!graph.vertices.some((v) => v.id === id)) throw new GraphInputError(`The ${role} vertex ${id} does not exist.`);
  return id;
}

export interface Neighbor {
  to: string;
  edge: Edge;
}

/** Adjacency lists in ascending neighbour id (then edge id). Undirected edges appear in both lists. */
export function adjacency(graph: Graph): Map<string, Neighbor[]> {
  const adj = new Map<string, Neighbor[]>();
  for (const v of graph.vertices) adj.set(v.id, []);
  for (const e of graph.edges) {
    adj.get(e.from)!.push({ to: e.to, edge: e });
    if (!graph.directed) adj.get(e.to)!.push({ to: e.from, edge: e });
  }
  for (const list of adj.values()) {
    list.sort((a, b) => byId(a.to, b.to) || byId(a.edge.id, b.edge.id));
  }
  return adj;
}

export function sortedVertexIds(graph: Graph): string[] {
  return graph.vertices.map((v) => v.id).sort(byId);
}

export function labelOf(graph: Graph, id: string): string {
  return graph.vertices.find((v) => v.id === id)?.label ?? id;
}

/** "A–B" for undirected edges, "A→B" for directed ones (using labels). */
export function edgeName(graph: Graph, edge: Edge): string {
  return `${labelOf(graph, edge.from)}${graph.directed ? "→" : "–"}${labelOf(graph, edge.to)}`;
}

export function emptyHighlights(): Highlights {
  return {
    current: [],
    currentEdges: [],
    discovered: [],
    completed: [],
    chosenEdges: [],
    rejectedEdges: [],
    frontierEdges: [],
    resultVertices: [],
    resultEdges: [],
  };
}

export interface FrameInput<S extends AlgorithmState> {
  event: string;
  lineId: string | null;
  state: S;
  highlights?: Partial<Highlights>;
  title: string;
  changed: string;
  why: string;
}

/** Collects frames, deep-copying every mutable collection at emit time. */
export class Recorder<S extends AlgorithmState> {
  readonly frames: TraceFrame<S>[] = [];

  emit(input: FrameInput<S>): void {
    const highlights = { ...emptyHighlights(), ...input.highlights };
    this.frames.push(
      structuredClone({
        index: this.frames.length,
        event: input.event,
        lineId: input.lineId,
        highlights,
        state: input.state,
        title: input.title,
        changed: input.changed,
        why: input.why,
      }),
    );
  }
}

/** Display helper for distances: null renders as ∞. */
export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : String(n));
