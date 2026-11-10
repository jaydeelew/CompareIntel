/**
 * Heading-range slice used by triage and before/after evidence.
 * Same rule as the full-section audit: ATX headings outside fences, from the
 * heading that contains the match through the next heading of the same or
 * higher level. No heading in the reply means the whole reply.
 */

const ATX_HEADING_RE = /^(#{1,6})(?:\s|$)/

export interface HeadingSpan {
  index: number
  level: number
  text: string
  markdown: string
}

export function headingPositions(lines: string[]): Array<{ index: number; level: number; text: string }> {
  const found: Array<{ index: number; level: number; text: string }> = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = ATX_HEADING_RE.exec(line)
    if (!match) continue
    found.push({ index: i, level: match[1].length, text: line.slice(match[1].length).trim() })
  }
  return found
}

export function splitHeadingSections(markdown: string): HeadingSpan[] {
  const lines = markdown.split('\n')
  const headings = headingPositions(lines)
  if (headings.length === 0) {
    return [{ index: 0, level: 0, text: '', markdown: markdown.replace(/\s+$/, '') + '\n' }]
  }
  return headings.map((heading, position) => {
    const next = headings.slice(position + 1).find(candidate => candidate.level <= heading.level)
    const end = next ? next.index : lines.length
    return {
      index: heading.index,
      level: heading.level,
      text: heading.text,
      markdown: lines.slice(heading.index, end).join('\n').replace(/\s+$/, '') + '\n',
    }
  })
}

/** Whole heading range whose heading text contains `needle`, else the whole reply. */
export function sectionByHeading(markdown: string, needle: string): string {
  const sections = splitHeadingSections(markdown)
  const trimmed = needle.trim()
  if (!trimmed) {
    return markdown.replace(/\s+$/, '') + '\n'
  }
  const byHeading = sections.find(section => section.text.includes(trimmed))
  if (byHeading) return byHeading.markdown
  const byBody = [...sections].reverse().find(section => section.markdown.includes(trimmed) && section.text)
  return (byBody || sections[0]).markdown
}
