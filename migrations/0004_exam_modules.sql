INSERT OR IGNORE INTO categories (id, name, parent_id, created_at, created_by) VALUES
  ('shenzhen-zhongkao-math', '深圳中考', NULL, 1, NULL),
  ('zhongkao-number-algebra', '数与代数', 'shenzhen-zhongkao-math', 2, NULL),
  ('zhongkao-number', '实数与代数式', 'zhongkao-number-algebra', 3, NULL),
  ('zhongkao-equations', '方程与不等式', 'zhongkao-number-algebra', 4, NULL),
  ('zhongkao-functions', '函数', 'shenzhen-zhongkao-math', 5, NULL),
  ('zhongkao-linear-function', '一次函数与反比例函数', 'zhongkao-functions', 6, NULL),
  ('zhongkao-quadratic-function', '二次函数', 'zhongkao-functions', 7, NULL),
  ('zhongkao-geometry', '图形与几何', 'shenzhen-zhongkao-math', 8, NULL),
  ('zhongkao-triangles', '三角形与四边形', 'zhongkao-geometry', 9, NULL),
  ('zhongkao-circles', '圆', 'zhongkao-geometry', 10, NULL),
  ('zhongkao-transformations', '图形变换', 'zhongkao-geometry', 11, NULL),
  ('zhongkao-data', '统计与概率', 'shenzhen-zhongkao-math', 12, NULL),
  ('zhongkao-comprehensive', '综合与应用', 'shenzhen-zhongkao-math', 13, NULL),
  ('shenzhen-independent-math', '深圳自主招生考试', NULL, 101, NULL),
  ('independent-number-algebra', '数论与代数', 'shenzhen-independent-math', 102, NULL),
  ('independent-number-theory', '整数与数论', 'independent-number-algebra', 103, NULL),
  ('independent-algebra', '代数变形与方程', 'independent-number-algebra', 104, NULL),
  ('independent-geometry', '几何综合', 'shenzhen-independent-math', 105, NULL),
  ('independent-plane-geometry', '平面几何', 'independent-geometry', 106, NULL),
  ('independent-geometric-reasoning', '几何推理与构造', 'independent-geometry', 107, NULL),
  ('independent-functions', '函数与规律', 'shenzhen-independent-math', 108, NULL),
  ('independent-combinatorics', '组合与计数', 'shenzhen-independent-math', 109, NULL),
  ('independent-logic', '逻辑与创新思维', 'shenzhen-independent-math', 110, NULL);

UPDATE categories SET name = '深国交入学考', created_at = 201 WHERE id = 'scie-math';
UPDATE categories SET created_at = created_at + 200 WHERE id LIKE 'scie-math-%' AND created_at < 200;

UPDATE questions
SET payload_json = json_set(
  payload_json,
  '$.provenance',
  CASE json_extract(payload_json, '$.provenance')
    WHEN '深国交真题' THEN '真题'
    WHEN '深国交风格题' THEN '风格题'
    ELSE COALESCE(json_extract(payload_json, '$.provenance'), '来源待核实')
  END
);

PRAGMA optimize;
