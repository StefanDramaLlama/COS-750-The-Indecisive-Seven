import { enhanceSelect, required } from '../studio/dom.ts';
import { buildCode } from './code.ts';
import type { Representation } from './code.ts';
import { COMPARISON, CONTENT, opDocs } from './content.ts';
import type { OpDoc } from './content.ts';
import { CONFIGS, buildSession, computeFacts, emptyHighlights, finalGraph, listOf, matrixOf, nextFreeLabel, opLabel } from './engine.ts';
import { makeQuestion } from './quiz.ts';
import type { Question } from './quiz.ts';
import { createGraphView, highlightCode, renderList, renderMatrix } from './render.ts';
import { isMuted, isSpeaking, play as playSound, canSpeak, setMuted, setSpeaking, speak } from './sound.ts';
import type { GraphData, GraphKind, Highlights, OpName, OpRequest, Session } from './types.ts';
import { LABELS, MAX_WEIGHT, MIN_WEIGHT } from './types.ts';

/* ---------- Shell: theme, accent, clock, menu (same behaviour as the Algorithm Studio) ---------- */

const theme = required<HTMLSelectElement>(document, '#theme');
const accent = required<HTMLSelectElement>(document, '#accent');
function setTheme(value: string) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
  theme.value = value === 'light' || value === 'dark' ? value : 'system';
}
function setAccent(value: string) {
  document.documentElement.dataset.accent = ['violet', 'ocean', 'mint', 'sunset'].includes(value) ? value : 'violet';
  accent.value = document.documentElement.dataset.accent;
}
try { setTheme(localStorage.getItem('graphwise-theme') ?? 'system'); } catch { setTheme('system'); }
try { setAccent(localStorage.getItem('graphwise-accent') ?? 'violet'); } catch { setAccent('violet'); }
enhanceSelect(theme);
enhanceSelect(accent);
theme.addEventListener('change', () => { setTheme(theme.value); try { localStorage.setItem('graphwise-theme', theme.value); } catch { /* Applies for this visit. */ } });
accent.addEventListener('change', () => { setAccent(accent.value); try { localStorage.setItem('graphwise-accent', accent.value); } catch { /* Applies for this visit. */ } });

const clock = required<HTMLTimeElement>(document, '#clock');
const clockFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const tickClock = () => { const now = new Date(); clock.dateTime = now.toISOString(); clock.textContent = clockFormat.format(now); };
tickClock();
window.setInterval(tickClock, 30_000);

const courseNav = required(document, '#course-nav');
const menu = required<HTMLButtonElement>(document, '.menu-toggle');
const showMenu = (open: boolean) => { courseNav.toggleAttribute('data-open', open); menu.setAttribute('aria-expanded', String(open)); };
menu.addEventListener('click', () => showMenu(!courseNav.hasAttribute('data-open')));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && courseNav.hasAttribute('data-open')) { showMenu(false); menu.focus(); } });

/* ---------- Which page are we on? ---------- */

const match = /^\/graph-adt\/(undirected|directed|weighted-directed|weighted)\/?$/.exec(location.pathname);
const kind: GraphKind = (match?.[1] as GraphKind | undefined) ?? 'undirected';
if (!match) history.replaceState(null, '', `/graph-adt/${kind}`);
const content = CONTENT[kind];
const config = CONFIGS[kind];
document.title = `Graphwise · Graph ADT · ${content.name}`;
document.querySelectorAll<HTMLElement>('[data-kind-link]').forEach(link => {
  if (link.dataset.kindLink === kind) link.setAttribute('aria-current', 'page');
});
required(document, '.breadcrumb strong').textContent = content.name;

const main = required(document, '#main');
const announcement = required(document, '#announcement');

/* ---------- Small helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function btn(label: string, action: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const edgeText = (e: { from: string; to: string; weight?: number }) => {
  const weight = e.weight === undefined ? '' : ` (${e.weight})`;
  return config.directed ? `${e.from} → ${e.to}${weight}` : `${e.from} – ${e.to}${weight}`;
};

/* ---------- Page skeleton ---------- */

const allKinds: { kind: GraphKind; label: string }[] = [
  { kind: 'undirected', label: 'Undirected' },
  { kind: 'directed', label: 'Directed' },
  { kind: 'weighted', label: 'Weighted undirected' },
  { kind: 'weighted-directed', label: 'Weighted directed' }
];

