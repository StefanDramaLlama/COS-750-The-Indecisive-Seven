import type { Graph, WorkingState } from '../shared/contracts.ts';
import { element } from './dom.ts';

function chips(title: string, values: (string | number)[], empty = 'Empty'): HTMLElement {
  const section = element('section', undefined, 'state-item');
  section.append(element('h3', title));
  const list = element('div', undefined, 'chips');
  if (!values.length) list.append(element('span', empty, 'empty-state'));
  for (const value of values) list.append(element('span', String(value), 'chip'));
  section.append(list);
  return section;
}

function table(label: string, headings: string[], rows: (string | number)[][]): HTMLElement {
  const result = element('table', undefined, 'state-table');
  result.setAttribute('aria-label', label);
  const header = result.createTHead().insertRow();
  for (const heading of headings) {
    const cell = element('th', heading);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = result.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    const name = element('th', String(row[0]));
    name.scope = 'row';
    tr.append(name);
    for (const value of row.slice(1)) tr.insertCell().textContent = String(value);
  }
  return result;
}

export function renderState(host: HTMLElement, graph: Graph, state: WorkingState) {
  const ids = graph.vertices.map(({ id }) => id);
  const labels = new Map(graph.vertices.map(vertex => [vertex.id, vertex.label]));
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
  const edgeName = (id: string) => {
    const edge = edges.get(id)!;
    return `${edge.from}–${edge.to}${edge.weight === undefined ? '' : ` (${edge.weight})`}`;
  };
  const predecessor = (id: string, edgeId: string | null) => {
    const edge = edgeId ? edges.get(edgeId) : undefined;
    return edge ? edge.to === id ? edge.from : edge.to : '—';
  };
  const heading = element('h2');
  const grid = element('div', undefined, 'state-grid');
  const tables: HTMLElement[] = [];
  switch (state.kind) {
    case 'dijkstra':
    case 'bfs': {
      const done = state.kind === 'dijkstra' ? state.settled : state.order;
      heading.textContent = state.kind === 'dijkstra' ? 'Distance estimates' : 'Queue and hop counts';
      if (state.kind === 'bfs') grid.append(chips('Queue · front first', state.queue));
      grid.append(chips(state.kind === 'dijkstra' ? 'Settled order' : 'Visit order', done, 'None yet'));
      tables.push(table(heading.textContent, ['Vertex', state.kind === 'dijkstra' ? 'Distance' : 'Hops', 'Predecessor', 'Status'],
        ids.map(id => [id, state.distances[id] ?? '∞', predecessor(id, state.predecessors[id]),
          done.includes(id) ? state.kind === 'dijkstra' ? 'Settled' : 'Visited' : state.distances[id] === null ? 'Unreached' : 'Discovered'])));
      break;
    }
    case 'dfs':
      heading.textContent = 'Call stack and discovery';
      grid.append(chips('Stack · top last', state.stack.map(frame => frame.vertexId)), chips('Discovery order', state.order, 'None yet'));
      break;
    case 'topological-sort':
      heading.textContent = 'Ready tasks and dependencies';
      grid.append(chips('Ready queue', state.ready.map(id => labels.get(id)!)), chips('Output order', state.order.map(id => labels.get(id)!), 'None yet'));
      tables.push(table('Remaining prerequisites', ['Task', 'Remaining in-degree'], ids.map(id => [labels.get(id)!, state.indegrees[id]])));
      break;
    case 'kruskal':
      heading.textContent = 'Components and selected links';
      tables.push(table('Component membership', ['Site', 'Component'], ids.map(id => [id, state.components[id] || '—'])));
      grid.append(chips('Links by weight', state.edges.map(edgeName)), chips('Selected links', state.selected.map(edgeName), 'None yet'), chips('Total cost', [state.total]));
      break;
    case 'prim':
      heading.textContent = 'Tree and crossing frontier';
      grid.append(chips('Tree vertices', state.tree, 'None yet'), chips('Crossing links', state.frontier.map(edgeName)), chips('Selected links', state.selected.map(edgeName), 'None yet'), chips('Total cost', [state.total]));
      break;
  }
  host.replaceChildren(element('p', 'UNDER THE SURFACE', 'eyebrow'), heading, ...tables, grid);
}
