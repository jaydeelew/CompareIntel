## 7. Additional Stress Cases

**Superscripts/subscripts in prose:** Einstein wrote $E = mc^2$ in 1905.

**Multiline display:**
$$
\begin{aligned}
f(x) &= x^2 + 2x + 1 \\
     &= (x+1)^2
\end{aligned}
$$

**Unicode adjacent to math:** The value α relates via $\alpha + \beta = \gamma$.

**Empty-ish math:** $ $ (space only) and $$$ (triple dollar) are parser hazards.

**Escaped delimiters:** \$x^2\$ should show literal dollar-x-squared-dollar.

---

**Summary of parser expectations:**

| Case | Expected Behavior |
|------|-------------------|
| `$$...$$` | Render as display math |
| `\[...\]` | Render as display math |
| `$...$` | Render as inline math |
| `\(...\)` | Render as inline math |
| `` ``` ``` blocks | Content stays literal |
| `\$` | Renders as literal `$` |
| `$HOME`, `$PATH` | Context-dependent; ideally literal |
| Single `$` unpaired | Ideally literal, but parser-dependent |
