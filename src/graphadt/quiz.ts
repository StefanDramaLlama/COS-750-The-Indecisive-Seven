import type { GraphConfig, GraphData, OpRequest } from './types.ts';
import { buildSession, findEdge, inNeighborsOf, neighborsOf, opLabel } from './engine.ts';

export interface QuizOption { id: string; text: string }
export interface Question {
  id: string;
  prompt: string;
  options: QuizOption[];
  correct: string;
  hint: string;
  explanation: string;
  /** Operation the learner can run to check the answer. */
  op?: OpRequest;
}

interface Draft { prompt: string; correct: string; wrong: string[]; hint: string; explanation: string; op?: OpRequest }
type Generator = (config: GraphConfig, graph: GraphData, n: number) => Draft | undefined;

const list = (items: string[]) => `[${items.join(', ')}]`;
const pick = <T>(items: T[], n: number): T | undefined => (items.length ? items[n % items.length] : undefined);

/** Final graph after running one operation through the same engine the lesson uses, so answers always match what the learner sees. */
function after(config: GraphConfig, graph: GraphData, op: OpRequest): GraphData {
  const frames = buildSession(config, graph, [op]).frames;
  return frames[frames.length - 1].snapshot.graph;
}

const matrixAfterAddEdge: Generator = (config, graph, n) => {
  const pairs: [string, string][] = [];
  for (const a of graph.vertices) for (const b of graph.vertices) {
    if (a !== b && !findEdge(config, graph, a, b) && (config.directed || a < b)) pairs.push([a, b]);
  }
  const pair = pick(pairs, n);
  if (!pair) return undefined;
  const [a, b] = pair;
  const op: OpRequest = config.weighted ? { op: 'addEdge', a, b, weight: 6 } : { op: 'addEdge', a, b };
  const one = `Only [${a}][${b}]`;
  const both = `Both [${a}][${b}] and [${b}][${a}]`;
  return {
    prompt: `You run ${opLabel(op)}. Which cells of the adjacency matrix change?`,
    correct: config.directed ? one : both,
    wrong: config.directed ? [both, `Only [${b}][${a}]`, `Every cell in row ${a}`] : [one, `Only [${b}][${a}]`, `Every cell in row ${a}`],
    hint: config.directed ? 'Row = where the arrow starts, column = where it ends. Does the arrow also go back?' : 'An undirected edge works in both directions. What does that mean for the matrix?',
    explanation: config.directed
      ? `The arrow goes from ${a} to ${b}, so only row ${a}, column ${b} changes${config.weighted ? ' and it stores the weight 6' : ''}. [${b}][${a}] would only change if you also added ${b} → ${a}.`
      : `The edge joins ${a} and ${b} in both directions, so both mirrored cells are set${config.weighted ? ' to the weight 6' : ' to 1'} and the matrix stays symmetric.`,
    op
  };
};

const sizeAfterRemoveVertex: Generator = (config, graph, n) => {
  const v = pick(graph.vertices, n);
  if (!v || graph.vertices.length < 2) return undefined;
  const op: OpRequest = { op: 'removeVertex', a: v };
  const result = after(config, graph, op);
  const size = (count: number, edges: number) => `${count}×${count} matrix, ${edges} ${edges === 1 ? 'edge' : 'edges'}`;
  const nV = graph.vertices.length;
  const nE = graph.edges.length;
  const correct = size(nV - 1, result.edges.length);
  const wrong = [size(nV - 1, nE), size(nV, result.edges.length), size(nV - 1, Math.max(result.edges.length - 1, 0)), size(nV, nE)];
  return {
    prompt: `The graph has ${nV} vertices and ${nE} ${nE === 1 ? 'edge' : 'edges'}. You run ${opLabel(op)}. What are the matrix size and the edge count afterwards?`,
    correct, wrong,
    hint: `Count how many edges touch ${v}. They cannot stay, because an edge needs both of its ends.`,
    explanation: `The matrix loses row ${v} and column ${v}, so it is ${nV - 1}×${nV - 1}. ${nE - result.edges.length} ${nE - result.edges.length === 1 ? 'edge' : 'edges'} touched ${v} and went with it, leaving ${result.edges.length}.`,
    op
  };
};

