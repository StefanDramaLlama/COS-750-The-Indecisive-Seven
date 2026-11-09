import { readdir, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";

let client: Client | undefined;

/** Local SQLite file by default; Turso when TURSO_DATABASE_URL is set (server-only). */
export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL || "file:db/local.db";
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

/** Swap the client (tests use an in-memory database). */
export function setDb(next: Client): void {
  client = next;
}

/**
 * Apply db/migrations/*.sql in name order, recording each in schema_migrations.
 * Run explicitly (npm run migrate) — never from a request handler.
 */
export async function migrate(db: Client, dir = path.resolve("db/migrations")): Promise<string[]> {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = new Set((await db.execute("SELECT name FROM schema_migrations")).rows.map((r) => String(r.name)));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await db.executeMultiple(sql);
    await db.execute({
      sql: "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      args: [file, new Date().toISOString()],
    });
    applied.push(file);
  }
  return applied;
}

export async function ensureLocalDbDir(): Promise<void> {
  if (!process.env.TURSO_DATABASE_URL) await mkdir(path.resolve("db"), { recursive: true });
}
