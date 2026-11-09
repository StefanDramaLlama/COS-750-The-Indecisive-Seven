import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client/web';
import type { LessonId, ProgressItem } from '../shared/contracts.ts';

const cookieName = 'graphwise_learner';
const validSessionId = /^[a-f0-9-]{36}$/i;
const hostedEnvironment = () => Boolean(process.env.VERCEL && process.env.VERCEL_ENV !== 'development');
export function learnerId(request: Request): string | undefined {
  const id = request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return id && validSessionId.test(id) ? id : undefined;
}

export function sessionCookie(id: string, request: Request): string {
  const secure = hostedEnvironment() || new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

export function openLocalDatabase(): DatabaseSync {
  const file = resolve(process.env.SQLITE_PATH || '.data/graphwise.sqlite');
  mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec('PRAGMA busy_timeout = 5000;');
  return database;
}

export function openTursoDatabase() {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url || !authToken) throw new Error('Turso connection variables are required.');
  return createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
}

let local: DatabaseSync | undefined;
let hosted: ReturnType<typeof openTursoDatabase> | undefined;
const usesTurso = () => hostedEnvironment() || Boolean(process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN);
const select = 'SELECT lesson_id, lesson_version, started_at, completed_at FROM lesson_progress WHERE learner_id = ? ORDER BY lesson_id';
const upsert = `
  INSERT INTO lesson_progress (learner_id, lesson_id, lesson_version, started_at, completed_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (learner_id, lesson_id, lesson_version) DO UPDATE
  SET completed_at = COALESCE(lesson_progress.completed_at, excluded.completed_at)
`;

export async function readProgress(id: string): Promise<ProgressItem[]> {
  const rows = usesTurso()
    ? (await (hosted ??= openTursoDatabase()).execute({ sql: select, args: [id] })).rows
    : (local ??= openLocalDatabase()).prepare(select).all(id);
  return rows.map(row => ({
    lessonId: row.lesson_id as LessonId,
    version: Number(row.lesson_version),
    startedAt: String(row.started_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at)
  }));
}

export async function saveProgress(id: string, lesson: LessonId, version: number, complete: boolean): Promise<void> {
  const now = new Date().toISOString();
  const values = [id, lesson, version, now, complete ? now : null] as const;
  if (usesTurso()) {
    await (hosted ??= openTursoDatabase()).execute({ sql: upsert, args: [...values] });
  } else {
    (local ??= openLocalDatabase()).prepare(upsert).run(...values);
  }
}
