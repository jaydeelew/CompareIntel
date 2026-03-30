/**
 * Strip an attachment placeholder from composer text (legacy `[file:` / `[image:` tokens
 * or when removing a chip). Collapses runs of blank lines.
 */
export function removePlaceholderFromInput(prev: string, placeholder: string): string {
  let next = prev.split(placeholder).join('')
  next = next.replace(/\n{3,}/g, '\n\n')
  return next
}