const neighborsQuestion: Generator = (config, graph, n) => {
  const withNeighbors = graph.vertices.filter(v => neighborsOf(config, graph, v).length > 0);
  const v = pick(withNeighbors, n);
  if (!v) return undefined;
  const actual = neighborsOf(config, graph, v).map(item => item.to);
  const others = graph.vertices.filter(x => x !== v && !actual.includes(x));
  const wrong: string[] = [];
  if (config.directed) {
    const incoming = inNeighborsOf(config, graph, v);
    if (list(incoming) !== list(actual)) wrong.push(list(incoming));
  }
  if (others.length) wrong.push(list([...actual, others[0]].sort()));
  if (actual.length > 1) wrong.push(list(actual.slice(1)));
  wrong.push(list([...graph.vertices].filter(x => x !== v)));
  wrong.push(list([]));
  const op: OpRequest = { op: 'neighbors', a: v };
  return {
    prompt: `What does ${opLabel(op)} return on the current graph?`,
    correct: list(actual), wrong,
    hint: config.directed ? 'neighbors lists the vertices that this vertex points to, not the vertices that point to it.' : `Look at every edge that touches ${v} and note the vertex at its other end.`,
    explanation: `${v} is joined to ${actual.length} ${actual.length === 1 ? 'vertex' : 'vertices'}${config.directed ? ' by arrows leaving it' : ''}: ${list(actual)}. The matrix finds them by scanning row ${v}, the list by reading ${v}'s list.`,
    op
  };
};

const degreeQuestion: Generator = (config, graph, n) => {
  const candidates = graph.vertices.filter(v => graph.edges.some(e => e.from === v || e.to === v));
  const v = pick(candidates, n);
  if (!v) return undefined;
  const op: OpRequest = { op: 'degree', a: v };
  const out = neighborsOf(config, graph, v).length;
  const inn = inNeighborsOf(config, graph, v).length;
  if (config.directed) {
    const text = (o: number, i: number) => `out ${o}, in ${i}`;
    return {
      prompt: `What does ${opLabel(op)} return? Give the out-degree and the in-degree.`,
      correct: text(out, inn), wrong: [text(inn, out), text(out + 1, inn), text(out, inn + 1), text(out + inn, 0)],
      hint: 'Out-degree counts arrows leaving the vertex. In-degree counts arrows arriving at it.',
      explanation: `${v} has ${out} arrow${out === 1 ? '' : 's'} leaving and ${inn} arriving. The matrix reads row ${v} for the first and column ${v} for the second. The list gives the first for free but must scan every list for the second.`,
      op
    };
  }
  return {
    prompt: `What does ${opLabel(op)} return on the current graph?`,
    correct: String(out), wrong: [String(out + 1), String(Math.max(out - 1, 0)), String(out * 2), String(graph.edges.length)],
    hint: `Count the edges that touch ${v}.${config.weighted ? ' Weights do not matter here.' : ''}`,
    explanation: `${v} touches ${out} edge${out === 1 ? '' : 's'}, so its degree is ${out}.${config.weighted ? ' Degree counts edges, never weights.' : ''}`,
    op
  };
};

const traversalQuestion: Generator = (config, graph, n) => {
  const kind = n % 2 === 0 ? 'bfs' : 'dfs';
  const other = kind === 'bfs' ? 'dfs' : 'bfs';
  const start = pick(graph.vertices, Math.floor(n / 2));
  if (!start) return undefined;
  const run = (op: 'bfs' | 'dfs') => {
    const frames = buildSession(config, graph, [{ op, a: start }]).frames;
    return frames[frames.length - 1].traversal?.order ?? [];
  };
  const order = run(kind);
  if (order.length < 3) return undefined;
  const k = Math.min(order.length, 3);
  const alt = run(other);
  const wrong = [...(alt[k - 1] && alt[k - 1] !== order[k - 1] ? [alt[k - 1]] : []), ...graph.vertices.filter(v => v !== order[k - 1] && v !== start)];
  const ordinal = ['', 'first', 'second', 'third'][k];
  return {
    prompt: `You run ${kind}(${start}), and neighbours are tried in alphabetical order. Which vertex is visited ${ordinal}?`,
    correct: order[k - 1], wrong,
    hint: kind === 'bfs' ? 'BFS uses a queue: everything one edge away is visited before anything two edges away.' : 'DFS goes as deep as it can along the first neighbour before it comes back to try the next one.',
    explanation: `The full ${kind.toUpperCase()} order is ${order.join(' → ')}. ${kind === 'bfs' ? 'A queue serves the vertices in the order they were discovered.' : 'The call stack keeps following the first unvisited neighbour.'}`,
    op: { op: kind, a: start }
  };
};

