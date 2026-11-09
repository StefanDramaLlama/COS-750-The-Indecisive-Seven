import type { Lesson, LessonSummary, Primer } from '../shared/contracts.ts';
import { button, element, required } from './dom.ts';
import { createGraph } from './graph.ts';

export type View = 'walkthrough' | 'pseudocode' | 'practice';

export function lessonUrl(id: string, view: View = 'walkthrough') {
  return `/algorithms/${encodeURIComponent(id)}${view === 'walkthrough' ? '' : `?view=${view}`}`;
}

export function routeLink(text: string, href: string, className?: string) {
  const link = element('a', text, className);
  link.href = href;
  link.dataset.route = '';
  return link;
}

function options(select: HTMLSelectElement, entries: { id: string; name: string }[]) {
  select.replaceChildren(...entries.map(({ id, name }) => new Option(name, id)));
}

function renderPrimer(primer: Primer) {
  const card = element('section', undefined, 'primer');
  const toolbar = element('div', undefined, 'primer-controls');
  const canvas = element('div', undefined, 'graph-area');
  const caption = element('p');
  const before = button('Before', () => show('before'));
  const after = button('After', () => show('after'));
  function show(stage: 'before' | 'after') {
    const { graph, caption: description } = primer[stage];
    canvas.replaceChildren(createGraph(graph, primer.positions).picture);
    caption.textContent = description;
    before.setAttribute('aria-pressed', String(stage === 'before'));
    after.setAttribute('aria-pressed', String(stage === 'after'));
  }
  toolbar.append(before, after);
  card.append(element('h3', primer.title), toolbar, canvas, caption, element('p', primer.takeaway));
  show('before');
  return card;
}

export function renderOverview(main: HTMLElement, lessons: LessonSummary[], missing: boolean) {
  const heading = element('h1', missing ? 'Choose a lesson' : 'See graph algorithms in action.');
  const copy = missing
    ? 'That lesson is unavailable. Choose a lesson below to continue.'
    : 'Follow an algorithm step by step, then apply it to a new graph. Each lesson includes an interactive graph, pseudocode, and a short practice exercise.';
  const cards = element('div', undefined, 'overview-lessons');
  for (const [index, lesson] of lessons.entries()) {
    const card = routeLink('', lessonUrl(lesson.id), 'card lesson-card');
    card.append(element('p', `LESSON ${String(index + 1).padStart(2, '0')}`, 'eyebrow'),
      element('h2', lesson.name), element('p', lesson.category), element('span', 'Open lesson →'));
    cards.append(card);
  }
  main.replaceChildren(element('p', 'COS 212 / PRE-LECTURE LEARNING', 'eyebrow'), heading, element('p', copy, 'overview-copy'), cards);
}

