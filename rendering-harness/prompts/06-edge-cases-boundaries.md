# Test Prompt: Edge Cases and Boundaries

Generate a response testing delimiter variants and edge cases:

## Delimiter Variants
1. Double dollar display: $$x^2 + y^2 = r^2$$
2. Bracket display: \[E = mc^2\]
3. Single dollar inline: $a + b = c$
4. Paren inline: \(x = 5\)

## Nested Structures
1. Display math in a list with continuation:
   - First item
   - The equation is:
     $$\int_0^1 x dx = \frac{1}{2}$$
     And it evaluates to 0.5
   - Third item

## Code with Math-like Syntax
```python
# This should stay as literal code
price = $50
formula = "E = mc^2"
result = a**2 + b**2
def calc(x):
    return x**2
```

## Currency and Escaped Dollars
- Plain: The price is $100
- Escaped: The budget is \$500
- Multiple: Costs $25, $30, and $45
- In sentence: I spent $50 at the store

## Tables with Math
| Variable | Formula | Value |
|----------|---------|-------|
| Area | $A = \pi r^2$ | $78.54$ |
| Volume | $V = \frac{4}{3}\pi r^3$ | $523.60$ |

## Raw Dollar Signs
The shell variable $HOME is set. Price: $99.99.