const directionQuestion: Generator = (config, graph, n) => {
  const edge = pick(graph.edges, n);
  if (!edge) return undefined;
  const { from, to } = edge;
  const reverse = findEdge(config, graph, to, from) !== undefined;
  const op: OpRequest = { op: 'hasEdge', a: to, b: from };
  return {
    prompt: `The graph contains the edge ${from}${config.directed ? ' → ' : ' – '}${to}. What does ${opLabel(op)} return?`,
    correct: String(reverse), wrong: [String(!reverse)],
    hint: config.directed ? 'Ask yourself: does an arrow go from the second vertex to the first?' : 'Does an undirected edge have a “from” and a “to”?',
    explanation: config.directed
      ? reverse ? `${to} → ${from} also exists, so the answer is true.` : `Only ${from} → ${to} exists. Edges have a direction, so ${to} → ${from} is a different edge and the answer is false.`
      : `An undirected edge works both ways, so asking about ${to}–${from} gives the same answer as ${from}–${to}: true.`,
    op
  };
};

const sparseQuestion: Generator = config => ({
  prompt: `A ${config.kind.replace('-', ' ')} graph has 1,000 vertices but only about 3,000 edges. Which representation uses far less memory?`,
  correct: 'Adjacency list, O(V + E)', wrong: ['Adjacency matrix, O(V²)', 'They use the same memory', 'It depends on the edge weights'],
  hint: 'Compare 1,000 × 1,000 with 1,000 + 3,000.',
  explanation: 'The matrix needs a cell for every possible pair, about a million. The list stores only the edges that exist, around a few thousand entries.'
});

const lookupQuestion: Generator = () => ({
  prompt: 'Which representation can answer “is there an edge between u and v?” without searching?',
  correct: 'Adjacency matrix: read cell [u][v]', wrong: ['Adjacency list: read u’s list', 'Both need to search', 'Neither: this requires a traversal'],
  hint: 'Which structure lets you jump straight to the answer by index?',
  explanation: 'The matrix answers in O(1) by indexing. The list must walk u’s list, which costs O(degree).'
});

const generators: Generator[] = [matrixAfterAddEdge, neighborsQuestion, sizeAfterRemoveVertex, traversalQuestion, degreeQuestion, directionQuestion, lookupQuestion, sparseQuestion];

/** Deterministic question for a counter. Try generators in rotation until one fits the current graph. */
export function makeQuestion(config: GraphConfig, graph: GraphData, counter: number): Question {
  for (let i = 0; i < generators.length; i++) {
    const draft = generators[(counter + i) % generators.length](config, graph, counter);
    if (!draft) continue;
    const wrong = [...new Set(draft.wrong)].filter(text => text !== draft.correct).slice(0, 3);
    if (wrong.length < 1) continue;
    const texts = [...wrong];
    texts.splice(counter % (texts.length + 1), 0, draft.correct);
    const options = texts.map((text, index) => ({ id: `o${index}`, text }));
    const question: Question = {
      id: `q${counter}`, prompt: draft.prompt, options, correct: options.find(option => option.text === draft.correct)!.id,
      hint: draft.hint, explanation: draft.explanation
    };
    if (draft.op) question.op = draft.op;
    return question;
  }
  const fallback = lookupQuestion(config, graph, counter)!;
  const options = [fallback.correct, ...fallback.wrong].map((text, index) => ({ id: `o${index}`, text }));
  return { id: `q${counter}`, prompt: fallback.prompt, options, correct: 'o0', hint: fallback.hint, explanation: fallback.explanation };
}
