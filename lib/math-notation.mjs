export function normalizeMathNotation(source) {
  // In Chinese math texts the area of a triangle is often recognized as
  // "S△ABC". The whole triangle name is the semantic subscript of S.
  return source.replace(/S\s*[△Δ]\s*([A-Z]{3,8})/g, "S_{△$1}");
}

export function needsWordMathEquation(value, explicit = false) {
  if (explicit) return true;
  const normalized = normalizeMathNotation(value);
  if (normalized !== value || /[\\√∑∫^_²³⁴⁵⁶⁷⁸⁹⁰¹⁻⁺/]/.test(normalized)) return true;
  return (normalized.match(/[+＋\-−－×÷=＝]/g)?.length ?? 0) >= 2;
}