export function mountLesson(main: HTMLElement, lesson: Lesson, lessons: LessonSummary[]) {
  main.innerHTML = `
    <div class="lesson-head">
      <div><p id="lesson-eyebrow" class="eyebrow"></p><h1 id="lesson-title"></h1><p id="lesson-summary"></p></div>
      <label class="lesson-picker"><span>LESSON</span><span class="select-box"><select id="lesson-select"></select></span></label>
    </div>
    <div class="viewbar">
      <nav class="views" aria-label="Lesson views"></nav>
      <span id="saved" class="status-badge" hidden>Practice complete</span>
    </div>
    <div class="scenario">
      <div><h2 id="scenario-title"></h2><p id="scenario-copy"></p></div>
      <p class="assumption" id="assumption"></p>
    </div>
    <section class="notice card" id="notice" hidden aria-live="polite"><p></p><button type="button" class="button" hidden>Try again</button></section>
    <div class="study">
      <div class="panes">
        <div class="graph-column">
          <section class="graph-card card" aria-labelledby="graph-title">
            <div class="card-header">
              <div><h2 id="graph-title">Graph view</h2><p id="graph-meta">Interactive example</p></div>
              <label class="select-box" id="example-picker" hidden><span class="sr-only">Example</span><select id="example-select"></select></label>
            </div>
            <div class="graph-area" id="graph-area"></div>
            <ul class="legend" aria-label="Graph legend">
              <li><i class="legend-mark mark-active" aria-hidden="true"></i>Current action</li>
              <li><i class="legend-mark mark-known" aria-hidden="true"></i>Discovered or ready</li>
              <li><i class="legend-mark mark-result" aria-hidden="true"></i>Processed or selected</li>
              <li><i class="legend-mark mark-skipped" aria-hidden="true"></i>Skipped</li>
            </ul>
          </section>
          <div class="controls card" role="group" aria-label="Playback controls">
            <button id="restart" type="button">↶ Restart</button>
            <button id="back" type="button">← Back</button>
            <button id="play" type="button">▷ Play</button>
            <button id="next" type="button" class="primary">Next step →</button>
            <label class="select-box"><span class="sr-only">Playback speed</span>
              <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
            </label>
            <span id="step-count" class="step-count"></span>
          </div>
          <section class="state-panel card" id="state-panel" aria-label="Algorithm working state"></section>
        </div>
        <div class="step-column">
          <section class="step-detail card" aria-labelledby="step-title">
            <p class="eyebrow" id="step-label">CURRENT STEP</p><h2 id="step-title"></h2>
            <p id="step-change"></p><p id="step-reason" class="step-reason"></p>
          </section>
          <section class="practice card" id="practice-panel" hidden aria-label="Practice checkpoint"></section>
          <section class="code-card card" aria-labelledby="code-title">
            <header><h2 id="code-title"></h2><span class="eyebrow">PSEUDOCODE</span></header>
            <div class="code-lines" id="code-lines"></div><p class="line-explanation" id="line-explanation"></p>
          </section>
        </div>
      </div>
      <details class="guide card" id="learning-guide">
        <summary>Learning guide &amp; graph concepts</summary>
        <div class="guide-content" id="guide-content"></div>
      </details>
    </div>`;
  const q = <T extends HTMLElement>(selector: string) => required<T>(main, selector);
  const number = lessons.findIndex(item => item.id === lesson.id) + 1;
  q('#lesson-eyebrow').textContent = `ALGORITHM STUDIO / ${String(number).padStart(2, '0')} · ${lesson.category.toUpperCase()}`;
  q('#lesson-title').textContent = lesson.title;
  q('#lesson-summary').textContent = lesson.summary;
  q('#assumption').textContent = lesson.prerequisites;
  q('#code-title').textContent = lesson.id === 'topological-sort' ? 'Kahn’s algorithm' : lesson.name;
  const lessonSelect = q<HTMLSelectElement>('#lesson-select');
  options(lessonSelect, lessons);
  lessonSelect.value = lesson.id;
  const tabs = new Map<View, HTMLAnchorElement>();
  for (const [name, title] of [['walkthrough', 'Walkthrough'], ['pseudocode', 'Pseudocode'], ['practice', 'Practice']] as const) {
    const link = routeLink(title, lessonUrl(lesson.id, name));
    q('.views').append(link);
    tabs.set(name, link);
  }

  const code = q('#code-lines');
  const explanation = q('#line-explanation');
  const codeButtons = new Map<string, HTMLButtonElement>();
  let inspected: string | undefined;
  const resetExplanation = () => { explanation.textContent = 'Select a line to see why it is used.'; };
  resetExplanation();
  for (const [index, line] of lesson.code.entries()) {
    const node = button('', () => {
      inspected = inspected === line.id ? undefined : line.id;
      for (const [id, item] of codeButtons) item.setAttribute('aria-pressed', String(id === inspected));
      if (inspected) explanation.textContent = line.explanation;
      else resetExplanation();
    }, 'code-line');
    node.setAttribute('aria-pressed', 'false');
    const number = element('span', String(index + 1).padStart(2, '0'), 'line-number');
    number.setAttribute('aria-hidden', 'true');
    node.append(number, element('code', line.text));
    codeButtons.set(line.id, node);
    code.append(node);
  }

  const guide = q('#guide-content');
  guide.append(element('p', lesson.complexity));
  const objectives = element('ul');
  lesson.objectives.forEach((objective, index) => objectives.append(element('li', `LO${index + 2} · ${objective}`)));
  const primers = element('div', undefined, 'primers');
  for (const primer of lesson.primers) primers.append(renderPrimer(primer));
  guide.append(objectives, primers);

  const exampleSelect = q<HTMLSelectElement>('#example-select');
  return {
    q, tabs, codeButtons, lessonSelect, exampleSelect,
    setExamples(kind: 'walkthrough' | 'practice', id: string) {
      const entries = lesson.examples.filter(example => example.kind === kind);
      options(exampleSelect, entries.map(example => ({ id: example.id, name: example.title })));
      exampleSelect.value = id;
      q('#example-picker').hidden = entries.length < 2;
      const selected = entries.find(example => example.id === id)!;
      q('#scenario-title').textContent = selected.title;
      q('#scenario-copy').textContent = selected.scenario;
    },
    highlight(lineId: string | null) {
      for (const [id, item] of codeButtons) {
        if (id === lineId) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      }
      const active = lineId ? codeButtons.get(lineId) : undefined;
      if (active) {
        const line = active.getBoundingClientRect();
        const box = code.getBoundingClientRect();
        if (line.bottom > box.bottom) code.scrollTop += line.bottom - box.bottom;
        if (line.top < box.top) code.scrollTop += line.top - box.top;
      }
    }
  };
}
