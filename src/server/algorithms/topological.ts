import type { Example, RunResult, VertexId, WorkingState } from '../../shared/contracts.ts';
import { adjacency, compareId, vertexValues } from './graph.ts';
import { trace } from './trace.ts';

export function topological(example: Example, chosenAfterPlan?: VertexId) {
  const state: Extract<WorkingState, { kind: 'topological-sort' }> = {
    kind: 'topological-sort', indegrees: vertexValues(example, 0), ready: [], order: []
  };
  const labels = new Map(example.graph.vertices.map(vertex => [vertex.id, vertex.label]));
  const label = (id: string) => labels.get(id) ?? id;
  const { frames, emit } = trace(state);
  const neighbors = adjacency(example.graph);
  emit(null, 'Put dependencies first', 'An arrow points from a prerequisite to the task that needs it.', 'A task can be placed when all of its prerequisites are already in the order.');

  for (const edge of example.graph.edges) state.indegrees[edge.to]++;
  state.ready = Object.keys(state.indegrees).filter(id => state.indegrees[id] === 0).sort(compareId);
  emit('count', 'Count incoming edges', `Ready tasks: ${state.ready.map(label).join(', ') || 'none'}.`, 'Zero remaining incoming edges means a task has no outstanding prerequisites.');
  while (state.ready.length) {
    const branchIndex = state.order.length === 1 && chosenAfterPlan ? state.ready.indexOf(chosenAfterPlan) : -1;
    const [current] = state.ready.splice(branchIndex < 0 ? 0 : branchIndex, 1);
    state.order.push(current);
    emit('place', `Place ${label(current)}`, `Append ${label(current)} to the output order.`, 'Any ready vertex is valid. The walkthrough takes the first one in the queue.', { vertex: current });
    for (const { to, edge } of neighbors.get(current)!) {
      const remaining = --state.indegrees[to];
      if (remaining === 0) state.ready.push(to);
      emit('release', `Update ${label(to)}’s prerequisites`, `${label(to)} has ${remaining} incoming edge(s) remaining.`,
        remaining === 0 ? 'All prerequisites are placed, so the task enters the ready queue.' : 'This task waits until every incoming prerequisite is placed.', { vertex: to, edge: edge.id });
    }
  }
  if (state.order.length < example.graph.vertices.length) {
    const blocked = Object.keys(state.indegrees).filter(id => !state.order.includes(id)).sort(compareId);
    const result: RunResult = { kind: 'cycle', order: [...state.order], blocked };
    emit('finish', 'A cycle blocks the remaining tasks', `The ready queue is empty. Blocked tasks: ${blocked.map(label).join(', ')}.`,
      'A directed cycle has prerequisites that depend on each other. Tasks downstream of the cycle can also be blocked.', { resultVertices: state.order });
    return { frames, result };
  }
  const result: RunResult = { kind: 'ordering', order: [...state.order] };
  emit('finish', 'Every task is ordered', state.order.map(label).join(' → '), 'Each prerequisite appears before the tasks it unlocks. There can be several valid orders.', { resultVertices: state.order });
  return { frames, result };
}
