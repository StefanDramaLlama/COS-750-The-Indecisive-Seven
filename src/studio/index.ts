import type { Lesson, LessonSummary, PracticeAction, PracticeResponse, ProgressItem, Run } from '../shared/contracts.ts';
import { button, element, enhanceSelect, required } from './dom.ts';
import { createGraph } from './graph.ts';
import { createSpatialGraph } from './spatial.ts';
import { renderState } from './state.ts';
import { lessonUrl, mountLesson, renderOverview, routeLink } from './view.ts';
import type { View } from './view.ts';

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function json<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(path, { signal, ...(body !== undefined ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : {}) });
  const data = await response.json().catch(() => undefined);
  if (!response.ok || data === undefined) throw new ApiError(data?.error?.message ?? 'The studio could not load this request.', response.status);
  return data as T;
}

const main = required(document, '#main');
const nav = required(document, '#lesson-links');
const courseNav = required(document, '#course-nav');
const menu = required<HTMLButtonElement>(document, '.menu-toggle');
const guideLink = required(document, '#guide-link');
const announcement = required(document, '#announcement');
const theme = required<HTMLSelectElement>(document, '#theme');
const accent = required<HTMLSelectElement>(document, '#accent');
const clock = required<HTMLTimeElement>(document, '#clock');

let lessons: LessonSummary[] = [];
let progress: ProgressItem[] = [];
let lesson: Lesson | undefined;
let ui: ReturnType<typeof mountLesson> | undefined;
let view: View = 'walkthrough';
let walkthrough: { id: string; index: number; run?: Run } | undefined;
let rehearsal: { id: string; index: number; run?: PracticeResponse } | undefined;
let selection: string | undefined;
let canvas: { key: string; graph: ReturnType<typeof createGraph> } | undefined;
let spatialCanvas: { key: string; graph: ReturnType<typeof createGraph> } | undefined;
let spatialScene: { key: string; graph: ReturnType<typeof createSpatialGraph> } | undefined;
let request: AbortController | undefined;
let progressRequest = 0;
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let playing = false;
let speed = 1;
let reviewLine: string | undefined;
let failed: { message: string; retry: () => void } | undefined;

function setTheme(value: string) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
  theme.value = value === 'light' || value === 'dark' ? value : 'system';
}
try { setTheme(localStorage.getItem('graphwise-theme') ?? 'system'); } catch { setTheme('system'); }
theme.addEventListener('change', () => {
  setTheme(theme.value);
  try { localStorage.setItem('graphwise-theme', theme.value); } catch { /* The current theme still applies. */ }
});

function setAccent(value: string) {
  document.documentElement.dataset.accent = ['violet', 'ocean', 'mint', 'sunset'].includes(value) ? value : 'violet';
  accent.value = document.documentElement.dataset.accent;
}
try { setAccent(localStorage.getItem('graphwise-accent') ?? 'violet'); } catch { setAccent('violet'); }
enhanceSelect(theme);
enhanceSelect(accent);
accent.addEventListener('change', () => {
  setAccent(accent.value);
  try { localStorage.setItem('graphwise-accent', accent.value); } catch { /* The selected accent still applies. */ }
});

const clockFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function renderClock() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = clockFormatter.format(now);
}
renderClock();
window.setInterval(renderClock, 30_000);

function showMenu(open: boolean) {
  courseNav.toggleAttribute('data-open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Hide course navigation' : 'Show course navigation');
}
menu.addEventListener('click', () => showMenu(!courseNav.hasAttribute('data-open')));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && courseNav.hasAttribute('data-open')) {
    showMenu(false);
    menu.focus();
  }
});
guideLink.addEventListener('click', () => {
  const guide = main.querySelector<HTMLDetailsElement>('#learning-guide');
  if (guide) guide.open = true;
});

function renderProgress() {
  const completed = new Set(lessons.filter(lesson => progress.some(item => item.lessonId === lesson.id &&
    item.version === lesson.version && item.completedAt)).map(lesson => lesson.id));
  const meter = required<HTMLProgressElement>(document, '#course-progress');
  meter.max = lessons.length || 6;
  meter.value = completed.size;
  required(document, '#progress-count').textContent = `${completed.size} of ${meter.max} lessons complete`;
  nav.replaceChildren(...lessons.map((item, index) => {
    const link = routeLink('', lessonUrl(item.id), 'lesson-link');
    const number = element('span', String(index + 1).padStart(2, '0'), 'lesson-number');
    number.setAttribute('aria-hidden', 'true');
    link.append(number, element('span', item.name));
    if (item.id === lesson?.id) link.setAttribute('aria-current', 'page');
    if (completed.has(item.id)) {
      const mark = element('span', '✓', 'lesson-done');
      mark.setAttribute('aria-label', 'Complete');
      link.append(mark);
    }
    return link;
  }));
  const studio = required(document, '.studio-nav');
  if (lesson) studio.setAttribute('aria-current', 'true');
  else studio.removeAttribute('aria-current');
  if (lesson && ui) ui.q('#saved').hidden = !progress.some(item => item.lessonId === lesson?.id && item.version === lesson.version && item.completedAt);
}

