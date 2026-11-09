-- One row per learner, lesson and lesson version.
-- started_at and completed_at keep their first values (see src/server/progress.ts).
CREATE TABLE IF NOT EXISTS lesson_progress (
  learner_id     TEXT    NOT NULL,
  lesson_id      TEXT    NOT NULL,
  lesson_version INTEGER NOT NULL,
  started_at     TEXT    NOT NULL,
  completed_at   TEXT,
  PRIMARY KEY (learner_id, lesson_id, lesson_version)
);