main.innerHTML = `
<header class="adt-hero">
  <p class="eyebrow">GRAPH ADT / ${content.name.toUpperCase()}</p>
  <h1>${content.name}</h1>
  <p class="lede">${content.headline}</p>
  <nav class="kind-tabs" aria-label="Graph types">${allKinds.map(k => `<a href="/graph-adt/${k.kind}" ${k.kind === kind ? 'aria-current="page"' : ''}>${k.label}</a>`).join('')}</nav>
  <div class="hero-grid">
    <section class="card pad" aria-labelledby="outcome-h">
      <h2 id="outcome-h">What you will be able to do</h2>
      <ul class="tick-list">
        <li>State the definition ${config.weighted ? 'G = (V, E, w)' : 'G = (V, E)'} and say what makes this graph type different.</li>
        <li>Identify its properties: direction, weights, degree, path, cycle, connectedness, sparse vs. dense.</li>
        <li>Compare an adjacency matrix with an adjacency list, in memory and in operation cost.</li>
        <li>Define each ADT operation, say what it returns or changes, then watch it run on both representations.</li>
        <li>Perform the operations yourself, predict their results, and read the code behind them.</li>
      </ul>
    </section>
    <section class="card pad" aria-labelledby="prior-h">
      <h2 id="prior-h">Before you start</h2>
      <p class="muted">You should already be comfortable with:</p>
      <ul class="chip-list"><li>Nodes (data + references)</li><li>Arrays</li><li>Linked lists</li><li>Stacks and queues (for DFS and BFS)</li></ul>
      <p class="muted small">Works on any phone, tablet or computer. Everything in the lab can be done by tapping or by using the buttons.</p>
    </section>
  </div>
  <nav class="jump" aria-label="On this page">
    <a href="#definition">Definition</a><a href="#representations">Representations</a><a href="#lab">Operation lab</a>
    <a href="#reference">Operations</a><a href="#predict">Predict</a><a href="#code">Code</a>
  </nav>
</header>

<section id="definition" class="adt-section" aria-labelledby="definition-h">
  <div class="section-head"><p class="eyebrow">1 · DEFINITION AND PROPERTIES</p><h2 id="definition-h">What is a ${content.name.toLowerCase()}?</h2></div>
  <div class="two-col">
    <div class="card pad">
      ${content.definition.map(p => `<p>${p}</p>`).join('')}
      <p class="formal" aria-label="Formal definition"><code>${content.formal}</code></p>
      <figure class="figure" id="def-figure"></figure>
    </div>
    <div class="card pad"><h3>Properties</h3><dl class="props">${content.properties.map(p => `<div><dt>${p.term}</dt><dd>${p.text}</dd></div>`).join('')}</dl></div>
  </div>
</section>

<section id="representations" class="adt-section" aria-labelledby="rep-h">
  <div class="section-head"><p class="eyebrow">2 · REPRESENTATIONS</p><h2 id="rep-h">One graph, two ways to store it</h2>
    <p class="muted">The ADT only promises what the operations do. Underneath, the same graph can live in an adjacency matrix or an adjacency list.</p></div>
  <div class="three-up" id="rep-figures"></div>
  <div class="card pad table-wrap">
    <h3>Matrix or list?</h3>
    <table class="compare"><thead><tr><th scope="col"></th><th scope="col">Adjacency matrix</th><th scope="col">Adjacency list</th></tr></thead>
      <tbody>${COMPARISON.map(r => `<tr><th scope="row">${r.aspect}<span class="note">${r.note}</span></th><td>${r.matrix}</td><td>${r.list}</td></tr>`).join('')}</tbody></table>
    <p class="muted small">V is the number of vertices, E the number of edges, and degree the number of neighbours of one vertex.</p>
  </div>
</section>

<section id="lab" class="adt-section" aria-labelledby="lab-h">
  <div class="section-head"><p class="eyebrow">3 · OPERATION LAB</p><h2 id="lab-h">Watch it, then do it</h2>
    <p class="muted">The graph on the left and its memory on the right always show the same moment. Step forward and backward as often as you like.</p></div>
  <div class="lab-tabs" role="group" aria-label="Lab mode"><button type="button" id="mode-guided" class="tab">Guided walkthrough</button><button type="button" id="mode-play" class="tab">Playground</button></div>
  <div id="guide" class="card pad guide"></div>
  <div id="toolbar" class="card pad toolbar" hidden></div>
  <div class="lab-grid">
    <div class="lab-col">
      <div class="card graph-card">
        <div class="card-head"><h3>Graph</h3><p class="muted small" id="graph-hint"></p></div>
        <div id="replay-banner" class="banner" hidden></div>
        <div class="graph-stage" id="graph-host"></div>
      </div>
      <div class="card pad controls" id="controls" role="group" aria-label="Playback controls"></div>
      <div class="card pad step-card" id="step-card" aria-label="Current step"></div>
    </div>
    <div class="lab-col">
      <div class="card memory-card" id="memory">
        <div class="card-head"><h3>Memory</h3><p class="muted small">The same graph inside the computer</p></div>
        <section class="mem" id="mem-matrix" aria-labelledby="mm-h"><h4 id="mm-h">Adjacency matrix</h4><div class="mem-body" id="matrix-host"></div><ul class="lines" id="matrix-lines"></ul></section>
        <section class="mem" id="mem-list" aria-labelledby="ml-h"><h4 id="ml-h">Adjacency list</h4><div class="mem-body" id="list-host"></div><ul class="lines" id="list-lines"></ul></section>
        <p class="muted small mem-note"><strong>Reading the matrix:</strong> ${content.matrixNote}</p>
        <p class="muted small mem-note"><strong>Reading the list:</strong> ${content.listNote}</p>
      </div>
      <div class="card pad facts" id="facts"></div>
      <div class="card pad log-card"><div class="card-head flush"><h3>Execution log</h3><p class="muted small">Every step in plain words. Select a line to jump to it.</p></div><ol class="log" id="log" aria-label="Execution log"></ol></div>
    </div>
  </div>
</section>

<section id="reference" class="adt-section" aria-labelledby="ref-h">
  <div class="section-head"><p class="eyebrow">4 · THE OPERATIONS</p><h2 id="ref-h">Every ADT operation, defined</h2>
    <p class="muted">Each card gives the definition, what the operation changes, how much it costs on each representation, a before-and-after picture on the example graph, and the code.</p></div>
  <div class="rep-toggle" role="group" aria-label="Code shown on cards"></div>
  <div id="op-cards"></div>
</section>

<section id="predict" class="adt-section" aria-labelledby="pred-h">
  <div class="section-head"><p class="eyebrow">5 · PREDICT</p><h2 id="pred-h">Predict first, then check</h2>
    <p class="muted">Questions use the graph currently in the lab, so change the graph and the questions change too.</p></div>
  <div class="card pad quiz" id="quiz"></div>
</section>

<section id="code" class="adt-section" aria-labelledby="code-h">
  <div class="section-head"><p class="eyebrow">6 · CODE</p><h2 id="code-h">The whole class</h2>
    <p class="muted">A complete TypeScript implementation of the ${content.name.toLowerCase()} in both representations. The lab above runs exactly these rules.</p></div>
  <div class="rep-toggle" role="group" aria-label="Representation for the full class"></div>
  <div class="card code-card"><div class="code-bar"><span id="code-title"></span><button type="button" class="btn small" id="copy-code">Copy</button></div><pre class="code" tabindex="0"><code id="code-full"></code></pre></div>
  <p class="muted small">Other graph types: ${content.siblings.map(s => `<a href="/graph-adt/${s.kind}">${s.label}</a>`).join(' · ')}.</p>
</section>`;

