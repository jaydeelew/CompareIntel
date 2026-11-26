/**
 * Split a partial streamed reply into blocks that can be rendered now and a
 * tail that must stay hidden.
 *
 * Closed paragraphs, fences, tables, and math become stable blocks. An
 * unclosed `$$`, `\[`, `\begin{...}`, code fence (including mermaid), or
 * GFM table stays in `held` so the renderer never paints the raw opener.
 * A finished reply must not use this split: render the original string so
 * the DOM matches a non-streaming render.
 */

import { displaySpanCrossesListItem, EXPLICIT_MATH_ENV_NAMES } from './mathRenderer'
import { gfmSeparatorCount, gfmSplitRow, isGfmRowTerminator } from './protection'

export interface StreamingBlock {
  /** Stable for the life of the block. The end offset in the source. */
  key: string
  source: string
}

export interface StreamingRenderSplit {
  blocks: StreamingBlock[]
  /** Safe suffix that may still grow (the open paragraph or an open table). */
  visibleTail: string
  /** Unclosed math, fence, or table. Not rendered. */
  held: string
}

const ENV_ALT = EXPLICIT_MATH_ENV_NAMES.join('|')
const BEGIN_RE = new RegExp(String.raw`^\\begin\{((?:${ENV_ALT})\*?)\}`)

interface CommitScan {
  commitEnds: number[]
  holdAt: number
}

type LineAdvance = { holdAt: number } | { commitEnd: number } | { skipTo: number }

function isEscaped(text: string, index: number): boolean {
  let count = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count += 1
  return count % 2 === 1
}

function indexOfUnescaped(text: string, needle: string, from: number): number {
  let cursor = from
  while (cursor < text.length) {
    const found = text.indexOf(needle, cursor)
    if (found < 0) return -1
    if (!isEscaped(text, found)) return found
    cursor = found + 1
  }
  return -1
}

function lineBounds(text: string, index: number): { start: number; end: number; newline: number } {
  const start = index
  const newline = text.indexOf('\n', start)
  const end = newline === -1 ? text.length : newline
  return { start, end, newline }
}

function isRealDisplayDollarPair(text: string, open: number, close: number): boolean {
  if (close < open + 2) return false
  const inner = text.slice(open + 2, close)
  if (inner.includes('$')) return false
  const full = text.slice(open, close + 2)
  if (displaySpanCrossesListItem(full)) return false
  const lineStart = text.lastIndexOf('\n', open - 1) + 1
  const midLine = /\S/.test(text.slice(lineStart, open))
  if (midLine && inner.includes('\n')) {
    const closeLineEnd = text.indexOf('\n', close)
    const rest = text.slice(close + 2, closeLineEnd === -1 ? text.length : closeLineEnd)
    if (/\S/.test(rest)) return false
  }
  return true
}

/** Mid-line `$$\n...\n$$` is math only while the closer line stays empty. */
function displayDollarPairUnsettled(text: string, open: number, close: number): boolean {
  const lineStart = text.lastIndexOf('\n', open - 1) + 1
  const midLine = /\S/.test(text.slice(lineStart, open))
  const inner = text.slice(open + 2, close)
  return midLine && inner.includes('\n') && text.indexOf('\n', close) === -1
}

/** A finished mid-line `use $$ as delimiter.` is prose. A `$$` that can still open math is not. */
function unclosedDisplayDollarIsLiteral(text: string, open: number): boolean {
  const lineEnd = text.indexOf('\n', open)
  if (lineEnd === -1) return false
  return /\S/.test(text.slice(open + 2, lineEnd))
}

function looksLikeTableRow(line: string): boolean {
  return /^[ \t]{0,3}\|/.test(line)
}

