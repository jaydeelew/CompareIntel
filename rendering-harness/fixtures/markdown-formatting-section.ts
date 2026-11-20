/** Self-contained 02-markdown-formatting-style section (no run data dependency). */

export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVQ42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export const MARKDOWN_FORMATTING_SECTION = `## Headers
### This is H3
#### This is H4

## Text formatting
**Bold text** and *italic text* and ***bold italic*** and ~~strikethrough~~

## Lists
Nested unordered list:
- Level 1 item A
  - Level 2 item A1
  - Level 2 item A2
    - Level 3 item A2a
- Level 1 item B

Nested ordered list:
1. First item
   1. Nested first
   2. Nested second
2. Second item
3. Third item

## Task list
- [x] Done task
- [ ] Open task

## Tables
| Model | Context | Price |
|-------|---------|-------|
| GPT-4 | 128k | $0.03 |
| Claude | 200k | $0.02 |

## Blockquotes
> This is a blockquote
> with multiple lines

## Image
![triangle sketch](${TINY_PNG})

Footnote-style note:¹ compare triangle area $\\frac{1}{2}bh$ when documenting sketches.
`

export const MARKDOWN_FORMATTING_EXPECTED =
  'HeadersThis is H3This is H4Text formatting Bold text and italic text and bold italic and strikethrough Lists Nested unordered list: Level 1 item ALevel 2 item A1Level 2 item A2Level 3 item A2aLevel 1 item BNested ordered list: First itemNested firstNested secondSecond itemThird itemTask list Done task Open task Tables ModelContextPriceGPT-4128k$0.03Claude200k$0.02Blockquotes This is a blockquote with multiple linesImage Footnote-style note:¹ compare triangle area 21bh when documenting sketches.'