/* ---------- Static figures (definition + representations) ---------- */

function staticGraph(graph: GraphData, label: string, hl: Highlights = emptyHighlights(), badges?: Record<string, string>) {
  const view = createGraphView(config, false);
  view.render(graph, hl, { label, badges });
  return view.root;
}
function describeGraph(graph: GraphData): string {
  const v = `V = { ${graph.vertices.join(', ')} }`;
  const e = `E = { ${graph.edges.map(edge => config.directed ? `(${edge.from}, ${edge.to})` : `{${edge.from}, ${edge.to}}`).join(', ')} }`;
  const join = config.directed ? '→' : '–';
  return config.weighted ? `${v},  ${e},  w = ${graph.edges.map(edge => `${edge.from}${join}${edge.to}:${edge.weight}`).join(', ')}` : `${v},  ${e}`;
}
{
  const fig = required(main, '#def-figure');
  fig.append(staticGraph(content.start, 'Example graph'), Object.assign(el('figcaption'), { textContent: describeGraph(content.start) }));
  const figures = required(main, '#rep-figures');
  const startMatrix = el('div', 'mem-body');
  renderMatrix(startMatrix, matrixOf(config, content.start), emptyHighlights(), config);
  const startList = el('div', 'mem-body');
  renderList(startList, listOf(config, content.start), emptyHighlights(), config);
  const make = (title: string, body: Node, caption: string) => {
    const card = el('figure', 'card pad figure');
    card.append(el('h3', undefined, title), body, el('figcaption', 'muted small', caption));
    return card;
  };
  figures.append(
    make('Picture', staticGraph(content.start, 'Example graph'), 'How we draw it. Vertices are circles and edges are lines' + (config.directed && config.weighted ? ' with arrowheads and weight labels.' : config.directed ? ' with arrowheads.' : config.weighted ? ' labelled with weights.' : '.')),
    make('Adjacency matrix', startMatrix, content.matrixNote),
    make('Adjacency list', startList, content.listNote)
  );
}

/* ---------- Lab state ---------- */

type Mode = 'guided' | 'play';
let mode: Mode = 'guided';
let startGraph: GraphData = content.start;
let ops: OpRequest[] = [];
let session: Session = buildSession(config, startGraph, ops);
let index = 0;
let guideCursor = 0;
let selectedOp: OpName = 'addEdge';
let picks: string[] = [];
let playing = false;
let speed = 1;
let autoplay = true;
let timer: ReturnType<typeof setTimeout> | undefined;

const graphHost = required(main, '#graph-host');
const graphHint = required(main, '#graph-hint');
const banner = required(main, '#replay-banner');
const matrixHost = required(main, '#matrix-host');
const listHost = required(main, '#list-host');
const matrixLines = required(main, '#matrix-lines');
const listLines = required(main, '#list-lines');
const stepCard = required(main, '#step-card');
const controlsHost = required(main, '#controls');
const logHost = required(main, '#log');
const factsHost = required(main, '#facts');
const guideHost = required(main, '#guide');
const toolbar = required(main, '#toolbar');

const OP_UI: Record<OpName, { arity: 0 | 1 | 2; weight?: boolean; label: string; hint: string }> = {
  addVertex: { arity: 0, label: 'Add vertex', hint: 'Tap an empty spot on the graph to place the new vertex, or press Run.' },
  removeVertex: { arity: 1, label: 'Remove vertex', hint: 'Tap the vertex you want to remove.' },
  addEdge: { arity: 2, weight: config.weighted, label: 'Add edge', hint: config.directed ? 'Drag from the start vertex to the end vertex, or tap the two vertices in order.' : 'Drag from one vertex to another, or tap two vertices.' },
  removeEdge: { arity: 2, label: 'Remove edge', hint: 'Tap an edge, or tap its two end vertices.' },
  updateWeight: { arity: 2, weight: true, label: 'Update weight', hint: 'Set a weight below, then tap an edge.' },
  hasEdge: { arity: 2, label: 'hasEdge', hint: config.directed ? 'Tap the start vertex, then the end vertex.' : 'Tap two vertices, or an edge.' },
  neighbors: { arity: 1, label: 'neighbors', hint: 'Tap a vertex.' },
  degree: { arity: 1, label: 'degree', hint: 'Tap a vertex.' },
  vertexCount: { arity: 0, label: 'vertexCount', hint: 'Press Run.' },
  edgeCount: { arity: 0, label: 'edgeCount', hint: 'Press Run.' },
  isEmpty: { arity: 0, label: 'isEmpty', hint: 'Press Run.' },
  bfs: { arity: 1, label: 'Breadth-first', hint: 'Tap the vertex to start from.' },
  dfs: { arity: 1, label: 'Depth-first', hint: 'Tap the vertex to start from.' }
};
const OP_GROUPS: { name: string; ops: OpName[] }[] = [
  { name: 'Change', ops: ['addVertex', 'removeVertex', 'addEdge', 'removeEdge', ...(config.weighted ? ['updateWeight' as OpName] : [])] },
  { name: 'Query', ops: ['hasEdge', 'neighbors', 'degree', 'vertexCount', 'edgeCount', 'isEmpty'] },
  { name: 'Traverse', ops: ['bfs', 'dfs'] }
];

