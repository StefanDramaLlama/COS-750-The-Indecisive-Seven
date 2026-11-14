import type { Example, LessonId, Run, RunResult, TraceFrame, VertexId } from '../../shared/contracts.ts';
import { basics } from './basics.ts'
import { dijkstra } from './dijkstra.ts';
import { validateGraph } from './graph.ts';
import { kruskal, prim } from './spanning.ts';
import { topological } from './topological.ts';
import { bfs, dfs } from './traversal.ts';

type Runner = (example: Example, choice?: VertexId) => { frames: TraceFrame[]; result: RunResult };

const runners: Record<LessonId, Runner> = {
  basics, dijkstra, bfs, dfs,
  'topological-sort': topological,
  kruskal, prim
};

export function runExample(
  lessonId: LessonId,
  version: number,
  example: Example,
  readyChoice?: VertexId,
  variant?: string
): Run {
  validateGraph(example.graph, lessonId, example.startId, example.goalId);
  const run = lessonId === 'topological-sort'
  ? topological(example, readyChoice, (variant as 'iterative' | 'recursive' | undefined) ?? 'iterative')
  : runners[lessonId](example, readyChoice);
  return { lessonId, exampleId: example.id, version, graph: example.graph, positions: example.positions, ...run };
}
