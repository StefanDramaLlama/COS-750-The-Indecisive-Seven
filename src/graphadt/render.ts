import type { GraphConfig, GraphData, Highlights, ListView, MatrixView } from './types.ts';
import { SLOTS } from './content.ts';
import { edgeKey } from './engine.ts';

const NS = 'http://www.w3.org/2000/svg';
const RADIUS = 21;
let viewNumber = 0;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, number | string> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export type Positions = Record<string, [number, number]>;
export interface RenderOptions { badges?: Record<string, string>; picked?: string[]; label?: string }

export interface GraphHandlers {
  space?: (x: number, y: number) => void;
  vertex?: (label: string) => void;
  edge?: (from: string, to: string) => void;
  /** Called when the learner drags from one vertex to another. */
  drag?: (from: string, to: string) => void;
  /** True when drags starting on a vertex should draw a rubber band. */
  canDrag?: () => boolean;
}

export function createGraphView(config: GraphConfig, interactive: boolean, handlers: GraphHandlers = {}) {
  const uid = `gv${++viewNumber}`;
  const root = svg('svg', { viewBox: '0 0 480 300', role: 'img', class: `adt-graph${interactive ? ' is-interactive' : ''}`, 'aria-labelledby': `${uid}-t` });
  const title = svg('title', { id: `${uid}-t` }, 'Graph');
  const defs = svg('defs');
  for (const mark of ['base', 'changed', 'read', 'removing']) {
    const marker = svg('marker', { id: `${uid}-${mark}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 Z', class: `tip tip-${mark}` }));
    defs.append(marker);
  }
  const layer = svg('g');
  const rubber = svg('line', { class: 'rubber', x1: 0, y1: 0, x2: 0, y2: 0 });
  rubber.setAttribute('visibility', 'hidden');
  root.append(title, defs, svg('rect', { x: 0, y: 0, width: 480, height: 300, class: 'adt-bg' }), layer, rubber);
  const positions: Positions = {};
  const place = (label: string): [number, number] => positions[label] ?? SLOTS[label] ?? [240, 150];

  function toSvg(event: PointerEvent): [number, number] {
    const matrix = root.getScreenCTM();
    if (!matrix) return [240, 150];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [Math.max(RADIUS, Math.min(480 - RADIUS, point.x)), Math.max(RADIUS, Math.min(300 - RADIUS, point.y))];
  }

  function render(graph: GraphData, hl: Highlights, options: RenderOptions = {}) {
    layer.replaceChildren();
    const summary = graph.edges.map(e => `${e.from} ${config.directed ? 'to' : 'joined to'} ${e.to}${e.weight === undefined ? '' : ` weight ${e.weight}`}`).join('; ');
    title.textContent = `${options.label ?? 'Graph'}: ${graph.vertices.length ? `vertices ${graph.vertices.join(', ')}` : 'no vertices'}. ${summary ? `Edges: ${summary}.` : 'No edges.'}`;
    const pairs = new Set(graph.edges.map(e => `${e.from}>${e.to}`));
    for (const edge of graph.edges) {
      const [x1, y1] = place(edge.from);
      const [x2, y2] = place(edge.to);
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      const dx = (x2 - x1) / length;
      const dy = (y2 - y1) / length;
      const bend = config.directed && pairs.has(`${edge.to}>${edge.from}`) ? 34 : 0;
      const mx = (x1 + x2) / 2 - dy * bend;
      const my = (y1 + y2) / 2 + dx * bend;
      const trim = (x: number, y: number, tx: number, ty: number, m: number) => {
        const n = Math.hypot(tx - x, ty - y) || 1;
        return `${x + ((tx - x) / n) * m} ${y + ((ty - y) / n) * m}`;
      };
      const mark = hl.graphEdges[edgeKey(edge)];
      const d = `M ${trim(x1, y1, mx, my, RADIUS)} Q ${mx} ${my} ${trim(x2, y2, mx, my, RADIUS + (config.directed ? 5 : 0))}`;
      const group = svg('g', { class: `edge${mark ? ` e-${mark}` : ''}`, 'data-from': edge.from, 'data-to': edge.to });
      const path = svg('path', { d, class: 'edge-line' });
      if (config.directed) path.setAttribute('marker-end', `url(#${uid}-${mark ?? 'base'})`);
      group.append(svg('path', { d, class: 'edge-hit' }), path);
      if (edge.weight !== undefined) {
        const lx = (x1 + x2) / 2 - dy * (bend / 2 + 13);
        const ly = (y1 + y2) / 2 + dx * (bend / 2 + 13);
        group.append(svg('text', { x: lx, y: ly, class: 'edge-weight', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(edge.weight)));
      }
      layer.append(group);
    }
    for (const label of graph.vertices) {
      const [x, y] = place(label);
      const mark = hl.graphVertices[label];
      const picked = options.picked?.includes(label);
      const group = svg('g', { class: `vertex${mark ? ` v-${mark}` : ''}${picked ? ' v-picked' : ''}`, transform: `translate(${x} ${y})`, 'data-vertex': label });
      group.append(svg('circle', { r: RADIUS + 6, class: 'halo' }), svg('circle', { r: RADIUS, class: 'disc' }), svg('text', { class: 'vlabel', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, label));
      const badge = options.badges?.[label];
      if (badge) {
        group.append(svg('circle', { cx: 17, cy: -17, r: 9, class: 'badge' }), svg('text', { x: 17, y: -17, class: 'badge-text', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, badge));
      }
      layer.append(group);
    }
    if (!graph.vertices.length) layer.append(svg('text', { x: 240, y: 150, class: 'empty-note', 'text-anchor': 'middle' }, interactive ? 'Empty graph. Choose “Add vertex”, then tap here.' : 'Empty graph'));
  }

  if (interactive) {
    let from: string | undefined;
    let moved = false;
    const under = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY);
    root.addEventListener('pointerdown', event => {
      const target = event.target as Element;
      const vertex = target.closest<SVGElement>('[data-vertex]')?.dataset.vertex;
      moved = false;
      if (vertex && handlers.canDrag?.()) {
        from = vertex;
        root.setPointerCapture(event.pointerId);
        const [x, y] = place(vertex);
        rubber.setAttribute('x1', String(x)); rubber.setAttribute('y1', String(y));
        rubber.setAttribute('x2', String(x)); rubber.setAttribute('y2', String(y));
      }
    });
    root.addEventListener('pointermove', event => {
      if (!from) return;
      moved = true;
      const [x, y] = toSvg(event);
      rubber.setAttribute('visibility', 'visible');
      rubber.setAttribute('x2', String(x)); rubber.setAttribute('y2', String(y));
    });
    root.addEventListener('pointerup', event => {
      const target = under(event);
      const vertex = target?.closest<SVGElement>('[data-vertex]')?.dataset.vertex;
      const edge = target?.closest<SVGElement>('.edge');
      rubber.setAttribute('visibility', 'hidden');
      const start = from;
      from = undefined;
      if (start && moved && vertex && vertex !== start) { handlers.drag?.(start, vertex); return; }
      if (vertex) { handlers.vertex?.(vertex); return; }
      if (start) return;
      if (edge?.dataset.from && edge.dataset.to) { handlers.edge?.(edge.dataset.from, edge.dataset.to); return; }
      if (target === root || target?.classList.contains('adt-bg') || target?.classList.contains('empty-note')) {
        const [x, y] = toSvg(event);
        handlers.space?.(x, y);
      }
    });
    root.addEventListener('pointercancel', () => { from = undefined; rubber.setAttribute('visibility', 'hidden'); });
  }
  return { root, render, positions };
}

/* ---------- Matrix ---------- */

export function renderMatrix(host: HTMLElement, matrix: MatrixView, hl: Highlights, config: GraphConfig): void {
  const table = document.createElement('table');
  table.className = 'adt-matrix';
  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = `Adjacency matrix, ${matrix.rowLabels.length} rows by ${matrix.colLabels.length} columns. ${config.weighted ? '∞ means no edge.' : '1 means an edge, 0 means no edge.'}`;
  const head = table.createTHead().insertRow();
  const corner = document.createElement('th');
  corner.className = 'corner';
  corner.innerHTML = '<span class="sr-only">Row vertex, column vertex</span>';
  corner.setAttribute('aria-hidden', 'true');
  head.append(corner);
  for (const col of matrix.colLabels) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col;
    if (hl.matrixCols[col]) th.classList.add(`m-${hl.matrixCols[col]}`);
    head.append(th);
  }
  const body = table.createTBody();
  matrix.rowLabels.forEach((row, i) => {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row;
    if (hl.matrixRows[row]) th.classList.add(`m-${hl.matrixRows[row]}`);
    tr.append(th);
    matrix.colLabels.forEach((col, j) => {
      const td = tr.insertCell();
      const value = matrix.cells[i][j];
      td.textContent = value === null ? '∞' : String(value);
      td.className = (value === null || value === 0) ? 'empty' : 'filled';
      td.title = `[${row}][${col}]`;
      const mark = hl.matrixCells[`${row}|${col}`];
      if (mark) td.classList.add(`m-${mark}`);
      if (hl.matrixRows[row]) td.classList.add(`row-${hl.matrixRows[row]}`);
      if (hl.matrixCols[col]) td.classList.add(`col-${hl.matrixCols[col]}`);
      if (row === col) td.classList.add('diagonal');
    });
  });
  host.replaceChildren(table);
}

/* ---------- Adjacency list ---------- */

export function renderList(host: HTMLElement, list: ListView, hl: Highlights, config: GraphConfig): void {
  const wrap = document.createElement('ul');
  wrap.className = 'adt-list';
  wrap.setAttribute('aria-label', 'Adjacency list');
  if (!list.rows.length) {
    const none = document.createElement('li');
    none.className = 'list-empty';
    none.textContent = 'No rows yet.';
    wrap.append(none);
  }
  for (const row of list.rows) {
    const li = document.createElement('li');
    li.className = 'list-row';
    const mark = hl.listRows[row.vertex];
    if (mark) li.classList.add(`l-${mark}`);
    const head = document.createElement('span');
    head.className = 'list-head';
    head.textContent = row.vertex;
    li.append(head);
    for (const item of row.items) {
      const arrow = document.createElement('span');
      arrow.className = 'list-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      const node = document.createElement('span');
      node.className = 'list-node';
      const itemMark = hl.listItems[`${row.vertex}>${item.to}`];
      if (itemMark) node.classList.add(`l-${itemMark}`);
      node.textContent = config.weighted ? `${item.to}, ${item.weight}` : item.to;
      node.title = config.weighted ? `neighbour ${item.to}, weight ${item.weight}` : `neighbour ${item.to}`;
      li.append(arrow, node);
    }
    const end = document.createElement('span');
    end.className = 'list-end';
    end.textContent = row.items.length ? '→ ∅' : '∅';
    end.title = 'End of list';
    li.append(end);
    wrap.append(li);
  }
  host.replaceChildren(wrap);
}

/* ---------- Tiny TypeScript highlighter ---------- */

const KEYWORDS = new Set(['class', 'private', 'const', 'let', 'new', 'return', 'if', 'for', 'of', 'while', 'throw', 'interface', 'void', 'string', 'number', 'boolean', 'true', 'false', 'in', 'as']);
export function highlightCode(code: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const pattern = /(\/\/.*)|(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let last = 0;
  const push = (text: string, cls?: string) => {
    if (!text) return;
    if (!cls) { fragment.append(text); return; }
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    fragment.append(span);
  };
  for (const match of code.matchAll(pattern)) {
    push(code.slice(last, match.index));
    const [text, comment, string, number, word] = match;
    if (comment) push(text, 'tok-c');
    else if (string) push(text, 'tok-s');
    else if (number) push(text, 'tok-n');
    else if (word && KEYWORDS.has(word)) push(text, 'tok-k');
    else if (word && /^[A-Z]/.test(word)) push(text, 'tok-t');
    else push(text);
    last = (match.index ?? 0) + text.length;
  }
  push(code.slice(last));
  return fragment;
}
