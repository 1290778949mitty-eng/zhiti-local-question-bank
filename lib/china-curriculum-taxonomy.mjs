import taxonomy from "../data/china-math-taxonomy.v1.json" with { type: "json" };

export const CHINA_MATH_TAXONOMY_VERSION = taxonomy.version;
export const CHINA_MATH_NODES = taxonomy.nodes.map((node) => ({ ...node, dimension: "knowledge" }));
export const CHINA_MATH_EDGES = taxonomy.edges;
export const CHINA_TEXTBOOK_EDITIONS = taxonomy.editions;
export const CHINA_MATH_TAXONOMY = { ...taxonomy, nodes: CHINA_MATH_NODES };

const NODE_BY_KEY = new Map(CHINA_MATH_NODES.map((node) => [node.key, node]));
const DOMAIN_NODES = CHINA_MATH_NODES.filter((node) => node.level === "domain");

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s·•，,、；;：:（）()【】]+/g, "").replaceAll("[", "").replaceAll("]", "");
}

export function validateChinaMathTaxonomy(value = taxonomy) {
  const errors = [];
  const nodeKeys = new Set();
  const editionKeys = new Set();
  for (const node of Array.isArray(value?.nodes) ? value.nodes : []) {
    if (!node?.key || nodeKeys.has(node.key)) errors.push(`节点 ID 重复或为空：${node?.key ?? ""}`);
    nodeKeys.add(node?.key);
  }
  for (const edition of Array.isArray(value?.editions) ? value.editions : []) {
    if (!edition?.key || editionKeys.has(edition.key)) errors.push(`教材版本 ID 重复或为空：${edition?.key ?? ""}`);
    editionKeys.add(edition?.key);
  }
  for (const node of Array.isArray(value?.nodes) ? value.nodes : []) {
    if (!nodeKeys.has(node.domainKey)) errors.push(`节点 ${node.key} 的领域不存在：${node.domainKey}`);
    if (node.parentKey && !nodeKeys.has(node.parentKey)) errors.push(`节点 ${node.key} 的父节点不存在：${node.parentKey}`);
    if (![7, 8, 9].includes(node.stage)) errors.push(`节点 ${node.key} 的年级阶段无效`);
  }
  const outgoing = new Map();
  for (const edge of Array.isArray(value?.edges) ? value.edges : []) {
    if (!nodeKeys.has(edge.sourceKey) || !nodeKeys.has(edge.targetKey)) errors.push(`依赖边引用不存在：${edge.sourceKey} -> ${edge.targetKey}`);
    if (edge.sourceKey === edge.targetKey) errors.push(`依赖边不能指向自身：${edge.sourceKey}`);
    const targets = outgoing.get(edge.sourceKey) ?? [];
    targets.push(edge.targetKey); outgoing.set(edge.sourceKey, targets);
  }
  const visiting = new Set(); const visited = new Set();
  function visit(key) {
    if (visiting.has(key)) { errors.push(`依赖图存在环：${key}`); return; }
    if (visited.has(key)) return;
    visiting.add(key); for (const target of outgoing.get(key) ?? []) visit(target);
    visiting.delete(key); visited.add(key);
  }
  for (const key of nodeKeys) visit(key);
  for (const mapping of Array.isArray(value?.mappings) ? value.mappings : []) {
    if (!nodeKeys.has(mapping.nodeKey)) errors.push(`教材映射节点不存在：${mapping.nodeKey}`);
    if (!editionKeys.has(mapping.editionKey)) errors.push(`教材映射版本不存在：${mapping.editionKey}`);
  }
  return errors;
}

export function chinaMathNodeFor(key) { return NODE_BY_KEY.get(String(key)) ?? null; }

export function textbookMappingsFor(key) {
  const exact = taxonomy.mappings.filter((mapping) => mapping.nodeKey === key).map((mapping) => ({
    ...mapping,
    editionLabel: taxonomy.editions.find((edition) => edition.key === mapping.editionKey)?.label ?? mapping.editionKey,
  }));
  if (exact.length) return exact;
  const node = NODE_BY_KEY.get(key); if (!node) return [];
  return taxonomy.editions.map((edition) => ({ nodeKey: key, editionKey: edition.key, editionLabel: edition.label,
    grade: node.stage, volume: "待校准", unitLabel: `${node.label} · 章节待校准`, alignmentStatus: "framework" }));
}

export function resolveChinaMathTaxonomyKeys(labels, stem = "") {
  const inputs = [...(Array.isArray(labels) ? labels : []), stem].map(normalized).filter(Boolean);
  const matches = new Map();
  for (const input of inputs) {
    const scored = [];
    for (const node of CHINA_MATH_NODES.filter((item) => item.level !== "domain")) {
      let score = 0;
      for (const alias of [node.label, ...(node.aliases ?? [])].map(normalized).filter(Boolean)) if (input.includes(alias)) score = Math.max(score, alias.length);
      if (score) scored.push({ key: node.key, score, stage: node.stage });
    }
    const best = Math.max(0, ...scored.map((item) => item.score));
    for (const item of scored.filter((entry) => entry.score === best)) matches.set(item.key, item);
  }
  const exact = [...matches.values()].sort((left, right) => right.score - left.score || right.stage - left.stage).slice(0, 4).map((item) => item.key);
  if (exact.length) return exact;
  const domain = DOMAIN_NODES.find((node) => [node.label, ...(node.aliases ?? [])].some((alias) => inputs.some((input) => input.includes(normalized(alias)))));
  return domain ? [domain.key] : ["cn-math:domain:integrated-application"];
}

export function taxonomyEdgesFor(keys, options = {}) {
  const selected = new Set((Array.isArray(keys) ? keys : []).filter((key) => NODE_BY_KEY.has(key)));
  const requestedDepth = options.depth === undefined ? 2 : Number(options.depth);
  const depth = Math.max(0, Math.min(4, Number.isFinite(requestedDepth) ? requestedDepth : 2));
  for (let step = 0; step < depth; step += 1) {
    for (const edge of CHINA_MATH_EDGES) if (selected.has(edge.sourceKey) || selected.has(edge.targetKey)) {
      selected.add(edge.sourceKey); selected.add(edge.targetKey);
    }
  }
  return CHINA_MATH_EDGES.filter((edge) => selected.has(edge.sourceKey) && selected.has(edge.targetKey));
}

export function taxonomyNodesFor(keys, options = {}) {
  const edges = taxonomyEdgesFor(keys, options); const selected = new Set(keys);
  for (const edge of edges) { selected.add(edge.sourceKey); selected.add(edge.targetKey); }
  for (const key of [...selected]) {
    const node = NODE_BY_KEY.get(key); if (node?.parentKey) selected.add(node.parentKey);
  }
  return [...selected].map((key) => NODE_BY_KEY.get(key)).filter(Boolean);
}
