import type { Example, LessonId, Run, VertexId } from '../../shared/contracts.ts';
import { basics } from './basics.ts'
import { dijkstra } from './dijkstra.ts';
import { validateGraph } from './graph.ts';
import { kruskal, prim } from './spanning.ts';
import { topological } from './topological.ts';
import { bfs, dfs } from './traversal.ts';

const runners = { basics, dijkstra, bfs, dfs, 'topological-sort': topological, kruskal, prim };

export function runExample(lessonId: LessonId, version: number, example: Example, readyChoice?: VertexId): Run {
  validateGraph(example.graph, lessonId, example.startId, example.goalId);
  const run = runners[lessonId](example, readyChoice);
  return { lessonId, exampleId: example.id, version, graph: example.graph, positions: example.positions, ...run };
}
