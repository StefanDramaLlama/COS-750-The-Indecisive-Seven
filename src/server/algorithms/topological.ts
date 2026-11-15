import type { Example, RunResult, TraceFrame, VertexId, WorkingState } from '../../shared/contracts.ts';
import { adjacency, compareId, vertexValues } from './graph.ts';
import { trace } from './trace.ts';

export function topologicalIterative(example: Example, chosenAfterPlan?: VertexId) {
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
      'Iterative algorithm places one such task at a time until every task is placed or none can be.'
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

export function topologicalRecursive(example: Example): { frames: TraceFrame[]; result: RunResult } {
  const state: Extract<WorkingState, { kind: 'topological-sort' }> = {
    kind: 'topological-sort', indegrees: vertexValues(example, 0), ready: [], order: []
  };
  const labels = new Map(example.graph.vertices.map(vertex => [vertex.id, vertex.label]));
  const label = (id: string) => labels.get(id) ?? id;
  const { frames, emit } = trace(state);
  const neighbors = adjacency(example.graph);
  const visited = new Set<string>();
  const finished: string[] = [];
  let cycle = false;

  emit(null, 'Order by depth-first postorder',
    [
      'An arrow still points from a prerequisite to the task that needs it.',
      'The rule is different: a task is appended only after every task it points to has been appended.'
    ].join('\n'),
    [
      'DFS visits each vertex once and finishes it after its descendants.',
      'If every vertex can be finished, reading the finishes in reverse gives a valid order.',
      'If a back-edge is found, the graph has a cycle and no ordering exists.'
    ].join('\n'));

  const visiting = new Set<string>();
  function visit(id: string) {
    visiting.add(id);
    emit('enter', `Enter ${label(id)}`,
      [
        `Start exploring ${label(id)}'s outgoing edges.`,
        `It stays on the recursion stack until every successor has been visited.`
      ].join('\n'),
      [
        'Mark the vertex as "visiting" so a back-edge can be detected.',
        'Do not append it yet — its successors must be appended first.'
      ].join('\n'),
      { vertex: id });

    for (const { to, edge } of neighbors.get(id)!) {
      if (cycle) return;
      if (visiting.has(to)) {
        cycle = true;
        emit('cycle', `Back-edge to ${label(to)}`,
          [
            `${label(to)} is still on the recursion stack.`,
            'This is a directed cycle, so no topological ordering exists.'
          ].join('\n'),
          [
            'A back-edge means a prerequisite chain leads back to its own start.',
            'DFS cannot finish the cycle, and neither can Kahn\'s algorithm.'
          ].join('\n'),
          { vertex: to, edge: edge.id });
        return;
      }
      if (visited.has(to)) {
        emit('skip', `Skip ${label(to)}`,
          [
            `${label(to)} is already finished.`,
            'It was appended to the order in an earlier branch.'
          ].join('\n'),
          [
            'Re-visiting a finished vertex would duplicate it in the output.',
            'This is what makes DFS postorder linear in the number of edges.'
          ].join('\n'),
          { vertex: to, skipped: edge.id });
        continue;
      }
      emit('descend', `Descend into ${label(to)}`,
        [
          `Follow the edge from ${label(id)} to ${label(to)}.`,
          `Finish ${label(to)} before returning here.`
        ].join('\n'),
        [
          'The order of appends is the order of "last to finish first."',
          'That is the reverse of a valid topological order.'
        ].join('\n'),
        { vertex: to, edge: edge.id });
      visit(to);
      if (cycle) return;
    }

    visiting.delete(id);
    visited.add(id);
    finished.push(id);
    emit('finish-one', `Finish ${label(id)}`,
      [
        `Every successor of ${label(id)} has been appended.`,
        `Append ${label(id)} to the postorder list.`
      ].join('\n'),
      [
        'Postorder means "after all descendants."',
        'Reversing the postorder gives a valid topological order.'
      ].join('\n'),
      { vertex: id });
  }

  for (const vertex of [...example.graph.vertices].sort((a, b) => compareId(a.id, b.id))) {
    if (!visited.has(vertex.id)) visit(vertex.id);
  }

  if (cycle) {
    const result: RunResult = { kind: 'cycle', order: [...finished].reverse(), blocked: [] };
    emit('finish', 'A cycle prevents an ordering',
      [
        'DFS found a back-edge, so no topological order exists.',
        'The order shown is the postorder of the acyclic part, reversed.'
      ].join('\n'),
      [
        'A directed cycle has prerequisites that depend on each other.',
        'Kahn\'s algorithm reports the cycle as "blocked tasks"; DFS reports it as a back-edge.',
        'Both mean the same thing: no valid ordering exists.'
      ].join('\n'),
      { resultVertices: finished });
    return { frames, result };
  }

  const order = [...finished].reverse();
  const result: RunResult = { kind: 'ordering', order };
  emit('finish', 'Every task is ordered',
    order.map(label).join(' → '),
    [
      'Each prerequisite appears before the tasks it unlocks.',
      'DFS never found a back-edge, so the graph has no directed cycle.',
      'There can be several valid orders; the one shown is the reverse of a depth-first postorder.'
    ].join('\n'),
    { resultVertices: order });
  return { frames, result };
}

export function topological(
  example: Example,
  chosenAfterPlan?: VertexId,
  variant: 'iterative' | 'recursive' = 'iterative'
): { frames: TraceFrame[]; result: RunResult } {
  return variant === 'recursive'
    ? topologicalRecursive(example)
    : topologicalIterative(example, chosenAfterPlan);
}