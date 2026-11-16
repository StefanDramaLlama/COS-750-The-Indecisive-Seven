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
  main.innerHTML = `<section class="builder-page"><p class="eyebrow">GRAPHWISE / GRAPH BUILDER</p><h1>Build a graph, then run it.</h1><p class="builder-intro">Place vertices on the grid, connect them, and see how each algorithm responds to your structure.</p><div class="builder-layout"><section id="builder-canvas-section" class="builder-canvas card" aria-labelledby="builder-canvas-title"><header><div><h2 id="builder-canvas-title">Your graph</h2><p>Drag a node to place it. Select two nodes to connect them. Select an edge to edit its weight. Ctrl + scroll or pinch to zoom; drag empty space to pan.</p></div><div class="builder-actions"><button id="builder-add" type="button">Add node</button><button id="builder-delete" type="button">Delete node</button><button id="builder-clear" type="button">Clear</button><div class="builder-zoom" role="group" aria-label="Grid zoom"><button id="builder-zoom-out" type="button" aria-label="Zoom out">−</button><button id="builder-zoom-value" class="builder-zoom-value" type="button" title="Reset zoom" aria-label="Reset zoom to 100%">100%</button><button id="builder-zoom-in" type="button" aria-label="Zoom in">+</button></div></div></header><div id="builder-grid" class="builder-grid"></div></section><aside id="builder-panel-section" class="builder-panel card" aria-labelledby="builder-settings-title"><h2 id="builder-settings-title">Run settings</h2><div class="builder-panel-body"><label class="builder-algorithm-field">Algorithm<span class="select-box"><select id="builder-algorithm">${algorithms.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></span></label><label class="builder-check"><input id="builder-directed" type="checkbox"> Directed edges</label><label class="builder-check"><input id="builder-weighted" type="checkbox"> Add edge weights</label><label id="builder-weight-label" class="builder-weight-field">Selected edge weight<input id="builder-weight" type="number" min="0" step="1" disabled></label><p id="builder-help" class="builder-help">Select two nodes to add an edge.</p><button id="builder-run" class="button primary" type="button">Run algorithm</button><div id="builder-error" class="builder-error" role="alert" hidden></div></div></aside></div><section id="builder-result" class="builder-result card" hidden aria-live="polite"></section></section>`;
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
  // The grid zooms by changing the SVG viewBox, so drawing stays sharp and pointer maths stays exact.
  const view = { width: 460, height: 250, cx: 230, cy: 125 };
  const minZoom = 0.5, maxZoom = 3, dragThreshold = 4;
  const viewBox = () => {
    const width = view.width / zoom, height = view.height / zoom;
    return `${view.cx - width / 2} ${view.cy - height / 2} ${width} ${height}`;
  };
  const toGraphPoint = (clientX: number, clientY: number) => {
    const svg = grid.querySelector('svg');
    const ctm = svg instanceof SVGSVGElement ? svg.getScreenCTM() : null;
    if (!svg || !ctm) return undefined;
    return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  };
  const help = main.querySelector<HTMLElement>('#builder-help')!;
  const updateHelp = () => {
    help.textContent = state.selected
      ? `${state.selected} is selected. Select another node to connect it, select ${state.selected} again to deselect, or delete it.`
      : state.selectedEdge && weighted.checked ? `Edge ${state.selectedEdge.replace('-', '–')} is selected. Set its weight above.`
      : 'Select two nodes to add an edge.';
  };
  const connect = (from: VertexId, to: VertexId) => {
    const id = directed.checked ? `${from}-${to}` : [from, to].sort().join('-');
    const exists = state.graph.edges.some(edge => edge.id === id || (!directed.checked && [edge.from, edge.to].sort().join('-') === id));
    if (!exists) state.graph.edges.push({ id, from, to, ...(weighted.checked ? { weight: 1 } : {}) });
  };
  const selectVertex = (id: VertexId) => {
    delete state.selectedEdge;
    if (!state.selected) state.selected = id;
    else if (state.selected === id) delete state.selected;
    else { connect(state.selected, id); delete state.selected; }
    render();
  };
  let frameRequest: number | undefined;
  const scheduleRender = () => {
    if (frameRequest !== undefined) return;
    frameRequest = requestAnimationFrame(() => { frameRequest = undefined; render(); });
  };

  const render = () => {
    const graph = createGraph(state.graph, state.positions);
    const frame = state.run?.frames[Math.min(frameIndex, state.run.frames.length - 1)];
    graph.update(frame ?? { index: 0, event: 'builder', lineId: null, title: 'Ready to run', change: '', reason: '', highlights: {}, state: { kind: 'dfs', stack: [], order: [] } });
    graph.picture.classList.add('builder-svg');
    graph.picture.setAttribute('viewBox', viewBox());
    grid.replaceChildren(graph.picture);
    grid.classList.toggle('has-selection', Boolean(state.selected));
    for (const vertex of state.graph.vertices) {
      const node = grid.querySelector<SVGGElement>(`[data-vertex="${vertex.id}"]`)!;
      node.classList.toggle('node-selected', state.selected === vertex.id);
      node.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        const startX = event.clientX, startY = event.clientY;
        let dragging = false;
        // Select on release unless the pointer moved far enough to count as a drag. Drags re-render the
        // SVG, which would otherwise swallow the browser's click event.
        const move = (moveEvent: PointerEvent) => {
          if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < dragThreshold) return;
          dragging = true;
          grid.classList.add('is-dragging');
          const cursor = toGraphPoint(moveEvent.clientX, moveEvent.clientY);
          if (!cursor) return;
          state.positions[vertex.id] = [Math.max(25, Math.min(435, cursor.x)), Math.max(25, Math.min(225, cursor.y))];
          scheduleRender();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          grid.classList.remove('is-dragging');
          if (!dragging) selectVertex(vertex.id);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }
    state.graph.edges.forEach(edge => {
      const edgeNode = grid.querySelector<SVGGElement>(`[data-edge="${edge.id}"]`);
      if (!edgeNode) return;
      edgeNode.classList.toggle('edge-selected', state.selectedEdge === edge.id);
      // A wide invisible copy of the line makes thin edges easy to click.
      const line = edgeNode.querySelector('.graph-edge');
      if (line) {
        const hit = line.cloneNode() as SVGPathElement;
        hit.setAttribute('class', 'edge-hit');
        hit.removeAttribute('marker-end');
        edgeNode.prepend(hit);
      }
      edgeNode.addEventListener('pointerdown', event => event.stopPropagation());
      edgeNode.addEventListener('click', event => {
        event.stopPropagation();
        delete state.selected;
        state.selectedEdge = edge.id;
        render();
        if (weighted.checked) weight.focus();
      });
    });
    weightLabel.hidden = !weighted.checked;
    weight.disabled = !weighted.checked || !state.selectedEdge;
    if (state.selectedEdge) weight.value = String(state.graph.edges.find(edge => edge.id === state.selectedEdge)?.weight ?? 1);
    (main.querySelector('#builder-delete')! as HTMLButtonElement).disabled = !state.selected;
    updateHelp();
  };

  // Empty grid: click to clear the selection, drag to pan when zoomed in.
  grid.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy };
    let panning = false;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x, dy = moveEvent.clientY - start.y;
      if (!panning && Math.hypot(dx, dy) < dragThreshold) return;
      panning = true;
      grid.classList.add('is-panning');
      const scale = (view.width / zoom) / grid.getBoundingClientRect().width;
      view.cx = Math.max(0, Math.min(view.width, start.cx - dx * scale));
      view.cy = Math.max(0, Math.min(view.height, start.cy - dy * scale));
      grid.querySelector('svg')?.setAttribute('viewBox', viewBox());
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      grid.classList.remove('is-panning');
      if (!panning && (state.selected || state.selectedEdge)) { delete state.selected; delete state.selectedEdge; render(); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  main.querySelector('#builder-add')!.addEventListener('click', () => { const id = String.fromCharCode(65 + state.graph.vertices.length); state.graph.vertices.push({ id, label: id }); state.positions[id] = [230, 125]; render(); });
  main.querySelector('#builder-delete')!.addEventListener('click', () => {
    if (!state.selected) return;
    state.graph.vertices = state.graph.vertices.filter(v => v.id !== state.selected);
    state.graph.edges = state.graph.edges.filter(edge => edge.from !== state.selected && edge.to !== state.selected);
    delete state.positions[state.selected];
    delete state.selected;
    render();
  });
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
    resetView();
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
    render();
  });
  const zoomValue = main.querySelector<HTMLButtonElement>('#builder-zoom-value')!;
  // Zoom keeps the graph point under `anchor` fixed on screen (the grid centre for the buttons).
  const setZoom = (value: number, anchor?: { x: number; y: number }) => {
    const next = Math.max(minZoom, Math.min(maxZoom, value));
    if (next === zoom) return;
    const before = anchor && toGraphPoint(anchor.x, anchor.y);
    zoom = next;
    const svg = grid.querySelector('svg');
    svg?.setAttribute('viewBox', viewBox());
    const after = anchor && toGraphPoint(anchor.x, anchor.y);
    if (before && after) {
      view.cx = Math.max(0, Math.min(view.width, view.cx + before.x - after.x));
      view.cy = Math.max(0, Math.min(view.height, view.cy + before.y - after.y));
      svg?.setAttribute('viewBox', viewBox());
    }
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    grid.classList.toggle('is-zoomed', zoom > 1);
  };
  const zoomStep = 1.2;
  main.querySelector('#builder-zoom-out')!.addEventListener('click', () => setZoom(zoom / zoomStep));
  main.querySelector('#builder-zoom-in')!.addEventListener('click', () => setZoom(zoom * zoomStep));
  function resetView() {
    zoom = 1;
    view.cx = view.width / 2;
    view.cy = view.height / 2;
    grid.querySelector('svg')?.setAttribute('viewBox', viewBox());
    zoomValue.textContent = '100%';
    grid.classList.remove('is-zoomed');
  }
  zoomValue.addEventListener('click', resetView);
  // Ctrl/⌘ + wheel, or a trackpad pinch (reported as ctrl + wheel), zooms smoothly toward the cursor.
  grid.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    setZoom(zoom * Math.exp(-Math.max(-60, Math.min(60, delta)) * 0.004), { x: event.clientX, y: event.clientY });
  }, { passive: false });
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
