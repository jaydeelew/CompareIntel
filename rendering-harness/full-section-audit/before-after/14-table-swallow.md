## Scenario 2: Tables with Math

| Formula | LaTeX | Result |
|---------|-------|--------|
| Quadratic | $ax^2 + bx + c = 0$ | $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$ |
| Sum | $\sum_{i=1}^{n} i$ | $\frac{n(n+1)}{2}$ |
| Product | $\prod_{i=1}^{n} i$ | $n!$ |

**Edge case notes:** The quadratic formula contains `\pm`, `\sqrt{}` with a nested expression, and `\frac` with a multi-character numerator — all inside table cells where pipes (`|`) must not be confused with column delimiters.
