CREATE TABLE IF NOT EXISTS homework_classes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_user_id, name)
);

CREATE TABLE IF NOT EXISTS homework_class_students (
  class_id TEXT NOT NULL REFERENCES homework_classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS teacher_student_portals (
  owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS student_accounts (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_id TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_user_id, login_id)
);

CREATE TABLE IF NOT EXISTS student_sessions (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_sessions_expiry ON student_sessions(expires_at);

CREATE TABLE IF NOT EXISTS homework_assignments (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  due_at INTEGER,
  template_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (template_confirmed IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_owner_status ON homework_assignments(owner_user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS homework_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homework_assets_owner ON homework_assets(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assignment_assets (
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES homework_assets(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('question', 'answer')),
  page_order INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, role, page_order),
  UNIQUE(asset_id)
);

CREATE TABLE IF NOT EXISTS assignment_questions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  question_number TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('单选题', '多选题', '填空题', '判断题', '解答题')),
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '',
  bbox_json TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(assignment_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_assignment_questions_order ON assignment_questions(assignment_id, sort_order);

CREATE TABLE IF NOT EXISTS assignment_targets (
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'processing', 'review_required', 'ready', 'published', 'returned', 'failed')),
  submitted_by_type TEXT NOT NULL CHECK (submitted_by_type IN ('teacher', 'student')),
  submitted_by_id TEXT NOT NULL,
  submitted_at INTEGER,
  published_at INTEGER,
  returned_at INTEGER,
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(assignment_id, student_id, version)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_status ON homework_submissions(assignment_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_student_status ON homework_submissions(student_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS submission_pages (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  original_asset_id TEXT NOT NULL REFERENCES homework_assets(id) ON DELETE RESTRICT,
  processed_asset_id TEXT NOT NULL REFERENCES homework_assets(id) ON DELETE RESTRICT,
  page_order INTEGER NOT NULL,
  quality_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(submission_id, page_order)
);

CREATE TABLE IF NOT EXISTS grading_items (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  assignment_question_id TEXT NOT NULL REFERENCES assignment_questions(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES submission_pages(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'partial', 'incorrect', 'unreadable', 'review_required')),
  student_answer TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  error_type TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  bbox_json TEXT,
  requires_review INTEGER NOT NULL DEFAULT 1 CHECK (requires_review IN (0, 1)),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  wrong_book_applied_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(submission_id, assignment_question_id)
);

CREATE INDEX IF NOT EXISTS idx_grading_submission_review ON grading_items(submission_id, requires_review, updated_at);

ALTER TABLE student_wrong_questions ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'library' CHECK (source_kind IN ('library', 'assignment'));
ALTER TABLE student_wrong_questions ADD COLUMN assignment_id TEXT;
ALTER TABLE student_wrong_questions ADD COLUMN submission_id TEXT;
ALTER TABLE student_wrong_questions ADD COLUMN grading_item_id TEXT;
ALTER TABLE student_wrong_questions ADD COLUMN student_answer TEXT NOT NULL DEFAULT '';
ALTER TABLE student_wrong_questions ADD COLUMN feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE student_wrong_questions ADD COLUMN answer_crop_asset_id TEXT;

CREATE INDEX IF NOT EXISTS idx_wrong_questions_assignment ON student_wrong_questions(student_id, assignment_id, submission_id);

PRAGMA optimize;
