CREATE TABLE IF NOT EXISTS libraries_v2 (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('public', 'personal')),
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  active_publication_id TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_libraries_v2_personal_owner
  ON libraries_v2(owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS library_publications (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('staging', 'active', 'superseded', 'failed')),
  diff_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  committed_at INTEGER
);

CREATE TABLE IF NOT EXISTS library_modules_v2 (
  row_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  publication_id TEXT,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_modules_v2_version
  ON library_modules_v2(library_id, publication_id, source_id);
CREATE INDEX IF NOT EXISTS idx_library_modules_v2_read
  ON library_modules_v2(library_id, publication_id, sort_order);

CREATE TABLE IF NOT EXISTS library_categories_v2 (
  row_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  publication_id TEXT,
  module_source_id TEXT NOT NULL,
  parent_source_id TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_categories_v2_version
  ON library_categories_v2(library_id, publication_id, source_id);
CREATE INDEX IF NOT EXISTS idx_library_categories_v2_read
  ON library_categories_v2(library_id, publication_id, module_source_id, sort_order);

CREATE TABLE IF NOT EXISTS library_questions_v2 (
  row_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  publication_id TEXT,
  module_source_id TEXT NOT NULL,
  category_source_id TEXT,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_questions_v2_version
  ON library_questions_v2(library_id, publication_id, source_id);
CREATE INDEX IF NOT EXISTS idx_library_questions_v2_read
  ON library_questions_v2(library_id, publication_id, module_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_questions_v2_creator
  ON library_questions_v2(created_by);

CREATE TABLE IF NOT EXISTS asset_library_access (
  access_key TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES question_assets(id) ON DELETE CASCADE,
  library_id TEXT NOT NULL REFERENCES libraries_v2(id) ON DELETE CASCADE,
  publication_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_library_access_asset
  ON asset_library_access(asset_id, library_id, publication_id);

CREATE TABLE IF NOT EXISTS scoped_library_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE question_assets ADD COLUMN content_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_assets_content_hash
  ON question_assets(content_hash) WHERE content_hash IS NOT NULL;

INSERT OR IGNORE INTO libraries_v2 (id, kind, owner_user_id, active_publication_id, published_at, created_at)
VALUES ('public', 'public', NULL, 'legacy', NULL, 0);

INSERT OR IGNORE INTO library_publications (id, library_id, status, diff_json, created_at, committed_at)
VALUES ('legacy', 'public', 'active', '{}', 0, 0);

INSERT OR IGNORE INTO libraries_v2 (id, kind, owner_user_id, active_publication_id, published_at, created_at)
SELECT 'personal:' || id, 'personal', id, NULL, NULL, created_at FROM users;

-- Map every legacy category to its top-level module.
WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
)
INSERT OR IGNORE INTO library_modules_v2 (
  row_id, source_id, library_id, publication_id, name, subtitle, sort_order,
  content_hash, created_by, created_at, updated_at
)
SELECT
  'legacy:public:module:' || categories.id,
  categories.id,
  'public',
  'legacy',
  categories.name,
  CASE categories.id
    WHEN 'shenzhen-zhongkao-math' THEN '数学真题与专题训练'
    WHEN 'shenzhen-independent-math' THEN '数学能力与创新题型'
    WHEN 'scie-math' THEN '数学真题与风格题'
    ELSE ''
  END,
  ROW_NUMBER() OVER (ORDER BY categories.created_at, categories.id) - 1,
  '', categories.created_by, categories.created_at, categories.created_at
FROM categories
WHERE categories.parent_id IS NULL;

WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
)
INSERT OR IGNORE INTO library_categories_v2 (
  row_id, source_id, library_id, publication_id, module_source_id,
  parent_source_id, name, sort_order, content_hash, created_by, created_at
)
SELECT
  'legacy:public:category:' || categories.id,
  categories.id,
  'public',
  'legacy',
  category_tree.root_id,
  categories.parent_id,
  categories.name,
  categories.created_at,
  '', categories.created_by, categories.created_at
FROM categories JOIN category_tree ON category_tree.id = categories.id
WHERE categories.parent_id IS NOT NULL;

-- Public keeps system/admin/local-admin questions. Member questions move to their owner library.
WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
)
INSERT OR IGNORE INTO library_questions_v2 (
  row_id, source_id, library_id, publication_id, module_source_id,
  category_source_id, payload_json, content_hash, created_by, created_at, updated_at
)
SELECT
  'legacy:public:question:' || questions.id,
  questions.id,
  'public',
  'legacy',
  category_tree.root_id,
  CASE WHEN questions.category_id = category_tree.root_id THEN NULL ELSE questions.category_id END,
  questions.payload_json,
  '', questions.created_by, questions.created_at, questions.updated_at
FROM questions
JOIN category_tree ON category_tree.id = questions.category_id
LEFT JOIN users ON users.id = questions.created_by
WHERE questions.created_by IS NULL OR users.role = 'admin' OR questions.created_by = 'local-admin';

-- A member receives a private copy of every legacy module containing one of their questions.
WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
), member_modules AS (
  SELECT DISTINCT questions.created_by AS user_id, category_tree.root_id
  FROM questions
  JOIN users ON users.id = questions.created_by AND users.role = 'member'
  JOIN category_tree ON category_tree.id = questions.category_id
)
INSERT OR IGNORE INTO library_modules_v2 (
  row_id, source_id, library_id, publication_id, name, subtitle, sort_order,
  content_hash, created_by, created_at, updated_at
)
SELECT
  'personal:' || member_modules.user_id || ':module:' || roots.id,
  roots.id,
  'personal:' || member_modules.user_id,
  NULL,
  roots.name,
  '',
  ROW_NUMBER() OVER (PARTITION BY member_modules.user_id ORDER BY roots.created_at, roots.id) - 1,
  '', member_modules.user_id, roots.created_at, roots.created_at
FROM member_modules JOIN categories AS roots ON roots.id = member_modules.root_id;

WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
), member_modules AS (
  SELECT DISTINCT questions.created_by AS user_id, category_tree.root_id
  FROM questions
  JOIN users ON users.id = questions.created_by AND users.role = 'member'
  JOIN category_tree ON category_tree.id = questions.category_id
)
INSERT OR IGNORE INTO library_categories_v2 (
  row_id, source_id, library_id, publication_id, module_source_id,
  parent_source_id, name, sort_order, content_hash, created_by, created_at
)
SELECT
  'personal:' || member_modules.user_id || ':category:' || categories.id,
  categories.id,
  'personal:' || member_modules.user_id,
  NULL,
  member_modules.root_id,
  categories.parent_id,
  categories.name,
  categories.created_at,
  '', member_modules.user_id, categories.created_at
FROM member_modules
JOIN category_tree ON category_tree.root_id = member_modules.root_id
JOIN categories ON categories.id = category_tree.id
WHERE categories.parent_id IS NOT NULL;

WITH RECURSIVE category_tree(id, root_id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT categories.id, category_tree.root_id
  FROM categories JOIN category_tree ON categories.parent_id = category_tree.id
)
INSERT OR IGNORE INTO library_questions_v2 (
  row_id, source_id, library_id, publication_id, module_source_id,
  category_source_id, payload_json, content_hash, created_by, created_at, updated_at
)
SELECT
  'personal:' || questions.created_by || ':question:' || questions.id,
  questions.id,
  'personal:' || questions.created_by,
  NULL,
  category_tree.root_id,
  CASE WHEN questions.category_id = category_tree.root_id THEN NULL ELSE questions.category_id END,
  questions.payload_json,
  '', questions.created_by, questions.created_at, questions.updated_at
FROM questions
JOIN users ON users.id = questions.created_by AND users.role = 'member'
JOIN category_tree ON category_tree.id = questions.category_id;

PRAGMA optimize;
