import type { LessonId, LessonSummary, PublicLesson, Run } from "../../shared/types.js";
import { validateGraph } from "../algorithms/common.js";
import { bfsLesson } from "./bfs.js";
import type { LessonDef } from "./define.js";
import { dfsLesson } from "./dfs.js";
import { dijkstraLesson } from "./dijkstra.js";
import { kruskalLesson, primLesson } from "./spanning-trees.js";
import { topologicalSortLesson } from "./topological-sort.js";

export const LESSONS: LessonDef[] = [
  dijkstraLesson,
  bfsLesson,
  dfsLesson,
  topologicalSortLesson,
  kruskalLesson,
  primLesson,
];

export function getLesson(id: string): LessonDef | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function summarize(l: LessonDef): LessonSummary {
  return { id: l.id, order: l.order, version: l.version, title: l.title, approach: l.approach, blurb: l.blurb };
}

/** Public projection: instructions, pseudocode and example descriptors. No answers. */
export function publicLesson(l: LessonDef): PublicLesson {
  const practice = l.examples.find((e) => e.id === l.practice.exampleId)!;
  return {
    ...summarize(l),
    prerequisites: l.prerequisites,
    objectives: l.objectives,
    vocabulary: l.vocabulary,
    primers: l.primers,
    pseudocode: l.pseudocode,
    complexity: l.complexity,
    examples: l.examples,
    practice: {
      exampleId: practice.id,
      scenario: practice.scenario,
      assumptions: practice.assumptions,
      checkpointCount: l.practice.build([]).checkpoints.length,
    },
  };
}

/** Walkthrough run for a worked or variant example. Practice traces are served by the practice service. */
export function buildRun(lesson: LessonDef, exampleId: string): Run | undefined {
  const example = lesson.examples.find((e) => e.id === exampleId && e.kind !== "practice");
  if (!example) return undefined;
  const trace = lesson.run(example);
  return {
    lessonId: lesson.id,
    exampleId: example.id,
    version: lesson.version,
    graph: example.graph,
    positions: example.positions,
    frames: trace.frames,
    result: trace.result,
  };
}

/**
 * Check every fixture: graphs validate, positions cover every vertex, runs succeed,
 * frames reference real line/vertex/edge ids, and checkpoints are well-formed.
 * Returns a list of problems (empty when the catalog is sound).
 */
export function validateCatalog(): string[] {
  const problems: string[] = [];
  const ids = new Set<LessonId>();
  for (const lesson of LESSONS) {
    const where = (s: string) => problems.push(`${lesson.id}: ${s}`);
    if (ids.has(lesson.id)) where("duplicate lesson id");
    ids.add(lesson.id);
    const lineIds = new Set(lesson.pseudocode.map((p) => p.id));
    if (lineIds.size !== lesson.pseudocode.length) where("duplicate pseudocode line id");

    for (const ex of lesson.examples) {
      try {
        validateGraph(ex.graph);
      } catch (e) {
        where(`example ${ex.id}: ${(e as Error).message}`);
        continue;
      }
      if (ex.graph.vertices.length < 3 || ex.graph.vertices.length > 6) where(`example ${ex.id} should have 3–6 vertices`);
      for (const v of ex.graph.vertices) if (!ex.positions[v.id]) where(`example ${ex.id} has no position for ${v.id}`);
      let frames;
      try {
        frames = lesson.run(ex).frames;
      } catch (e) {
        where(`example ${ex.id} failed to run: ${(e as Error).message}`);
        continue;
      }
      const vIds = new Set(ex.graph.vertices.map((v) => v.id));
      const eIds = new Set(ex.graph.edges.map((e) => e.id));
      frames.forEach((f, i) => {
        if (f.index !== i) where(`example ${ex.id} frame ${i} has index ${f.index}`);
        if (i === 0 ? f.lineId !== null : f.lineId === null || !lineIds.has(f.lineId)) {
          where(`example ${ex.id} frame ${i} has bad lineId ${f.lineId}`);
        }
        const h = f.highlights;
        for (const v of [...h.current, ...h.discovered, ...h.completed, ...h.resultVertices]) {
          if (!vIds.has(v)) where(`example ${ex.id} frame ${i} highlights unknown vertex ${v}`);
        }
        for (const e of [...h.currentEdges, ...h.chosenEdges, ...h.rejectedEdges, ...h.frontierEdges, ...h.resultEdges]) {
          if (!eIds.has(e)) where(`example ${ex.id} frame ${i} highlights unknown edge ${e}`);
        }
      });
    }

    const practiceExample = lesson.examples.find((e) => e.id === lesson.practice.exampleId);
    if (!practiceExample || practiceExample.kind !== "practice") {
      where("practice example missing or not of kind practice");
      continue;
    }
    try {
      const { checkpoints, trace } = lesson.practice.build([]);
      if (checkpoints.length === 0) where("practice has no checkpoints");
      let last = -1;
      for (const cp of checkpoints) {
        if (cp.frameIndex <= last || cp.frameIndex >= trace.frames.length - 1) where(`checkpoint ${cp.id} frame out of order`);
        last = cp.frameIndex;
        const opts = new Set(cp.options.map((o) => o.id));
        if (cp.correct.length === 0 || cp.correct.some((c) => !opts.has(c))) where(`checkpoint ${cp.id} has an invalid answer`);
        if (cp.walkthrough) {
          const wex = lesson.examples.find((e) => e.id === cp.walkthrough!.exampleId);
          if (!wex || wex.kind === "practice") where(`checkpoint ${cp.id} links to a missing walkthrough example`);
          else if (cp.walkthrough.frame < 0 || cp.walkthrough.frame >= lesson.run(wex).frames.length) {
            where(`checkpoint ${cp.id} links to a missing walkthrough frame`);
          }
        }
      }
    } catch (e) {
      where(`practice failed to build: ${(e as Error).message}`);
    }
  }
  return problems;
}
