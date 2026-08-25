INSERT OR IGNORE INTO categories (id, name, parent_id, created_at, created_by) VALUES
  ('scie-math', '深国交入学数学', NULL, 1, NULL),
  ('scie-math-number-algebra', '数与代数', 'scie-math', 2, NULL),
  ('scie-math-number', '数与式', 'scie-math-number-algebra', 3, NULL),
  ('scie-math-equations', '方程与不等式', 'scie-math-number-algebra', 4, NULL),
  ('scie-math-patterns', '数列与规律', 'scie-math-number-algebra', 5, NULL),
  ('scie-math-geometry', '几何与图形', 'scie-math', 6, NULL),
  ('scie-math-plane-geometry', '平面几何', 'scie-math-geometry', 7, NULL),
  ('scie-math-transformations', '图形变换', 'scie-math-geometry', 8, NULL),
  ('scie-math-measurement', '度量与空间', 'scie-math-geometry', 9, NULL),
  ('scie-math-functions', '函数与坐标', 'scie-math', 10, NULL),
  ('scie-math-coordinate', '坐标与图像', 'scie-math-functions', 11, NULL),
  ('scie-math-graphs', '函数与变化', 'scie-math-functions', 12, NULL),
  ('scie-math-data', '统计与概率', 'scie-math', 13, NULL),
  ('scie-math-statistics', '数据与统计', 'scie-math-data', 14, NULL),
  ('scie-math-probability', '概率', 'scie-math-data', 15, NULL),
  ('scie-math-comprehensive', '逻辑与综合', 'scie-math', 16, NULL),
  ('scie-math-reasoning', '逻辑推理', 'scie-math-comprehensive', 17, NULL),
  ('scie-math-applied', '综合应用', 'scie-math-comprehensive', 18, NULL);

-- 仅移除项目自带、ID 固定的三道通用演示题。用户自行录入的题目不会被删除。
DELETE FROM questions WHERE id IN ('q1', 'q2', 'q3');

-- 旧版七年级目录若仍含用户题目，则整体保留，避免升级时误删数据；
-- 只有目录已空时才清理这些固定 ID 的演示分类。
DELETE FROM categories
WHERE id IN ('number-line', 'opposite', 'absolute', 'algebra', 'equation')
  AND NOT EXISTS (
    SELECT 1 FROM questions
    WHERE questions.category_id = categories.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM categories AS children
    WHERE children.parent_id = categories.id
  );
DELETE FROM categories
WHERE id = 'rational'
  AND NOT EXISTS (SELECT 1 FROM questions WHERE questions.category_id = categories.id)
  AND NOT EXISTS (SELECT 1 FROM categories AS children WHERE children.parent_id = categories.id);
DELETE FROM categories
WHERE id = 'math-7'
  AND NOT EXISTS (SELECT 1 FROM questions WHERE questions.category_id = categories.id)
  AND NOT EXISTS (SELECT 1 FROM categories AS children WHERE children.parent_id = categories.id);

PRAGMA optimize;
