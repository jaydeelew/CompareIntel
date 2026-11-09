# Whole-section re-audit after independent rejection

Reference: markdown-it (GFM tables, no typographer) + KaTeX for real delimited math. `$...$` that is not currency is an allowed enhancement. Bare `\frac` / list-prefixed `\[`…`- \]` recovery is not.

Excerpts are the ATX heading range (heading through the next same-or-higher heading). No heading → whole reply. Bug 20 uses the real Phi-4 05 `#### 1. Math in Lists` section; the synthetic closer is a unit test plus `20-synthetic.md`.

| bug | verdict | parser diff / what changed |
| --- | --- | --- |
| 01 | pass | none |
| 02 | pass | none |
| 03 | pass | excerpt rebuilt to `## Real World Context` (includes heading + Money Context) |
| 04 | pass | none |
| 05 | pass | none |
| 06 | pass | none |
| 07 | pass | excerpt rebuilt to `## Python code` (includes heading + fence) |
| 08 | pass | none |
| 09 | pass | DOM keeps U+2014; PNG hyphen-like glyphs are font shaping, not a codepoint rewrite |
| 10 | pass | excerpt rebuilt to `## 3. Matrices` |
| 11 | pass | none |
| 12 | pass | none |
| 13 | pass | none |
| 14 | reopened-fixed | prose em dash U+2014 was rewritten to U+002D hyphen; `fixLatexIssues` no longer maps en/em dashes |
| 15 | pass | no headings → whole 58-line reply |
| 16 | reopened-fixed | leftover `$$` collapsed to `$`; `\[...\]` kept backslashes. Now `$$` stays two dollars and examples unescape to `[...]` |
| 17 | pass | excerpt is `## Tables` through EOF (includes complete Blockquotes + summary) |
| 18 | pass | none |
| 19 | pass | excerpt rebuilt to Scenario 3 heading range |
| 20 | reopened-fixed | retargeted to real Phi-4 05 list math; synthetic `- \[`…`- \]` is two list items and undelimited `\frac{1}{2}` stays text |
| 21 | reopened-fixed | same em-dash rewrite as 14; DOM now keeps U+2014 |
| 22 | pass | excerpt rebuilt to `### Math Basics Demonstration` |
| 23 | pass | none |
| 24 | pass | none |
| 25 | pass | CommonMark `$`100 pairing unchanged |
| 26 | pass | excerpt rebuilt to `## Scenario 4: Horizontal Rules` |
| 27 | pass | excerpt rebuilt to `## 7. Additional Stress Cases` |
| 28 | pass | no headings → whole reply |
| 29 | reopened-fixed | labels `(\[ \])` / `(\( \))` now CommonMark `([ ])` / `(( ))` |

Wide before/after (960 CSS × DPR 2, stacked, no crop): `before-after/*-wide.png` with matching `sections/*.md`.