const graphView = createGraphView(config, true, {
  canDrag: () => mode === 'play' && OP_UI[selectedOp].arity === 2,
  space: (x, y) => {
    if (mode !== 'play' || selectedOp !== 'addVertex') return;
    const label = freeLabel();
    if (label) graphView.positions[label] = [x, y];
    execute({ op: 'addVertex', a: label ?? 'I' });
  },
  vertex: label => {
    if (mode !== 'play') return;
    const ui = OP_UI[selectedOp];
    if (ui.arity === 1) { argA.value = label; run(); }
    else if (ui.arity === 2) {
      picks = [...picks, label];
      if (picks.length === 2) { argA.value = picks[0]; argB.value = picks[1]; run(); }
      else { argA.value = label; renderGraph(); announce(`${label} selected. Now choose the second vertex.`); }
    }
  },
  edge: (from, to) => {
    if (mode !== 'play' || !['removeEdge', 'updateWeight', 'hasEdge', 'addEdge'].includes(selectedOp)) return;
    if (selectedOp === 'addEdge') return;
    argA.value = from; argB.value = to; run();
  },
  drag: (from, to) => {
    if (mode !== 'play' || OP_UI[selectedOp].arity !== 2) return;
    argA.value = from; argB.value = to; run();
  }
});
graphHost.append(graphView.root);

/* Toolbar (playground) */
const argA = el('select');
const argB = el('select');
const argW = el('input');
argW.type = 'number'; argW.min = String(MIN_WEIGHT); argW.max = String(MAX_WEIGHT); argW.value = '5';
const labelA = el('label', 'field');
const labelB = el('label', 'field');
const labelW = el('label', 'field');
const spanA = el('span', undefined, 'Vertex');
labelA.append(spanA, argA);
labelB.append(el('span', undefined, 'To'), argB);
labelW.append(el('span', undefined, 'Weight'), argW);
const opButtons = new Map<OpName, HTMLButtonElement>();
const opHint = el('p', 'muted small op-hint');
{
  const groups = el('div', 'op-groups');
  for (const group of OP_GROUPS) {
    const wrap = el('div', 'op-group');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', group.name);
    wrap.append(el('span', 'op-group-name', group.name));
    for (const op of group.ops) {
      const b = btn(OP_UI[op].label, () => selectOp(op), 'chip');
      b.setAttribute('aria-pressed', 'false');
      opButtons.set(op, b);
      wrap.append(b);
    }
    groups.append(wrap);
  }
  const args = el('div', 'args');
  args.append(labelA, labelB, labelW, btn('Run operation', () => run(), 'btn primary'));
  const extras = el('div', 'extras');
  const auto = el('label', 'check');
  const autoBox = el('input');
  autoBox.type = 'checkbox'; autoBox.checked = true;
  autoBox.addEventListener('change', () => { autoplay = autoBox.checked; });
  auto.append(autoBox, el('span', undefined, 'Play each operation automatically'));
  extras.append(auto, btn('Undo last operation', undoOp, 'btn small'), btn('Reset example', () => resetPlayground(content.start), 'btn small'), btn('Clear graph', () => resetPlayground({ vertices: [], edges: [] }), 'btn small'));
  toolbar.append(groups, args, opHint, extras);
}

function freeLabel(): string | undefined { return nextFreeLabel(finalGraph(session)); }

function fillSelects() {
  const graph = finalGraph(session);
  const keep = [argA.value, argB.value];
  const labels = selectedOp === 'addVertex' ? LABELS.filter(l => !graph.vertices.includes(l)) : graph.vertices;
  for (const [select, previous] of [[argA, keep[0]], [argB, keep[1]]] as const) {
    select.replaceChildren(...labels.map(l => Object.assign(el('option'), { value: l, textContent: l })));
    const useful = select === argB && graph.vertices.length > 1 && !labels.includes(previous) ? graph.vertices[1] : previous;
    select.value = labels.includes(useful as typeof LABELS[number]) ? useful : labels[select === argB && labels.length > 1 ? 1 : 0] ?? '';
  }
}

function selectOp(op: OpName) {
  selectedOp = op;
  picks = [];
  const ui = OP_UI[op];
  for (const [name, b] of opButtons) b.setAttribute('aria-pressed', String(name === op));
  spanA.textContent = op === 'addVertex' ? 'New label' : ui.arity === 2 ? 'From' : 'Vertex';
  labelA.hidden = op !== 'addVertex' && ui.arity === 0;
  labelB.hidden = ui.arity !== 2;
  labelW.hidden = !ui.weight;
  opHint.textContent = ui.hint;
  graphHint.textContent = mode === 'play' ? ui.hint : 'Use the controls below to step through the walkthrough.';
  fillSelects();
  renderGraph();
}

function currentRequest(): OpRequest {
  const ui = OP_UI[selectedOp];
  const request: OpRequest = { op: selectedOp };
  if (labelA.hidden === false && argA.value) request.a = argA.value;
  if (ui.arity === 2 && argB.value) request.b = argB.value;
  if (ui.weight) request.weight = Number(argW.value);
  if (selectedOp === 'addVertex' && !request.a) request.a = 'I';
  return request;
}
const run = () => { if (mode === 'play') execute(currentRequest()); };

function resetPlayground(graph: GraphData) {
  pause();
  startGraph = graph;
  ops = [];
  for (const key of Object.keys(graphView.positions)) delete graphView.positions[key];
  rebuild(0);
  fillSelects();
  announce(graph.vertices.length ? 'Example restored.' : 'Graph cleared.');
}
function undoOp() {
  if (!ops.length) return;
  pause();
  ops = ops.slice(0, -1);
  rebuild(undefined);
  fillSelects();
}

/* ---------- Running operations and stepping ---------- */

function rebuild(at: number | undefined) {
  session = buildSession(config, startGraph, ops);
  index = Math.min(at ?? session.frames.length - 1, session.frames.length - 1);
  picks = [];
  renderAll();
}

function execute(request: OpRequest) {
  pause();
  ops = [...ops, request];
  session = buildSession(config, startGraph, ops);
  const span = session.spans[session.spans.length - 1];
  const final = finalGraph(session);
  for (const key of Object.keys(graphView.positions)) if (!final.vertices.includes(key)) delete graphView.positions[key];
  index = span.first;
  picks = [];
  renderAll();
  cue(session.frames[index], true);
  fillSelects();
  if (autoplay && !prefersReducedMotion() && index < span.last) play();
}

