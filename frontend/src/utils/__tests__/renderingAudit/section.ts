import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BugCase } from './catalog'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '../../../../..')

const ATX_HEADING_RE = /^(#{1,6})(?:\s|$)/

export function loadSourceMarkdown(bug: BugCase): string {
  if (bug.inlineContent) return bug.inlineContent
  if (!bug.sourceJson) throw new Error(`bug ${bug.bug} has no source`)
  const full = path.join(REPO_ROOT, bug.sourceJson)
  if (!fs.existsSync(full)) throw new Error(`missing fixture ${full}`)
  const data = JSON.parse(fs.readFileSync(full, 'utf8')) as { response?: string }
  if (!data.response) throw new Error(`empty response in ${full}`)
  return data.response
}

/** ATX headings outside fenced code. Numbered list labels are not headings. */
export function headingPositions(
  lines: string[]
): Array<{ index: number; level: number; text: string }> {
  const found: Array<{ index: number; level: number; text: string }> = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = ATX_HEADING_RE.exec(line)
    if (!m) continue
    found.push({ index: i, level: m[1].length, text: line.slice(m[1].length).trim() })
  }
  return found
}

/**
 * Slice from the heading that contains `startRe` through the next heading of
 * the same or higher level (lower ATX number). No heading → whole document.
 */
export function extractHeadingSection(
  markdown: string,
  startRe: string,
  stopHeadingLevel?: number
): string {
  const lines = markdown.split('\n')
  const headings = headingPositions(lines)
  if (headings.length === 0) {
    return markdown.replace(/\s+$/, '') + '\n'
  }

  let start = lines.findIndex(line => new RegExp(startRe).test(line))
  if (start < 0) start = 0

  const containing =
    headings.find(h => h.index === start) ??
    [...headings].reverse().find(h => h.index <= start) ??
    headings[0]

  const stopLevel = stopHeadingLevel ?? containing.level
  const next = headings.find(h => h.index > containing.index && h.level <= stopLevel)
  const end = next ? next.index : lines.length
  return lines.slice(containing.index, end).join('\n').replace(/\s+$/, '') + '\n'
}

export function extractSection(markdown: string, startRe: string, stopRe?: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => new RegExp(startRe).test(line))
  if (start < 0) {
    return markdown.replace(/\s+$/, '') + '\n'
  }
  let end = lines.length
  if (stopRe) {
    const stop = lines.findIndex((line, i) => i > start && new RegExp(stopRe).test(line))
    if (stop >= 0) end = stop
  }
  return lines.slice(start, end).join('\n').replace(/\s+$/, '') + '\n'
}

export function loadBugSection(bug: BugCase): { markdown: string; section: string } {
  const markdown = loadSourceMarkdown(bug)
  if (bug.inlineContent) {
    return { markdown, section: markdown.replace(/\s+$/, '') + '\n' }
  }
  const section = extractHeadingSection(markdown, bug.startRe, bug.stopHeadingLevel)
  return { markdown, section }
}
