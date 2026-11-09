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
