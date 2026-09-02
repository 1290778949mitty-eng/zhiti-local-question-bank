ALTER TABLE assignment_questions ADD COLUMN knowledge_tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE assignment_questions ADD COLUMN capability_keys_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE grading_items ADD COLUMN step_analysis_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE grading_items ADD COLUMN evidence_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE grading_items ADD COLUMN capability_keys_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE grading_items ADD COLUMN corrected_at INTEGER;

CREATE TABLE IF NOT EXISTS submission_reports (
  submission_id TEXT PRIMARY KEY REFERENCES homework_submissions(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  framework_version TEXT NOT NULL,
  overall_summary TEXT NOT NULL DEFAULT '',
  student_message TEXT NOT NULL DEFAULT '',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  gaps_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_reports_owner ON submission_reports(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS student_capability_evidence (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  grading_item_id TEXT NOT NULL REFERENCES grading_items(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  capability_label TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('knowledge', 'skill')),
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'partial', 'incorrect')),
  confidence REAL NOT NULL DEFAULT 0,
  diagnosis TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(grading_item_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_capability_evidence_student ON student_capability_evidence(student_id, capability_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_evidence_submission ON student_capability_evidence(submission_id, grading_item_id);

CREATE TABLE IF NOT EXISTS grading_item_revisions (
  id TEXT PRIMARY KEY,
  grading_item_id TEXT NOT NULL REFERENCES grading_items(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  corrected_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grading_revisions_item ON grading_item_revisions(grading_item_id, created_at DESC);
