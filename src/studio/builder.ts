import type { Graph, LessonId, Positions, Run, VertexId } from '../shared/contracts.ts';
import { button, element, enhanceSelect } from './dom.ts';
import { createGraph } from './graph.ts';
import { createSpatialGraph } from './spatial.ts';
import { renderState } from './state.ts';

const algorithms: { id: LessonId; name: string }[] = [
  { id: 'dijkstra', name: 'Dijkstra' }, { id: 'bfs', name: 'Breadth-first search' },
  { id: 'dfs', name: 'Depth-first search' }, { id: 'topological-sort', name: 'Topological sort' },
  { id: 'kruskal', name: 'Kruskal' }, { id: 'prim', name: 'Prim' }
];

type BuilderState = { graph: Graph; positions: Positions; selected?: VertexId; selectedEdge?: string; run?: Run };
const initial: BuilderState = {
  graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }], edges: [{ id: 'A-B', from: 'A', to: 'B' }, { id: 'B-C', from: 'B', to: 'C' }] },
  positions: { A: [100, 110], B: [230, 58], C: [360, 110] }
};

export function mountBuilder(main: HTMLElement, runCustom: (payload: Record<string, unknown>) => Promise<Run>) {
  const state: BuilderState = structuredClone(initial);
  let zoom = 1;
  main.innerHTML = `<section class="builder-page"><p class="eyebrow">GRAPHWISE / GRAPH BUILDER</p><h1>Build a graph, then run it.</h1><p class="builder-intro">Place vertices on the grid, connect them, and see how each algorithm responds to your structure.</p><div class="builder-layout"><section id="builder-canvas-section" class="builder-canvas card" aria-labelledby="builder-canvas-title"><header><div><h2 id="builder-canvas-title">Your graph</h2><p>Drag a node to place it. Select two nodes to connect them. Select an edge to edit its weight.</p></div><div class="builder-actions"><button id="builder-add" type="button">Add node</button><button id="builder-clear" type="button">Clear</button><div class="builder-zoom" role="group" aria-label="Grid zoom"><button id="builder-zoom-out" type="button" aria-label="Zoom out">−</button><output id="builder-zoom-value">100%</output><button id="builder-zoom-in" type="button" aria-label="Zoom in">+</button></div></div></header><div id="builder-grid" class="builder-grid"></div></section><aside id="builder-panel-section" class="builder-panel card" aria-labelledby="builder-settings-title"><h2 id="builder-settings-title">Run settings</h2><div class="builder-panel-body"><label class="builder-algorithm-field">Algorithm<span class="select-box"><select id="builder-algorithm">${algorithms.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></span></label><label class="builder-check"><input id="builder-directed" type="checkbox"> Directed edges</label><label class="builder-check"><input id="builder-weighted" type="checkbox"> Add edge weights</label><label id="builder-weight-label" class="builder-weight-field">Selected edge weight<input id="builder-weight" type="number" min="0" step="1" disabled></label><p id="builder-help" class="builder-help">Select two nodes to add an edge.</p><button id="builder-run" class="button primary" type="button">Run algorithm</button><div id="builder-error" class="builder-error" role="alert" hidden></div></div></aside></div><section id="builder-result" class="builder-result card" hidden aria-live="polite"></section></section>`;
  const grid = main.querySelector<HTMLElement>('#builder-grid')!;
  const error = main.querySelector<HTMLElement>('#builder-error')!;
  const result = main.querySelector<HTMLElement>('#builder-result')!;
  const algorithm = main.querySelector<HTMLSelectElement>('#builder-algorithm')!;
  enhanceSelect(algorithm);
  const directed = main.querySelector<HTMLInputElement>('#builder-directed')!;
  const weighted = main.querySelector<HTMLInputElement>('#builder-weighted')!;
  const weight = main.querySelector<HTMLInputElement>('#builder-weight')!;
  const weightLabel = main.querySelector<HTMLElement>('#builder-weight-label')!;
  const addCollapse = (host: HTMLElement, label: string) => {
    if (host.querySelector(':scope > .mobile-collapse')) return;
    host.classList.add('mobile-section');
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'mobile-collapse';
    const update = () => {
      const collapsed = host.classList.contains('mobile-collapsed');
      control.textContent = collapsed ? `Show ${label}` : `Hide ${label}`;
      control.setAttribute('aria-expanded', String(!collapsed));
    };
    control.addEventListener('click', () => { host.classList.toggle('mobile-collapsed'); update(); });
    host.prepend(control);
    update();
  };
  addCollapse(main.querySelector<HTMLElement>('#builder-canvas-section')!, 'graph builder');
  addCollapse(main.querySelector<HTMLElement>('#builder-panel-section')!, 'run settings');
  let spatial: ReturnType<typeof createSpatialGraph> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let playing = false;
  let speed = 1;
  let frameIndex = 0;

  const pause = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    playing = false;
  };
  const render = () => {
    const graph = createGraph(state.graph, state.positions);
    const frame = state.run?.frames[Math.min(frameIndex, state.run.frames.length - 1)];
    graph.update(frame ?? { index: 0, event: 'builder', lineId: null, title: 'Ready to run', change: '', reason: '', highlights: {}, state: { kind: 'dfs', stack: [], order: [] } });
    grid.replaceChildren(graph.picture);
    graph.picture.classList.add('builder-svg');
    graph.picture.style.transform = `scale(${zoom})`;
    graph.picture.style.transformOrigin = 'center center';
    for (const vertex of state.graph.vertices) {
      const node = grid.querySelector<SVGGElement>(`[data-vertex="${vertex.id}"]`)!;
      node.addEventListener('pointerdown', event => {
        event.stopPropagation();
        const move = (moveEvent: PointerEvent) => {
          const svg = grid.querySelector('svg');
          if (!(svg instanceof SVGSVGElement)) return;
          const point = svg.createSVGPoint();
          point.x = moveEvent.clientX;
          point.y = moveEvent.clientY;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;
          const cursor = point.matrixTransform(ctm.inverse());
          state.positions[vertex.id] = [Math.max(25, Math.min(435, cursor.x)), Math.max(25, Math.min(225, cursor.y))];
          render();
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      node.addEventListener('click', () => {
        if (!state.selected) { state.selected = vertex.id; return; }
        if (state.selected !== vertex.id) {
          const from = state.selected; const to = vertex.id; const pair = directed.checked ? `${from}-${to}` : [from, to].sort().join('-');
          if (!state.graph.edges.some(edge => edge.id === pair || (!directed.checked && edge.id === [to, from].sort().join('-')))) state.graph.edges.push({ id: pair, from, to, ...(weighted.checked ? { weight: 1 } : {}) });
        }
        state.selected = undefined; render();
      });
    }
    state.graph.edges.forEach(edge => {
      const edgeNode = grid.querySelector<SVGGElement>(`[data-edge="${edge.id}"]`);
      edgeNode?.addEventListener('click', event => { event.stopPropagation(); state.selectedEdge = edge.id; weight.value = String(edge.weight ?? 1); weight.disabled = !weighted.checked; weightLabel.hidden = !weighted.checked; });
    });
    weightLabel.hidden = !weighted.checked;
    weight.disabled = !weighted.checked || !state.selectedEdge;
    if (state.selectedEdge) weight.value = String(state.graph.edges.find(edge => edge.id === state.selectedEdge)?.weight ?? 1);
  };
  main.querySelector('#builder-add')!.addEventListener('click', () => { const id = String.fromCharCode(65 + state.graph.vertices.length); state.graph.vertices.push({ id, label: id }); state.positions[id] = [230, 125]; render(); });
  main.querySelector('#builder-clear')!.addEventListener('click', () => {
    pause();
    spatial?.dispose();
    spatial = undefined;
    const fresh = structuredClone(initial);
    state.graph = fresh.graph;
    state.positions = fresh.positions;
    delete state.selected;
    delete state.selectedEdge;
    delete state.run;
    frameIndex = 0;
    playing = false;
    speed = 1;
    zoom = 1;
    algorithm.value = algorithms[0].id;
    enhanceSelect(algorithm).refresh();
    directed.checked = false;
    weighted.checked = false;
    weight.value = '';
    weight.disabled = true;
    weightLabel.hidden = true;
    error.hidden = true;
    error.textContent = '';
    result.hidden = true;
    result.replaceChildren();
    main.querySelector<HTMLOutputElement>('#builder-zoom-value')!.value = '100%';
    render();
  });
  const setZoom = (value: number) => { zoom = Math.max(0.7, Math.min(2, value)); main.querySelector<HTMLOutputElement>('#builder-zoom-value')!.value = `${Math.round(zoom * 100)}%`; render(); };
  main.querySelector('#builder-zoom-out')!.addEventListener('click', () => setZoom(zoom - 0.1));
  main.querySelector('#builder-zoom-in')!.addEventListener('click', () => setZoom(zoom + 0.1));
  grid.addEventListener('wheel', event => { if (!event.ctrlKey) return; event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  directed.addEventListener('change', () => { state.graph.directed = directed.checked; render(); });
  weighted.addEventListener('change', () => { state.graph.edges = state.graph.edges.map(edge => weighted.checked ? { ...edge, weight: edge.weight ?? 1 } : (({ weight: _weight, ...unweighted }) => unweighted)(edge)); render(); });
  weight.addEventListener('input', () => { const edge = state.graph.edges.find(item => item.id === state.selectedEdge); const value = Number(weight.value); if (edge && Number.isInteger(value) && value >= 0) { edge.weight = value; render(); } });
  main.querySelector('#builder-run')!.addEventListener('click', async () => {
    error.hidden = true;
    pause();
    try {
      const startId = state.graph.vertices[0]?.id;
      const goalId = state.graph.vertices.at(-1)?.id;
      state.run = await runCustom({ lessonId: algorithm.value, graph: state.graph, positions: state.positions, startId, goalId });
      result.hidden = false;
      spatial?.dispose();
      frameIndex = 0;
      playing = false;
      result.innerHTML = `
        <h2>Run complete</h2>
        <p>${state.run.frames.at(-1)?.change ?? 'The algorithm finished.'}</p>
        <section id="builder-spatial-section" class="builder-spatial-section">
          <h3>Spatial view</h3>
          <div class="builder-spatial"></div>
          <div class="spatial-controls" role="group" aria-label="3D playback controls">
            <button id="builder-spatial-restart" type="button" aria-label="Restart"><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10V4m0 0h6M4 4l4 4a8 8 0 1 1-1 10" /></svg><span class="button-label">Restart</span></button>
            <button id="builder-spatial-back" type="button" aria-label="Back"><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg><span class="button-label">Back</span></button>
            <button id="builder-spatial-play" type="button" aria-label="Play"><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg><span id="builder-spatial-play-label" class="button-label">Play</span></button>
            <button id="builder-spatial-next" type="button" class="primary" aria-label="Next step"><span class="button-label">Next step</span><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg></button>
            <label class="select-box"><span class="sr-only">Playback speed</span>
              <select id="builder-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
            </label>
            <label class="spatial-toggle"><input id="builder-spatial-focus" type="checkbox" checked><span class="focus-label-full">Focus active node</span><span class="focus-label-short">Focus</span></label>
          </div>
        </section>
        <section id="builder-state-wrap" class="card builder-state-wrap">
          <div id="builder-state-panel" class="state-panel" aria-label="Algorithm working state"></div>
        </section>`;
      const spatialHost = result.querySelector<HTMLElement>('.builder-spatial')!;
      const statePanel = result.querySelector<HTMLElement>('#builder-state-panel')!;
      const stateWrap = result.querySelector<HTMLElement>('#builder-state-wrap')!;
      const spatialSection = result.querySelector<HTMLElement>('#builder-spatial-section')!;
      spatial = createSpatialGraph(spatialHost, state.run.graph, state.run.positions);
      spatial.setTotal(state.run.frames.length);
      const restart = result.querySelector<HTMLButtonElement>('#builder-spatial-restart')!;
      const back = result.querySelector<HTMLButtonElement>('#builder-spatial-back')!;
      const play = result.querySelector<HTMLButtonElement>('#builder-spatial-play')!;
      const next = result.querySelector<HTMLButtonElement>('#builder-spatial-next')!;
      const playLabel = result.querySelector<HTMLElement>('#builder-spatial-play-label')!;
      const playIcon = play.querySelector('path')!;
      const speedSelect = result.querySelector<HTMLSelectElement>('#builder-speed')!;
      const focus = result.querySelector<HTMLInputElement>('#builder-spatial-focus')!;
      enhanceSelect(speedSelect);
      try { focus.checked = localStorage.getItem('graphwise-spatial-focus') !== 'false'; } catch { focus.checked = true; }
      spatial.setFocusEnabled(focus.checked);
      focus.addEventListener('change', () => {
        spatial?.setFocusEnabled(focus.checked);
        try { localStorage.setItem('graphwise-spatial-focus', String(focus.checked)); } catch { /* The current setting still applies. */ }
      });
      speedSelect.value = String(speed);
      speedSelect.addEventListener('change', () => { speed = Number(speedSelect.value); });
      const updateControls = () => {
        const total = state.run?.frames.length ?? 0;
        restart.disabled = !total;
        back.disabled = !total || frameIndex === 0;
        next.disabled = !total || frameIndex >= total - 1;
        play.disabled = !total || frameIndex >= total - 1;
        play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        play.setAttribute('aria-pressed', String(playing));
        playLabel.textContent = playing ? 'Pause' : 'Play';
        playIcon.setAttribute('d', playing ? 'M7 5v14m10-14v14' : 'm8 5 11 7-11 7z');
      };
      const renderFrame = () => {
        if (!state.run || !spatial) return;
        const frame = state.run.frames[frameIndex];
        spatial.update(frame);
        renderState(statePanel, state.run.graph, frame.state);
        render();
        updateControls();
      };
      const schedule = () => {
        if (timer !== undefined) clearTimeout(timer);
        if (!playing || !state.run) return;
        timer = setTimeout(() => {
          if (!state.run) { pause(); updateControls(); return; }
          if (frameIndex >= state.run.frames.length - 1) { pause(); updateControls(); return; }
          frameIndex++;
          if (frameIndex >= state.run.frames.length - 1) pause();
          renderFrame();
          if (playing) schedule();
        }, 1000 / speed);
      };
      const move = (delta: number) => {
        if (!state.run) return;
        pause();
        frameIndex = Math.max(0, Math.min(frameIndex + delta, state.run.frames.length - 1));
        renderFrame();
      };
      restart.addEventListener('click', () => { if (!state.run) return; pause(); frameIndex = 0; renderFrame(); });
      back.addEventListener('click', () => move(-1));
      next.addEventListener('click', () => move(1));
      play.addEventListener('click', () => {
        if (playing) { pause(); updateControls(); return; }
        playing = true; updateControls(); schedule();
      });
      renderFrame();
      render();

      const addCollapse = (host: HTMLElement, label: string) => {
        if (host.querySelector(':scope > .mobile-collapse')) return;
        host.classList.add('mobile-section');
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'mobile-collapse';
        const update = () => {
          const collapsed = host.classList.contains('mobile-collapsed');
          control.textContent = collapsed ? `Show ${label}` : `Hide ${label}`;
          control.setAttribute('aria-expanded', String(!collapsed));
        };
        control.addEventListener('click', () => { host.classList.toggle('mobile-collapsed'); update(); });
        host.prepend(control);
        update();
      };
      addCollapse(result, 'run results');
      addCollapse(spatialSection, '3D graph');
      addCollapse(stateWrap, 'working state');

      const test = document.createElement('section');
      test.className = 'builder-test';
      const finalState = state.run.frames.at(-1)?.state;
      if (finalState && (finalState.kind === 'dijkstra' || finalState.kind === 'bfs')) {
        const edges = new Map(state.run.graph.edges.map(edge => [edge.id, edge]));
        const predecessorOf = (id: string, edgeId: string | null) => {
          const edge = edgeId ? edges.get(edgeId) : undefined;
          return edge ? edge.to === id ? edge.from : edge.to : '—';
        };
        const expected = state.run.graph.vertices.map(({ id }) => ({
          id,
          distance: finalState.distances[id] ?? '∞',
          predecessor: predecessorOf(id, finalState.predecessors[id])
        }));
        const valueLabel = finalState.kind === 'dijkstra' ? 'Distance' : 'Hops';
        test.innerHTML = `<h3>Test yourself</h3><p>Fill in the final ${valueLabel.toLowerCase()} table, then press Enter or Mark answers.</p><table class="state-table builder-test-table"><thead><tr><th scope="col">Vertex</th><th scope="col">${valueLabel}</th><th scope="col">Predecessor</th><th scope="col">Result</th></tr></thead><tbody>${expected.map(row => `<tr data-vertex="${row.id}"><th scope="row">${row.id}</th><td><input class="builder-test-input" data-field="distance" inputmode="text" aria-label="${valueLabel} for ${row.id}"></td><td><input class="builder-test-input" data-field="predecessor" inputmode="text" aria-label="Predecessor for ${row.id}"></td><td class="builder-test-mark" aria-live="polite"></td></tr>`).join('')}</tbody></table><div class="builder-test-actions"><button type="button" id="builder-test-mark" class="button primary">Mark answers</button><span id="builder-test-score" class="step-count"></span></div>`;
        const normDist = (value: string | number) => {
          if (value === '∞') return 'inf';
          const s = String(value).trim().toLowerCase();
          return s === '∞' || s === 'infinity' || s === 'inf' ? 'inf' : s;
        };
        const normPred = (value: string) => {
          const v = value.trim();
          if (!v || v === '�' || v === '-' || v.toLowerCase() === 'none' || v.toLowerCase() === 'null') return '�';
          return v;
        };
        const mark = () => {
          let correct = 0;
          expected.forEach(row => {
            const tr = test.querySelector<HTMLTableRowElement>(`tr[data-vertex="${row.id}"]`)!;
            const distInput = tr.querySelector<HTMLInputElement>('input[data-field="distance"]')!;
            const predInput = tr.querySelector<HTMLInputElement>('input[data-field="predecessor"]')!;
            const markCell = tr.querySelector<HTMLElement>('.builder-test-mark')!;
            const distOk = normDist(distInput.value) === normDist(row.distance);
            const predOk = normPred(predInput.value) === normPred(row.predecessor);
            distInput.classList.toggle('correct', distOk);
            distInput.classList.toggle('incorrect', !distOk);
            predInput.classList.toggle('correct', predOk);
            predInput.classList.toggle('incorrect', !predOk);
            const ok = distOk && predOk;
            if (ok) correct++;
            markCell.textContent = ok ? 'Correct' : `${row.distance}, ${row.predecessor}`;
            markCell.className = `builder-test-mark ${ok ? 'correct' : 'incorrect'}`;
          });
          test.querySelector<HTMLElement>('#builder-test-score')!.textContent = `${correct} / ${expected.length} correct`;
        };
        test.querySelector('#builder-test-mark')!.addEventListener('click', mark);
        test.querySelectorAll<HTMLInputElement>('.builder-test-input').forEach(input => {
          input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); mark(); } });
        });
      } else {
        test.innerHTML = `<h3>Test yourself</h3><p>Distance-table practice is available for Dijkstra and Breadth-first search runs.</p>`;
      }
      result.append(test);
      addCollapse(test, 'test yourself');
    } catch (caught) { error.hidden = false; error.textContent = caught instanceof Error ? caught.message : 'This graph could not be run.'; }
  });
  render();
}
