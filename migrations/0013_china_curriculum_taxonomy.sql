ALTER TABLE assignment_questions ADD COLUMN taxonomy_keys_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS curriculum_taxonomy_meta (
  framework_version TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('foundation', 'verified')),
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO curriculum_taxonomy_meta (framework_version, title, scope, status, created_at)
VALUES ('cn-math-junior-v1', '中国初中数学知识图谱 V1', '七至九年级数学课程通用骨架', 'foundation', 0);

CREATE INDEX IF NOT EXISTS idx_assignment_questions_taxonomy
  ON assignment_questions(assignment_id, sort_order, taxonomy_keys_json);
