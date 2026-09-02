CREATE TABLE IF NOT EXISTS homework_asset_cleanup_jobs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  r2_keys_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homework_cleanup_status
  ON homework_asset_cleanup_jobs(status, updated_at);

PRAGMA optimize;
