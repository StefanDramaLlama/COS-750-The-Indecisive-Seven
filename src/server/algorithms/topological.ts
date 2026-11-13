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

  // ---------------------------------------------------------------------
  // Opening frame — no lineId, orients the learner before any action.
  // ---------------------------------------------------------------------
  emit(null, 'Put dependencies first',
    [
      'An arrow points from a prerequisite to the task that needs it.',
      'Read it as: "the task at the head needs the task at the tail before it can be placed."'
    ].join('\n'),
    [
      'A task can be placed when all of its prerequisites are already in the order.',
      'Kahn\'s algorithm places one such task at a time until every task is placed or none can be.'
    ].join('\n'));

  // ---------------------------------------------------------------------
  // Count frame — the initial indegrees and the initial ready queue.
  // ---------------------------------------------------------------------
  for (const edge of example.graph.edges) state.indegrees[edge.to]++;
  state.ready = Object.keys(state.indegrees).filter(id => state.indegrees[id] === 0).sort(compareId);
  emit('count', 'Count incoming edges',
    [
      `Ready tasks: ${state.ready.map(label).join(', ') || 'none'}.`,
      'Every other task still has at least one incoming edge — a prerequisite that has not been placed.'
    ].join('\n'),
    [
      'Zero remaining incoming edges means a task has no outstanding prerequisites.',
      'Those tasks form the ready queue. The rest wait until their last prerequisite is placed.',
      'A ready task can be placed in any order relative to the other ready tasks.'
    ].join('\n'));

  // ---------------------------------------------------------------------
  // Main loop — place one ready task, then release its successors.
  // ---------------------------------------------------------------------
  while (state.ready.length) {
    const branchIndex = state.order.length === 1 && chosenAfterPlan ? state.ready.indexOf(chosenAfterPlan) : -1;
    const [current] = state.ready.splice(branchIndex < 0 ? 0 : branchIndex, 1);
    state.order.push(current);
    emit('place', `Place ${label(current)}`,
      [
        `Append ${label(current)} to the output order.`,
        `It was the next ready task, so its prerequisites are already satisfied.`,
        'Every task that depends on it will lose one prerequisite now.'
      ].join('\n'),
      [
        'Any ready vertex is valid. The walkthrough takes the first one in the queue.',
        'Choosing a different ready task is equally valid and produces a different, still-correct ordering.'
      ].join('\n'),
      { vertex: current });

    for (const { to, edge } of neighbors.get(current)!) {
      const remaining = --state.indegrees[to];
      if (remaining === 0) state.ready.push(to);
      emit('release', `Update ${label(to)}’s prerequisites`,
        [
          `Remove one prerequisite: ${label(current)} is now placed.`,
          `${label(to)} has ${remaining} incoming edge${remaining === 1 ? '' : 's'} remaining.`,
          remaining === 0 ? `${label(to)} is now ready — it joins the ready queue.` : `${label(to)} still waits for ${remaining} more prerequisite${remaining === 1 ? '' : 's'}.`
        ].join('\n'),
        remaining === 0
          ? [
              'All prerequisites are placed, so the task enters the ready queue.',
              'It can be chosen as the next task to place.'
            ].join('\n')
          : [
              'This task waits until every incoming prerequisite is placed.',
              'Placing tasks that unlock it will decrease its indegree further.'
            ].join('\n'),
        { vertex: to, edge: edge.id });
    }
  }

  // ---------------------------------------------------------------------
  // Finish frames — cycle or success.
  // ---------------------------------------------------------------------
  if (state.order.length < example.graph.vertices.length) {
    const blocked = Object.keys(state.indegrees).filter(id => !state.order.includes(id)).sort(compareId);
    const result: RunResult = { kind: 'cycle', order: [...state.order], blocked };
    emit('finish', 'A cycle blocks the remaining tasks',
      [
        'The ready queue is empty, so no more tasks can be placed.',
        `Placed so far: ${state.order.map(label).join(', ') || 'none'}.`,
        `Blocked tasks: ${blocked.map(label).join(', ')}.`
      ].join('\n'),
      [
        'A directed cycle has prerequisites that depend on each other.',
        'Tasks downstream of the cycle can also be blocked — even though they are not part of the cycle themselves.',
        'No valid ordering exists for this graph.'
      ].join('\n'),
      { resultVertices: state.order });
    return { frames, result };
  }

  const result: RunResult = { kind: 'ordering', order: [...state.order] };
  emit('finish', 'Every task is ordered',
    state.order.map(label).join(' → '),
    [
      'Each prerequisite appears before the tasks it unlocks.',
      'Every task was placed, so the graph has no directed cycle.',
      'There can be several valid orders — Kahn\'s algorithm produces one of them.'
    ].join('\n'),
    { resultVertices: state.order });
  return { frames, result };
}