async function refreshProgress() {
  const sequence = ++progressRequest;
  try {
    const items = await json<ProgressItem[]>('/api/progress');
    if (sequence !== progressRequest) return;
    progress = items;
    renderProgress();
  } catch { /* The lesson stays available during a progress read failure. */ }
}

function activeRun() { return view === 'practice' ? rehearsal : walkthrough; }

function cancelRequest() {
  request?.abort();
  request = undefined;
  busy = false;
}

function pause() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  playing = false;
}

function schedule() {
  if (timer !== undefined) clearTimeout(timer);
  if (!playing) return;
  timer = setTimeout(() => {
    const current = activeRun();
    if (!current?.run || current.index >= current.run.frames.length - 1) {
      pause();
      renderControls();
      return;
    }
    current.index++;
    if (current.index === current.run.frames.length - 1) pause();
    renderFrame(false);
    schedule();
  }, 1000 / speed);
}

function move(delta: number) {
  const current = activeRun();
  if (!current?.run || busy) return;
  pause();
  current.index = Math.max(0, Math.min(current.index + delta, current.run.frames.length - 1));
  renderFrame(true);
}

function renderControls() {
  if (!ui) return;
  const current = activeRun();
  const total = current?.run?.frames.length ?? 0;
  const index = current?.index ?? 0;
  ui.q<HTMLButtonElement>('#back').disabled = !total || index === 0 || busy;
  ui.q<HTMLButtonElement>('#next').disabled = !total || index >= total - 1 || busy;
  ui.q<HTMLButtonElement>('#restart').disabled = busy || !total;
  const play = ui.q<HTMLButtonElement>('#play');
  play.disabled = !total || index >= total - 1 || busy;
  play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  const playLabel = play.querySelector('.button-label');
  if (playLabel) playLabel.textContent = playing ? 'Pause' : 'Play';
  const playIcon = play.querySelector('path');
  if (playIcon) playIcon.setAttribute('d', playing ? 'M7 5v14m10-14v14' : 'm8 5 11 7-11 7z');
  play.setAttribute('aria-pressed', String(playing));
  ui.q('#step-count').textContent = !total ? '' : view === 'practice' && rehearsal?.run?.prompt
    ? `Step ${index + 1} · ${total} revealed` : `Step ${index + 1} of ${total}`;
  const spatialBack = ui.q<HTMLButtonElement>('#spatial-back');
  const spatialNext = ui.q<HTMLButtonElement>('#spatial-next');
  const spatialPlay = ui.q<HTMLButtonElement>('#spatial-play');
  const spatialRestart = ui.q<HTMLButtonElement>('#spatial-restart');
  spatialRestart.disabled = busy || !total;
  spatialBack.disabled = !total || index === 0 || busy;
  spatialNext.disabled = !total || index >= total - 1 || busy;
  spatialPlay.disabled = !total || index >= total - 1 || busy;
  spatialPlay.setAttribute('aria-pressed', String(playing));
  ui.q('#spatial-play-label').textContent = playing ? 'Pause' : 'Play';
}

function renderNotice() {
  if (!ui) return;
  const notice = ui.q('#notice');
  const message = required(notice, 'p');
  const retry = required<HTMLButtonElement>(notice, 'button');
  notice.hidden = !busy && !failed;
  message.textContent = failed?.message ?? (busy ? 'Loading the next step…' : '');
  retry.hidden = !failed;
  retry.onclick = failed?.retry ?? null;
}

function addMobileCollapse(host: HTMLElement, label: string) {
  if (host.querySelector(':scope > .mobile-collapse')) return;
  host.classList.add('mobile-section');
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'mobile-collapse';
  control.setAttribute('aria-expanded', 'true');
  const update = () => {
    const collapsed = host.classList.contains('mobile-collapsed');
    control.textContent = collapsed ? `Show ${label}` : `Hide ${label}`;
    control.setAttribute('aria-expanded', String(!collapsed));
  };
  control.addEventListener('click', () => {
    host.classList.toggle('mobile-collapsed');
    update();
  });
  host.prepend(control);
  update();
}

