# Full-section renderer audit (bugs 01–29)

Jack’s bar: a fix counts only if the **whole affected section** is correct, not just the targeted defect.

## How it runs

1. Load the original reply and slice **heading → next same/higher ATX heading** (fenced code ignored). Numbered list items are not headings; no heading → whole reply.
2. Independent reference: CommonMark inline-code pairing, then KaTeX for real `$$` / `\[` / `\(` / non-currency `$...$`, then **markdown-it** (GFM tables, no typographer). Empty/ellipsis `\[...\]` and spans that cross a new list item are left for CommonMark unescape (`\[` → `[`).
3. Same markdown through `LatexRenderer`. Compare code spans, `$` / `$$` runs, em dashes, leftover placeholders/delimiters, headings, tables, links, KaTeX errors.
4. Extra `$...$` math vs CommonMark-as-text is an allowed enhancement. Bare `\frac` wrapping is not.

Vitest: `cd frontend && npx vitest run src/utils/__tests__/fullSectionAudit.test.tsx`

See `verdicts.md` for pass / reopened-fixed.

## Artifacts

- `report.json` / `report.md` — current HEAD vs markdown-it+KaTeX
- `verdicts.md` — independent-rejection follow-up table
- `sections/*.md` — raw source excerpt per bug
- `visual.json` — no katex-error / leftover placeholders
- Screenshots, wide Before/After PNGs, and the audit ZIP are **generated artifacts** (not committed). Rebuild them into `/opt/cursor/artifacts/` from HEAD. The ZIP includes `before-after/`, `screenshots/`, `sections/*.md`, and `report.json`.
- Playwright: a first-child `.katex-display` in a list item must share the marker's line (`rendering-harness/full-section-marker.test.ts`).
