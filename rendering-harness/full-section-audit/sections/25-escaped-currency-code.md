## 6. Escaped Delimiters and Inline Code

- Escaped currency: `$`100`, `$`0.99, or literal `$` signs
- Inline code with math: `` `f(x) = $x^2$` `` should not parse as math inside code
- Dollar in code: `` `price = $19.99` `` and `` `formula = $E=mc^2$` ``
- Math with escaped dollar inside: $\text{Cost: }\$100 \times n$
- Code span containing single dollar: `` `$` `` and `` `$x$` ``
