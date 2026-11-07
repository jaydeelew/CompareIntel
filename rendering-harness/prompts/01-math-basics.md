# Test Prompt: Math Basics

Generate a response that demonstrates:

1. Inline math: Explain the quadratic formula $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ with inline notation.

2. Display math with aligned equations:
$$\begin{align}
x + y &= 5 \\
2x - y &= 1
\end{align}$$

3. Matrices and cases:
$$I = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}, \quad
f(x) = \begin{cases}
x^2 & \text{if } x \geq 0 \\
-x & \text{if } x < 0
\end{cases}$$

4. Multiple equations:
$$E = mc^2$$
$$F = ma$$
$$a^2 + b^2 = c^2$$

5. Links: See [Wikipedia](https://en.wikipedia.org/wiki/Quadratic_formula) for more details on the quadratic formula.

6. Money context (these should NOT render as math): The item costs $5 and the shipping is $10, for a total of $15. Budget: \$1000 (escaped dollar).
