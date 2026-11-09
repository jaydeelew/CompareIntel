# Mathematical Analysis: Functions and Linear Algebra

## Problem Statement

**Exercise 1**: Given the function $f(x) = x^2 + 2x + 1$, find:

1. The *derivative* $f'(x)$
2. The **integral** $\int f(x)\, dx$

---

### Solution

Notice that $f(x) = x^2 + 2x + 1 = (x+1)^2$, which simplifies verification.

**Part 1 — Derivative:**

Applying the power rule term by term:

$$f'(x) = 2x + 2$$

This can be factored as $f'(x) = 2(x + 1)$, confirming the single critical point at $x = -1$.

**Part 2 — Integral:**

$$\int f(x)\, dx = \frac{x^3}{3} + x^2 + x + C$$

> **Tip**: Always verify by differentiating the result — you should recover $f(x)$.

---

## Linear Algebra with Lists

Properties of the matrix $A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$:

- **Determinant**: $\det(A) = ad - bc$
- **Trace**: $\text{tr}(A) = a + d$
- **Eigenvalue relationship**: $\lambda^2 - \text{tr}(A)\lambda + \det(A) = 0$
- **Inverse** (exists *if and only if* $\det(A) \neq 0$):

$$A^{-1} = \frac{1}{ad - bc}\begin{pmatrix} d & -b \\ -c & a \end{pmatrix}$$

### Key Observations

| Property | Formula | Condition |
|---|---|---|
| Invertible | $\det(A) \neq 0$ | Required |
| Singular | $\det(A) = 0$ | No inverse |
| Symmetric | $b = c$ | $A = A^T$ |

---

## Real World Context

> **Note**: In economics, the cost function $C(q) = 100 + 5q$ represents a *linear cost model* where:
> - $100$ represents **fixed costs** (independent of quantity)
> - $5q$ represents **variable costs** (scaling with output $q$)

**Worked Example:**

If you purchase $q = 10$ units:

$$C(10) = 100 + 5(10) = 100 + 50 = \$150 \text{ total}$$

The *marginal cost* is simply:

$$C'(q) = 5$$

meaning each additional unit costs exactly **\$5**, regardless of current production level — a hallmark of linear cost models.
