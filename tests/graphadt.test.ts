import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { buildCode } from '../src/graphadt/code.ts';
import type { Representation } from '../src/graphadt/code.ts';
import { CONTENT, opDocs } from '../src/graphadt/content.ts';
import { CONFIGS, buildSession, computeFacts, finalGraph, listOf, matrixOf, neighborsOf, opLabel } from '../src/graphadt/engine.ts';
import { makeQuestion } from '../src/graphadt/quiz.ts';
import type { GraphData, GraphKind, OpRequest } from '../src/graphadt/types.ts';

const kinds: GraphKind[] = ['undirected', 'directed', 'weighted', 'weighted-directed'];
const run = (kind: GraphKind, start: GraphData, ops: OpRequest[]) => buildSession(CONFIGS[kind], start, ops);

for (const kind of kinds) {
  const content = CONTENT[kind];
  const ops = content.guide.map(step => step.request);

  test(`${kind}: the guided walkthrough never gets rejected and ends consistent`, () => {
    const session = run(kind, content.start, ops);
    assert.equal(session.frames[0].pane, 'start');
    for (const span of session.spans) {
      for (let i = span.first; i <= span.last; i++) assert.notEqual(session.frames[i].pane, 'rejected', opLabel(span.request));
      const last = session.frames[span.last].snapshot;
      assert.deepEqual(last.matrix, matrixOf(session.config, last.graph), `${opLabel(span.request)} matrix`);
      assert.deepEqual(last.list, listOf(session.config, last.graph), `${opLabel(span.request)} list`);
    }
    session.frames.forEach((frame, index) => {
      assert.equal(frame.index, index);
      assert.ok(frame.log.length > 10);
      assert.ok(frame.snapshot.matrix.cells.length === frame.snapshot.matrix.rowLabels.length);
      for (const row of frame.snapshot.matrix.cells) assert.equal(row.length, frame.snapshot.matrix.colLabels.length);
    });
  });

  test(`${kind}: every documented sample operation runs on the starting graph`, () => {
    for (const doc of opDocs(CONFIGS[kind])) {
      const session = run(kind, content.start, [doc.sample]);
      assert.ok(session.frames.slice(1).every(frame => frame.pane !== 'rejected'), doc.op);
    }
  });

  test(`${kind}: matrix and list code behave exactly like the lesson engine`, () => {
    for (const rep of ['matrix', 'list'] as Representation[]) {
      const code = buildCode(CONFIGS[kind], rep);
      const js = ts.transpileModule(code.full, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      const impl = new Function(`${js}\nreturn new ${code.className}();`)() as Record<string, (...args: unknown[]) => unknown>;
      const args = (op: OpRequest) => [op.a, op.b, ...(op.weight === undefined ? [] : [op.weight])].filter(value => value !== undefined);
      // Build the starting graph through the public API.
      for (const v of content.start.vertices) impl.addVertex(v);
      for (const edge of content.start.edges) impl.addEdge(edge.from, edge.to, ...(edge.weight === undefined ? [] : [edge.weight]));
      let applied: OpRequest[] = [];
      for (const step of ops) {
        const op = step;
        if (['addVertex', 'removeVertex', 'addEdge', 'removeEdge', 'updateWeight'].includes(op.op)) impl[op.op](...args(op));
        applied = [...applied, op];
        const session = run(kind, content.start, applied);
        const graph = finalGraph(session);
        assert.equal(impl.vertexCount(), graph.vertices.length);
        assert.equal(impl.edgeCount(), graph.edges.length);
        assert.equal(impl.isEmpty(), graph.vertices.length === 0);
        for (const v of graph.vertices) {
          assert.deepEqual(impl.neighbors(v), neighborsOf(CONFIGS[kind], graph, v).map(item => item.to), `${rep} neighbors(${v})`);
          const facts = computeFacts(CONFIGS[kind], graph).degrees[v];
          const degree = impl.degree(v);
          if (CONFIGS[kind].directed) assert.deepEqual(degree, { out: facts.out, in: facts.in });
          else assert.equal(degree, facts.total);
          for (const w of graph.vertices) {
            const present = graph.edges.some(edge => (edge.from === v && edge.to === w) || (!CONFIGS[kind].directed && edge.from === w && edge.to === v));
            assert.equal(impl.hasEdge(v, w), present, `${rep} hasEdge(${v}, ${w})`);
          }
          for (const traversal of ['bfs', 'dfs'] as const) {
            const frames = run(kind, graph, [{ op: traversal, a: v }]).frames;
            assert.deepEqual(impl[traversal](v), frames[frames.length - 1].traversal?.order, `${rep} ${traversal}(${v})`);
          }
        }
      }
    }
  });

  test(`${kind}: prediction questions are well formed and runnable`, () => {
    let graph = content.start;
    for (let counter = 0; counter < 40; counter++) {
      if (counter % 10 === 0) graph = finalGraph(run(kind, content.start, ops.slice(0, counter / 10 + 2)));
      const question = makeQuestion(CONFIGS[kind], graph, counter);
      const texts = question.options.map(option => option.text);
      assert.equal(new Set(texts).size, texts.length, `${question.prompt} has duplicate options`);
      assert.ok(texts.length >= 2);
      assert.ok(question.options.some(option => option.id === question.correct));
      if (question.op) {
        const frames = run(kind, graph, [question.op]).frames;
        assert.notEqual(frames[frames.length - 1].pane, 'rejected', question.prompt);
      }
    }
  });
}

test('rejections explain themselves and leave the graph untouched', () => {
  const start = CONTENT.undirected.start;
  const cases: [GraphKind, OpRequest, RegExp][] = [
    ['undirected', { op: 'addVertex', a: 'A' }, /already exists/],
    ['undirected', { op: 'addEdge', a: 'A', b: 'A' }, /self-loop/],
    ['undirected', { op: 'addEdge', a: 'B', b: 'A' }, /already exists/],
    ['undirected', { op: 'removeEdge', a: 'A', b: 'C' }, /no edge/],
    ['undirected', { op: 'removeVertex', a: 'Z' }, /does not exist/],
    ['undirected', { op: 'updateWeight', a: 'A', b: 'B', weight: 3 }, /not weighted/],
    ['directed', { op: 'removeEdge', a: 'B', b: 'A' }, /direction matters/],
    ['weighted', { op: 'addEdge', a: 'A', b: 'C' }, /needs a whole-number weight/],
    ['weighted', { op: 'addEdge', a: 'A', b: 'B', weight: 9 }, /updateWeight/],
    ['weighted', { op: 'updateWeight', a: 'A', b: 'B', weight: 4 }, /already has weight/]
  ];
  for (const [kind, op, pattern] of cases) {
    const base = kind === 'weighted' ? CONTENT.weighted.start : start;
    const session = run(kind, base, [op]);
    const last = session.frames[session.frames.length - 1];
    assert.equal(last.pane, 'rejected', opLabel(op));
    assert.match(last.log, pattern);
    assert.equal(last.sound, 'error');
    assert.deepEqual(last.snapshot.graph, session.frames[0].snapshot.graph);
  }
  const full: GraphData = { vertices: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], edges: [] };
  const session = run('undirected', full, [{ op: 'addVertex', a: 'I' }]);
  assert.equal(session.frames[session.frames.length - 1].pane, 'rejected');
});