function cue(frame: { sound: Parameters<typeof playSound>[0]; log: string }, sound: boolean) {
  if (sound) playSound(frame.sound);
  speak(frame.log);
}

function goto(target: number, withSound = false) {
  const next = Math.max(0, Math.min(target, session.frames.length - 1));
  const forward = next > index;
  index = next;
  renderAll();
  if (forward || withSound) cue(session.frames[index], true);
}
function pause() { playing = false; clearTimeout(timer); renderControls(); }
function play() {
  if (index >= session.frames.length - 1) index = 0;
  playing = true;
  renderControls();
  const tick = () => {
    if (!playing) return;
    if (index >= session.frames.length - 1) { pause(); return; }
    goto(index + 1);
    if (index >= session.frames.length - 1) { pause(); return; }
    timer = setTimeout(tick, 1300 / speed);
  };
  timer = setTimeout(tick, 400);
  if (index === 0) { renderAll(); }
}

function opBounds(direction: -1 | 1): number {
  const current = session.frames[index].opIndex;
  if (direction === 1) {
    const span = session.spans.find(s => s.first > index) ?? undefined;
    return span ? span.first : session.frames.length - 1;
  }
  const spans = session.spans.filter(s => s.first < index);
  if (!spans.length) return 0;
  const inside = current >= 0 ? session.spans[current] : undefined;
  const target = inside && index > inside.first ? inside : spans[spans.length - 1];
  return target.first;
}

/* ---------- Rendering ---------- */

function announce(text: string) { announcement.textContent = ''; window.setTimeout(() => { announcement.textContent = text; }, 30); }

function traversalBadges(frame: typeof session.frames[number]): Record<string, string> | undefined {
  const order = frame.traversal?.order;
  return order?.length ? Object.fromEntries(order.map((v, i) => [v, String(i + 1)])) : undefined;
}

function renderGraph() {
  const frame = session.frames[index];
  graphView.render(frame.snapshot.graph, frame.highlights, { badges: traversalBadges(frame), picked: picks, label: 'Graph at this step' });
  graphView.root.classList.toggle('is-playground', mode === 'play');
}

function renderAll() {
  const frame = session.frames[index];
  renderGraph();
  renderMatrix(matrixHost, frame.snapshot.matrix, frame.highlights, config);
  renderList(listHost, frame.snapshot.list, frame.highlights, config);
  const fill = (host: HTMLElement, lines: string[]) => host.replaceChildren(...lines.map(l => el('li', undefined, l)));
  fill(matrixLines, frame.matrixLines);
  fill(listLines, frame.listLines);
  required(main, '#mem-matrix').classList.toggle('is-focus', frame.pane === 'matrix');
  required(main, '#mem-list').classList.toggle('is-focus', frame.pane === 'list');
  required(main, '#graph-host').classList.toggle('is-focus', frame.pane === 'graph');
  renderStep(frame);
  renderControls();
  renderFacts(frame.snapshot.graph);
  renderLog();
  const atEnd = index === session.frames.length - 1;
  banner.hidden = atEnd || session.frames.length === 1;
  banner.textContent = `Replaying step ${index + 1} of ${session.frames.length}. ${mode === 'play' ? 'New operations always act on the latest graph.' : ''}`;
  announce(`Step ${index + 1} of ${session.frames.length}. ${frame.log}`);
  renderGuide();
}

const PANE_LABEL: Record<string, string> = { start: 'Start', graph: 'Graph', matrix: 'Matrix', list: 'List', result: 'Result', rejected: 'Rejected' };

function renderStep(frame: typeof session.frames[number]) {
  stepCard.className = `card pad step-card pane-${frame.pane}`;
  const opText = frame.opIndex >= 0 ? opLabel(session.spans[frame.opIndex].request) : 'Before any operation';
  const children: Node[] = [
    Object.assign(el('p', 'eyebrow'), { textContent: `STEP ${index + 1} OF ${session.frames.length} · ${opText}` }),
    el('h3', undefined, frame.title)
  ];
  const tag = el('span', `pane-tag tag-${frame.pane}`, PANE_LABEL[frame.pane]);
  children.push(tag, el('p', 'step-log', frame.log));
  if (frame.why) children.push(el('p', 'why', frame.why));
  if (frame.traversal) {
    const t = frame.traversal;
    const row = el('div', 'trav');
    row.append(el('span', 'trav-label', t.kind === 'bfs' ? 'Queue (front on the left)' : 'Call stack (top on the right)'));
    const items = el('span', 'trav-items');
    if (t.frontier.length) t.frontier.forEach(v => items.append(el('span', 'trav-chip', v)));
    else items.append(el('span', 'muted small', 'empty'));
    row.append(items);
    const order = el('div', 'trav');
    order.append(el('span', 'trav-label', 'Visited so far'), el('span', 'trav-items', t.order.join(' → ') || 'nothing yet'));
    children.push(row, order);
  }
  if (frame.result !== undefined && frame.pane !== 'rejected') {
    const result = el('p', 'result');
    result.append(el('span', 'trav-label', 'Result'), el('code', undefined, frame.result));
    children.push(result);
  }
  stepCard.replaceChildren(...children);
}

