import { runExample } from '../algorithms/index.ts';
import { validatePractice } from '../practice.ts';
import { getLesson, lessonIds } from './catalog.ts';
import { examples } from './fixtures.ts';

for (const id of lessonIds) {
  const lesson = getLesson(id);
  const lineIds = new Set(lesson.code.map(line => line.id));
  if (lineIds.size !== lesson.code.length) throw new Error(`Duplicate pseudocode ID for ${id}`);
  if (!lesson.examples.some(example => example.kind === 'walkthrough') || !lesson.examples.some(example => example.kind === 'practice')) {
    throw new Error(`Missing walkthrough or practice for ${id}`);
  }
  if (new Set(lesson.examples.map(example => example.id)).size !== lesson.examples.length) {
    throw new Error(`Duplicate example ID for ${id}`);
  }
  for (const example of examples[id]) {
    const { frames } = runExample(id, lesson.version, example);
    for (const vertex of example.graph.vertices) {
      if (!example.positions[vertex.id]?.every(Number.isFinite)) throw new Error(`Missing position for ${id}/${example.id}/${vertex.id}`);
    }
    if (frames[0].lineId !== null || frames.at(-1)?.lineId !== 'finish' || frames.slice(1).some(frame => !lineIds.has(frame.lineId ?? ''))) {
      throw new Error(`Missing opening, terminal, or pseudocode frame for ${id}/${example.id}`);
    }
    if (example.kind === 'practice') validatePractice(id, lesson.version, example);
  }
}
