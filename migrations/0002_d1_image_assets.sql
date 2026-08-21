CREATE TABLE IF NOT EXISTS question_assets (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS question_asset_chunks (
  asset_id TEXT NOT NULL REFERENCES question_assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (asset_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_asset_chunks_asset ON question_asset_chunks(asset_id, chunk_index);

PRAGMA optimize;
