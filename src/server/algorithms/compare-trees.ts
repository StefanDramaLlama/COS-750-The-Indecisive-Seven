// LO5, factors beyond computational efficiency: run Kruskal and Prim on the
// same graph, show that both trees cost the same, and explain what decides between them
import type { Example, Highlights, TraceFrame, WorkingState } from '../../shared/contracts.ts';
import { edgeLabel, GraphInputError } from './graph.ts';
import { kruskal, prim } from './spanning.ts';

export function compareTrees(example: Example) {
  const frames: TraceFrame[] = [];
  const emit = (lineId: string | null, state: WorkingState, title: string, change: string, reason: string, highlights: Highlights = {}) => {
    frames.push({ index: frames.length, event: lineId ?? 'open', lineId, title, change, reason, highlights: structuredClone(highlights), state: structuredClone(state) });
  };
  const sortRun = kruskal(example);
  const growRun = prim(example);
  const sorted = sortRun.result, grown = growRun.result;
  if (sorted.kind !== 'tree' || grown.kind !== 'tree') throw new GraphInputError('Connect every site so that both algorithms can build a spanning tree.');

  const sites = example.graph.vertices.map(vertex => vertex.id);
  const edges = new Map(example.graph.edges.map(edge => [edge.id, edge]));
  const links = (ids: string[]) => ids.map(id => edgeLabel(edges.get(id)!)).join(', ');
  const sortEnd = sortRun.frames.at(-1)!.state;
  const sortTree = { resultVertices: sites, resultEdges: sorted.edges };

  emit(null, sortRun.frames[0].state, 'Two ways to build a spanning tree', `Connect all ${sites.length} sites. Prim starts from ${example.startId}.`,
    'Kruskal and Prim both build a minimum spanning tree, but they pick the links in a different order.');
  emit('kruskal', sortEnd, `Kruskal: total cost ${sorted.weight}`, `It picked ${links(sorted.edges)}, cheapest first.`,
    'Kruskal sorts the whole list of links by cost and skips any link that would close a loop.', sortTree);
  emit('prim', growRun.frames.at(-1)!.state, `Prim: total cost ${grown.weight}`, `From ${example.startId}, it picked ${links(grown.edges)}.`,
    'Prim grows one tree from the start, always adding the cheapest link that reaches a new site.', { resultVertices: sites, resultEdges: grown.edges });
  emit('same', sortEnd, 'Both trees cost the same', `Kruskal’s tree costs ${sorted.weight}; Prim’s costs ${grown.weight}.`,
    'Both always return a minimum spanning tree. When two links cost the same the trees can differ, but the total cannot.', sortTree);
  emit('factors', sortEnd, 'The input and the code decide', 'A list of links suits Kruskal. When any site can link to any other, Prim on an array is less code.',
    'Kruskal sorts the list and skips links that close a loop. Prim on a simple array needs no priority queue and no structure for tracking joined groups, and with Dijkstra’s priority queue already written, Prim is a small change.', sortTree);
  emit('finish', sortEnd, 'Same cost? Choose the better fit',
    'Choose Kruskal for a list of links. Choose Prim when any site can link to any other, or when Dijkstra’s code already exists.',
    'Both trees are correct and cost the same, so the input format, programming time and existing code decide.', sortTree);
  return { frames, result: sorted };
}