function setupMobileCollapsibles() {
  if (!ui) return;
  addMobileCollapse(ui.q('.graph-card'), 'graph');
  addMobileCollapse(ui.q('#state-panel'), 'working state');
  addMobileCollapse(ui.q('.step-detail'), 'step explanation');
  addMobileCollapse(ui.q('.code-card'), 'pseudocode');
  addMobileCollapse(ui.q('.practice'), 'practice');
  addMobileCollapse(ui.q('.spatial-section'), '3D graph');
}

function renderBullets(host: HTMLElement, text: string, className?: string) {
  if (className) host.className = className;
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length <= 1) {
    host.textContent = text;
    return;
  }
  const list = element('ul');
  for (const line of lines) list.append(element('li', line));
  host.replaceChildren(list);
}

function renderFrame(announce: boolean) {
  if (!ui) return;
  const current = activeRun();
  const run = current?.run;
  const frame = run?.frames[current!.index];
  const area = ui.q('#graph-area');
  const spatialArea = ui.q('#spatial-graph-area');
  if (!run || !frame) {
    area.replaceChildren();
    spatialArea.replaceChildren();
    ui.q('#graph-meta').textContent = 'Interactive example';
    ui.q('#state-panel').replaceChildren();
    ui.q('#state-panel').hidden = true;
    ui.q('.step-detail').hidden = true;
    ui.highlight(null);
    canvas = undefined;
    spatialCanvas = undefined;
    spatialScene?.graph.dispose();
    spatialScene = undefined;
  } else {
    const key = `${run.lessonId}:${run.exampleId}`;
    if (canvas?.key !== key) {
      canvas = { key, graph: createGraph(run.graph, run.positions) };
      area.replaceChildren(canvas.graph.picture);
    }
    if (spatialCanvas?.key !== key) {
      spatialCanvas = { key, graph: createGraph(run.graph, run.positions) };
      spatialCanvas.graph.picture.classList.add('spatial-scene');
      spatialArea.replaceChildren(spatialCanvas.graph.picture);
      bindGraphWheel(spatialArea);
    }
    if (spatialScene?.key !== key) {
      spatialScene?.graph.dispose();
      spatialScene = { key, graph: createSpatialGraph(spatialArea, run.graph, run.positions) };
    }
    canvas.graph.update(frame);
    spatialCanvas.graph.update(frame);
    spatialScene.graph.setTotal(run.frames.length);
    spatialScene.graph.setFocusEnabled(ui.q<HTMLInputElement>('#spatial-focus').checked);
    spatialScene.graph.update(frame);
    area.dataset.step = String(frame.index);
    spatialArea.dataset.step = String(frame.index);
    spatialArea.style.setProperty('--scene-depth', String(frame.index));
    ui.q('#graph-meta').textContent = `${run.graph.directed ? 'Directed' : 'Undirected'} · ${run.graph.vertices.length} vertices · ${run.graph.edges.length} edges`;
    const terminal = frame.lineId === 'finish';
    const success = terminal && run.result && !['unreachable', 'cycle', 'disconnected'].includes(run.result.kind);
    ui.q('.step-detail').hidden = false;
    ui.q('.step-detail').classList.toggle('terminal', Boolean(success));
    ui.q('#step-label').textContent = terminal ? 'RESULT' : frame.index === 0 ? 'BEFORE WE BEGIN' : `CURRENT STEP / ${String(frame.index + 1).padStart(2, '0')}`;
    ui.q('#step-title').textContent = frame.title;
    renderBullets(ui.q('#step-change'), frame.change);
    renderBullets(ui.q('#step-reason'), frame.reason, 'step-reason');
    const state = ui.q('#state-panel');
    state.hidden = lesson?.id === 'basics';
    if (!state.hidden) renderState(state, run.graph, frame.state);
    addMobileCollapse(state, 'working state');
    ui.highlight(frame.lineId);
    if (announce) announcement.textContent = `Step ${frame.index + 1}. ${frame.title}. ${frame.change}`;
  }
  renderControls();
  renderPractice();
  setupMobileCollapsibles();
  renderNotice();
}

let graphWheelDelta = 0;
let graphWheelFrame = 0;

