import type { Run } from '../shared/contracts.ts';
import { button, element, required } from './dom.ts';
import { createGraph } from './graph.ts';

// Each LO5 comparison lesson: its two algorithms, the step the card appears from, its legend and its notes.
const cards = {
  compare: {
    names: ['BFS', 'Dijkstra'], from: 'weights',
    legend: [['mark-known', 'Discovered or ready'], ['mark-result', 'Processed or selected']],
    tradeOff: 'BFS needs fewer lines of code and only a plain queue. Dijkstra adds a priority queue and distance updates. Result: with weights on, only Dijkstra’s route is sure to be the cheapest.',
    factors: 'Input patterns come first: different weights rule BFS out. When both are correct, programming time and maintainability favour BFS, and existing, tested code can tip the choice.'
  },
  'compare-trees': {
    names: ['Kruskal', 'Prim'], from: 'same',
    legend: [['mark-result', 'In the tree']],
    tradeOff: 'Kruskal sorts every link and needs a structure that tracks joined groups. Prim on a simple array needs no priority queue and no group tracking, so it is less code. Result: both trees always cost the same.',
    factors: 'Input patterns decide: a list of possible links suits Kruskal, and a graph where any site can link to any other suits Prim on an array. Existing code can tip the choice: with Dijkstra’s priority queue already written, Prim is a small change.'
  }
};

// LO5 comparison lessons: two algorithms side by side, drawn from the walkthrough run the page has already loaded.
export function createComparison(column: HTMLElement, lessonId: keyof typeof cards) {
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
  required(column, '#state-panel').before(card);
  const caption = required(card, '#compare-caption');
  const sides = Array.from(card.querySelectorAll<HTMLElement>('.compare-graphs > div'), side => {
    const [route, totals] = side.querySelectorAll('p');
    return { area: required(side, '.graph-area'), route, totals };
  });
  const on = button('Weights on', () => show(true));
  const off = button('Weights off', () => show(false));
  if (!trees) required(card, '.primer-controls').append(on, off);
  let weighted = true;
  let run: Run | undefined;
  let graphs: ReturnType<typeof createGraph>[] = [];

  // Left: the 'bfs' frame. Right: the 'dijkstra' frame, or the 'equal' frame when weights are off.
  // Spanning trees: the 'kruskal' frame on the left and the 'prim' frame on the right, each with its links and total cost.
  function draw() {
    if (!run) return;
    const { frames, graph } = run;
    (trees ? ['kruskal', 'prim'] : ['bfs', weighted ? 'dijkstra' : 'equal']).forEach((lineId, index) => {
      const frame = frames.find(item => item.lineId === lineId)!;
      const edges = frame.highlights.resultEdges ?? [];
      const weight = weighted ? edges.reduce((sum, id) => sum + (graph.edges.find(edge => edge.id === id)?.weight ?? 0), 0) : edges.length;
      graphs[index].update(frame);
      sides[index].route.textContent = trees
        ? edges.map(id => graph.edges.find(edge => edge.id === id)!).map(edge => `${edge.from}–${edge.to} (${edge.weight})`).join(', ')
        : (frame.highlights.resultVertices ?? []).join(' → ');
      sides[index].totals.textContent = trees ? `Total cost ${weight}` : `${edges.length} ${edges.length === 1 ? 'hop' : 'hops'} · total weight ${weight}`;
    });
  }

  function show(weights: boolean) {
    weighted = weights;
    on.setAttribute('aria-pressed', String(weights));
    off.setAttribute('aria-pressed', String(!weights));
    card.classList.toggle('compare-unweighted', !weights);
    caption.textContent = trees ? 'The same graph, with its link costs' : weights ? 'The same graph, with its edge weights' : 'The same graph, with every edge counting as 1';
    draw();
  }
  show(true);

  return {
    // Shows the card from the lesson's starting step onwards and draws both graphs once per loaded run.
    update(walkthrough?: { index: number; run?: Run }) {
      const next = walkthrough?.run;
      const start = next ? next.frames.findIndex(frame => frame.lineId === setup.from) : -1;
      card.hidden = !walkthrough || start < 0 || walkthrough.index < start;
      if (!next || card.hidden || next === run) return;
      run = next;
      graphs = sides.map(side => {
        const picture = createGraph(next.graph, next.positions);
        side.area.replaceChildren(picture.picture);
        return picture;
      });
      draw();
    }
  };
}
