import type {
  AcceptedChoice,
  Example,
  Graph,
  LessonId,
  PublicLesson,
  RunResult,
  TraceFrame,
} from "../../shared/types.js";

export interface CheckpointOption {
  id: string;
  label: string;
  /** Targeted feedback shown when this option is chosen. */
  feedback: string;
}

export interface CheckpointDef {
  id: string;
  /** Last frame revealed while the question is open. */
  frameIndex: number;
  question: string;
  options: CheckpointOption[];
  correct: string[];
  hint: string;
  /** The walkthrough step that teaches the same move. */
  walkthrough: { exampleId: string; frame: number } | null;
}

export interface Trace {
  frames: TraceFrame[];
  result: RunResult;
}

export interface PracticeDef {
  exampleId: string;
  reflection: string;
  /** Build the practice trace and its checkpoints for the accepted choices so far. */
  build(accepted: AcceptedChoice[]): { trace: Trace; checkpoints: CheckpointDef[] };
}

export interface LessonDef extends Omit<PublicLesson, "examples" | "practice"> {
  id: LessonId;
  examples: Example[];
  run(example: Example): Trace;
  practice: PracticeDef;
}

/* ------------------------------------------------------------ fixture helpers */

type EdgeSpec = [from: string, to: string, weight?: number];

/** Build a graph from "A" style ids; labels default to the id. Edge ids are "A-B" or "A>B". */
export function graph(
  directed: boolean,
  vertices: (string | [id: string, label: string])[],
  edges: EdgeSpec[],
): Graph {
  return {
    directed,
    vertices: vertices.map((v) => (typeof v === "string" ? { id: v, label: v } : { id: v[0], label: v[1] })),
    edges: edges.map(([from, to, weight]) => ({
      id: `${from}${directed ? ">" : "-"}${to}`,
      from,
      to,
      ...(weight === undefined ? {} : { weight }),
    })),
  };
}

export function withWeight(g: Graph, edgeId: string, weight: number): Graph {
  return { ...g, edges: g.edges.map((e) => (e.id === edgeId ? { ...e, weight } : { ...e })) };
}

export function findFrame(frames: TraceFrame[], pred: (f: TraceFrame) => boolean, what: string): number {
  const i = frames.findIndex(pred);
  if (i < 0) throw new Error(`Fixture error: no frame where ${what}.`);
  return i;
}

/** Index of the frame just before the first frame matching pred. */
export function before(frames: TraceFrame[], pred: (f: TraceFrame) => boolean, what: string): number {
  return findFrame(frames, pred, what) - 1;
}

export const is =
  (event: string, opts: { current?: string; edge?: string } = {}) =>
  (f: TraceFrame) =>
    f.event === event &&
    (opts.current === undefined || f.highlights.current.includes(opts.current)) &&
    (opts.edge === undefined || f.highlights.currentEdges.includes(opts.edge));

export function exampleById(lesson: LessonDef, id: string): Example | undefined {
  return lesson.examples.find((e) => e.id === id);
}

/** Memoise a lesson's worked trace so checkpoint links can point into it. */
export function lazy<T>(fn: () => T): () => T {
  let value: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value as T;
  };
}
