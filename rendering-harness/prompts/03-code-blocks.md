# Test Prompt: Code Blocks

Generate a response with fenced code blocks:

## Python code
```python
def quadratic_formula(a, b, c):
    discriminant = b**2 - 4*a*c
    x1 = (-b + discriminant**0.5) / (2*a)
    x2 = (-b - discriminant**0.5) / (2*a)
    return x1, x2

# Example: solve x^2 - 5x + 6 = 0
result = quadratic_formula(1, -5, 6)
print(f"Solutions: x = {result[0]}, x = {result[1]}")
```

## JavaScript code
```javascript
const fibonacci = (n) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

console.log(fibonacci(10)); // 55
```

## Inline code with math-like content
The variable `x^2` should render as code, not math. Similarly `a_b` and `$price` should be code.