test('adding a vertex shows a row without a column for one frame, and labels stay sorted', () => {
  const session = run('undirected', { vertices: ['A', 'C'], edges: [{ from: 'A', to: 'C' }] }, [{ op: 'addVertex', a: 'B' }]);
  const rowOnly = session.frames[2].snapshot.matrix;
  assert.deepEqual(rowOnly.rowLabels, ['A', 'B', 'C']);
  assert.deepEqual(rowOnly.colLabels, ['A', 'C']);
  assert.deepEqual(session.frames[3].snapshot.matrix.colLabels, ['A', 'B', 'C']);
  assert.deepEqual(finalGraph(session).vertices, ['A', 'B', 'C']);
});

test('directed edges change one cell and undirected edges change two', () => {
  const start: GraphData = { vertices: ['A', 'B'], edges: [] };
  const directed = run('directed', start, [{ op: 'addEdge', a: 'B', b: 'A' }]);
  assert.deepEqual(Object.keys(directed.frames[2].highlights.matrixCells), ['B|A']);
  assert.equal(directed.frames[3].snapshot.list.rows[0].items.length, 0);
  const undirected = run('undirected', start, [{ op: 'addEdge', a: 'B', b: 'A' }]);
  assert.deepEqual(Object.keys(undirected.frames[2].highlights.matrixCells).sort(), ['A|B', 'B|A']);
  assert.deepEqual(finalGraph(undirected).edges, [{ from: 'A', to: 'B' }]);
});

