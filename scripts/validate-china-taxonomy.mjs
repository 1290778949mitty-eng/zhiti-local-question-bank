import { CHINA_MATH_EDGES, CHINA_MATH_NODES, CHINA_MATH_TAXONOMY_VERSION, validateChinaMathTaxonomy } from "../lib/china-curriculum-taxonomy.mjs";

const errors = validateChinaMathTaxonomy();
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`${CHINA_MATH_TAXONOMY_VERSION}: ${CHINA_MATH_NODES.length} nodes, ${CHINA_MATH_EDGES.length} edges, references valid, DAG valid`);
}
