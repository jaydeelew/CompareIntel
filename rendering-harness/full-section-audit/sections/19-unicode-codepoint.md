### ✅ **Scenario 3: Code and Math Mixed — Edge Case: Inline Math in Code Comments**

**Original Code:**
```python
# Calculate area of circle with radius r
import math

def circle_area(r):
    # Formula: A = πr²
    return math.pi * r**2

print(f"Area: {circle_area(5)}")
```

**Edge Case Challenge:**  
The comment `# Formula: A = πr²` contains a **math expression** with `π` and `r²`, but if the code is parsed in a context that interprets `π` as a variable or `r²` as invalid syntax, it may fail.

Also: What if the code is in a **Jupyter notebook** or **Markdown cell**, and the `π` is not properly encoded?

⚠️ **Problems:**
- `π` is Unicode (U+03C0), which may not be supported in all environments.
- `r²` uses superscript 2 (U+00B2), which may render poorly or cause syntax errors in some parsers.
- If the code is in a **LaTeX-rendered environment**, the `π` might be misinterpreted.

✅ **Robust Fix:**
```python
# Calculate area of circle with radius r
import math

def circle_area(r):
    # Formula: A = π * r^2 (π ≈ 3.14159)
    return math.pi * r**2

print(f"Area: {circle_area(5):.6f}")
```

> 🔍 **Key Fixes:**
> - Use `π` only if Unicode is supported (safe in Python, but avoid in strict C/C++).
> - Replace `r²` with `r^2` in comments (standard in code).
> - Use `math.pi` instead of `π` in code to avoid symbol confusion.
> - Use `:.6f` for consistent floating-point formatting.

> ✅ **Best Practice:** Use **plain ASCII** in code comments for math: `A = pi * r^2`, and reserve `π`, `²`, `√`, etc., for **rendered documentation** (e.g., Markdown, LaTeX).

---