function renderControls() {
  const last = session.frames.length - 1;
  controlsHost.replaceChildren();
  const prevOp = btn('⏮', () => { pause(); goto(opBounds(-1)); }, 'btn icon');
  prevOp.setAttribute('aria-label', 'Jump to the start of the previous operation');
  prevOp.disabled = index === 0;
  const back = btn('◀ Back', () => { pause(); goto(index - 1); }, 'btn');
  back.disabled = index === 0;
  const playButton = btn(playing ? '❚❚ Pause' : '▶ Play', () => (playing ? pause() : play()), 'btn primary');
  playButton.disabled = last === 0;
  const next = btn('Next ▶', () => { pause(); goto(index + 1); }, 'btn');
  next.disabled = index === last;
  const nextOp = btn('⏭', () => { pause(); goto(opBounds(1)); }, 'btn icon');
  nextOp.setAttribute('aria-label', 'Jump to the start of the next operation');
  nextOp.disabled = index === last;
  const restart = btn('↺', () => { pause(); goto(0); }, 'btn icon');
  restart.setAttribute('aria-label', 'Restart from the first step');
  restart.disabled = index === 0;
  const scrub = el('input', 'scrub');
  scrub.type = 'range'; scrub.min = '0'; scrub.max = String(last); scrub.value = String(index);
  scrub.setAttribute('aria-label', 'Step');
  scrub.setAttribute('aria-valuetext', `Step ${index + 1} of ${last + 1}`);
  scrub.disabled = last === 0;
  scrub.addEventListener('input', () => { pause(); goto(Number(scrub.value)); });
  const count = el('span', 'step-count', `${index + 1} / ${last + 1}`);
  const speedSelect = el('select', 'speed');
  speedSelect.setAttribute('aria-label', 'Playback speed');
  for (const s of [0.5, 1, 2]) speedSelect.append(Object.assign(el('option'), { value: String(s), textContent: `${s}×`, selected: s === speed }));
  speedSelect.addEventListener('change', () => { speed = Number(speedSelect.value); });
  const sound = btn(isMuted() ? '🔇 Sound off' : '🔊 Sound on', () => { setMuted(!isMuted()); renderControls(); }, 'btn small');
  sound.setAttribute('aria-pressed', String(!isMuted()));
  const row1 = el('div', 'row');
  row1.append(restart, prevOp, back, playButton, next, nextOp);
  const row2 = el('div', 'row');
  row2.append(scrub, count);
  const row3 = el('div', 'row wrap');
  const speedLabel = el('label', 'inline-label', 'Speed');
  speedSelect.id = 'speed-select';
  speedLabel.htmlFor = 'speed-select';
  row3.append(speedLabel, speedSelect, sound);
  if (canSpeak()) {
    const speech = btn(isSpeaking() ? '🗣 Reading aloud' : '🗣 Read steps aloud', () => { setSpeaking(!isSpeaking()); if (isSpeaking()) speak(session.frames[index].log); renderControls(); }, 'btn small');
    speech.setAttribute('aria-pressed', String(isSpeaking()));
    row3.append(speech);
  }
  controlsHost.append(row1, row2, row3);
}

function renderFacts(graph: GraphData) {
  const f = computeFacts(config, graph);
  const yes = (v: boolean | null, y = 'Yes', n = 'No') => (v === null ? '–' : v ? y : n);
  const rows: [string, string][] = [
    ['Vertices |V|', String(f.vertexCount)],
    ['Edges |E|', String(f.edgeCount)],
    ['Density', f.maxEdges ? `${Math.round(f.density * 100)}% of ${f.maxEdges} possible · ${f.densityLabel}` : 'no possible edges yet'],
    [config.directed ? 'Weakly connected' : 'Connected', yes(f.connected)]
  ];
  if (config.directed) rows.push(['Strongly connected', yes(f.stronglyConnected)]);
  rows.push([config.directed ? 'Has a directed cycle' : 'Has a cycle', yes(f.hasCycle)]);
  if (config.weighted) rows.push(['Total weight', String(f.totalWeight)]);
  const degrees = graph.vertices.map(v => {
    const d = f.degrees[v];
    return config.directed ? `${v}: out ${d.out}, in ${d.in}` : `${v}: ${d.total}`;
  });
  const dl = el('dl', 'facts-list');
  for (const [k, v] of rows) { const wrap = el('div'); wrap.append(el('dt', undefined, k), el('dd', undefined, v)); dl.append(wrap); }
  factsHost.replaceChildren(el('h3', undefined, 'Facts about this graph'), dl, el('p', 'muted small', config.directed ? 'Degrees (out and in)' : 'Degrees'), el('p', 'degrees', degrees.join('   ·   ') || 'none'));
}

function renderLog() {
  logHost.replaceChildren();
  let previous = -2;
  for (let i = 0; i <= index; i++) {
    const frame = session.frames[i];
    if (frame.opIndex !== previous) {
      previous = frame.opIndex;
      const h = el('li', 'log-op', frame.opIndex < 0 ? 'Start' : `${frame.opIndex + 1}. ${opLabel(session.spans[frame.opIndex].request)}`);
      logHost.append(h);
    }
    const li = el('li', `log-step${i === index ? ' is-current' : ''}${frame.pane === 'rejected' ? ' is-rejected' : ''}`);
    const b = btn(frame.log, () => { pause(); goto(i); }, 'log-btn');
    if (i === index) b.setAttribute('aria-current', 'step');
    li.append(b);
    logHost.append(li);
  }
  const current = logHost.querySelector<HTMLElement>('.is-current');
  if (current) logHost.scrollTop = Math.max(0, current.offsetTop - logHost.clientHeight + current.offsetHeight + 8);
}

/* ---------- Guided walkthrough ---------- */

