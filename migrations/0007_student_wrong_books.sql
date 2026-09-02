CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_owner_updated
  ON students(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS student_wrong_questions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  source_scope TEXT NOT NULL CHECK (source_scope IN ('public', 'mine')),
  source_library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  source_question_id TEXT NOT NULL,
  source_path TEXT NOT NULL DEFAULT '',
  question_snapshot_json TEXT NOT NULL,
  mistake_count INTEGER NOT NULL DEFAULT 1 CHECK (mistake_count >= 1),
  note TEXT NOT NULL DEFAULT '',
  mastered INTEGER NOT NULL DEFAULT 0 CHECK (mastered IN (0, 1)),
  last_wrong_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(student_id, source_library_id, source_question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_wrong_questions_owner_student
  ON student_wrong_questions(owner_user_id, student_id, mastered, last_wrong_at DESC);

PRAGMA optimize;
