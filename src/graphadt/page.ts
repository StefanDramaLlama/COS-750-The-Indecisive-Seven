import type { LessonSummary, ProgressItem } from '../shared/contracts.ts';
import { json } from '../studio/api.ts';
import { listCourseLessons, renderCourseNav } from '../studio/course-nav.ts';
import { element, enhanceSelect, required } from '../studio/dom.ts';
import { mountTheme } from '../studio/theme.ts';
import { captureScreen, TutorPanel } from '../studio/tutor.ts';
import { graphBasicsTabs, lessonUrl, setupLessonSelect } from '../studio/view.ts';
import { CONTENT } from './content.ts';
import { mountFoundationLesson } from './lesson.ts';
import type { GraphKind } from './types.ts';
/* ---------- Shell: theme, accent, clock, menu (same behaviour as the Algorithm Studio) ---------- */

const theme = required<HTMLSelectElement>(document, '#theme');
const accent = required<HTMLSelectElement>(document, '#accent');
mountTheme(theme);
function setAccent(value: string) {
  document.documentElement.dataset.accent = ['violet', 'ocean', 'mint', 'sunset'].includes(value) ? value : 'violet';
  accent.value = document.documentElement.dataset.accent;
}
try { setAccent(localStorage.getItem('graphwise-accent') ?? 'violet'); } catch { setAccent('violet'); }
enhanceSelect(accent);
accent.addEventListener('change', () => { setAccent(accent.value); try { localStorage.setItem('graphwise-accent', accent.value); } catch { /* Applies for this visit. */ } });

const clock = required<HTMLTimeElement>(document, '#clock');
const clockFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const tickClock = () => { const now = new Date(); clock.dateTime = now.toISOString(); clock.textContent = clockFormat.format(now); };
tickClock();
window.setInterval(tickClock, 30_000);

const courseNav = required(document, '#course-nav');
const menu = required<HTMLButtonElement>(document, '.menu-toggle');
function showMenu(open: boolean) {
  courseNav.toggleAttribute('data-open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Hide course navigation' : 'Show course navigation');
}
menu.addEventListener('click', () => showMenu(!courseNav.hasAttribute('data-open')));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && courseNav.hasAttribute('data-open')) { showMenu(false); menu.focus(); } });

const main = required(document, '#main');
const announcement = required(document, '#announcement');
const lessonSelect = required<HTMLSelectElement>(main, '#lesson-select');
lessonSelect.addEventListener('change', () => location.assign(lessonUrl(lessonSelect.value)));

async function loadCourseNavigation() {
  const progress = json<ProgressItem[]>('/api/progress').catch(() => []);
  try {
    const lessons = await json<LessonSummary[]>('/api/lessons');
    const courseLessons = listCourseLessons(lessons);
    setupLessonSelect(lessonSelect, courseLessons, 'basics');
    renderCourseNav(lessons, courseLessons, await progress, 'basics');
  } catch { /* Foundations stays available if the lesson catalogue cannot load. */ }
}
void loadCourseNavigation();

const kindTabs = required(main, '.kind-tabs');
const basicsTabs = graphBasicsTabs('foundations');
const foundationsTab = required<HTMLAnchorElement>(basicsTabs, '[aria-current]');
kindTabs.before(basicsTabs);

const kinds: { id: GraphKind; label: string }[] = [
  { id: 'undirected', label: 'Undirected' },
  { id: 'directed', label: 'Directed' },
  { id: 'weighted', label: 'Weighted undirected' },
  { id: 'weighted-directed', label: 'Weighted directed' }
];
const links = kinds.map(({ id, label }) => {
  const link = element('a', label);
  link.href = `/graph-adt/${id}`;
  kindTabs.append(link);
  return { id, link };
});

const heading = required(main, '.foundation-title');
const lessonContent = required(main, '#foundation-content');
const tutor = new TutorPanel(captureScreen, json);
new MutationObserver(() => tutor.refreshContext()).observe(main, { childList: true, subtree: true, characterData: true });

const labs = new Map<GraphKind, { host: HTMLElement; controls: ReturnType<typeof mountFoundationLesson> }>();
let activeKind: GraphKind | undefined;

function kindFromPath(path: string): GraphKind | undefined {
  return kinds.find(({ id }) => path === `/graph-adt/${id}` || path === `/graph-adt/${id}/`)?.id;
}

function showKind(kind: GraphKind) {
  if (kind === activeKind) return;
  if (activeKind) labs.get(activeKind)?.controls.suspend();
  let lab = labs.get(kind);
  if (!lab) {
    const host = element('div');
    lab = { host, controls: mountFoundationLesson(host, announcement, kind) };
    labs.set(kind, lab);
  }
  activeKind = kind;
  const { name } = CONTENT[kind];
  document.title = `${name} · Graph basics · Graphwise`;
  heading.textContent = name;
  foundationsTab.href = `/graph-adt/${kind}`;
  for (const { id, link } of links) {
    if (id === kind) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  lessonContent.replaceChildren(lab.host);
  lab.controls.activate();
}

main.addEventListener('click', event => {
  if (!(event.target instanceof Element) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href^="/graph-adt/"]');
  if (!link || link.origin !== location.origin) return;
  const kind = kindFromPath(link.pathname);
  if (!kind) return;
  event.preventDefault();
  if (link.href === location.href) return;
  history.pushState(null, '', link.href);
  showKind(kind);
  if (!kindTabs.contains(link)) {
    window.scrollTo(0, 0);
    links.find(item => item.id === kind)?.link.focus({ preventScroll: true });
  }
});

function applyKindFromLocation() {
  const kind = kindFromPath(location.pathname);
  if (!kind) history.replaceState(null, '', `/graph-adt/undirected${location.hash}`);
  showKind(kind ?? 'undirected');
}
window.addEventListener('popstate', applyKindFromLocation);
applyKindFromLocation();
