# Word math source recovery and readable display equations

## Scope

Follow-up on the screenshots showing dollar markers, escaped Rightarrow text,
small nested CD subscripts and unsupported mathbb set notation. The changes stay
on the existing fix/math-rendering-consistency branch. They do not change the
concurrency scheduler, API settings, output-mode choices or warnings checkbox.

## Implementation

- `math-source.mjs` shares delimiter scanning between the math parser and export.
  It recovers a clearly mathematical pair with inconsistent dollar counts and
  duplicated known commands outside environments. It does not remove every `$`
  or collapse every backslash. Literal text arguments, code spans, currencies
  and aligned/cases row separators are protected. Ambiguous source is retained
  and reported, not silently solved or rewritten.
- Studio escape normalization uses that scanner rather than a delimiter regex.
  Known JSON control escapes are repaired inside the actual formula. Normalized
  text fields are also checked for delimiter and native-math errors; generated
  diagnostics are recomputed without accumulating duplicates on every export.
- Word paragraph splitting preserves complete multiline math blocks. Both the
  paragraph builder and the short-answer placement path use safe boundaries.
- `mathOmml` supports mathbb as editable native double-struck characters. Common
  sets render as Unicode N/Z/Q/R/C double-struck symbols, with native script
  metadata as well. This also supports importers that ignore script metadata.
  dfrac/tfrac are accepted as native stacked fractions; no nesting-depth font
  multiplier is restored. Paired sub/superscripts use a common `sSubSup` base.
- Independent calculations use real `oMathPara` display blocks and a consistent
  12 pt base (`24` half-points). Inline prose math uses 11 pt (`22` half-points).
  Short Chinese proof cues do not force a standalone calculation into compact
  inline layout. The Word paragraph styles agree with the equation run sizes.
  Subscripts still remain naturally smaller than the base; missing braces are
  not guessed (for example `k_CD` is not silently changed to `k_{CD}`).
- Existing source warnings are literal text and are not sent through math parsing.
  The warnings checkbox only controls supplementary notes; it does not turn an
  unknown or ambiguous expression into a supposedly successful conversion.

## Verification

- 41 targeted unit/behavior tests executed successfully. These run the actual
  scanner, normalizer function, native OMML converter and display-layout helper.
  No Gemini requests are made. TypeScript transpilation is not a full app build.
- Modified TypeScript modules passed syntax checks.
- Generated a three-page local DOCX fixture from the actual converter XML using
  python-docx as a packaging harness, rendered it with LibreOffice and inspected
  every page. Checked set glyphs, arrow recovery, cases, nested fractions and
  grouped CD subscripts. This is not the application's DOCX packer or browser.
  LibreOffice's math color/font import is not identical to Word/WPS; the actual
  application's color and full-page layout still require desktop verification.
- Added a companion packer integration test for all three output modes, with the
  warning toggle both on and off. It was not run in this environment because
  GitHub/npm DNS resolution prevents installing esbuild/docx/jszip and the rest
  of the full application. Browser upload/export, complete lint/build/regression
  tests, original user documents and real Word/WPS rendering remain unverified.

## Local verification

On the existing branch, stop the running dev server, then run:

```sh
git pull --ff-only
node --test tests/math-export-repair.test.mjs
node --test tests/math-export-repair-integration.test.mjs
npm run dev
```

Existing local drafts are normalized again at export without mutating the caller
object, so start by regenerating Word from the saved task. A fresh Gemini run is
not necessary for these reproducible syntax/converter cases. Previously downloaded
Word files are unchanged. Check the original failing pages in all applicable modes,
including red answer color, ordering, line wrapping, set symbols and subscripts.
For genuinely misrecognized content or ambiguous markers, compare with the source
rather than accepting an automatic mathematical correction.