function bindGraphWheel(area: HTMLElement) {
  if (area.dataset.wheelBound === 'true') return;
  area.dataset.wheelBound = 'true';
  area.addEventListener('wheel', event => {
    if (!activeRun()?.run || busy || view === 'practice' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    graphWheelDelta += event.deltaY;
    if (Math.abs(graphWheelDelta) < 70 || graphWheelFrame) return;
    const direction = graphWheelDelta > 0 ? 1 : -1;
    graphWheelDelta = 0;
    graphWheelFrame = window.requestAnimationFrame(() => {
      graphWheelFrame = 0;
      move(direction);
    });
  }, { passive: false });
}

function practiceButton(text: string, key: string, action: () => void, style = 'button') {
  const node = button(text, action, style);
  node.dataset.practiceFocus = key;
  node.disabled = busy;
  return node;
}

function renderPractice() {
  if (!ui) return;
  const host = ui.q('#practice-panel');
  const current = rehearsal;
  const run = current?.run;
  const focusKey = host.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.practiceFocus : undefined;
  host.hidden = view !== 'practice' || !run;
  host.replaceChildren();
  if (host.hidden || !run || !current || !lesson) return;
  const atCheckpoint = current.index === run.frames.length - 1;
  const kicker = element('p', run.completed ? 'PRACTICE COMPLETE' : 'TRY A PREDICTION', 'eyebrow');
  host.append(kicker);
  if (!atCheckpoint) {
    host.append(element('h2', 'Follow the revealed steps'),
      element('p', run.completed ? 'Revisit any part of your completed run.' : 'Advance to the checkpoint before making your prediction.'));
    host.append(practiceButton(run.completed ? 'Go to result' : 'Go to question', 'checkpoint', () => {
      move(run.frames.length - 1 - current.index);
      ui?.q('#practice-panel h2').focus();
    }));
  } else if (run.prompt) {
    const prompt = run.prompt;
    const heading = element('h2', prompt.question);
    heading.tabIndex = -1;
    host.append(heading);
    const options = element('div', undefined, 'options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', 'Answer options');
    for (const option of prompt.options) {
      const choice = practiceButton(option.label, `option-${option.id}`, () => {
        selection = option.id;
        renderPractice();
      }, '');
      choice.setAttribute('aria-pressed', String(selection === option.id));
      options.append(choice);
    }
    const actions = element('div', undefined, 'practice-actions');
    const submit = practiceButton('Check answer', 'submit', () => {
      if (selection) void sendPractice({ type: 'answer', checkpointId: prompt.id, optionId: selection });
    }, 'button primary');
    submit.disabled = busy || !selection;
    actions.append(submit, practiceButton('Show a hint', 'hint', () => { void sendPractice({ type: 'hint', checkpointId: prompt.id }); }));
    const review = routeLink('Review this step', lessonUrl(lesson.id), 'button');
    review.dataset.review = prompt.reviewLineId;
    actions.append(review);
    host.append(options, actions);
  } else {
    const heading = element('h2', 'You applied the algorithm');
    heading.tabIndex = -1;
    host.append(heading, element('p', 'Think back to the rule you used at each checkpoint. Your completion is saved.'));
    const next = lessons[lessons.findIndex(item => item.id === lesson?.id) + 1];
    host.append(routeLink(next ? `Next lesson · ${next.name}` : 'Return to lessons', next ? lessonUrl(next.id) : '/algorithms', 'button primary'));
  }
  if (atCheckpoint && run.feedback) {
    const feedback = element('div', undefined, `feedback ${run.feedback.kind}`);
    const heading = { correct: 'That’s right', incorrect: 'Try another option', hint: 'Hint' }[run.feedback.kind];
    feedback.append(element('strong', heading), element('p', run.feedback.message));
    host.append(feedback);
  }
  if (focusKey) {
    const replacement = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-practice-focus]')).find(node => node.dataset.practiceFocus === focusKey && !node.disabled);
    replacement?.focus({ preventScroll: true });
  }
}

function errorState(error: unknown, retry: () => void) {
  failed = {
    message: error instanceof Error ? error.message : 'Something went wrong. Try again.',
    retry: error instanceof ApiError && error.status === 409 ? () => location.reload() : retry
  };
}

