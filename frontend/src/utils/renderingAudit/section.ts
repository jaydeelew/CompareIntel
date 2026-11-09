import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BugCase } from './catalog'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '../../../..')

export function loadSourceMarkdown(bug: BugCase): string {
  if (bug.inlineContent) return bug.inlineContent
  if (!bug.sourceJson) throw new Error(`bug ${bug.bug} has no source`)
  const full = path.join(REPO_ROOT, bug.sourceJson)
  if (!fs.existsSync(full)) throw new Error(`missing fixture ${full}`)
  const data = JSON.parse(fs.readFileSync(full, 'utf8')) as { response?: string }
  if (!data.response) throw new Error(`empty response in ${full}`)
  return data.response
}

export function extractSection(markdown: string, startRe: string, stopRe?: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => new RegExp(startRe).test(line))
  if (start < 0) {
    return markdown
  }
  const from = start
  // Include the heading line; if the match is mid-paragraph, take from that line.
  let end = lines.length
  if (stopRe) {
    const stop = lines.findIndex((line, i) => i > from && new RegExp(stopRe).test(line))
    if (stop >= 0) end = stop
  }
  return lines.slice(from, end).join('\n').replace(/\s+$/, '') + '\n'
}

export function loadBugSection(bug: BugCase): { markdown: string; section: string } {
  const markdown = loadSourceMarkdown(bug)
  const section = extractSection(markdown, bug.startRe, bug.stopRe)
  return { markdown, section }
}
