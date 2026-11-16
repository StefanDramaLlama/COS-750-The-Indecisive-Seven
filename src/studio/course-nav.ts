import type { LessonSummary, ProgressItem } from '../shared/contracts.ts';
import { comparisonPairs, comparisonsId, isComparison } from './compare.ts';
import { element, required } from './dom.ts';
import { lessonUrl, routeLink } from './view.ts';

export function listCourseLessons(lessons: LessonSummary[]): LessonSummary[] {
  return lessons.flatMap(item => item.id === comparisonsId
    ? [{ ...item, name: 'Comparisons', category: 'Shortest paths and minimum spanning trees' }]
    : isComparison(item.id) ? [] : [item]);
}

export function renderCourseNav(
  lessons: LessonSummary[],
  courseLessons: LessonSummary[],
  progress: ProgressItem[],
  activeLesson?: LessonSummary['id']
) {
  const completed = new Set(lessons.filter(lesson => progress.some(item =>
    item.lessonId === lesson.id && item.version === lesson.version && item.completedAt
  )).map(lesson => lesson.id));
  const isComplete = (id: LessonSummary['id']) => id === comparisonsId
    ? comparisonPairs.every(pair => completed.has(pair.id))
    : completed.has(id);
  const courseCompleted = courseLessons.filter(item => isComplete(item.id)).length;
  const meter = required<HTMLProgressElement>(document, '#course-progress');
  meter.max = courseLessons.length || 8;
  meter.value = courseCompleted;
  required(document, '#quiz-lock-label').hidden = lessons.length > 0 && completed.size === lessons.length;
  required(document, '#progress-count').textContent = `${courseCompleted} of ${meter.max} lessons complete`;
  const activeCourseLesson = isComparison(activeLesson) ? comparisonsId : activeLesson;
  required(document, '#lesson-links').replaceChildren(...courseLessons.map((item, index) => {
    const link = routeLink('', lessonUrl(item.id), 'lesson-link');
    const number = element('span', String(index + 1).padStart(2, '0'), 'lesson-number');
    number.setAttribute('aria-hidden', 'true');
    link.append(number, element('span', item.name));
    if (item.id === activeCourseLesson) link.setAttribute('aria-current', 'page');
    if (isComplete(item.id)) {
      const mark = element('span', '✓', 'lesson-done');
      mark.setAttribute('aria-label', 'Complete');
      link.append(mark);
    }
    return link;
  }));
  const studio = required(document, '.studio-nav');
  if (activeLesson) studio.setAttribute('aria-current', 'true');
  else studio.removeAttribute('aria-current');
  return completed;
}
