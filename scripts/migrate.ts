import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openLocalDatabase, openTursoDatabase } from '../src/server/progress.ts';

const directory = 'db/migrations';
const migrations = readdirSync(directory).filter(file => /^\d+_[a-z_]+\.sql$/.test(file)).sort();
const schema = 'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)';
if (process.argv.includes('--remote')) {
  const database = openTursoDatabase();
  try {
    await database.execute(schema);
    const { rows } = await database.execute('SELECT name FROM schema_migrations');
    for (const file of migrations.filter(file => !rows.some(row => row.name === file))) {
      await database.batch([
        readFileSync(join(directory, file), 'utf8').trim(),
        { sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [file] }
      ], 'write');
      console.log(`Applied ${file} to Turso.`);
    }
  } finally {
    database.close();
  }
} else {
  const database = openLocalDatabase();
  try {
    database.exec(schema);
    for (const file of migrations) {
      database.exec('BEGIN IMMEDIATE');
      try {
        if (!database.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(file)) {
          database.exec(readFileSync(join(directory, file), 'utf8'));
          database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
          console.log(`Applied ${file} to local SQLite.`);
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  } finally {
    database.close();
  }
}