test('weighted matrices use infinity (null) for no edge', () => {
  const m = matrixOf(CONFIGS.weighted, CONTENT.weighted.start);
  assert.equal(m.cells[0][1], 4);
  assert.equal(m.cells[0][2], null);
  assert.equal(m.cells[0][0], null);
});

test('a weighted directed update changes one arrow and leaves the reverse weight alone', () => {
  const start: GraphData = {
    vertices: ['A', 'B'],
    edges: [{ from: 'A', to: 'B', weight: 4 }, { from: 'B', to: 'A', weight: 8 }]
  };
  const session = run('weighted-directed', start, [{ op: 'updateWeight', a: 'A', b: 'B', weight: 1 }]);
  assert.deepEqual(finalGraph(session).edges, [
    { from: 'A', to: 'B', weight: 1 },
    { from: 'B', to: 'A', weight: 8 }
  ]);
  const matrix = session.frames.at(-1)!.snapshot.matrix;
  assert.equal(matrix.cells[0][1], 1);
  assert.equal(matrix.cells[1][0], 8);
  const changed = session.frames.find(frame => frame.title === 'Matrix: overwrite the weight');
  assert.deepEqual(Object.keys(changed!.highlights.matrixCells), ['A|B']);
});

test('traversals follow BFS and DFS order and report unreached vertices', () => {
  const graph: GraphData = { vertices: ['A', 'B', 'C', 'D', 'E'], edges: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }] };
  const bfs = run('undirected', graph, [{ op: 'bfs', a: 'A' }]);
  const dfs = run('undirected', graph, [{ op: 'dfs', a: 'A' }]);
  assert.deepEqual(bfs.frames.at(-1)!.traversal?.order, ['A', 'B', 'C', 'D']);
  assert.deepEqual(dfs.frames.at(-1)!.traversal?.order, ['A', 'B', 'D', 'C']);
  assert.match(bfs.frames.at(-1)!.log, /Not reached: E/);
  const queues = bfs.frames.filter(frame => frame.traversal).map(frame => frame.traversal!.frontier.join(''));
  assert.deepEqual(queues.slice(0, 3), ['A', 'BC', 'CD']);
});

test('facts: degree, density, connectivity, cycles and weight', () => {
  const triangle: GraphData = { vertices: ['A', 'B', 'C', 'D'], edges: [{ from: 'A', to: 'B', weight: 1 }, { from: 'A', to: 'C', weight: 2 }, { from: 'B', to: 'C', weight: 3 }] };
  const facts = computeFacts(CONFIGS.weighted, triangle);
  assert.equal(facts.maxEdges, 6);
  assert.equal(facts.densityLabel, 'sparse');
  assert.equal(facts.connected, false);
  assert.equal(facts.hasCycle, true);
  assert.equal(facts.totalWeight, 6);
  assert.deepEqual(facts.degrees.A, { in: 2, out: 2, total: 2 });
  const cycle: GraphData = { vertices: ['A', 'B', 'C'], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }] };
  const directed = computeFacts(CONFIGS.directed, cycle);
  assert.equal(directed.hasCycle, true);
  assert.equal(directed.stronglyConnected, true);
  assert.equal(computeFacts(CONFIGS.directed, { vertices: ['A', 'B'], edges: [{ from: 'A', to: 'B' }] }).hasCycle, false);
  assert.equal(computeFacts(CONFIGS.directed, { vertices: ['A', 'B'], edges: [{ from: 'A', to: 'B' }] }).stronglyConnected, false);
});
