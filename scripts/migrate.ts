// npm run migrate: apply db/migrations to the local SQLite file, or to Turso when
// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are set. Run once per environment before deploying.
import { ensureLocalDbDir, getDb, migrate } from "../src/server/db.js";

await ensureLocalDbDir();
const applied = await migrate(getDb());
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
