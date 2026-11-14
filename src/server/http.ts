import { randomUUID } from 'node:crypto';
import type { Choice, Example, Graph, LessonId, Positions, PracticeAction } from '../shared/contracts.ts';
import { GraphInputError } from './algorithms/graph.ts';
import { runExample } from './algorithms/index.ts';
import { getLesson, getLessons, isLessonId } from './lessons/catalog.ts';
import { examples } from './lessons/fixtures.ts';
import { practice, PracticeError } from './practice.ts';
import { learnerId, readProgress, saveProgress, sessionCookie } from './progress.ts';

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const invalid = (message: string) => new RequestError(400, 'INVALID_REQUEST', message);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;

function endpoint(method: 'GET' | 'POST', handler: (request: Request) => Promise<Response> | Response) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== method) {
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${method} for this endpoint.` } },
        { status: 405, headers: { Allow: method, 'Cache-Control': 'no-store' } });
    }
    try {
      if (method === 'POST') {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) throw new RequestError(403, 'INVALID_ORIGIN', 'Submit from Algorithm Studio.');
      }
      return await handler(request);
    } catch (error) {
      if (error instanceof RequestError) return failure(error.status, error.code, error.message);
      if (error instanceof GraphInputError) return failure(422, 'UNSUPPORTED_GRAPH', error.message);
      if (error instanceof PracticeError) return failure(422, 'INVALID_DECISION_HISTORY', error.message);
      console.error('Algorithm Studio request failed', error instanceof Error ? error.name : 'Unknown error');
      return failure(500, 'REQUEST_FAILED', 'Algorithm Studio could not complete the request. Try again.');
    }
  };
}

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) throw new Error('Body too large');
    value = JSON.parse(raw);
  } catch {
    throw invalid('Send a valid JSON request.');
  }
  if (!record(value)) throw invalid('Send a JSON object.');
  return value;
}

function lessonId(value: unknown): LessonId {
  if (!validText(value)) throw invalid('Provide a lesson ID.');
  if (!isLessonId(value)) throw new RequestError(404, 'LESSON_NOT_FOUND', 'That lesson does not exist.');
  return value;
}

function exampleFor(lesson: LessonId, value: unknown, kind: Example['kind']): Example {
  if (!validText(value)) throw invalid('Provide an example ID.');
  const example = examples[lesson].find(example => example.id === value && example.kind === kind);
  if (!example) throw new RequestError(404, 'EXAMPLE_NOT_FOUND', 'That example is unavailable in this view.');
  return example;
}

export const lessonsEndpoint = endpoint('GET', request => {
  const id = new URL(request.url).searchParams.get('id');
  return Response.json(id === null ? getLessons() : getLesson(lessonId(id)));
});

export const runsEndpoint = endpoint('POST', async request => {
  const data = await body(request);
  const id = lessonId(data.lessonId);
  const example = record(data.graph) && record(data.positions)
    ? {
        id: 'builder',
        kind: 'walkthrough' as const,
        title: 'Graph builder',
        scenario: 'A learner-built graph.',
        graph: data.graph as unknown as Graph,
        positions: data.positions as unknown as Positions,
        startId: typeof data.startId === 'string' ? data.startId : undefined,
        goalId: typeof data.goalId === 'string' ? data.goalId : undefined
      }
    : exampleFor(id, data.exampleId, 'walkthrough');
  const variant = typeof data.variant === 'string' ? data.variant : undefined;
  return Response.json(runExample(id, getLesson(id).version, example, undefined, variant));
});

function choice(value: unknown): Choice {
  if (!record(value) || !validText(value.checkpointId) || !validText(value.optionId)) throw invalid('Provide checkpoint and option IDs.');
  return { checkpointId: value.checkpointId, optionId: value.optionId };
}

function practiceAction(value: unknown): PracticeAction {
  if (!record(value)) throw invalid('Provide a practice action.');
  if (value.type === 'start') return { type: 'start' };
  if (value.type === 'hint' && validText(value.checkpointId)) return { type: 'hint', checkpointId: value.checkpointId };
  if (value.type === 'answer') return { type: 'answer', ...choice(value) };
  throw invalid('Choose a supported practice action.');
}

export const practiceEndpoint = endpoint('POST', async request => {
  const data = await body(request);
  const id = lessonId(data.lessonId);
  const example = exampleFor(id, data.exampleId, 'practice');
  const { version } = getLesson(id);
  if (!Number.isInteger(data.version) || !Array.isArray(data.acceptedChoices) || data.acceptedChoices.length > 12) {
    throw invalid('Provide a lesson version and the accepted choices.');
  }
  if (data.version !== version) throw new RequestError(409, 'LESSON_UPDATED', 'The lesson has changed. Reload the page to start again.');
  if (data.lessonId === 'topological-sort' && data.variant === 'dfs') {
    throw new RequestError(422, 'PRACTICE_UNAVAILABLE', 'Practice is available for Kahn’s algorithm only.');
  }
  const action = practiceAction(data.action);
  const result = practice({ lessonId: id, exampleId: example.id, version, action, acceptedChoices: data.acceptedChoices.map(choice) }, example);
  const existing = learnerId(request);
  const learner = existing ?? randomUUID();
  if (!existing || action.type === 'start' || result.completed) await saveProgress(learner, id, version, result.completed);
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (!existing) headers.set('Set-Cookie', sessionCookie(learner, request));
  return Response.json(result, { headers });
});

export const progressEndpoint = endpoint('GET', async request => {
  const id = learnerId(request);
  return Response.json(id ? await readProgress(id) : [], { headers: { 'Cache-Control': 'no-store' } });
});
