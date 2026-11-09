import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { ProgressEntry } from "../shared/types.js";

export const LEARNER_COOKIE = "gw_learner";

/** Course identity is not wired yet; until then an opaque server-issued id identifies the browser. */
export function newLearnerId(): string {
  return randomUUID();
}

export function isLearnerId(value: string | undefined): value is string {
  return !!value && /^[0-9a-f-]{36}$/i.test(value);
}

export function learnerCookie(id: string, secure: boolean): string {
  const parts = [`${LEARNER_COOKIE}=${id}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${60 * 60 * 24 * 365}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Record a practice start. Keeps the first started_at if the row exists. */
export async function markStarted(db: Client, learnerId: string, lessonId: string, version: number, now = new Date()) {
  await db.execute({
    sql: `INSERT INTO lesson_progress (learner_id, lesson_id, lesson_version, started_at, completed_at)
          VALUES (?, ?, ?, ?, NULL)
          ON CONFLICT (learner_id, lesson_id, lesson_version)
          DO UPDATE SET started_at = COALESCE(lesson_progress.started_at, excluded.started_at)`,
    args: [learnerId, lessonId, version, now.toISOString()],
  });
}

/** Record completion. Never overwrites an earlier completed_at. */
export async function markCompleted(db: Client, learnerId: string, lessonId: string, version: number, now = new Date()) {
  const ts = now.toISOString();
  await db.execute({
    sql: `INSERT INTO lesson_progress (learner_id, lesson_id, lesson_version, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (learner_id, lesson_id, lesson_version)
          DO UPDATE SET started_at = COALESCE(lesson_progress.started_at, excluded.started_at),
                        completed_at = COALESCE(lesson_progress.completed_at, excluded.completed_at)`,
    args: [learnerId, lessonId, version, ts, ts],
  });
}

export async function listProgress(db: Client, learnerId: string): Promise<ProgressEntry[]> {
  const rs = await db.execute({
    sql: `SELECT lesson_id, lesson_version, started_at, completed_at FROM lesson_progress
          WHERE learner_id = ? ORDER BY lesson_id, lesson_version`,
    args: [learnerId],
  });
  return rs.rows.map((r) => ({
    lessonId: String(r.lesson_id),
    lessonVersion: Number(r.lesson_version),
    startedAt: String(r.started_at),
    completedAt: r.completed_at === null ? null : String(r.completed_at),
  }));
}
