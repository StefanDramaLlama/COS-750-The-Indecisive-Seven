import type { Example, RunResult, WorkingState } from '../../shared/contracts.ts';
import { adjacency, compareId, recoverPath, vertexValues } from './graph.ts';
import { trace } from './trace.ts';

export function dijkstra(example: Example) {
  const start = example.startId!;
  const goal = example.goalId!;
  const state: Extract<WorkingState, { kind: 'dijkstra' }> = {
    kind: 'dijkstra', distances: vertexValues(example, null), predecessors: vertexValues(example, null), settled: []
  };
  const { frames, emit } = trace(state);
  const ids = Object.keys(state.distances).sort(compareId);
  const neighbors = adjacency(example.graph);
  const settled = new Set<string>();
  emit(null, 'Find the lowest-cost route', `Start at ${start} and find a route to ${goal}.`, 'The cost of a route is the sum of its edge weights.');
  state.distances[start] = 0;
  emit('initialize', 'Set the starting estimate', `${start} costs 0 to reach. Every other estimate is ∞.`, 'A distance of ∞ means no route to that vertex has been found yet.', { vertex: start });

  while (true) {
    let current: string | undefined;
    let best = Infinity;
    for (const id of ids) {
      const estimate = state.distances[id] ?? Infinity;
      if (!settled.has(id) && estimate < best) {
        current = id;
        best = estimate;
      }
    }
    if (current === undefined) {
      const result: RunResult = { kind: 'unreachable', target: goal };
      emit('finish', 'The destination is unreachable', `${goal} still has distance ∞.`, 'There are no reachable unsettled vertices left to explore.');
      return { frames, result };
    }
    settled.add(current);
    state.settled.push(current);
    emit('settle', `Settle ${current} at cost ${best}`, `${current} has the smallest finite estimate among unsettled vertices.`, 'With nonnegative weights, going through a later vertex cannot give a smaller cost to this vertex.', { vertex: current });
    if (current === goal) {
      const path = recoverPath(example.graph, start, goal, state.predecessors);
      const result: RunResult = { kind: 'path', ...path, cost: best };
      emit('finish', `Lowest total cost · ${best}`, `The route is ${path.vertices.join(' → ')}.`, 'Follow the predecessor edges from the goal back to the start, then reverse that sequence.', { resultVertices: path.vertices, resultEdges: path.edges });
      return { frames, result };
    }
    for (const { to, edge } of neighbors.get(current)!) {
      if (settled.has(to)) continue;
      const candidate = best + edge.weight!;
      const previous = state.distances[to];
      emit('consider', `Consider ${current} → ${to}`, `The edge has weight ${edge.weight}. The current estimate for ${to} is ${previous ?? '∞'}.`, 'Add the edge weight to the settled distance to get a candidate estimate.', { vertex: to, edge: edge.id });
      if (previous === null || candidate < previous) {
        state.distances[to] = candidate;
        state.predecessors[to] = edge.id;
        emit('relax', `Update ${to} to ${candidate}`, `${best} + ${edge.weight} = ${candidate}, below the previous estimate of ${previous ?? '∞'}.`, `Save ${current} as the predecessor of ${to} so the best route found so far can be reconstructed.`, { vertex: to, edge: edge.id });
      } else {
        emit('relax', `Keep the estimate for ${to}`, `${best} + ${edge.weight} = ${candidate}. The current estimate is ${previous}.`, 'Change a distance and its predecessor only when the candidate is strictly smaller.', { vertex: to, skipped: edge.id });
      }
    }
  }
}