function renderGuide() {
  guideHost.hidden = mode !== 'guided';
  toolbar.hidden = mode !== 'play';
  required(main, '#mode-guided').setAttribute('aria-pressed', String(mode === 'guided'));
  required(main, '#mode-play').setAttribute('aria-pressed', String(mode === 'play'));
  if (mode !== 'guided') return;
  // The guide always mirrors the frame on screen: once an operation's frames are showing, that
  // step counts as run. Stepping Back before it rewinds the guide together with the graph.
  guideCursor = session.frames[index].opIndex + 1;
  const steps = content.guide;
  const done = guideCursor >= steps.length;
  const step = steps[guideCursor];
  const list = el('ol', 'guide-steps');
  steps.forEach((s, i) => {
    const li = el('li', i < guideCursor ? 'is-done' : i === guideCursor ? 'is-now' : '');
    li.append(el('span', undefined, s.title));
    if (i === guideCursor && !done) li.setAttribute('aria-current', 'step');
    list.append(li);
  });
  const body = el('div', 'guide-body');
  if (done) {
    body.append(el('h3', undefined, 'Walkthrough complete'), el('p', undefined, 'You have seen every kind of operation run on both representations. Step back through the log to review any moment, or take over in the playground.'));
    const actions = el('div', 'row wrap');
    actions.append(btn('Restart walkthrough', () => startGuided(), 'btn'), btn('Open the playground', () => switchMode('play'), 'btn primary'));
    body.append(actions);
  } else {
    body.append(el('p', 'eyebrow', `STEP ${guideCursor + 1} OF ${steps.length}`), el('h3', undefined, step.title), el('p', undefined, step.intro));
    const watch = el('p', 'watch');
    watch.append(el('strong', undefined, 'Watch for: '), document.createTextNode(step.watch));
    body.append(watch, btn(`Run ${opLabel(step.request)}`, () => {
      // If the learner stepped back, discard the steps they rewound past before running this one.
      ops = ops.slice(0, guideCursor);
      execute(step.request);
    }, 'btn primary'));
  }
  guideHost.replaceChildren(list, body);
}

function startGuided() {
  pause();
  mode = 'guided';
  startGraph = content.start;
  ops = [];
  guideCursor = 0;
  picks = [];
  for (const key of Object.keys(graphView.positions)) delete graphView.positions[key];
  graphHint.textContent = 'Use the controls below to step through the walkthrough.';
  rebuild(0);
}

function switchMode(next: Mode, carry?: GraphData) {
  if (next === 'guided') { startGuided(); return; }
  pause();
  mode = 'play';
  startGraph = carry ?? content.start;
  ops = [];
  for (const key of Object.keys(graphView.positions)) delete graphView.positions[key];
  selectOp(selectedOp);
  rebuild(0);
}
required(main, '#mode-guided').addEventListener('click', () => switchMode('guided'));
required(main, '#mode-play').addEventListener('click', () => switchMode('play'));

main.querySelector('#lab')?.addEventListener('keydown', event => {
  const e = event as KeyboardEvent;
  const target = e.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); pause(); goto(index + 1); }
  else if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); pause(); goto(index - 1); }
});

/* ---------- Operation reference cards ---------- */

let rep: Representation = 'matrix';
const codeSlots: { host: HTMLElement; op: OpName }[] = [];
const repToggles = Array.from(main.querySelectorAll<HTMLElement>('.rep-toggle'));
const fullCode = required(main, '#code-full');
const codeTitle = required(main, '#code-title');

function diffHighlights(before: GraphData, after: GraphData): { before: Highlights; after: Highlights } {
  const b = emptyHighlights();
  const a = emptyHighlights();
  const key = (e: { from: string; to: string }) => `${e.from}-${e.to}`;
  for (const v of after.vertices) if (!before.vertices.includes(v)) a.graphVertices[v] = 'changed';
  for (const v of before.vertices) if (!after.vertices.includes(v)) b.graphVertices[v] = 'removing';
  for (const e of after.edges) {
    const old = before.edges.find(x => key(x) === key(e));
    if (!old || old.weight !== e.weight) a.graphEdges[key(e)] = 'changed';
  }
  for (const e of before.edges) {
    const now = after.edges.find(x => key(x) === key(e));
    if (!now) b.graphEdges[key(e)] = 'removing';
    else if (now.weight !== e.weight) b.graphEdges[key(e)] = 'changed';
  }
  return { before: b, after: a };
}

function opCard(doc: OpDoc): HTMLElement {
  const s = buildSession(config, content.start, [doc.sample]);
  const first = s.frames[0];
  const last = s.frames[s.frames.length - 1];
  const mutates = doc.group === 'update';
  const diff = diffHighlights(first.snapshot.graph, last.snapshot.graph);
  const card = el('article', 'card pad op-card');
  card.id = `op-${doc.op}`;
  const head = el('div', 'op-head');
  head.append(el('code', 'sig', doc.signature), el('span', `pill pill-${doc.group}`, doc.group === 'update' ? 'Changes the graph' : doc.group === 'query' ? 'Query' : 'Traversal'));
  const costs = el('table', 'cost');
  costs.innerHTML = `<caption class="sr-only">Cost of ${doc.op}</caption><thead><tr><th scope="col">Matrix</th><th scope="col">List</th></tr></thead><tbody><tr><td>${doc.matrixCost}</td><td>${doc.listCost}</td></tr></tbody>`;
  const before = el('figure', 'mini');
  before.append(staticGraph(first.snapshot.graph, 'Before', mutates ? diff.before : emptyHighlights()), el('figcaption', undefined, mutates ? 'Before' : 'Example graph'));
  const after = el('figure', 'mini');
  const afterCaption = mutates
    ? `After · |V| ${first.snapshot.graph.vertices.length}→${last.snapshot.graph.vertices.length}, |E| ${first.snapshot.graph.edges.length}→${last.snapshot.graph.edges.length}`
    : `Returns ${last.result ?? ''}`;
  after.append(staticGraph(last.snapshot.graph, 'After', mutates ? diff.after : last.highlights, traversalBadges(last)), el('figcaption', undefined, afterCaption));
  const figs = el('div', 'mini-row');
  figs.append(before, el('span', 'mini-arrow', '→'), after);
  const details = el('details', 'code-details');
  details.append(el('summary', undefined, 'Show the code'));
  const pre = el('pre', 'code');
  pre.tabIndex = 0;
  const code = el('code');
  pre.append(code);
  details.append(pre);
  codeSlots.push({ host: code, op: doc.op });
  const sample = `Sample: ${opLabel(doc.sample)} on the example graph.`;
  const tryIt = btn('Try it in the lab', () => {
    if (mode !== 'play') switchMode('play');
    selectOp(doc.op);
    if (doc.sample.a) argA.value = doc.sample.a;
    if (doc.sample.b) argB.value = doc.sample.b;
    if (doc.sample.weight !== undefined) argW.value = String(doc.sample.weight);
    required(main, '#lab').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    announce(`${OP_UI[doc.op].label} is selected in the playground. ${OP_UI[doc.op].hint}`);
  }, 'btn small');
  card.append(head, el('p', undefined, doc.definition), el('p', 'muted', doc.changes), costs);
  if (doc.costNote) card.append(el('p', 'muted small', doc.costNote));
  card.append(figs, el('p', 'muted small', sample), details, tryIt);
  return card;
}
{
  const host = required(main, '#op-cards');
  const titles: Record<string, string> = { update: 'Operations that change the graph', query: 'Queries', traverse: 'Traversals' };
  for (const group of ['update', 'query', 'traverse'] as const) {
    const docs = opDocs(config).filter(d => d.group === group);
    const section = el('div', 'op-section');
    section.append(el('h3', undefined, titles[group]));
    const grid = el('div', 'op-grid');
    docs.forEach(d => grid.append(opCard(d)));
    section.append(grid);
    host.append(section);
  }
}

