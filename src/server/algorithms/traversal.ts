import type { Example, RunResult, WorkingState } from '../../shared/contracts.ts';
import { adjacency, recoverPath, vertexValues } from './graph.ts';
import { trace } from './trace.ts';

export function bfs(example: Example) {
  const start = example.startId!;
  const goal = example.goalId;
  const state: Extract<WorkingState, { kind: 'bfs' }> = {
    kind: 'bfs', queue: [], distances: vertexValues(example, null), predecessors: vertexValues(example, null), order: []
  };
  const { frames, emit } = trace(state);
  const neighbors = adjacency(example.graph);
  const queue = [start];
  let head = 0;
  emit(null, 'Explore one layer at a time', `Start at ${start}.`, 'A queue visits the earliest discovered vertex first.');
  state.distances[start] = 0;
  state.queue = [start];
  emit('seed', `Enqueue ${start}`, `${start} is discovered at distance 0.`, 'Mark a vertex when it enters the queue so it cannot be queued twice.', { vertex: start });

  while (head < queue.length) {
    const current = queue[head++];
    state.queue = queue.slice(head);
    state.order.push(current);
    emit('take', `Dequeue ${current}`, `${current} is next in the visit order.`, 'First in, first out keeps the visit order grouped by hop count.', { vertex: current });
    for (const { to, edge } of neighbors.get(current)!) {
      if (state.distances[to] !== null) {
        emit('discover', `Skip the discovered vertex ${to}`, `${to} already has a hop count.`, 'An earlier discovery found a path with at most this many hops.', { vertex: to, skipped: edge.id }, 'skip');
        continue;
      }
      state.distances[to] = state.distances[current]! + 1;
      state.predecessors[to] = edge.id;
      queue.push(to);
      state.queue = queue.slice(head);
      emit('discover', `Discover and enqueue ${to}`, `${to} is ${state.distances[to]} hop(s) from ${start}.`, `The edge from ${current} adds one hop. Record it to recover the route later.`, { vertex: to, edge: edge.id });
    }
  }
  const reachable = goal !== undefined && state.distances[goal] !== null;
  const path = reachable ? recoverPath(example.graph, start, goal, state.predecessors) : undefined;
  const result: RunResult = goal !== undefined && !path
    ? { kind: 'unreachable', target: goal, order: [...state.order] }
    : { kind: 'traversal', order: [...state.order], ...(path && goal ? { path: path.vertices, hops: state.distances[goal]! } : {}) };
  emit('finish', 'The queue is empty',
    path ? `${path.vertices.join(' → ')} takes ${state.distances[goal!]} hops.`
      : `Visited ${state.order.join(', ')}.${goal ? ` ${goal} was unreachable.` : ''}`,
    'BFS explores every vertex reachable from the start and finds a shortest path by edge count.',
    { resultVertices: path?.vertices ?? state.order, resultEdges: path?.edges });
  return { frames, result };
}

export function dfs(example: Example) {
  const start = example.startId!;
  const state: Extract<WorkingState, { kind: 'dfs' }> = { kind: 'dfs', stack: [], order: [] };
  const { frames, emit } = trace(state);
  const neighbors = adjacency(example.graph);
  const visited = new Set<string>();
  const treeEdges: string[] = [];
  const enter = (id: string, edge?: string) => {
    visited.add(id);
    state.stack.push({ vertexId: id, nextNeighborIndex: 0 });
    state.order.push(id);
    if (edge) treeEdges.push(edge);
    emit('enter', `Enter ${id}`, `Mark ${id} visited and push its stack frame.`, 'The stack remembers where to return after exploring this branch.', { vertex: id, edge });
  };

  emit(null, 'Follow a branch to its end', `Start at ${start}.`, 'Depth-first search follows an unvisited neighbor before returning to try another branch.');
  enter(start);
  while (state.stack.length) {
    const top = state.stack.at(-1)!;
    const { vertexId } = top;
    const list = neighbors.get(vertexId)!;
    if (top.nextNeighborIndex === list.length) {
      emit('return', `${vertexId} has no unexplored neighbors`, 'The current stack frame has checked every neighbor.', 'The search must return to the previous frame, if there is one.', { vertex: vertexId }, 'dead-end');
      state.stack.pop();
      const parent = state.stack.at(-1)?.vertexId;
      emit('return', parent ? `Backtrack to ${parent}` : 'Leave the starting vertex', `Pop ${vertexId} from the stack.`, parent ? `Resume ${parent} at its next neighbor.` : 'An empty stack means there is no remaining branch from the start.', { vertex: parent }, 'backtrack');
      continue;
    }
    const { to, edge } = list[top.nextNeighborIndex++];
    if (visited.has(to)) {
      emit('check', `Skip the visited vertex ${to}`, `The edge from ${vertexId} leads to a vertex already discovered.`, 'Marking vertices on entry prevents a cycle from causing repeated exploration.', { vertex: to, skipped: edge.id });
    } else {
      emit('check', `Follow the edge to ${to}`, `${to} has not been visited.`, 'DFS explores this branch before checking the current vertex’s remaining neighbors.', { vertex: to, edge: edge.id });
      enter(to, edge.id);
    }
  }
  const unreached = example.graph.vertices.map(({ id }) => id).filter(id => !visited.has(id));
  const result: RunResult = { kind: 'traversal', order: [...state.order] };
  emit('finish', 'The stack is empty', `Discovery order is ${state.order.join(' → ')}.${unreached.length ? ` Unreached: ${unreached.join(', ')}.` : ''}`, 'The search covers the vertices reachable from this start.', { resultVertices: state.order, resultEdges: treeEdges });
  return { frames, result };
}
