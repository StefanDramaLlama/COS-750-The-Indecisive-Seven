// A "runner" for the Basics lesson. No algorithm — just narrated frames
// that build the vocabulary (graph → node → edge) before any lesson
// that uses it. Frames are ordered so the practice checkpoints can hook
// each concept at its own moment.
import type { Example, RunResult, WorkingState } from '../../shared/contracts.ts';
import { trace } from './trace.ts';

export function basics(example: Example) {
  // Reuse the dijkstra state shape as a placeholder; the state panel is
  // not the point of this lesson, the narration is.
  const state: Extract<WorkingState, { kind: 'dijkstra' }> = {
    kind: 'dijkstra', distances: {}, predecessors: {}, settled: []
  };
  const { frames, emit } = trace(state);
  const ids = example.graph.vertices.map(v => v.id);
  const firstVertex = example.graph.vertices[0];
  const firstEdge = example.graph.edges[0];

  emit(null, 'Start with a graph',
    'A graph is a set of nodes joined by edges.',
    'Every algorithm in this studio takes a graph like this one and answers a question about it.');

  // Step 1 — what a graph is, with the example graph as the illustration.
  emit('graph', 'A graph is nodes plus edges',
    `This graph has ${example.graph.vertices.length} nodes and ${example.graph.edges.length} edges.`,
    'Any picture of dots and connecting lines is a graph. The dots are nodes; the lines are edges.',
    { resultVertices: ids });

  // Step 2 — what a node is.
  emit('node', `A node is one point: ${firstVertex.label}`,
    `Node ${firstVertex.id} sits at a position and can be named.`,
    'A node (also called a vertex) is a single item. It has a label and, when drawn, a position.',
    { vertex: firstVertex.id });

  // Step 3 — what an edge is.
  emit('edge', `An edge joins ${firstEdge.from} to ${firstEdge.to}`,
    firstEdge.weight === undefined
      ? 'This edge has no weight — it is a plain connection.'
      : `This edge has weight ${firstEdge.weight}, the cost of traversing it.`,
    'An edge (also called a link) connects two nodes. A directed edge has an arrowhead; a weighted edge carries a number.',
    { edge: firstEdge.id });

  emit('finish', 'That’s the vocabulary',
    'Graph → node → edge. Direction and weights build on top of those three ideas.',
    'The next lessons turn these ideas into algorithms.',
    { resultVertices: ids });

  const result: RunResult = { kind: 'traversal', order: ids };
  return { frames, result };
}