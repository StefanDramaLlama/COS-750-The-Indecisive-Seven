import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import type { Choice, LessonId, PracticeAction, PracticeResponse, ProgressItem } from '../src/shared/contracts.ts';
import { lessonsEndpoint, practiceEndpoint, progressEndpoint, quizEndpoint, runsEndpoint } from '../src/server/http.ts';
import { getLesson, lessonIds } from '../src/server/lessons/catalog.ts';
import { openLocalDatabase, saveProgress, sessionCookie } from '../src/server/progress.ts';
import { quizQuestions } from '../src/server/quiz-bank.ts';

const directory = mkdtempSync(join(tmpdir(), 'graphwise-test-'));
process.env.SQLITE_PATH = join(directory, 'test.sqlite');
delete process.env.VERCEL;
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
const database = openLocalDatabase();
database.exec(readFileSync('db/migrations/001_lesson_progress.sql', 'utf8'));
database.close();
after(() => { rmSync(directory, { recursive: true, force: true }); });

const request = (path: string, body?: unknown, cookie?: string) => new Request(`http://localhost${path}`, {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  headers: cookie ? { Cookie: cookie } : undefined
});
const submit = (id: LessonId, action: PracticeAction, history: Choice[] = [], cookie?: string, version = 1) =>
  practiceEndpoint(request('/api/practice', {
    lessonId: id, exampleId: getLesson(id).examples.find(item => item.kind === 'practice')!.id,
    action, version, acceptedChoices: history
  }, cookie));

test('public routes list catalogue lessons, validate inputs, and keep practice traces private', async () => {
  const lessonList = await (await lessonsEndpoint(request('/api/lessons'))).json();
  assert.equal(lessonList.length, lessonIds.length);
  assert.ok(lessonList.every((lesson: { id: string }) => lesson.id !== 'review' && lesson.id !== 'quiz'));
  assert.equal((await lessonsEndpoint(request('/api/lessons?id=missing'))).status, 404);
  assert.equal((await lessonsEndpoint(request('/api/lessons', {}))).status, 405);
  assert.equal((await runsEndpoint(request('/api/runs', {}))).status, 400);
  assert.equal((await runsEndpoint(request('/api/runs', { lessonId: 'dijkstra', exampleId: 'cheaper-connection' }))).status, 404);
  const response = await runsEndpoint(request('/api/runs', { lessonId: 'dijkstra', exampleId: 'unreachable' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.kind, 'unreachable');
});

test('quiz withholds answers until a complete submission and grades only the 42 choices', async () => {
  const learner = randomUUID();
  const cookie = sessionCookie(learner, request('/api/quiz')).split(';')[0];
  for (const id of lessonIds) await saveProgress(learner, id, getLesson(id).version, true);

  const list = await quizEndpoint(request('/api/quiz', undefined, cookie));
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('Cache-Control'), 'no-store');
  const questions = await list.json();
  assert.equal(questions.length, 48);
  assert.equal(questions.filter((question: {kind: string}) => question.kind === 'written').length, 6);
  assert.ok(questions.every((question: object) => !('answer' in question || 'explanation' in question || 'modelAnswer' in question)));

  const answers = Object.fromEntries(quizQuestions.map(question => [question.id,
    question.kind === 'choice' ? question.answer : 'A written response to compare after submitting.'
  ]));
  assert.equal((await quizEndpoint(request('/api/quiz', { answers: {} }, cookie))).status, 400);
  assert.equal((await quizEndpoint(request('/api/quiz', { answers: { ...answers, 43: '   ' } }, cookie))).status, 400);
  assert.equal((await quizEndpoint(request('/api/quiz', { answers: { ...answers, 1: 'invalid' } }, cookie))).status, 400);

  const graded = await quizEndpoint(request('/api/quiz', { answers: { ...answers, 1: 'B' } }, cookie));
  assert.equal(graded.status, 200);
  const result = await graded.json();
  assert.equal(result.correct, 41);
  assert.equal(result.total, 42);
  assert.equal(result.feedback[0].correct, false);
  assert.equal(result.feedback[0].answer, 'A');
  assert.equal(result.feedback.filter((item: { modelAnswer?: string }) => item.modelAnswer).length, 6);
});

test('quiz unlocks only when the same learner completes every current Studio lesson', async () => {
  const learner = randomUUID();
  const cookie = sessionCookie(learner, request('/api/quiz')).split(';')[0];
  const last = lessonIds.at(-1)!;
  const version = getLesson(last).version;
  for (const id of lessonIds.slice(0, -1)) await saveProgress(learner, id, getLesson(id).version, true);
  await saveProgress(learner, last, version - 1, true);
  await saveProgress(learner, last, version, false);

  const locked = await quizEndpoint(request('/api/quiz', undefined, cookie));
  assert.equal(locked.status, 403);
  assert.equal((await locked.json()).error.code, 'QUIZ_LOCKED');
  assert.equal((await quizEndpoint(request('/api/quiz', { answers: {} }, cookie))).status, 403);

  await saveProgress(learner, last, version, true);
  assert.equal((await quizEndpoint(request('/api/quiz', undefined, cookie))).status, 200);
  assert.equal((await quizEndpoint(request('/api/quiz'))).status, 403);
});

test('practice validates replay and saves completion once per learner and lesson version', async () => {
  const first = await submit('dijkstra', { type: 'start' });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const header = first.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly; SameSite=Lax/);
  const cookie = header.split(';')[0];
  const initial: PracticeResponse = await first.json();
  assert.equal(initial.prompt?.id, 'estimate');
  assert.equal(initial.result, undefined);
  assert.equal(initial.frames.at(-1)?.event, 'consider');
  assert.equal((await submit('dijkstra', { type: 'start' }, [], cookie, 0)).status, 409);
  assert.equal((await submit('dijkstra', { type: 'hint', checkpointId: 'estimate' }, [{ checkpointId: 'estimate', optionId: '3' }], cookie)).status, 422);

  const incorrect = await submit('dijkstra', { type: 'answer', checkpointId: 'estimate', optionId: '3' }, [], cookie);
  assert.equal(incorrect.status, 200);
  const retry: PracticeResponse = await incorrect.json();
  assert.deepEqual(retry.frames, initial.frames);
  assert.equal(retry.feedback?.kind, 'incorrect');
  assert.deepEqual(retry.acceptedChoices, []);
  const hinted = await submit('dijkstra', { type: 'hint', checkpointId: 'estimate' }, [], cookie);
  assert.equal((await hinted.json()).feedback.kind, 'hint');

  const correct = await submit('dijkstra', { type: 'answer', checkpointId: 'estimate', optionId: '5' }, [], cookie);
  const next: PracticeResponse = await correct.json();
  assert.equal(next.prompt?.id, 'route');
  const finish = () => submit('dijkstra', { type: 'answer', checkpointId: 'route', optionId: 'ACD' }, next.acceptedChoices, cookie);
  const complete: PracticeResponse = await (await finish()).json();
  assert.equal(complete.completed, true);
  assert.deepEqual(complete.result, { kind: 'path', vertices: ['A', 'C', 'D'], edges: ['A-C', 'C-D'], cost: 5 });

  const progress = async (): Promise<ProgressItem[]> => (await progressEndpoint(request('/api/progress', undefined, cookie))).json();
  const stored = await progress();
  assert.equal(stored.length, 1);
  assert.ok(stored[0].completedAt);
  await finish();
  await submit('dijkstra', { type: 'start' }, [], cookie);
  assert.deepEqual(await progress(), stored);
  assert.deepEqual(await (await progressEndpoint(request('/api/progress'))).json(), []);
});