async function sendPractice(action: PracticeAction) {
  const current = rehearsal;
  const definition = lesson;
  if (!current || !definition || busy) return;
  pause();
  const abort = request = new AbortController();
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset.practiceFocus;
  busy = true;
  failed = undefined;
  renderFrame(false);
  try {
    const response = await json<PracticeResponse>('/api/practice', abort.signal, {
      lessonId: definition.id, exampleId: current.id, version: definition.version,
      acceptedChoices: action.type === 'start' ? [] : current.run?.acceptedChoices ?? [], action
    });
    if (request !== abort) return;
    current.run = response;
    current.index = action.type === 'start' ? 0 : response.frames.length - 1;
    if (action.type === 'start' || response.feedback?.kind === 'correct') selection = undefined;
    if (response.feedback) announcement.textContent = response.feedback.message;
    if (response.completed) {
      const completedAt = new Date().toISOString();
      const before = progress.find(item => item.lessonId === definition.id && item.version === definition.version);
      progress = progress.filter(item => item.lessonId !== definition.id || item.version !== definition.version);
      progress.push({ lessonId: definition.id, version: definition.version, startedAt: before?.startedAt ?? completedAt, completedAt: before?.completedAt ?? completedAt });
      renderProgress();
      void refreshProgress();
    }
  } catch (error) {
    if (request !== abort) return;
    errorState(error, () => { void sendPractice(action); });
  } finally {
    if (request === abort) {
      request = undefined;
      busy = false;
      renderFrame(false);
      const host = ui?.q('#practice-panel');
      if (action.type === 'answer' && current.run?.feedback?.kind === 'correct' && !failed) {
        host?.querySelector<HTMLElement>('h2')?.focus();
      } else if (focusKey && !failed && host) {
        Array.from(host.querySelectorAll<HTMLButtonElement>('[data-practice-focus]')).find(node => node.dataset.practiceFocus === focusKey && !node.disabled)?.focus({ preventScroll: true });
      }
    }
  }
}

function jumpToReview() {
  if (!reviewLine || !walkthrough?.run) return;
  const at = walkthrough.run.frames.findIndex(frame => frame.lineId === reviewLine);
  if (at >= 0) walkthrough.index = at;
  reviewLine = undefined;
}

async function loadWalkthrough() {
  const current = walkthrough;
  const definition = lesson;
  if (!current || !definition || busy) return;
  const abort = request = new AbortController();
  busy = true;
  failed = undefined;
  renderFrame(false);
  try {
    const run = await json<Run>('/api/runs', abort.signal, { lessonId: definition.id, exampleId: current.id });
    if (request !== abort) return;
    current.run = run;
    current.index = 0;
    jumpToReview();
  } catch (error) {
    if (request !== abort) return;
    errorState(error, () => { void loadWalkthrough(); });
  } finally {
    if (request === abort) {
      request = undefined;
      busy = false;
      renderFrame(false);
    }
  }
}

