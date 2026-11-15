import type { Example, LessonId, Run, RunResult, TraceFrame, VertexId } from '../../shared/contracts.ts';
import { basics } from './basics.ts'
import { dijkstra } from './dijkstra.ts';
import { validateGraph } from './graph.ts';
import { kruskal, prim } from './spanning.ts';
import { topological } from './topological.ts';
import { bfs, dfs } from './traversal.ts';
import { compare } from './compare.ts';
import { compareTrees } from './compare-trees.ts';

type Runner = (example: Example, choice?: VertexId) => { frames: TraceFrame[]; result: RunResult };

const runners: Record<LessonId, Runner> = {
  basics, dijkstra, bfs, dfs,
  'topological-sort': topological,
  kruskal, prim, compare, 'compare-trees': compareTrees,
  review: dijkstra, quiz: dijkstra
};

export function runExample(
  lessonId: LessonId,
  version: number,
  example: Example,
  readyChoice?: VertexId,
  variant?: string
): Run {
  const validationLesson = lessonId === 'review' || lessonId === 'quiz' ? 'dijkstra' : lessonId;
  validateGraph(example.graph, validationLesson, example.startId, example.goalId);
  const run = lessonId === 'topological-sort'
  ? topological(example, readyChoice, (variant as 'iterative' | 'recursive' | undefined) ?? 'iterative')
  : runners[lessonId](example, readyChoice);
  return { lessonId, exampleId: example.id, version, graph: example.graph, positions: example.positions, ...run };
}
