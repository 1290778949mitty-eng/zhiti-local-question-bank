ALTER TABLE homework_assets ADD COLUMN role TEXT NOT NULL DEFAULT 'submission_original'
  CHECK (role IN ('question', 'answer', 'submission_original', 'submission_processed', 'answer_crop'));
ALTER TABLE homework_assets ADD COLUMN upload_assignment_id TEXT;
ALTER TABLE homework_assets ADD COLUMN upload_submission_id TEXT;
ALTER TABLE homework_assets ADD COLUMN upload_student_id TEXT;

CREATE INDEX IF NOT EXISTS idx_homework_assets_upload_assignment
  ON homework_assets(upload_assignment_id, role, created_at);
CREATE INDEX IF NOT EXISTS idx_homework_assets_upload_submission
  ON homework_assets(upload_submission_id, upload_student_id, role, created_at);

PRAGMA optimize;
