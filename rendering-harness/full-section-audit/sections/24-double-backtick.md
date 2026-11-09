### Scenario C: Emphasis and Math Boundary Clashes
*Italic text starting immediately before math* $E=mc^2$ *and continuing after*.
**Bold text spanning** $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$ **math equations**.

A tricky case for parsers: backtick-wrapped math versus actual math.
In Markdown, writing `` `$x$` `` renders as inline code, whereas writing $y$ renders as math.

Adjacent math and punctuation (parsers often swallow trailing punctuation into math blocks):
The series converges to $\pi$, which is approximately $3.14159$! Therefore, the area is $A = \pi r^2$.
