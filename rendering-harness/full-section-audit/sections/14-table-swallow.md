## Scenario 2: Tables with Math

| Formula | LaTeX | Result |
|---------|-------|--------|
| Quadratic | $ax^2 + bx + c = 0$ | $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$ |
| Sum | $\sum_{i=1}^{n} i$ | $\frac{n(n+1)}{2}$ |
| Product | $\prod_{i=1}^{n} i$ | $n!$ |

**Edge case notes:** The quadratic formula contains `\pm`, `\sqrt{}` with a nested expression, and `\frac` with a multi-character numerator — all inside table cells where pipes (`|`) must not be confused with column delimiters.

## Scenario 3: Code and Math Mixed

```python
# Calculate area of circle with radius r
import math

def circle_area(r):
    # Formula: A = πr²
    return math.pi * r**2

print(f"Area: {circle_area(5)}")
```

The mathematical formula is $A = \pi r^2$ where $r$ is the radius.

**Edge case notes:** The `**` in Python code (exponentiation) must not be interpreted as markdown bold markers. The `π` character in the comment is Unicode, while the rendered formula uses `\pi`. Code blocks preserve everything verbatim.

## Scenario 4: Horizontal Rules

First section

---

Second section with math: $\int_{0}^{1} x dx = \frac{1}{2}$

---

Third section

**Edge case notes:** Horizontal rules (`---`) can be ambiguous with setext-style headers if placed directly under text — blank lines are required on both sides.

## Scenario 5: Multiple Dollar Signs

Prices: Computer costs $1,200, monitor $300, keyboard $50, mouse $25. Total: $1,575.

Math: The formula $f(x) = x^2$ evaluates to $f(5) = 25$.

**Edge case notes:** This is the trickiest scenario. Currency amounts like `$1,200` contain digits between dollar signs, which naive LaTeX parsers may misinterpret as math delimiters (e.g., treating `$1,200, monitor $` as a math span). Disambiguation strategies:

- **Heuristic parsing:** Require no whitespace immediately after an opening `$` and before a closing `$` (currency `$1,200` has a digit right after `$`, real math like `$f(x)$` has a letter/symbol)
- **Context awareness:** `1,200` with thousands separators suggests currency; `x^2` suggests math
- **Escaping:** Use `\$1,200` when explicit control is needed

## Summary Table

| Scenario | Risk | Handling |
|----------|------|----------|
| Math in lists | Chained equations, nested emphasis | Preserve indentation and inline `$...$` |
| Tables with math | `\|` conflicts, complex fractions | Escape pipes, parse full cell content |
| Code + math | `**`, `#`, `f"..."` misread as markup | Code fences take precedence |
| Horizontal rules | `---` vs. setext headers vs. table syntax | Require blank lines |
| Dollar signs | Currency vs. LaTeX delimiters | Heuristic or explicit `\$` escaping |

All five scenarios render correctly with the conventions demonstrated above. ✅
