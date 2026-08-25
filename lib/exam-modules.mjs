export const QUESTION_PROVENANCES = ["真题", "风格题", "来源待核实"];

export const EXAM_MODULES = [
  {
    id: "shenzhen-zhongkao",
    name: "深圳中考",
    subtitle: "数学真题与专题训练",
    rootCategoryId: "shenzhen-zhongkao-math",
    paperTitle: "深圳中考数学专项练习",
  },
  {
    id: "shenzhen-independent",
    name: "深圳自主招生考试",
    subtitle: "数学能力与创新题型",
    rootCategoryId: "shenzhen-independent-math",
    paperTitle: "深圳自主招生数学专项练习",
  },
  {
    id: "scie-entrance",
    name: "深国交入学考",
    subtitle: "数学真题与风格题",
    rootCategoryId: "scie-math",
    paperTitle: "深国交入学数学专项练习",
  },
];

export const EXAM_SEED_CATEGORIES = [
  { id: "shenzhen-zhongkao-math", name: "深圳中考", parentId: null, createdAt: 1 },
  { id: "zhongkao-number-algebra", name: "数与代数", parentId: "shenzhen-zhongkao-math", createdAt: 2 },
  { id: "zhongkao-number", name: "实数与代数式", parentId: "zhongkao-number-algebra", createdAt: 3 },
  { id: "zhongkao-equations", name: "方程与不等式", parentId: "zhongkao-number-algebra", createdAt: 4 },
  { id: "zhongkao-functions", name: "函数", parentId: "shenzhen-zhongkao-math", createdAt: 5 },
  { id: "zhongkao-linear-function", name: "一次函数与反比例函数", parentId: "zhongkao-functions", createdAt: 6 },
  { id: "zhongkao-quadratic-function", name: "二次函数", parentId: "zhongkao-functions", createdAt: 7 },
  { id: "zhongkao-geometry", name: "图形与几何", parentId: "shenzhen-zhongkao-math", createdAt: 8 },
  { id: "zhongkao-triangles", name: "三角形与四边形", parentId: "zhongkao-geometry", createdAt: 9 },
  { id: "zhongkao-circles", name: "圆", parentId: "zhongkao-geometry", createdAt: 10 },
  { id: "zhongkao-transformations", name: "图形变换", parentId: "zhongkao-geometry", createdAt: 11 },
  { id: "zhongkao-data", name: "统计与概率", parentId: "shenzhen-zhongkao-math", createdAt: 12 },
  { id: "zhongkao-comprehensive", name: "综合与应用", parentId: "shenzhen-zhongkao-math", createdAt: 13 },

  { id: "shenzhen-independent-math", name: "深圳自主招生考试", parentId: null, createdAt: 101 },
  { id: "independent-number-algebra", name: "数论与代数", parentId: "shenzhen-independent-math", createdAt: 102 },
  { id: "independent-number-theory", name: "整数与数论", parentId: "independent-number-algebra", createdAt: 103 },
  { id: "independent-algebra", name: "代数变形与方程", parentId: "independent-number-algebra", createdAt: 104 },
  { id: "independent-geometry", name: "几何综合", parentId: "shenzhen-independent-math", createdAt: 105 },
  { id: "independent-plane-geometry", name: "平面几何", parentId: "independent-geometry", createdAt: 106 },
  { id: "independent-geometric-reasoning", name: "几何推理与构造", parentId: "independent-geometry", createdAt: 107 },
  { id: "independent-functions", name: "函数与规律", parentId: "shenzhen-independent-math", createdAt: 108 },
  { id: "independent-combinatorics", name: "组合与计数", parentId: "shenzhen-independent-math", createdAt: 109 },
  { id: "independent-logic", name: "逻辑与创新思维", parentId: "shenzhen-independent-math", createdAt: 110 },

  { id: "scie-math", name: "深国交入学考", parentId: null, createdAt: 201 },
  { id: "scie-math-number-algebra", name: "数与代数", parentId: "scie-math", createdAt: 202 },
  { id: "scie-math-number", name: "数与式", parentId: "scie-math-number-algebra", createdAt: 203 },
  { id: "scie-math-equations", name: "方程与不等式", parentId: "scie-math-number-algebra", createdAt: 204 },
  { id: "scie-math-patterns", name: "数列与规律", parentId: "scie-math-number-algebra", createdAt: 205 },
  { id: "scie-math-geometry", name: "几何与图形", parentId: "scie-math", createdAt: 206 },
  { id: "scie-math-plane-geometry", name: "平面几何", parentId: "scie-math-geometry", createdAt: 207 },
  { id: "scie-math-transformations", name: "图形变换", parentId: "scie-math-geometry", createdAt: 208 },
  { id: "scie-math-measurement", name: "度量与空间", parentId: "scie-math-geometry", createdAt: 209 },
  { id: "scie-math-functions", name: "函数与坐标", parentId: "scie-math", createdAt: 210 },
  { id: "scie-math-coordinate", name: "坐标与图像", parentId: "scie-math-functions", createdAt: 211 },
  { id: "scie-math-graphs", name: "函数与变化", parentId: "scie-math-functions", createdAt: 212 },
  { id: "scie-math-data", name: "统计与概率", parentId: "scie-math", createdAt: 213 },
  { id: "scie-math-statistics", name: "数据与统计", parentId: "scie-math-data", createdAt: 214 },
  { id: "scie-math-probability", name: "概率", parentId: "scie-math-data", createdAt: 215 },
  { id: "scie-math-comprehensive", name: "逻辑与综合", parentId: "scie-math", createdAt: 216 },
  { id: "scie-math-reasoning", name: "逻辑推理", parentId: "scie-math-comprehensive", createdAt: 217 },
  { id: "scie-math-applied", name: "综合应用", parentId: "scie-math-comprehensive", createdAt: 218 },
];

export function normalizeQuestionProvenance(value) {
  if (value === "深国交真题") return "真题";
  if (value === "深国交风格题") return "风格题";
  return QUESTION_PROVENANCES.includes(value) ? value : "来源待核实";
}