function fenceMarker(line: string): { marker: '```' | '~~~'; rest: string } | null {
  const match = /^([ \t]{0,3})(```|~~~)(.*)$/.exec(line)
  if (!match) return null
  return { marker: match[2] as '```' | '~~~', rest: match[3] }
}

/**
 * End index after the closing fence's newline, or -1 when the fence is still
 * open. A closer that is the last line and has no newline is still open: the
 * next token might extend that line.
 */
function closingFenceEnd(text: string, from: number, marker: '```' | '~~~'): number {
  let cursor = from
  const closer = new RegExp(`^[ \\t]{0,3}${marker}[ \\t]*$`)
  while (cursor < text.length) {
    const newline = text.indexOf('\n', cursor)
    const end = newline === -1 ? text.length : newline
    const line = text.slice(cursor, end)
    if (closer.test(line)) {
      if (newline === -1) return -1
      return newline + 1
    }
    if (newline === -1) return -1
    cursor = newline + 1
  }
  return -1
}

function tryLineFence(text: string, index: number): LineAdvance | null {
  const { end, newline } = lineBounds(text, index)
  const opener = fenceMarker(text.slice(index, end))
  if (!opener) return null
  if (newline === -1) return { holdAt: index }
  const closeEnd = closingFenceEnd(text, newline + 1, opener.marker)
  if (closeEnd < 0) return { holdAt: index }
  return { commitEnd: closeEnd }
}

function tryMidFence(text: string, index: number): LineAdvance | null {
  const marker = text.startsWith('```', index)
    ? '```'
    : text.startsWith('~~~', index)
      ? '~~~'
      : null
  if (!marker) return null
  const newline = text.indexOf('\n', index)
  if (newline === -1) {
    const rest = text.slice(index + marker.length)
    if (/^[a-zA-Z0-9+#-]{0,32}$/.test(rest)) return { holdAt: index }
    return null
  }
  const info = text.slice(index + marker.length, newline)
  if (!/^[a-zA-Z0-9+#-]*[ \t]*$/.test(info)) return null
  const closeEnd = closingFenceEnd(text, newline + 1, marker)
  if (closeEnd < 0) return { holdAt: index }
  return { commitEnd: closeEnd }
}

function tableHasOpenDelimiter(slice: string): boolean {
  let rest = slice.replace(/```[\s\S]*?\n[ \t]{0,3}```[ \t]*\n/g, '')
  rest = rest.replace(/\$\$[\s\S]*?\$\$/g, '')
  rest = rest.replace(/\\\[[\s\S]*?\\\]/g, '')
  rest = rest.replace(/\\\([\s\S]*?\\\)/g, '')
  for (const name of EXPLICIT_MATH_ENV_NAMES) {
    const re = new RegExp(String.raw`\\begin\{${name}\*?\}[\s\S]*?\\end\{${name}\*?\}`, 'g')
    rest = rest.replace(re, '')
  }
  return /\$\$|\\\[|\\\(|^[ \t]{0,3}```|\\begin\{/.test(rest)
}

function tryTable(text: string, index: number): LineAdvance | null {
  const header = lineBounds(text, index)
  const headerLine = text.slice(index, header.end)
  if (!looksLikeTableRow(headerLine) || isGfmRowTerminator(headerLine)) return null
  if (header.newline === -1) return { holdAt: index }

  const separator = lineBounds(text, header.newline + 1)
  const separatorLine = text.slice(header.newline + 1, separator.end)
  const columns = gfmSplitRow(headerLine).length
  const separatorColumns = gfmSeparatorCount(separatorLine)
  if (separatorColumns === null || separatorColumns !== columns) {
    // The next line is still growing and may become a real separator.
    // A finished line that is not a separator is ordinary text.
    if (separator.newline === -1) return { holdAt: index }
    return null
  }
  if (separator.newline === -1) return { holdAt: index }

  let cursor = separator.newline + 1
  while (cursor < text.length) {
    const row = lineBounds(text, cursor)
    const line = text.slice(cursor, row.end)
    if (line.trim() === '') {
      if (row.newline === -1) return { holdAt: index }
      return { commitEnd: row.newline + 1 }
    }
    if (isGfmRowTerminator(line)) return { commitEnd: cursor }
    if (row.newline === -1) {
      const slice = text.slice(index)
      if (tableHasOpenDelimiter(slice)) return { holdAt: index }
      return { skipTo: text.length }
    }
    cursor = row.newline + 1
  }
  return { holdAt: index }
}

function tryInlineCode(text: string, index: number): { holdAt: number } | { end: number } {
  let width = 0
  while (text[index + width] === '`') width += 1
  const lineEnd = text.indexOf('\n', index)
  const limit = lineEnd === -1 ? text.length : lineEnd
  let cursor = index + width
  while (cursor < limit) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }
    let run = 0
    while (text[cursor + run] === '`') run += 1
    if (run === width) return { end: cursor + run }
    cursor += run
  }
  if (lineEnd === -1) return { holdAt: index }
  return { end: index + width }
}

function inlineDollarIsMath(text: string, open: number, close: number): boolean {
  const inner = text.slice(open + 1, close)
  if (!inner.trim()) return false
  if (text[close + 1] === '$') return false
  return true
}

function unfinishedInlineShouldHold(rest: string): boolean {
  if (/[\\^_{}$]/.test(rest)) return true
  if (/^\d[\d,]*(?:\.\d+)?(?:\s+\S+)/.test(rest)) return false
  if (/^\s+\S+/.test(rest)) return false
  return true
}

function tryInlineDollar(
  text: string,
  index: number
): { holdAt: number } | { commitEnd: number } | { end: number } {
  const lineEnd = text.indexOf('\n', index)
  const limit = lineEnd === -1 ? text.length : lineEnd
  for (let cursor = index + 1; cursor < limit; cursor += 1) {
    if (text.startsWith('$$', cursor)) break
    if (text[cursor] !== '$' || isEscaped(text, cursor)) continue
    if (inlineDollarIsMath(text, index, cursor)) return { commitEnd: cursor + 1 }
    return { end: index + 1 }
  }
  if (lineEnd === -1) {
    const rest = text.slice(index + 1)
    if (unfinishedInlineShouldHold(rest)) return { holdAt: index }
    return { end: index + 1 }
  }
  return { end: index + 1 }
}

function tryBackslash(
  text: string,
  index: number
): { holdAt: number } | { commitEnd: number } | { end: number } {
  const next = text[index + 1]
  if (next === '[') {
    const close = indexOfUnescaped(text, '\\]', index + 2)
    if (close < 0) return { holdAt: index }
    return { commitEnd: close + 2 }
  }
  if (next === '(') {
    const close = indexOfUnescaped(text, '\\)', index + 2)
    if (close < 0) return { holdAt: index }
    return { commitEnd: close + 2 }
  }
  if (text.startsWith('\\begin', index)) {
    const match = BEGIN_RE.exec(text.slice(index))
    if (match) {
      const name = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const endRe = new RegExp(String.raw`\\end\{${name}\}`)
      const found = endRe.exec(text.slice(index + match[0].length))
      if (!found) return { holdAt: index }
      return { commitEnd: index + match[0].length + found.index + found[0].length }
    }
    if (/^\\begin(?:\{[A-Za-z*]*)?$/.test(text.slice(index))) return { holdAt: index }
  }
  if (index === text.length - 1) return { holdAt: index }
  return { end: index + 1 }
}

function applyAdvance(advance: LineAdvance, index: number): CommitScan | number {
  if ('holdAt' in advance) return { commitEnds: [], holdAt: advance.holdAt }
  if ('commitEnd' in advance) return advance.commitEnd
  return advance.skipTo === index ? index + 1 : advance.skipTo
}

function scan(text: string): CommitScan {
  const commitEnds: number[] = []
  const length = text.length
  let index = 0

  while (index < length) {
    const atLineStart = index === 0 || text[index - 1] === '\n'
    if (atLineStart) {
      const bounds = lineBounds(text, index)
      const line = text.slice(index, bounds.end)
      if (line.trim() === '') {
        if (bounds.newline === -1) break
        commitEnds.push(bounds.newline + 1)
        index = bounds.newline + 1
        continue
      }
      const fence = tryLineFence(text, index)
      if (fence) {
        const next = applyAdvance(fence, index)
        if (typeof next !== 'number') return { commitEnds, holdAt: next.holdAt }
        if ('commitEnd' in fence) commitEnds.push(fence.commitEnd)
        index = next
        continue
      }
      const table = tryTable(text, index)
      if (table) {
        const next = applyAdvance(table, index)
        if (typeof next !== 'number') return { commitEnds, holdAt: next.holdAt }
        if ('commitEnd' in table) commitEnds.push(table.commitEnd)
        index = next
        continue
      }
    }

    if (
      (text.startsWith('```', index) || text.startsWith('~~~', index)) &&
      !isEscaped(text, index)
    ) {
      const fence = tryMidFence(text, index)
      if (fence) {
        const next = applyAdvance(fence, index)
        if (typeof next !== 'number') return { commitEnds, holdAt: next.holdAt }
        if ('commitEnd' in fence) commitEnds.push(fence.commitEnd)
        index = next
        continue
      }
    }

    if (text[index] === '`' && !isEscaped(text, index)) {
      const code = tryInlineCode(text, index)
      if ('holdAt' in code) return { commitEnds, holdAt: code.holdAt }
      index = code.end
      continue
    }

    if (text.startsWith('$$', index) && !isEscaped(text, index)) {
      const close = text.indexOf('$$', index + 2)
      if (close >= 0 && isRealDisplayDollarPair(text, index, close)) {
        if (displayDollarPairUnsettled(text, index, close)) {
          return { commitEnds, holdAt: index }
        }
        commitEnds.push(close + 2)
        index = close + 2
        continue
      }
      if (close < 0 && !unclosedDisplayDollarIsLiteral(text, index)) {
        return { commitEnds, holdAt: index }
      }
      index += 2
      continue
    }

    if (text[index] === '$' && !isEscaped(text, index) && text[index + 1] !== '$') {
      const inline = tryInlineDollar(text, index)
      if ('holdAt' in inline) return { commitEnds, holdAt: inline.holdAt }
      if ('commitEnd' in inline) {
        commitEnds.push(inline.commitEnd)
        index = inline.commitEnd
        continue
      }
      index = inline.end
      continue
    }

    if (text[index] === '\\' && !isEscaped(text, index)) {
      const special = tryBackslash(text, index)
      if ('holdAt' in special) return { commitEnds, holdAt: special.holdAt }
      if ('commitEnd' in special) {
        commitEnds.push(special.commitEnd)
        index = special.commitEnd
        continue
      }
      index = special.end
      continue
    }

    index += 1
  }

  return { commitEnds, holdAt: length }
}

export function splitStreamingRender(source: string): StreamingRenderSplit {
  const { commitEnds, holdAt } = scan(source)
  const blocks: StreamingBlock[] = []
  let cursor = 0
  for (const end of commitEnds) {
    if (end <= cursor || end > holdAt) continue
    blocks.push({ key: String(end), source: source.slice(cursor, end) })
    cursor = end
  }
  return {
    blocks,
    visibleTail: source.slice(cursor, holdAt),
    held: source.slice(holdAt),
  }
}

/** Source that is safe to paint. Joined blocks plus the visible tail. */
export function streamingVisibleSource(source: string): string {
  const split = splitStreamingRender(source)
  return split.blocks.map(block => block.source).join('') + split.visibleTail
}
