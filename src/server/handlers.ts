import type { LessonId } from "../shared/types.js";
import { getDb } from "./db.js";
import { HttpError } from "./errors.js";
import { type ApiHandler, type ApiRequest, errorResponse, json, requireMethod } from "./http.js";
import { LESSONS, buildRun, getLesson, publicLesson, summarize } from "./lessons/catalog.js";
import { evaluatePractice, parsePracticeRequest } from "./practice.js";
import { askTutor, parseTtsRequest, parseTutorRequest, speak } from "./tutor.js";
import { LEARNER_COOKIE, isLearnerId, learnerCookie, listProgress, markCompleted, markStarted, newLearnerId } from "./progress.js";

const NO_STORE = { "Cache-Control": "no-store" };

/** Wrap so thrown HttpErrors become JSON error responses. */
const safe =
  (fn: ApiHandler): ApiHandler =>
  async (req) => {
    try {
      return await fn(req);
    } catch (err) {
      return errorResponse(err);
    }
  };

/** GET /api/lessons[?id=…] */
export const lessonsHandler = safe(async (req) => {
  requireMethod(req, "GET");
  const id = req.query.id;
  if (!id) return json(200, { lessons: LESSONS.map(summarize) });
  const lesson = getLesson(id);
  if (!lesson) throw new HttpError(404, "unknown_lesson", `No lesson called ${id}.`);
  return json(200, { lesson: publicLesson(lesson) });
});

/** POST /api/runs {lessonId, exampleId} */
export const runsHandler = safe(async (req) => {
  requireMethod(req, "POST");
  const b = req.body as { lessonId?: unknown; exampleId?: unknown } | undefined;
  if (!b || typeof b.lessonId !== "string" || typeof b.exampleId !== "string") {
    throw new HttpError(400, "bad_request", "Send {lessonId, exampleId} as strings.");
  }
  const lesson = getLesson(b.lessonId);
  if (!lesson) throw new HttpError(404, "unknown_lesson", `No lesson called ${b.lessonId}.`);
  const run = buildRun(lesson, b.exampleId);
  if (!run) throw new HttpError(404, "unknown_example", `No walkthrough example ${b.exampleId} in ${lesson.id}.`);
  return json(200, { run });
});

function learnerFrom(req: ApiRequest): { id: string; setCookie?: string } {
  const existing = req.cookies[LEARNER_COOKIE];
  if (isLearnerId(existing)) return { id: existing };
  const id = newLearnerId();
  return { id, setCookie: learnerCookie(id, req.secure) };
}

/** POST /api/practice */
export const practiceHandler = safe(async (req) => {
  requireMethod(req, "POST");
  const request = parsePracticeRequest(req.body);
  const { response, completedNow } = evaluatePractice(request);
  const learner = learnerFrom(req);
  const db = getDb();
  const lessonId: LessonId = response.lessonId;
  if (request.action.type === "start") await markStarted(db, learner.id, lessonId, response.version);
  if (completedNow || response.status === "complete") await markCompleted(db, learner.id, lessonId, response.version);
  return json(200, response, { ...NO_STORE, ...(learner.setCookie ? { "Set-Cookie": learner.setCookie } : {}) });
});

/** GET /api/progress */
export const progressHandler = safe(async (req) => {
  requireMethod(req, "GET");
  const id = req.cookies[LEARNER_COOKIE];
  if (!isLearnerId(id)) return json(200, { progress: [] }, NO_STORE);
  return json(200, { progress: await listProgress(getDb(), id) }, NO_STORE);
});

/** POST /api/tutor {mode, context, messages} → {reply} */
export const tutorHandler = safe(async (req) => {
  requireMethod(req, "POST");
  const request = parseTutorRequest(req.body);
  return json(200, await askTutor(request), NO_STORE);
});

/** POST /api/tts {text} → {mimeType, data (base64 WAV)} */
export const ttsHandler = safe(async (req) => {
  requireMethod(req, "POST");
  const { text } = parseTtsRequest(req.body);
  return json(200, await speak(text), NO_STORE);
});