function updateView() {
  if (!lesson || !ui) return;
  const kind = view === 'practice' ? 'practice' : 'walkthrough';
  if (kind === 'practice') rehearsal ??= { id: lesson.examples.find(example => example.kind === kind)!.id, index: 0 };
  else walkthrough ??= { id: lesson.examples.find(example => example.kind === kind)!.id, index: 0 };
  const current = activeRun()!;
  ui.setExamples(kind, current.id);
  for (const [key, tab] of ui.tabs) {
    if (key === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  ui.q('.study').classList.toggle('pseudocode-view', view === 'pseudocode');
  if (kind === 'walkthrough') jumpToReview();
  renderFrame(false);
  if (!current.run) {
    if (kind === 'practice') void sendPractice({ type: 'start' });
    else void loadWalkthrough();
  }
}

function bindLesson() {
  if (!ui || !lesson) return;
  ui.lessonSelect.addEventListener('change', event => go(lessonUrl((event.target as HTMLSelectElement).value, view)));
  ui.exampleSelect.addEventListener('change', event => {
    const id = (event.target as HTMLSelectElement).value;
    pause();
    cancelRequest();
    failed = undefined;
    selection = undefined;
    if (view === 'practice') rehearsal = { id, index: 0 };
    else {
      walkthrough = { id, index: 0 };
      rehearsal = undefined;
    }
    updateView();
  });
  ui.q('#back').addEventListener('click', () => move(-1));
  ui.q('#next').addEventListener('click', () => move(1));
  ui.q('#restart').addEventListener('click', () => {
    pause();
    if (view === 'practice') {
      selection = undefined;
      void sendPractice({ type: 'start' });
    } else if (walkthrough) {
      walkthrough.index = 0;
      renderFrame(true);
    }
  });
  ui.q('#play').addEventListener('click', () => {
    if (playing) pause();
    else { playing = true; schedule(); }
    renderControls();
  });
  ui.q('#spatial-back').addEventListener('click', () => move(-1));
  ui.q('#spatial-restart').addEventListener('click', () => {
    pause();
    if (view === 'practice') {
      selection = undefined;
      void sendPractice({ type: 'start' });
    } else if (walkthrough) {
      walkthrough.index = 0;
      renderFrame(true);
    }
  });
  ui.q('#spatial-next').addEventListener('click', () => move(1));
  ui.q('#spatial-play').addEventListener('click', () => {
    if (playing) pause();
    else { playing = true; schedule(); }
    renderControls();
  });
  const spatialFocus = ui.q<HTMLInputElement>('#spatial-focus');
  try { spatialFocus.checked = localStorage.getItem('graphwise-spatial-focus') !== 'false'; } catch { spatialFocus.checked = true; }
  spatialFocus.addEventListener('change', () => {
    spatialScene?.graph.setFocusEnabled(spatialFocus.checked);
    try { localStorage.setItem('graphwise-spatial-focus', String(spatialFocus.checked)); } catch { /* The current setting still applies. */ }
  });
  const select = ui.q<HTMLSelectElement>('#speed');
  select.value = String(speed);
  enhanceSelect(select);
  select.addEventListener('change', () => { speed = Number(select.value); schedule(); });
}

async function applyRoute(focus = false) {
  const match = /^\/algorithms\/([^/]+)\/?$/.exec(location.pathname);
  const id = match?.[1];
  const mode = new URLSearchParams(location.search).get('view');
  view = mode === 'practice' || mode === 'pseudocode' ? mode : 'walkthrough';
  pause();
  cancelRequest();
  failed = undefined;
  if (lesson?.id === id && ui) {
    updateView();
    return;
  }

  lesson = undefined;
  ui = undefined;
  walkthrough = undefined;
  rehearsal = undefined;
  canvas = undefined;
  spatialCanvas = undefined;
  spatialScene?.graph.dispose();
  spatialScene = undefined;
  selection = undefined;
  guideLink.hidden = true;
  renderProgress();
  if (!id || !lessons.some(item => item.id === id)) {
    document.title = 'Graphwise · Algorithm Studio';
    renderOverview(main, lessons, Boolean(id));
    if (focus) main.focus({ preventScroll: true });
    return;
  }

  main.replaceChildren(element('p', 'GRAPHWISE / ALGORITHM STUDIO', 'eyebrow'), element('h1', 'Loading the lesson…'));
  const abort = request = new AbortController();
  try {
    const definition = await json<Lesson>(`/api/lessons?id=${encodeURIComponent(id)}`, abort.signal);
    if (request !== abort) return;
    request = undefined;
    lesson = definition;
    ui = mountLesson(main, definition, lessons);
    document.title = `${definition.name} · Graphwise`;
    guideLink.hidden = false;
    bindLesson();
    renderProgress();
    updateView();
    if (focus) main.focus({ preventScroll: true });
  } catch {
    if (request !== abort) return;
    request = undefined;
    main.replaceChildren(element('h1', 'This lesson couldn’t load.'), button('Try again', () => { void applyRoute(true); }, 'button primary'));
  }
}

function go(href: string, line?: string) {
  if (!lessons.length) return;
  const url = new URL(href, location.href);
  if (url.href !== location.href) history.pushState(null, '', url);
  reviewLine = line;
  const menuWasOpen = courseNav.hasAttribute('data-open');
  showMenu(false);
  const sameLesson = url.pathname === (lesson ? lessonUrl(lesson.id) : '');
  if (!sameLesson) window.scrollTo(0, 0);
  if (menuWasOpen && sameLesson) menu.focus();
  void applyRoute(!sameLesson);
  if (line) {
    ui?.q('#step-title').setAttribute('tabindex', '-1');
    ui?.q('#step-title').focus();
  }
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest<HTMLAnchorElement>('a[data-route]');
  if (!link || link.origin !== location.origin) return;
  event.preventDefault();
  go(link.href, link.dataset.review);
});
window.addEventListener('popstate', () => {
  reviewLine = undefined;
  if (lessons.length) void applyRoute();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); renderControls(); }
});

async function boot() {
  try {
    lessons = await json<LessonSummary[]>('/api/lessons');
    void applyRoute();
    void refreshProgress();
  } catch {
    main.replaceChildren(element('h1', 'The studio couldn’t load.'), button('Try again', () => { void boot(); }, 'button primary'));
  }
}
void boot();
