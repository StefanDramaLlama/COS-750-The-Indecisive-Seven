// LO5, factors beyond computational efficiency: run BFS and Dijkstra on the
// same graph, then with equal weights, and explain what decides between them
import type { Example, Highlights, TraceFrame, WorkingState } from '../../shared/contracts.ts';
import { dijkstra } from './dijkstra.ts';
import { GraphInputError } from './graph.ts';
import { bfs } from './traversal.ts';

export function compare(example: Example) {
  const frames: TraceFrame[] = [];
  const emit = (lineId: string | null, state: WorkingState, title: string, change: string, reason: string, highlights: Highlights = {}) => {
    frames.push({ index: frames.length, event: lineId ?? 'open', lineId, title, change, reason, highlights: structuredClone(highlights), state: structuredClone(state) });
  };
  const hopRun = bfs(example);
  const costRun = dijkstra(example);
  const equalRun = dijkstra({ ...example, graph: { ...example.graph, edges: example.graph.edges.map(edge => ({ ...edge, weight: 1 })) } });
  const cost = costRun.result, equal = equalRun.result;
  if (cost.kind !== 'path' || equal.kind !== 'path') throw new GraphInputError('Choose a goal that the start can reach.');

  const hopEnd = hopRun.frames.at(-1)!;
  const hopVertices = hopEnd.highlights.resultVertices ?? [];
  const hopEdges = hopEnd.highlights.resultEdges ?? [];
  const weights = new Map(example.graph.edges.map(edge => [edge.id, edge.weight ?? 0]));
  const hopCost = hopEdges.reduce((sum, id) => sum + weights.get(id)!, 0);
  const costState = costRun.frames.at(-1)!.state;
  const route = (vertices: string[]) => vertices.join(' → ');

  emit(null, hopRun.frames[0].state, 'Two ways to find a shortest route', `Find a route from ${example.startId} to ${example.goalId}.`,
    'BFS and Dijkstra both find shortest routes, but they measure “shortest” differently.');
  emit('bfs', hopEnd.state, `BFS: ${route(hopVertices)}`, `${hopEdges.length} hop(s), total weight ${hopCost}.`,
    'BFS counts hops with a plain queue and ignores the edge weights.', { resultVertices: hopVertices, resultEdges: hopEdges });
  emit('dijkstra', costState, `Dijkstra: ${route(cost.vertices)}`, `${cost.edges.length} hop(s), total weight ${cost.cost}.`,
    'Dijkstra keeps a priority queue of estimates and adds up the weights.', { resultVertices: cost.vertices, resultEdges: cost.edges });
  emit('weights', costState, 'The weights decide which answer is right', `BFS’s route costs ${hopCost}; Dijkstra’s costs ${cost.cost}.`,
    'With different weights, the route with the fewest hops is not always the cheapest, so only Dijkstra is correct.', { resultVertices: cost.vertices, resultEdges: cost.edges });
  emit('equal', equalRun.frames.at(-1)!.state, 'Remove the weights', `If every edge counts as 1, Dijkstra also picks ${route(equal.vertices)}.`,
    'Without weights, the cheapest route is the one with the fewest hops, and BFS already finds it.', { resultVertices: equal.vertices, resultEdges: equal.edges });
  emit('finish', hopEnd.state, 'Same answer? Choose the simpler code',
    'For an unweighted graph, choose BFS: a plain queue instead of a priority queue and distance updates.',
    'When both algorithms are correct, programming time and maintainability decide. With weights, correctness rules BFS out.',
    { resultVertices: hopVertices, resultEdges: hopEdges });
  return { frames, result: cost };
}
