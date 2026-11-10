import assert from 'node:assert/strict';
import test from 'node:test';
import type { LessonId, RunResult } from '../src/shared/contracts.ts';
import { runExample } from '../src/server/algorithms/index.ts';
import { getLesson, lessonIds } from '../src/server/lessons/catalog.ts';
import { examples, makeGraph } from '../src/server/lessons/fixtures.ts';

function run(id: LessonId, exampleId?: string) {
  const example = exampleId ? examples[id].find(item => item.id === exampleId)! : examples[id][0];
  return runExample(id, getLesson(id).version, example);
}

const worked: Record<LessonId, RunResult> = {
  dijkstra: { kind: 'path', vertices: ['A', 'B', 'D'], edges: ['A-B', 'B-D'], cost: 7 },
  bfs: { kind: 'traversal', order: ['A', 'B', 'C', 'D'], path: ['A', 'B', 'D'], hops: 2 },
  dfs: { kind: 'traversal', order: ['A', 'B', 'C', 'D'] },
  'topological-sort': { kind: 'ordering', order: ['A', 'B', 'C', 'D', 'E'] },
  kruskal: { kind: 'tree', edges: ['A-B', 'B-C', 'C-D'], weight: 7 },
  prim: { kind: 'tree', edges: ['A-B', 'B-C', 'C-D'], weight: 7 }
};

for (const id of lessonIds) {
  test(`${id}: worked answer, stable snapshots, and valid references`, () => {
    const result = run(id);
    assert.deepEqual(result.result, worked[id]);
    assert.deepEqual(result, run(id));
    const vertices = new Set(result.graph.vertices.map(vertex => vertex.id));
    const edges = new Set(result.graph.edges.map(edge => edge.id));
    const lines = new Set(getLesson(id).code.map(line => line.id));
    for (const [index, frame] of result.frames.entries()) {
      assert.equal(frame.index, index);
      assert.ok(index === 0 ? frame.lineId === null : frame.lineId && lines.has(frame.lineId));
      if (frame.highlights.vertex) assert.ok(vertices.has(frame.highlights.vertex));
      if (frame.highlights.edge) assert.ok(edges.has(frame.highlights.edge));
      if (frame.highlights.skipped) assert.ok(edges.has(frame.highlights.skipped));
      for (const vertex of frame.highlights.resultVertices ?? []) assert.ok(vertices.has(vertex));
      for (const edge of frame.highlights.resultEdges ?? []) assert.ok(edges.has(edge));
    }
    assert.equal(result.frames.at(-1)?.lineId, 'finish');
    assert.notEqual(result.frames[0].state, result.frames.at(-1)?.state);
  });
}

test('Dijkstra records both D estimates and replaces its predecessor without mutating older frames', () => {
  const frames = run('dijkstra').frames;
  const updates = frames.filter(frame => frame.event === 'relax' && frame.highlights.vertex === 'D');
  assert.deepEqual(updates.map(({ state }) => state.kind === 'dijkstra' && [state.distances.D, state.predecessors.D]), [[12, 'C-D'], [7, 'B-D']]);
  assert.equal(run('dijkstra', 'unreachable').result.kind, 'unreachable');
});

test('Dijkstra accepts zero weight, breaks equal distances by ID, and rejects negative weights', () => {
  const fixture = examples.dijkstra[0];
  const graph = makeGraph({ A: 'A', B: 'B', C: 'C', D: 'D' }, [['A', 'C', 0], ['A', 'B', 0], ['B', 'D', 2], ['C', 'D', 2]]);
  const result = runExample('dijkstra', 1, { ...fixture, graph });
  assert.deepEqual(result.result, { kind: 'path', vertices: ['A', 'B', 'D'], edges: ['A-B', 'B-D'], cost: 2 });
  graph.edges[0].weight = -1;
  assert.throws(() => runExample('dijkstra', 1, { ...fixture, graph }), /nonnegative/);
});

test('graph validation rejects missing endpoints, parallel edges, and weighted hop counts', () => {
  const fixture = examples.bfs[0];
  const graph = structuredClone(fixture.graph);
  graph.edges.push({ id: 'duplicate', from: 'B', to: 'A' });
  assert.throws(() => runExample('bfs', 1, { ...fixture, graph }), /at most one edge/);
  graph.edges.pop();
  graph.edges[0].to = 'X';
  assert.throws(() => runExample('bfs', 1, { ...fixture, graph }), /existing endpoints/);
  graph.edges[0].to = 'B';
  graph.edges[0].weight = 1;
  assert.throws(() => runExample('bfs', 1, { ...fixture, graph }), /unweighted/);
});

test('BFS discovers each vertex once and DFS backtracks through the correct frames', () => {
  assert.equal(run('bfs').frames.filter(frame => frame.event === 'discover' && frame.highlights.vertex === 'D').length, 1);
  assert.deepEqual(run('dfs').frames.filter(frame => frame.event === 'backtrack').map(frame => frame.highlights.vertex), ['B', 'A', 'A', undefined]);
  assert.deepEqual(run('dfs', 'split-graph').result, { kind: 'traversal', order: ['A', 'B'] });
});

test('Kahn reports a partial order and blocks the cycle and its dependent task', () => {
  assert.deepEqual(run('topological-sort', 'dependency-cycle').result, { kind: 'cycle', order: ['A', 'C'], blocked: ['B', 'D', 'E'] });
});

test('spanning tree runners select connected acyclic edges and explain disconnected inputs', () => {
  for (const id of ['prim', 'kruskal'] as const) {
    const { graph, result } = run(id);
    assert.equal(result.kind, 'tree');
    const groups = new Map(graph.vertices.map(vertex => [vertex.id, new Set([vertex.id])]));
    for (const edgeId of result.edges) {
      const edge = graph.edges.find(edge => edge.id === edgeId)!;
      const first = groups.get(edge.from)!;
      const second = groups.get(edge.to)!;
      assert.notEqual(first, second, 'a selected edge cannot close a cycle');
      for (const vertex of second) {
        first.add(vertex);
        groups.set(vertex, first);
      }
    }
    assert.equal(result.edges.length, graph.vertices.length - 1);
    assert.equal(groups.get('A')?.size, graph.vertices.length);
  }
  assert.equal(run('kruskal', 'forest').result.kind, 'disconnected');
  assert.deepEqual(run('prim', 'isolated-site').result, { kind: 'disconnected', edges: ['A-B', 'B-C'], weight: 3, covered: ['A', 'B', 'C'] });
});
