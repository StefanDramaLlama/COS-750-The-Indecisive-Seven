import type { Run } from '../shared/contracts.ts';
import { button, element, required } from './dom.ts';
import { createGraph } from './graph.ts';

export const comparisonPairs = [
  { id: 'compare', name: 'BFS vs. Dijkstra', topic: 'Shortest paths' },
  { id: 'compare-trees', name: 'Kruskal vs. Prim', topic: 'Minimum spanning trees' }
] as const;
export const comparisonsId = comparisonPairs[0].id;
export type ComparisonId = typeof comparisonPairs[number]['id'];
export const isComparison = (id: unknown): id is ComparisonId => comparisonPairs.some(pair => pair.id === id);

const cards = {
  compare: {
    names: ['BFS', 'Dijkstra'],
    legend: [['mark-known', 'Discovered or ready'], ['mark-result', 'Processed or selected']],
    tradeOff: 'BFS needs fewer lines of code and only a plain queue. Dijkstra adds a priority queue and distance updates. Result: with weights on, only Dijkstra’s route is sure to be the cheapest.',
    factors: 'Input patterns come first: different weights rule BFS out. When both are correct, programming time and maintainability favour BFS, and existing, tested code can tip the choice.'
  },
  'compare-trees': {
    names: ['Kruskal', 'Prim'],
    legend: [['mark-result', 'In the tree']],
    tradeOff: 'Kruskal sorts every link and needs a structure that tracks joined groups. Prim on a simple array needs no priority queue and no group tracking, so it is less code. Result: both trees always cost the same.',
    factors: 'Input patterns decide: a list of possible links suits Kruskal, and a graph where any site can link to any other suits Prim on an array. Existing code can tip the choice: with Dijkstra’s priority queue already written, Prim is a small change.'
  }
};

// LO5 comparison lessons: two algorithms side by side, drawn from the walkthrough run the page has already loaded.
export function createComparison(study: HTMLElement, lessonId: ComparisonId) {
  const setup = cards[lessonId];
  const trees = lessonId === 'compare-trees';
  const card = element('section', undefined, 'compare-card card');
  card.setAttribute('aria-labelledby', 'compare-title');
  card.hidden = true;
  card.innerHTML = `
    <div class="card-header">
      <div><h2 id="compare-title">Side by side</h2><p id="compare-caption"></p></div>
      <div class="primer-controls"></div>
    </div>
    <p class="compare-takeaway" aria-live="polite"></p>
    <div class="compare-graphs">
      ${setup.names.map(name => `<div><h3>${name}</h3><div class="graph-area"></div><p class="compare-route"></p><p></p></div>`).join('')}
    </div>
    <ul class="legend" aria-label="Side by side legend">
      ${setup.legend.map(([mark, text]) => `<li><i class="legend-mark ${mark}" aria-hidden="true"></i>${text}</li>`).join('')}
    </ul>
    <div class="compare-notes">
      <div class="state-item"><h3>Trade-off</h3><p>${setup.tradeOff}</p></div>
      <div class="state-item"><h3>Practical factors</h3><p>${setup.factors}</p></div>
    </div>`;
  study.before(card);
  const caption = required(card, '#compare-caption');
  const takeaway = required(card, '.compare-takeaway');
  const sides = Array.from(card.querySelectorAll<HTMLElement>('.compare-graphs > div'), side => {
    const [route, totals] = side.querySelectorAll('p');
    return { area: required(side, '.graph-area'), route, totals };
  });
  const on = button('Weights on', () => show(true));
  const off = button('Weights off', () => show(false));
  if (!trees) required(card, '.primer-controls').append(on, off);
  let weighted = true;
  let run: Run | undefined;

  // Left: the 'bfs' frame. Right: the 'dijkstra' frame, or the 'equal' frame when weights are off.
  // Spanning trees: the 'kruskal' frame on the left and the 'prim' frame on the right, each with its links and total cost.
  function draw() {
    if (!run) return;
    const { frames, graph, positions } = run;
    const displayed = weighted ? graph : { ...graph, edges: graph.edges.map(edge => ({ ...edge, weight: undefined })) };
    (trees ? ['kruskal', 'prim'] : ['bfs', weighted ? 'dijkstra' : 'equal']).forEach((lineId, index) => {
      const frame = frames.find(item => item.lineId === lineId)!;
      const edges = frame.highlights.resultEdges ?? [];
      const weight = weighted ? edges.reduce((sum, id) => sum + (graph.edges.find(edge => edge.id === id)?.weight ?? 0), 0) : edges.length;
      const route = trees
        ? edges.map(id => graph.edges.find(edge => edge.id === id)!).map(edge => `${edge.from}–${edge.to} (${edge.weight})`).join(', ')
        : (frame.highlights.resultVertices ?? []).join(' → ');
      const totals = trees ? `Total cost ${weight}` : `${edges.length} ${edges.length === 1 ? 'hop' : 'hops'} · total weight ${weight}`;
      const side = sides[index];
      side.route.textContent = route;
      side.totals.textContent = totals;
      const visual = createGraph(displayed, positions);
      visual.update({ ...frame, title: setup.names[index], change: `${route}. ${totals}.` });
      side.area.replaceChildren(visual.picture);
    });
  }

  function show(weights: boolean) {
    weighted = weights;
    on.setAttribute('aria-pressed', String(weights));
    off.setAttribute('aria-pressed', String(!weights));
    caption.textContent = trees ? 'The same graph, with its link costs' : weights ? 'The same graph, with its edge weights' : 'The same graph, with every edge counting as 1';
    takeaway.textContent = trees
      ? 'Both algorithms build a minimum spanning tree with the same total cost.'
      : weights
        ? 'BFS finds the route with the fewest hops. Dijkstra finds the route with the lowest total weight.'
        : 'When every edge counts as 1, the route with the fewest hops is also the cheapest route.';
    draw();
  }
  show(true);

  return {
    update(next?: Run) {
      card.hidden = !next;
      if (!next || next === run) return;
      run = next;
      draw();
    }
  };
}
