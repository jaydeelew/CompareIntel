"""
Test prompt suite for model-specific rendering analysis.

This module contains comprehensive test prompts designed to elicit various
formatting patterns from AI models, including:
- Complex mathematical expressions (display and inline)
- Various markdown elements (bold, italic, lists, links, headers, tables)
- Edge cases (dollar signs in text, code blocks with math, mixed content)
- Special formatting patterns (blockquotes, horizontal rules)
- Code block preservation tests

These prompts are used to collect model responses for analysis and
renderer configuration generation.
"""

# Test prompts designed to elicit model-specific formatting behaviors
TEST_PROMPTS: list[dict[str, str]] = [
    {
        "name": "complex_math_display",
        "description": "Complex display math with multiple equations and symbols",
        "prompt": """Solve this step by step:

Given the quadratic equation: $$ax^2 + bx + c = 0$$

Show that the solutions are:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Then explain why when $b^2 - 4ac < 0$, the solutions are complex numbers.

Also show the integral:
$$\\int_0^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

And the matrix equation:
$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} e \\\\ f \\end{pmatrix}$$""",
    },
    {
        "name": "inline_math_mixed",
        "description": "Inline math expressions mixed with text",
        "prompt": """Explain the following concepts:

The Pythagorean theorem states that $a^2 + b^2 = c^2$ where $c$ is the hypotenuse.

Einstein's mass-energy equivalence is $E = mc^2$.

The derivative of $f(x) = x^2$ is $f'(x) = 2x$.

The limit as $x$ approaches infinity of $\\frac{1}{x}$ is $0$.

When $\\alpha = 0.05$, we reject the null hypothesis if $p < \\alpha$.

The sum $\\sum_{i=1}^{n} x_i$ represents the total of all values.""",
    },
    {
        "name": "markdown_lists",
        "description": "Markdown lists with various formatting elements",
        "prompt": """Create a markdown list with:

1. First item with **bold** and *italic* text
2. Second item with inline math: $E = mc^2$
3. Third item with a code block:
   ```python
   def hello():
       print("world")
   ```
4. Fourth item with display math:
   $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$
5. Fifth item with a [link](https://example.com)
6. Sixth item with `inline code` and more text

Also create an unordered list:
- Item A with **bold**
- Item B with *italic*
- Item C with $x = y + z$
- Item D with `code`""",
    },
    {
        "name": "markdown_headers",
        "description": "Markdown headers and structured content",
        "prompt": """Create a document with headers:

# Main Title

## Section 1

This section contains an equation: $y = mx + b$

### Subsection 1.1

More content here with **bold** and *italic*.

## Section 2

Another equation: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$

### Subsection 2.1

Final content.""",
    },
    {
        "name": "markdown_tables",
        "description": "Markdown tables with math content",
        "prompt": """Create a markdown table:

| Variable | Formula | Value |
|----------|---------|-------|
| Area | $A = \\pi r^2$ | $25\\pi$ |
| Volume | $V = \\frac{4}{3}\\pi r^3$ | $\\frac{500\\pi}{3}$ |
| Surface Area | $S = 4\\pi r^2$ | $100\\pi$ |

Also include a table with display math:

| Equation | Description |
|----------|-------------|
| $$E = mc^2$$ | Mass-energy equivalence |
| $$F = ma$$ | Newton's second law |""",
    },
    {
        "name": "edge_cases_dollar_signs",
        "description": "Edge cases with dollar signs in text vs math",
        "prompt": """Render these correctly:

- Dollar signs in text: The price is $50
- Math with dollars: $x = \\$50 + y$
- Multiple dollars: The cost is $100, $200, or $300
- Code with math: `const price = $50`
- Display math: $$\\sum_{i=1}^{n} \\$x_i$$
- Text with dollar: I have $5 in my pocket
- Mixed: Price $p$ where $p = \\$50 + tax$""",
    },
    {
        "name": "code_blocks_preservation",
        "description": "Code blocks with various languages and formatting",
        "prompt": """Show code examples in different languages:

Python:
```python
def calculate(x):
    return x ** 2 + 1
```

JavaScript:
```javascript
function calculate(x) {
    return x ** 2 + 1;
}
```

LaTeX in code (should NOT be rendered as math):
```latex
\\documentclass{article}
\\begin{document}
$E = mc^2$
\\end{document}
```

Math-like code (should NOT be rendered as math):
```python
# This looks like math but is code
result = a * b + c / d
formula = "E = mc^2"
```

Code with dollar signs:
```bash
echo "Price: $50"
export PRICE=$100
```""",
    },
    {
        "name": "mixed_content_complex",
        "description": "Complex mixed content with all formatting types",
        "prompt": """Create a comprehensive response with:

# Title

## Introduction

The **Pythagorean theorem** states: $a^2 + b^2 = c^2$

In matrix form:
$$\\begin{pmatrix} a \\\\ b \\end{pmatrix}^T \\begin{pmatrix} a \\\\ b \\end{pmatrix} = c^2$$

## Code Example

```python
import math

def pythagorean(a, b):
    return math.sqrt(a**2 + b**2)
```

## List

1. First: $x = 1$
2. Second: $y = 2$
3. Third: $z = x + y = 3$

## Table

| Variable | Value |
|----------|-------|
| $x$ | $1$ |
| $y$ | $2$ |
| $z$ | $3$ |

**Note:** This only works in Euclidean space.""",
    },
    {
        "name": "blockquotes_and_special",
        "description": "Blockquotes and special markdown elements",
        "prompt": """Create content with blockquotes:

> This is a quote with math: $E = mc^2$
> 
> And display math:
> $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

Also include:

- Horizontal rule below:

---

And more content with **bold**, *italic*, and `code`.

> Nested quote with $x = y + z$""",
    },
    {
        "name": "unicode_and_special_chars",
        "description": "Unicode characters and special symbols in math",
        "prompt": """Use various mathematical symbols:

Greek letters: $\\alpha, \\beta, \\gamma, \\pi, \\theta, \\lambda$

Operators: $\\sum, \\prod, \\int, \\partial$

Relations: $\\leq, \\geq, \\neq, \\approx, \\equiv$

Set theory: $\\in, \\subset, \\cup, \\cap, \\emptyset$

Special: $\\infty, \\nabla, \\Delta, \\forall, \\exists$

Display versions:
$$\\sum_{i=1}^{n} x_i, \\quad \\prod_{j=1}^{m} y_j, \\quad \\int_a^b f(x) dx$$""",
    },
    {
        "name": "fractions_and_complex_expressions",
        "description": "Complex fractions and nested expressions",
        "prompt": """Show complex mathematical expressions:

Simple fraction: $\\frac{1}{2}$

Nested fraction: $\\frac{a + \\frac{b}{c}}{d + \\frac{e}{f}}$

Display fraction:
$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Complex expression:
$$\\frac{\\partial^2 f}{\\partial x^2} + \\frac{\\partial^2 f}{\\partial y^2} = 0$$

With subscripts and superscripts:
$$x_{i,j}^{n+1} = x_{i,j}^n + \\Delta t \\cdot f(x_{i,j}^n)$$""",
    },
    {
        "name": "links_and_references",
        "description": "Links and references with math",
        "prompt": """Create content with links:

See [this equation](https://example.com): $E = mc^2$

Reference to equation (1): $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

More links:
- [Wikipedia](https://wikipedia.org) has info on $\\pi$
- [MathWorld](https://mathworld.wolfram.com) explains $e^{i\\pi} + 1 = 0$

Inline reference: As shown in equation $x = y + z$, we can see...""",
    },
    {
        "name": "nested_structures",
        "description": "Nested lists, quotes, and structures",
        "prompt": """Create nested structures:

1. First level
   - Second level with $x = 1$
   - Another second level
     - Third level with $$y = x^2$$
2. Back to first level

> Quote level 1
> > Quote level 2 with $z = x + y$
> > > Quote level 3

**Bold** with *italic* and `code` with $math$ all together.""",
    },
]


def get_prompt_by_name(name: str) -> dict[str, str]:
    """Get a test prompt by its name."""
    for prompt in TEST_PROMPTS:
        if prompt["name"] == name:
            return prompt
    raise ValueError(f"Prompt '{name}' not found")


def get_all_prompt_names() -> list[str]:
    """Get list of all prompt names."""
    return [prompt["name"] for prompt in TEST_PROMPTS]


def get_prompts_by_category() -> dict[str, list[dict[str, str]]]:
    """Group prompts by category based on their name prefix."""
    categories = {}
    for prompt in TEST_PROMPTS:
        # Extract category from name (e.g., "complex_math_display" -> "math")
        if "math" in prompt["name"]:
            category = "math"
        elif "markdown" in prompt["name"]:
            category = "markdown"
        elif "code" in prompt["name"]:
            category = "code"
        elif "edge" in prompt["name"]:
            category = "edge_cases"
        else:
            category = "mixed"

        if category not in categories:
            categories[category] = []
        categories[category].append(prompt)

    return categories
