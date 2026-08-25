-- Establish image authorization before the first scoped-library request.
-- json_tree exposes image URLs stored in arrays, DOCX asset maps and nested fields.
INSERT OR IGNORE INTO asset_library_access (
  access_key, asset_id, library_id, publication_id, created_at
)
SELECT
  questions.library_id || '|' || COALESCE(questions.publication_id, 'personal') || '|' || assets.id,
  assets.id,
  questions.library_id,
  questions.publication_id,
  questions.created_at
FROM library_questions_v2 AS questions
JOIN json_tree(questions.payload_json) AS value
JOIN question_assets AS assets
  ON assets.id = substr(value.value, instr(value.value, '/api/assets/') + 12, 36)
WHERE value.type = 'text'
  AND instr(value.value, '/api/assets/') > 0;

PRAGMA optimize;
