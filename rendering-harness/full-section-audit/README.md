# Full-section renderer audit (bugs 01–29)

Jack’s bar: a fix counts only if the **whole affected section** is correct, not just the targeted defect.

## How it runs

1. Load the fixture (or synthetic source) for each bug and slice the heading range in `frontend/src/utils/renderingAudit/catalog.ts`.
2. Build a reference: CommonMark code spans + fenced code, then KaTeX for `$` / `$$` / `\[` / `\(` that are not currency, then markdown-it (GFM tables).
3. Render the same markdown with `LatexRenderer`.
4. Compare code spans, literal `$`, stray backticks, leftover placeholders/delimiters, headings, tables, links, KaTeX errors.
5. Extra math vs CommonMark-as-text is an allowed enhancement.

Vitest: `cd frontend && npx vitest run src/utils/__tests__/fullSectionAudit.test.tsx`

## Artifacts

- `report.json` / `report.md` — verdicts
- `sections/*.md` — raw source excerpt per bug
- `screenshots/*.png` — 960 CSS × DPR 2 full-section shots of current HEAD
- `visual.json` — no katex-error / leftover placeholders