const solutions = {
  bfs: [['queue', 'B'], ['hops', '2']],
  dfs: [['return', 'A'], ['unreached', 'CD']],
  kruskal: [['cycle-edge', 'skip'], ['total', '5']],
  prim: [['first-link', 'A-B'], ['total', '3']],
  compare: [['bfs-route', 'AD'], ['dijkstra-route', 'ACD'], ['choose', 'bfs']],
  'compare-trees': [['same-cost', 'same'], ['trenches', 'kruskal'], ['existing-code', 'prim']]
} satisfies Partial<Record<LessonId, [string, string][]>>;

async function completePractice(lesson: LessonId, answers: [string, string][]) {
  const first = await submit(lesson, { type: 'start' });
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  let run: PracticeResponse = await first.json();
  for (const [checkpointId, optionId] of answers) {
    assert.equal(run.prompt?.id, checkpointId);
    const response = await submit(lesson, { type: 'answer', checkpointId, optionId }, run.acceptedChoices, cookie);
    assert.equal(response.status, 200);
    run = await response.json();
    assert.equal(run.feedback?.kind, 'correct');
  }
  assert.equal(run.completed, true);
  return run.result;
}

for (const [lesson, answers] of Object.entries(solutions)) {
  test(`${lesson}: complete both practice checkpoints`, async () => {
    assert.ok(await completePractice(lesson as LessonId, answers));
  });
}

test('Kahn continues from either learner-chosen ready task', async () => {
  for (const [choice, order] of [['B', 'ABCDE'], ['C', 'ACBDE']]) {
    const result = await completePractice('topological-sort', [['ready', choice], ['prerequisites', 'both']]);
    assert.deepEqual(result, { kind: 'ordering', order: [...order] });
  }
});
