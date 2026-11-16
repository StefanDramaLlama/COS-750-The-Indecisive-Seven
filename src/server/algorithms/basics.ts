import type { Example, RunResult, WorkingState } from '../../shared/contracts.ts';
import { trace } from './trace.ts';

export function basics(example: Example) {
  const state: Extract<WorkingState, { kind: 'dijkstra' }> = {
    kind: 'dijkstra', distances: {}, predecessors: {}, settled: []
  };
  const { frames, emit } = trace(state);

  const all = example.graph.vertices.map(v => v.id);
  const [first, second, third] = example.graph.vertices;
  const [firstEdge, secondEdge] = example.graph.edges;

  emit(null, 'Start with a picture',
    [
      'Three dots, two lines, one number.',
      'The dots are labelled A, B, and C.',
      'The lines join A–B and B–C.',
      'The number 4 sits on the A–B line.'
    ].join('\n'),
    [
      'Every algorithm in this studio works on a picture like this one.',
      'Before the rules, learn the parts.'
    ].join('\n'),
    { resultVertices: all });

  emit('graph', 'A graph is nodes plus edges',
    [
      `This graph has ${example.graph.vertices.length} nodes: A, B, C.`,
      `It has ${example.graph.edges.length} edges: A–B and B–C.`,
      'That is the entire definition: a set of nodes plus a set of edges.'
    ].join('\n'),
    [
      'A graph is not a picture — the picture is one way to draw it.',
      'The graph itself is the two sets: the nodes and the edges.',
      'Once you can say "three nodes, two edges," you have fully described this graph.',
      'The next lessons add properties to those sets — direction, weights, cycles — but the two sets are always the starting point.'
    ].join('\n'),
    { resultVertices: all });

  emit('node', `A node is one dot — here, ${first.label}`,
    [
      `Node ${first.id} is one item in the graph.`,
      'It has a label ("A") and a position on the screen.',
      `The other two nodes are ${second.label} and ${third.label}.`
    ].join('\n'),
    [
      'A node (also called a vertex — the words mean the same thing) is a single item.',
      'Nodes are the "things" in the graph: a city, a person, a task.',
      'Each node has a name so the algorithm can refer to it, and a position so the picture stays readable.',
      'Every algorithm in this studio works with nodes by label — "settle A," "visit C" — never by position.'
    ].join('\n'),
    { vertex: first.id });

  emit('edge', `An edge joins two nodes — here, ${firstEdge.from} to ${firstEdge.to}`,
    [
      `The line from ${firstEdge.from} to ${firstEdge.to} is one edge.`,
      `It carries the number ${firstEdge.weight} — that is its weight.`,
      `The arrowhead at ${firstEdge.to} means it is directed.`
    ].join('\n'),
    [
      'An edge (also called a link) connects exactly two nodes.',
      'An edge is not a thing in itself — it is a relationship between two nodes.',
      'The connection is the edge; the arrowhead adds direction, and the number adds weight.',
      'This graph uses both, which is why the next lesson can talk about directed and weighted graphs.'
    ].join('\n'),
    { edge: firstEdge.id });

  emit('edge', `Every line is an edge — here, ${secondEdge.from} to ${secondEdge.to}`,
    [
      `The line from ${secondEdge.from} to ${secondEdge.to} is another edge.`,
      'It has no number, so it is unweighted.',
      'It has no arrowhead, so this particular edge is undirected.'
    ].join('\n'),
    [
      'Two lines, two edges. The definition is the same whether the line carries a number or not.',
      'A single graph can mix weighted and unweighted edges, and it can mix directed and undirected edges.',
      'The differences between A–B and B–C are differences in what the edge carries, not in what an edge is.',
      'That distinction — the thing vs. the information on the thing — is what the next lesson ("Properties") is about.'
    ].join('\n'),
    { edge: secondEdge.id });

  emit('finish', 'Graph → node → edge',
    [
      'A graph is nodes joined by edges.',
      'A node is one dot, with a label and a position.',
      'An edge is one line, joining two nodes.'
    ].join('\n'),
    [
      'Everything in the next lessons is a property of these three ideas.',
      'Direction and weight are properties of an edge.',
      'Degree is a property of a node.',
      'A cycle is a path through nodes and edges.',
      'A spanning tree is a set of edges connecting all nodes without forming a cycle.'
    ].join('\n'),
    { resultVertices: all });

  const result: RunResult = { kind: 'traversal', order: all };
  return { frames, result };
}