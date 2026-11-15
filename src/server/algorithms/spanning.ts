import type { Example, RunResult, WorkingState } from '../../shared/contracts.ts';
import { compareEdge, compareId, edgeLabel, vertexValues } from './graph.ts';
import { trace } from './trace.ts';

export function kruskal(example: Example) {
  const sorted = [...example.graph.edges].sort(compareEdge);
  const state: Extract<WorkingState, { kind: 'kruskal' }> = {
    kind: 'kruskal', edges: [], components: vertexValues(example, ''), selected: [], total: 0
  };
  const { frames, emit } = trace(state);
  const parent = new Map(example.graph.vertices.map(({ id }) => [id, id]));
  const root = (id: string): string => {
    let current = id;
    while (current !== parent.get(current)) current = parent.get(current)!;
    return current;
  };

  emit(null, 'Connect all the sites', 'Each link has a construction cost.', 'A spanning tree connects all vertices without a cycle.');
  state.edges = sorted.map(edge => edge.id);
  for (const id of parent.keys()) state.components[id] = id;
  emit('sort', 'Sort links by cost', 'Each vertex starts in a separate component.', 'Kruskal considers the cheapest remaining link first.');
  for (const edge of sorted) {
    if (state.selected.length === parent.size - 1) break;
    const [a, b] = [root(edge.from), root(edge.to)];
    emit('check', `Consider ${edgeLabel(edge)}`, `This link costs ${edge.weight}.`, 'Check whether the endpoints belong to different components.', { edge: edge.id });
    if (a === b) {
      emit('skip', `Skip ${edgeLabel(edge)}`, 'Its endpoints already share a component.', 'There is already a route between them, so adding this link would form a cycle.', { skipped: edge.id, resultEdges: state.selected });
      continue;
    }
    const [first, second] = [a, b].sort(compareId);
    parent.set(second, first);
    for (const id of parent.keys()) state.components[id] = root(id);
    state.selected.push(edge.id);
    state.total += edge.weight!;
    emit('join', `Add ${edgeLabel(edge)}`, `The components merge. Running cost is ${state.total}.`, 'This link connects two previously separate pieces without forming a cycle.', { edge: edge.id, resultEdges: state.selected });
  }
  const connected = state.selected.length === parent.size - 1;
  const result: RunResult = connected
    ? { kind: 'tree', edges: [...state.selected], weight: state.total }
    : { kind: 'disconnected', edges: [...state.selected], weight: state.total, covered: [...parent.keys()] };
  emit('finish', connected ? `Minimum tree cost · ${state.total}` : 'Only a spanning forest is possible',
    connected ? `${state.selected.length} links connect all ${parent.size} vertices.` : 'Some components still have no link between them.',
    connected ? 'The result connects every vertex without cycles.' : 'Kruskal builds a tree within each connected component.', { resultEdges: state.selected });
  return { frames, result };
}

export function prim(example: Example) {
  const start = example.startId!;
  const state: Extract<WorkingState, { kind: 'prim' }> = { kind: 'prim', tree: [], frontier: [], selected: [], total: 0 };
  const { frames, emit } = trace(state);
  const inTree = new Set<string>();
  emit(null, 'Grow one connected tree', `Start from site ${start}.`, 'Prim expands the current tree using the cheapest link that leads outside it.');
  inTree.add(start);
  state.tree.push(start);
  emit('seed', `Start the tree at ${start}`, 'The tree has one vertex and costs 0.', 'The first usable link must touch the starting vertex.', { vertex: start });
  while (inTree.size < example.graph.vertices.length) {
    const crossing = example.graph.edges.filter(edge => inTree.has(edge.from) !== inTree.has(edge.to));
    state.frontier = crossing.map(edge => edge.id);
    let cheapest = crossing[0];
    for (const edge of crossing) if (compareEdge(edge, cheapest) < 0) cheapest = edge;
    emit('frontier', 'Find the crossing links', `${crossing.length} link(s) connect the tree to an outside vertex.`, 'A candidate has exactly one endpoint in the current tree.', { resultEdges: state.selected });
    if (!cheapest) break;
    const next = inTree.has(cheapest.from) ? cheapest.to : cheapest.from;
    inTree.add(next);
    state.tree.push(next);
    state.selected.push(cheapest.id);
    state.total += cheapest.weight!;
    state.frontier = example.graph.edges.filter(edge => inTree.has(edge.from) !== inTree.has(edge.to)).map(edge => edge.id);
    emit('add', `Add ${edgeLabel(cheapest)}`, `${next} joins the tree. Running cost is ${state.total}.`, `This was the cheapest crossing link at cost ${cheapest.weight}.`, { vertex: next, edge: cheapest.id, resultEdges: state.selected });
  }
  const connected = inTree.size === example.graph.vertices.length;
  const result: RunResult = connected
    ? { kind: 'tree', edges: [...state.selected], weight: state.total }
    : { kind: 'disconnected', edges: [...state.selected], weight: state.total, covered: [...state.tree] };
  emit('finish', connected ? `Minimum tree cost · ${state.total}` : 'The tree cannot reach every site',
    `The tree covers ${state.tree.join(', ')}.`, connected ? 'Every vertex is connected with exactly one fewer link than vertices.' : 'There are no crossing links left from the start component.',
    { resultVertices: state.tree, resultEdges: state.selected });
  return { frames, result };
}
