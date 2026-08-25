import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const local = !remote;
const command = [
  "npx", "wrangler", "d1", "execute", "zhiti-question-bank",
  local ? "--local" : "--remote", "--json", "--command",
];

function query(sql) {
  const result = spawnSync(command[0], [...command.slice(1), sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "D1 审计查询失败");
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || !parsed[0]?.success) throw new Error(`D1 审计返回异常：${result.stdout}`);
  return parsed[0].results;
}

const counts = query(`
  SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM questions) AS legacy_questions,
    (SELECT COUNT(*) FROM categories) AS legacy_categories,
    (SELECT COUNT(*) FROM library_questions_v2) AS scoped_questions,
    (SELECT COUNT(*) FROM library_categories_v2) AS scoped_categories,
    (SELECT COUNT(*) FROM library_modules_v2) AS scoped_modules,
    (SELECT COUNT(*) FROM question_assets) AS assets,
    (SELECT COUNT(*) FROM asset_library_access) AS asset_links
`)[0];

const missing = query(`
  WITH expected AS (
    SELECT questions.id,
      CASE WHEN users.role = 'member' THEN 'personal:' || questions.created_by ELSE 'public' END AS library_id,
      CASE WHEN users.role = 'member' THEN NULL ELSE 'legacy' END AS publication_id
    FROM questions LEFT JOIN users ON users.id = questions.created_by
  )
  SELECT expected.id
  FROM expected
  LEFT JOIN library_questions_v2 scoped
    ON scoped.source_id = expected.id
   AND scoped.library_id = expected.library_id
   AND scoped.publication_id IS expected.publication_id
  WHERE scoped.source_id IS NULL
  LIMIT 20
`);

const duplicates = query(`
  WITH expected AS (
    SELECT questions.id,
      CASE WHEN users.role = 'member' THEN 'personal:' || questions.created_by ELSE 'public' END AS library_id,
      CASE WHEN users.role = 'member' THEN NULL ELSE 'legacy' END AS publication_id
    FROM questions LEFT JOIN users ON users.id = questions.created_by
  )
  SELECT expected.id AS source_id, COUNT(scoped.row_id) AS copies
  FROM expected
  LEFT JOIN library_questions_v2 scoped
    ON scoped.source_id = expected.id
   AND scoped.library_id = expected.library_id
   AND scoped.publication_id IS expected.publication_id
  GROUP BY expected.id
  HAVING COUNT(scoped.row_id) <> 1
  LIMIT 20
`);

const wrongMemberOwners = query(`
  SELECT questions.id, questions.created_by, scoped.library_id
  FROM questions
  JOIN users ON users.id = questions.created_by AND users.role = 'member'
  JOIN library_questions_v2 scoped ON scoped.source_id = questions.id
  WHERE scoped.library_id <> 'personal:' || questions.created_by
  LIMIT 20
`);

const wrongPublicOwners = query(`
  SELECT questions.id, questions.created_by, scoped.library_id
  FROM questions
  LEFT JOIN users ON users.id = questions.created_by
  JOIN library_questions_v2 scoped ON scoped.source_id = questions.id
  WHERE (questions.created_by IS NULL OR users.role = 'admin' OR questions.created_by = 'local-admin')
    AND scoped.library_id <> 'public'
  LIMIT 20
`);

const badReferences = query(`
  SELECT scoped.source_id
  FROM library_questions_v2 scoped
  LEFT JOIN library_modules_v2 modules
    ON modules.library_id = scoped.library_id
   AND modules.publication_id IS scoped.publication_id
   AND modules.source_id = scoped.module_source_id
  LEFT JOIN library_categories_v2 categories
    ON categories.library_id = scoped.library_id
   AND categories.publication_id IS scoped.publication_id
   AND categories.source_id = scoped.category_source_id
  WHERE modules.source_id IS NULL
     OR (scoped.category_source_id IS NOT NULL AND categories.source_id IS NULL)
  LIMIT 20
`);

const missingAssetAccess = query(`
  WITH referenced AS (
    SELECT DISTINCT questions.library_id, questions.publication_id,
      substr(value.value, instr(value.value, '/api/assets/') + 12, 36) AS asset_id
    FROM library_questions_v2 AS questions
    JOIN json_tree(questions.payload_json) AS value
    WHERE value.type = 'text' AND instr(value.value, '/api/assets/') > 0
  )
  SELECT referenced.library_id, referenced.publication_id, referenced.asset_id
  FROM referenced
  JOIN question_assets ON question_assets.id = referenced.asset_id
  LEFT JOIN asset_library_access access
    ON access.library_id = referenced.library_id
   AND access.publication_id IS referenced.publication_id
   AND access.asset_id = referenced.asset_id
  WHERE access.asset_id IS NULL
  LIMIT 20
`);

const failures = [
  ["legacy question is missing from scoped storage", missing],
  ["legacy question was migrated more or less than once", duplicates],
  ["member question is outside its owner library", wrongMemberOwners],
  ["system or admin question is outside the public library", wrongPublicOwners],
  ["scoped question has a broken module or category reference", badReferences],
  ["referenced image has no scoped access association", missingAssetAccess],
].filter(([, rows]) => rows.length);

process.stdout.write(`${JSON.stringify({ location: remote ? "remote" : "local", counts }, null, 2)}\n`);
if (failures.length) {
  for (const [message, rows] of failures) process.stderr.write(`${message}: ${JSON.stringify(rows)}\n`);
  process.exit(1);
}
process.stdout.write("作用域题库迁移审计通过。\n");
