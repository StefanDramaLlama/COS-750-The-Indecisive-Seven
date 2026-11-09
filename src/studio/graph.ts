import type { Graph, Positions, TraceFrame } from '../shared/contracts.ts';

let graphNumber = 0;
const namespace = 'http://www.w3.org/2000/svg';
const radius = 19;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, number | string> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createGraph(graph: Graph, positions: Positions) {
  const uid = `graph-${++graphNumber}`;
  const picture = svg('svg', { viewBox: '0 0 460 250', role: 'img', 'aria-labelledby': `${uid}-title ${uid}-desc` });
  const title = svg('title', { id: `${uid}-title` }, graph.directed ? 'Directed graph' : 'Undirected graph');
  const edgeSummary = graph.edges.map(edge =>
    `${edge.from}${graph.directed ? ' to ' : ' joined to '}${edge.to}${edge.weight === undefined ? '' : `, weight ${edge.weight}`}`
  ).join('; ');
  const description = svg('desc', { id: `${uid}-desc` });
  const graphSummary = `Vertices: ${graph.vertices.map(({ id, label }) => id === label ? id : `${id} (${label})`).join(', ')}. ${edgeSummary ? `Edges: ${edgeSummary}.` : 'No edges.'}`;
  description.textContent = graphSummary;
  picture.append(title, description);

  const definitions = svg('defs');
  for (const style of ['base', 'active', 'result']) {
    const marker = svg('marker', { id: `${uid}-${style}`, viewBox: '0 0 9 10', refX: 8, refY: 5, markerWidth: 9, markerHeight: 10, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(svg('path', { d: 'M 0 0 L 9 5 L 0 10 Z', class: style === 'base' ? 'arrow-tip' : `arrow-${style}` }));
    definitions.append(marker);
  }
  picture.append(definitions);

  const edges = new Map<string, { group: SVGGElement; path: SVGPathElement }>();
  const directedPairs = new Set(graph.edges.map(edge => `${edge.from}:${edge.to}`));
  for (const edge of graph.edges) {
    const [x1, y1] = positions[edge.from];
    const [x2, y2] = positions[edge.to];
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    const bend = graph.directed && directedPairs.has(`${edge.to}:${edge.from}`) ? 46 : 0;
    const mx = (x1 + x2) / 2 - dy * bend;
    const my = (y1 + y2) / 2 + dx * bend;
    const trim = (x: number, y: number, targetX: number, targetY: number, margin: number) => {
      const norm = Math.hypot(targetX - x, targetY - y) || 1;
      return [x + (targetX - x) / norm * margin, y + (targetY - y) / norm * margin].join(' ');
    };
    const from = trim(x1, y1, mx, my, radius);
    const to = trim(x2, y2, mx, my, graph.directed ? radius + 4 : radius);
    const group = svg('g', { 'data-edge': edge.id });
    const path = svg('path', { class: 'graph-edge', d: `M ${from} Q ${mx} ${my} ${to}` });
    if (graph.directed) path.setAttribute('marker-end', `url(#${uid}-base)`);
    group.append(path);
    if (edge.weight !== undefined) {
      group.append(svg('text', { x: (x1 + x2) / 2 - dy * (bend / 2 + 12), y: (y1 + y2) / 2 + dx * (bend / 2 + 12), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'edge-weight' }, String(edge.weight)));
    }
    picture.append(group);
    edges.set(edge.id, { group, path });
  }

  const nodes = new Map<string, SVGGElement>();
  for (const { id, label } of graph.vertices) {
    const [x, y] = positions[id];
    const group = svg('g', { transform: `translate(${x} ${y})`, 'data-vertex': id });
    group.append(svg('circle', { r: radius + 5, class: 'node-halo' }));
    group.append(svg('circle', { r: radius, class: 'node-disc' }));
    group.append(svg('text', { class: 'node-id', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, id));
    if (label !== id) group.append(svg('text', { y: radius + 19, class: 'node-label', 'text-anchor': 'middle' }, label));
    picture.append(group);
    nodes.set(id, group);
  }

  function update(frame: TraceFrame) {
    const { state, highlights } = frame;
    let known: string[] = [];
    let done: string[] = [];
    let knownEdges: string[] = [];
    let doneEdges = highlights.resultEdges ?? [];
    switch (state.kind) {
      case 'dijkstra':
      case 'bfs':
        known = Object.keys(state.distances).filter(id => state.distances[id] !== null);
        done = state.kind === 'dijkstra' ? state.settled : state.order;
        knownEdges = Object.values(state.predecessors).filter(id => id !== null);
        break;
      case 'dfs':
        known = state.stack.map(item => item.vertexId);
        done = state.order.filter(id => !known.includes(id));
        break;
      case 'topological-sort':
        known = state.ready;
        done = state.order;
        break;
      case 'kruskal':
        doneEdges = state.selected;
        break;
      case 'prim':
        known = state.frontier.length ? graph.edges.filter(edge => state.frontier.includes(edge.id)).map(edge => state.tree.includes(edge.from) ? edge.to : edge.from) : [];
        knownEdges = state.frontier;
        done = state.tree;
        doneEdges = state.selected;
        break;
    }
    for (const [id, node] of nodes) {
      const final = highlights.resultVertices?.includes(id) ?? false;
      node.classList.toggle('node-known', known.includes(id));
      node.classList.toggle('node-complete', final || done.includes(id));
      node.classList.toggle('node-result', final);
      node.classList.toggle('node-active', highlights.vertex === id);
    }
    for (const [id, { group, path }] of edges) {
      const active = highlights.edge === id;
      const result = doneEdges.includes(id);
      group.classList.toggle('edge-active', active);
      group.classList.toggle('edge-known', knownEdges.includes(id) && !active && !result && highlights.skipped !== id);
      group.classList.toggle('edge-result', result && !active);
      group.classList.toggle('edge-skipped', highlights.skipped === id);
      if (graph.directed) path.setAttribute('marker-end', `url(#${uid}-${active ? 'active' : result ? 'result' : 'base'})`);
    }
    description.textContent = `${graphSummary} ${frame.title}. ${frame.change}`;
  }
  return { picture, update };
}