function renderCode() {
  const sample = buildCode(config, rep);
  for (const slot of codeSlots) {
    const text = sample.ops[slot.op];
    slot.host.replaceChildren(text ? highlightCode(text) : document.createTextNode('// This operation is only part of weighted graphs.'));
  }
  fullCode.replaceChildren(highlightCode(sample.full));
  codeTitle.textContent = `${sample.className}.ts · ${rep === 'matrix' ? 'adjacency matrix' : 'adjacency list'}`;
  for (const toggle of repToggles) for (const b of toggle.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.rep === rep));
}
for (const toggle of repToggles) {
  for (const [value, label] of [['matrix', 'Adjacency matrix'], ['list', 'Adjacency list']] as const) {
    const b = btn(label, () => { rep = value; renderCode(); }, 'tab');
    b.dataset.rep = value;
    toggle.append(b);
  }
}
required(main, '#copy-code').addEventListener('click', async event => {
  const button = event.currentTarget as HTMLButtonElement;
  const text = buildCode(config, rep).full;
  try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; } catch { button.textContent = 'Select the code and copy'; }
  window.setTimeout(() => { button.textContent = 'Copy'; }, 1800);
});

/* ---------- Prediction quiz ---------- */

const quizHost = required(main, '#quiz');
let counter = 0;
let question: Question | undefined;
let answered: string | undefined;
let hinted = false;
const scoreKey = `graphwise-adt-score-${kind}`;
let score = { right: 0, tried: 0 };
try { score = JSON.parse(localStorage.getItem(scoreKey) ?? '') as typeof score; if (typeof score.right !== 'number') throw new Error(); } catch { score = { right: 0, tried: 0 }; }

function newQuestion() {
  question = makeQuestion(config, finalGraph(session), counter++);
  answered = undefined;
  hinted = false;
  renderQuiz();
}

function renderQuiz() {
  if (!question) return;
  const q = question;
  const graph = finalGraph(session);
  quizHost.replaceChildren();
  const top = el('div', 'quiz-top');
  top.append(el('p', 'eyebrow', 'PREDICTION'), el('p', 'muted small', `Score: ${score.right} of ${score.tried} correct`));
  const figure = el('figure', 'mini quiz-fig');
  figure.append(staticGraph(graph, 'Current lab graph'), el('figcaption', undefined, `Lab graph: ${graph.edges.length ? graph.edges.map(edgeText).join(', ') : 'no edges'}`));
  const form = el('fieldset', 'options');
  form.append(Object.assign(el('legend'), { textContent: q.prompt }));
  for (const option of q.options) {
    const label = el('label', 'option');
    const input = el('input');
    input.type = 'radio'; input.name = 'answer'; input.value = option.id;
    input.disabled = answered === q.correct;
    input.checked = answered === option.id;
    input.addEventListener('change', () => {
      if (answered === q.correct) return;
      answered = option.id;
      score.tried++;
      if (option.id === q.correct) { score.right++; playSound('add'); } else playSound('error');
      try { localStorage.setItem(scoreKey, JSON.stringify(score)); } catch { /* Score only lasts this visit. */ }
      renderQuiz();
      announce(option.id === q.correct ? 'Correct.' : 'Not quite. Read the hint and try again.');
    });
    label.append(input, el('span', undefined, option.text));
    if (answered === option.id) label.classList.add(option.id === q.correct ? 'is-right' : 'is-wrong');
    form.append(label);
  }
  const feedback = el('div', 'feedback');
  feedback.setAttribute('aria-live', 'polite');
  if (answered) {
    const right = answered === q.correct;
    feedback.classList.add(right ? 'is-right' : 'is-wrong');
    feedback.append(el('strong', undefined, right ? 'Correct. ' : 'Not quite. '));
    feedback.append(document.createTextNode(right ? q.explanation : 'Have another look, then pick again. A hint is available.'));
  }
  if (hinted && answered !== q.correct) feedback.append(el('p', 'hint', `Hint: ${q.hint}`));
  const actions = el('div', 'row wrap');
  if (answered !== q.correct) actions.append(btn('Show a hint', () => { hinted = true; renderQuiz(); }, 'btn small'));
  if (q.op) {
    const op = q.op;
    actions.append(btn('Run it in the lab', () => {
      switchMode('play', graph);
      selectOp(op.op);
      execute(op);
      required(main, '#lab').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 'btn small'));
  }
  actions.append(btn('Next question', newQuestion, 'btn primary small'));
  quizHost.append(top, el('div', 'quiz-body'));
  const body = quizHost.querySelector('.quiz-body') as HTMLElement;
  body.append(figure, form);
  quizHost.append(feedback, actions);
}

/* ---------- Boot ---------- */

selectOp(selectedOp);
startGuided();
renderCode();
newQuestion();
