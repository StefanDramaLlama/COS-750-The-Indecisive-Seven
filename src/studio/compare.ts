import type { Run } from '../shared/contracts.ts';
import { button, element, required } from './dom.ts';
import { createGraph } from './graph.ts';

// LO5 compare lesson: BFS and Dijkstra side by side, drawn from the walkthrough run the page has already loaded.
export function createComparison(column: HTMLElement) {
  const card = element('section', undefined, 'compare-card card');
  card.setAttribute('aria-labelledby', 'compare-title');
  card.hidden = true;
  card.innerHTML = `
    <div class="card-header">
      <div><h2 id="compare-title">Side by side</h2><p id="compare-caption"></p></div>
      <div class="primer-controls"></div>
    </div>
    <div class="compare-graphs">
      <div><h3>BFS</h3><div class="graph-area"></div><p class="compare-route"></p><p></p></div>
      <div><h3>Dijkstra</h3><div class="graph-area"></div><p class="compare-route"></p><p></p></div>
    </div>
    <ul class="legend" aria-label="Side by side legend">
      <li><i class="legend-mark mark-known" aria-hidden="true"></i>Discovered or ready</li>
      <li><i class="legend-mark mark-result" aria-hidden="true"></i>Processed or selected</li>
    </ul>
    <div class="compare-notes">
      <div class="state-item"><h3>Trade-off</h3><p>BFS needs fewer lines of code and only a plain queue. Dijkstra adds a priority queue and distance updates. Result: with weights on, only Dijkstra’s route is sure to be the cheapest.</p></div>
      <div class="state-item"><h3>Practical factors</h3><p>Input patterns come first: different weights rule BFS out. When both are correct, programming time and maintainability favour BFS, and existing, tested code can tip the choice.</p></div>
    </div>`;
  column.append(card);
  const caption = required(card, '#compare-caption');
  const sides = Array.from(card.querySelectorAll<HTMLElement>('.compare-graphs > div'), side => {
    const [route, totals] = side.querySelectorAll('p');
    return { area: required(side, '.graph-area'), route, totals };
  });
  const on = button('Weights on', () => show(true));
  const off = button('Weights off', () => show(false));
  required(card, '.primer-controls').append(on, off);
  let weighted = true;
  let run: Run | undefined;
  let graphs: ReturnType<typeof createGraph>[] = [];

  // Left: the 'bfs' frame. Right: the 'dijkstra' frame, or the 'equal' frame when weights are off.
  function draw() {
    if (!run) return;
    const { frames, graph } = run;
    ['bfs', weighted ? 'dijkstra' : 'equal'].forEach((lineId, index) => {
      const frame = frames.find(item => item.lineId === lineId)!;
      const edges = frame.highlights.resultEdges ?? [];
      const weight = weighted ? edges.reduce((sum, id) => sum + (graph.edges.find(edge => edge.id === id)?.weight ?? 0), 0) : edges.length;
      graphs[index].update(frame);
      sides[index].route.textContent = (frame.highlights.resultVertices ?? []).join(' → ');
      sides[index].totals.textContent = `${edges.length} ${edges.length === 1 ? 'hop' : 'hops'} · total weight ${weight}`;
    });
  }

  function show(weights: boolean) {
    weighted = weights;
    on.setAttribute('aria-pressed', String(weights));
    off.setAttribute('aria-pressed', String(!weights));
    card.classList.toggle('compare-unweighted', !weights);
    caption.textContent = weights ? 'The same graph, with its edge weights' : 'The same graph, with every edge counting as 1';
    draw();
  }
  show(true);

  return {
    // Shows the card from the 'weights' step onwards and draws both graphs once per loaded run.
    update(walkthrough?: { index: number; run?: Run }) {
      const next = walkthrough?.run;
      const start = next ? next.frames.findIndex(frame => frame.lineId === 'weights') : -1;
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
