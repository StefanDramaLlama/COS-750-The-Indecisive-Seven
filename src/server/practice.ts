import type {
  AcceptedChoice,
  PracticeFeedback,
  PracticePrompt,
  PracticeRequest,
  PracticeResponse,
} from "../shared/types.js";
import { HttpError } from "./errors.js";
import type { CheckpointDef } from "./lessons/define.js";
import { getLesson } from "./lessons/catalog.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Validate the JSON shape of a practice request (400 on failure). */
export function parsePracticeRequest(body: unknown): PracticeRequest {
  const bad = (msg: string): never => {
    throw new HttpError(400, "bad_request", msg);
  };
  if (!isRecord(body)) bad("Expected a JSON object.");
  const b = body as Record<string, unknown>;
  if (typeof b.lessonId !== "string") bad("lessonId must be a string.");
  if (typeof b.exampleId !== "string") bad("exampleId must be a string.");
  if (typeof b.version !== "number" || !Number.isInteger(b.version)) bad("version must be an integer.");
  if (!Array.isArray(b.acceptedChoices)) bad("acceptedChoices must be an array.");
  const accepted = (b.acceptedChoices as unknown[]).map((c) => {
    if (!isRecord(c) || typeof c.checkpointId !== "string" || typeof c.optionId !== "string") {
      bad("Each accepted choice needs checkpointId and optionId strings.");
    }
    const r = c as Record<string, string>;
    return { checkpointId: r.checkpointId, optionId: r.optionId };
  });
  if (accepted.length > 20) bad("Too many accepted choices.");
  if (!isRecord(b.action)) bad("action must be an object.");
  const a = b.action as Record<string, unknown>;
  let action: PracticeRequest["action"];
  if (a.type === "start") action = { type: "start" };
  else if (a.type === "hint" && typeof a.checkpointId === "string") action = { type: "hint", checkpointId: a.checkpointId };
  else if (a.type === "answer" && typeof a.checkpointId === "string" && typeof a.optionId === "string") {
    action = { type: "answer", checkpointId: a.checkpointId, optionId: a.optionId };
  } else {
    return bad("action must be start, hint (with checkpointId) or answer (with checkpointId and optionId).");
  }
  return {
    lessonId: b.lessonId as PracticeRequest["lessonId"],
    exampleId: b.exampleId as string,
    version: b.version as number,
    acceptedChoices: accepted,
    action,
  };
}

function toPrompt(cp: CheckpointDef, number: number, total: number): PracticePrompt {
  return {
    checkpointId: cp.id,
    number,
    total,
    question: cp.question,
    options: cp.options.map(({ id, label }) => ({ id, label })),
    walkthroughFrame: cp.walkthrough?.frame ?? null,
    walkthroughExampleId: cp.walkthrough?.exampleId ?? "",
  };
}

export interface PracticeOutcome {
  response: PracticeResponse;
  /** True when this request moved the lesson to complete. */
  completedNow: boolean;
}

/**
 * Replay the accepted prefix, apply one action and reveal frames up to the next open
 * checkpoint. Future frames, options' correctness and feedback never leave the server.
 */
export function evaluatePractice(req: PracticeRequest): PracticeOutcome {
  const lesson = getLesson(req.lessonId);
  if (!lesson) throw new HttpError(404, "unknown_lesson", `No lesson called ${req.lessonId}.`);
  if (req.exampleId !== lesson.practice.exampleId) {
    throw new HttpError(404, "unknown_example", `No practice example ${req.exampleId} in ${lesson.id}.`);
  }
  if (req.version !== lesson.version) {
    throw new HttpError(409, "version_mismatch", "This lesson has been updated. Restart the practice to continue.");
  }
  const example = lesson.examples.find((e) => e.id === req.exampleId)!;

  // Replay: every accepted choice must answer the checkpoint open at that point, correctly.
  const accepted: AcceptedChoice[] = [];
  let built = lesson.practice.build(accepted);
  for (const choice of req.acceptedChoices) {
    const cp = built.checkpoints[accepted.length];
    if (!cp || cp.id !== choice.checkpointId || !cp.correct.includes(choice.optionId)) {
      throw new HttpError(422, "invalid_history", "The accepted choices do not match this practice. Restart it to continue.");
    }
    accepted.push(choice);
    built = lesson.practice.build(accepted);
  }
  const wasComplete = accepted.length >= built.checkpoints.length;

  let feedback: PracticeFeedback | null = null;
  const open = () => built.checkpoints[accepted.length];
  const action = req.action;
  if (action.type === "start") {
    feedback = wasComplete
      ? { tone: "info", message: "You have already finished this practice." }
      : null;
  } else {
    const cp = open();
    if (!cp || cp.id !== action.checkpointId) {
      throw new HttpError(422, "invalid_checkpoint", "That checkpoint is not the one currently open.");
    }
    if (action.type === "hint") {
      feedback = { tone: "hint", message: cp.hint };
    } else {
      const option = cp.options.find((o) => o.id === action.optionId);
      if (!option) throw new HttpError(422, "invalid_option", "That option does not belong to this checkpoint.");
      if (cp.correct.includes(option.id)) {
        accepted.push({ checkpointId: cp.id, optionId: option.id });
        built = lesson.practice.build(accepted);
        feedback = { tone: "correct", message: option.feedback };
      } else {
        feedback = { tone: "incorrect", message: option.feedback };
      }
    }
  }

  const total = built.checkpoints.length;
  const next = open();
  const complete = !next;
  const revealTo = next ? next.frameIndex : built.trace.frames.length - 1;
  return {
    completedNow: complete && !wasComplete,
    response: {
      lessonId: lesson.id,
      exampleId: example.id,
      version: lesson.version,
      graph: example.graph,
      positions: example.positions,
      frames: built.trace.frames.slice(0, revealTo + 1),
      acceptedChoices: accepted,
      prompt: next ? toPrompt(next, accepted.length + 1, total) : null,
      feedback,
      status: complete ? "complete" : "in-progress",
      ...(complete ? { result: built.trace.result, reflection: lesson.practice.reflection } : {}),
    },
  };
}
