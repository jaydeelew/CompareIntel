import { replaceExactlyTwoStrong, replaceSingleStarEm } from './emphasis'
import { convertImplicitMath } from './implicitMath'

const BULLET_ITEM_RE = /^([ \t]*)[-*•][ \t]+\S/
const ANY_LIST_ITEM_RE = /^[ \t]*(?:[-*•][ \t]|\d+[.)][ \t])/
const BLOCK_PLACEHOLDER_RE = /__(?:DISPLAY_MATH|CODE_BLOCK|HR_PLACEHOLDER)_\d+__|<hr/
const DISPLAY_MATH_LINE_RE = /^[ \t]*__DISPLAY_MATH_\d+__[ \t]*$/

/** CommonMark lazy continuation stops at a new block, not at indent 0. */
function isInterruptingBlock(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (ANY_LIST_ITEM_RE.test(line)) return true
  if (isStructuralInterrupt(line)) return true
  return false
}

function isStructuralInterrupt(line: string): boolean {
  const t = line.trim()
  // A column-0 heading ends the list. An indented heading is a block inside the item.
  if (/^#{1,6}(?:\s|$)/.test(t)) return lineIndent(line) === 0
  if (/^```/.test(t)) return true
  if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(t)) return true
  if (/^<hr\b/i.test(t)) return true
  // A column-0 pipe line cannot open a table inside a list item: markdown-it
  // requires the separator to be indented to the item. It stays paragraph text.
  // An indented pipe line can still be a nested table.
  if (/^\s*\|.+\|\s*$/.test(line) && lineIndent(line) > 0) return true
  if (/^>/.test(t)) return true
  if (/[\uE010\uE011]/.test(t)) return true
  return false
}

/** Column where the item text starts (`*   ` is 4, `- ` is 2). */
function contentColumn(line: string): number | null {
  const marker = line.match(/^([ \t]*)(?:([-*•])|(\d+[.)]))([ \t]+)/)
  if (!marker) return null
  return marker[1].length + (marker[2] || marker[3]).length + marker[4].length
}

function lineIndent(line: string): number {
  return line.match(/^[ \t]*/)![0].length
}

/**
 * Fold lazily indented continuation lines into the bullet item above them, e.g.
 * `- Calculate:  ` followed by `     $c = 5$`. A trailing double space keeps the line break.
 * An indented display-math block joins the bullet above it even at the bullet's own indent
 * (`   - Find c:` / `   \[ … \]` / `   - Therefore …`), so it doesn't split the list.
 */
/** Fold a following display-math placeholder into the list item above it. */
function mergeDisplayMathIntoListItems(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^([ \t]*)(?:[-*•]|\d+[.)])[ \t]+\S/)
    if (!marker) {
      out.push(lines[i])
      continue
    }
    let combined = lines[i]
    let j = i + 1
    while (j < lines.length && DISPLAY_MATH_LINE_RE.test(lines[j])) {
      const aheadIndent = lineIndent(lines[j])
      if (aheadIndent < marker[1].length) break
      combined += ' ' + lines[j].trim()
      j++
    }
    out.push(combined)
    i = j - 1
  }
  return out.join('\n')
}

const ORDERED_ITEM_RE = /^([ \t]*)(\d+)[.)][ \t]+\S/

/**
 * CommonMark lazy continuation: the line after `1) Title` stays in that item
 * when it is not indented and there is no blank line yet. `1)` … paragraph …
 * `2)` is one ordered list, including a display-math placeholder on the next line.
 */
function mergeOrderedLazyLines(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i])
    if (!ORDERED_ITEM_RE.test(lines[i])) continue
    let j = i + 1
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      !ORDERED_ITEM_RE.test(lines[j]) &&
      !isInterruptingBlock(lines[j])
    ) {
      const previous = out[out.length - 1]
      const separator = / {2,}$/.test(previous) ? '<br>' : ' '
      const trimmed = lines[j].trim()
      const heading = trimmed.match(/^(#{1,6})\s+([\s\S]+)$/)
      const piece = heading
        ? `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`
        : trimmed
      out[out.length - 1] = previous.trimEnd() + separator + piece
      j++
    }
    i = j - 1
  }
  return out.join('\n')
}

function mergeBulletContinuationLines(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const previous = out[out.length - 1]
    const bullet = previous?.match(BULLET_ITEM_RE)
    const indent = lineIndent(line)
    // A `>` indented under the bullet is a quote inside the item. markBlockquotes
    // has already turned it into markers and kept that indent.
    if (bullet && line.includes('\uE010')) {
      const contentCol = contentColumn(previous) ?? bullet[1].length + 2
      if (indent >= contentCol) {
        const chunk = [line]
        let depth = (line.match(/\uE010/g) || []).length - (line.match(/\uE011/g) || []).length
        let k = i + 1
        while (k < lines.length && depth > 0) {
          chunk.push(lines[k])
          depth += (lines[k].match(/\uE010/g) || []).length
          depth -= (lines[k].match(/\uE011/g) || []).length
          k += 1
        }
        // Stay on the bullet's line. The list matcher is single-line, so a
        // newline would leave the quote outside the item and split the list.
        const flat = chunk.join('\n').replace(/\n+/g, ' ').trim()
        out[out.length - 1] = previous.trimEnd() + ' ' + flat
        i = k - 1
        continue
      }
    }
    if (bullet && indent > 0 && indent >= bullet[1].length && DISPLAY_MATH_LINE_RE.test(line)) {
      const separator = / {2,}$/.test(previous) ? '<br>' : ' '
      out[out.length - 1] = previous.trimEnd() + separator + line.trim()
      continue
    }
    // A blank line does not end the item when the next non-blank line is still
    // indented under the bullet (display math or the sentence after it).
    // CommonMark keeps `- The equation is:` / blank / `$$` / blank / `And it…`
    // / `- Third` as one list. Column-0 text, a sibling marker, or a heading
    // still ends it.
    if (bullet && line.trim() === '') {
      let k = i + 1
      while (k < lines.length && lines[k].trim() === '') k++
      const ahead = lines[k]
      const markerIndent = bullet[1].length
      const contentCol = contentColumn(previous) ?? markerIndent + 2
      if (ahead) {
        const aheadIndent = lineIndent(ahead)
        const sibling = ANY_LIST_ITEM_RE.test(ahead) && aheadIndent <= markerIndent
        const nestedQuote = ahead.includes('\uE010') && aheadIndent >= contentCol
        const underBullet =
          aheadIndent >= contentCol &&
          aheadIndent < contentCol + 4 &&
          !sibling &&
          (nestedQuote || !isStructuralInterrupt(ahead))
        if (underBullet) {
          i = k - 1
          continue
        }
      }
      out.push(line)
      continue
    }
    // Prose after an indented display-math placeholder still belongs to the
    // bullet. The placeholder would otherwise look like a new block and the
    // following sentence would split the list.
    if (
      bullet &&
      line.trim() &&
      indent > bullet[1].length &&
      !ANY_LIST_ITEM_RE.test(line) &&
      !isStructuralInterrupt(line) &&
      !BLOCK_PLACEHOLDER_RE.test(line)
    ) {
      const separator = / {2,}$/.test(previous) ? '<br>' : ' '
      out[out.length - 1] = previous.trimEnd() + separator + line.trim()
      continue
    }
    if (
      bullet &&
      line.trim() &&
      !isInterruptingBlock(line) &&
      !BLOCK_PLACEHOLDER_RE.test(line) &&
      !BLOCK_PLACEHOLDER_RE.test(previous)
    ) {
      const separator = / {2,}$/.test(previous) ? '<br>' : ' '
      out[out.length - 1] = previous.trimEnd() + separator + line.trim()
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * An indented `>` belongs to the list item above it. markBlockquotes has
 * already turned it into markers; the list matcher only sees one line, so
 * the quote has to be on that line. Display math is folded first so the
 * warning stays after the formula (MiMo 04).
 */
function mergeIndentedQuotesIntoItems(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('\uE010') && lineIndent(line) > 0) {
      let b = out.length - 1
      while (b >= 0 && out[b].trim() === '') b -= 1
      const owner = b >= 0 ? out[b] : ''
      const contentCol = contentColumn(owner)
      if (contentCol !== null && lineIndent(line) >= contentCol) {
        const chunk = [line]
        let depth = (line.match(/\uE010/g) || []).length - (line.match(/\uE011/g) || []).length
        let k = i + 1
        while (k < lines.length && depth > 0) {
          chunk.push(lines[k])
          depth += (lines[k].match(/\uE010/g) || []).length
          depth -= (lines[k].match(/\uE011/g) || []).length
          k += 1
        }
        while (out.length - 1 > b) out.pop()
        const flat = chunk.join(' ').replace(/\s+/g, ' ').trim()
        out[b] = owner.trimEnd() + ' ' + flat
        i = k - 1
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

export function processMarkdownLists(text: string): string {
  let processed = text

  while (processed.includes('((MDPH')) {
    processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
  }
  while (processed.includes('{{MDPH')) {
    processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
  }
  processed = processed.replace(/\(MDPH\d+\)/g, '')
  processed = processed.replace(/\{MDPH\d+\}/g, '')

  const processListContent = (content: string): string => {
    let processedContent = convertImplicitMath(content)

    const mathPlaceholders = new Map<string, string>()
    let placeholderCounter = 0
    processedContent = processedContent.replace(
      /__(?:INLINE_MATH|DISPLAY_MATH|CODE_BLOCK|HR_PLACEHOLDER)_\d+__/g,
      match => {
        const tempPlaceholder = `%%MATHPH${placeholderCounter}%%`
        mathPlaceholders.set(tempPlaceholder, match)
        placeholderCounter++
        return tempPlaceholder
      }
    )

    processedContent = processedContent.replace(
      /~~((?:(?!~~)[\s\S])+?)~~/g,
      '<del class="markdown-strikethrough">$1</del>'
    )
    processedContent = replaceExactlyTwoStrong(processedContent)
    processedContent = processedContent.replace(
      /\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g,
      '<strong>$1</strong>'
    )
    processedContent = processedContent.replace(/__((?:(?!__)[\s\S])+?)__/g, (match, content) => {
      if (content.includes('$') || content.includes('\\(') || content.includes('\\[')) {
        return match
      }
      return `<strong>${content}</strong>`
    })
    processedContent = replaceSingleStarEm(processedContent)
    processedContent = processedContent.replace(/(?<!_)_((?:(?!_)[^\n])+?)_(?!_)/g, '<em>$1</em>')

    mathPlaceholders.forEach((original, placeholder) => {
      processedContent = processedContent.replaceAll(placeholder, original)
    })
    processedContent = processedContent.replace(
      /`([^`\n]+?)`/g,
      '<code class="inline-code">$1</code>'
    )
    // An image inside a list item never reaches the later image pass, because
    // the item is already a placeholder by then. Alt text stays an attribute.
    processedContent = processedContent.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      '<img alt="$1" src="$2">'
    )

    return processedContent
  }

  processed = mergeBulletContinuationLines(processed)
  processed = mergeOrderedLazyLines(processed)
  // A `$$` / `\[` block on the next line is still inside the list item
  // (markdown-it lazy continuation). Replacing it with a column-0
  // `__DISPLAY_MATH_n__` would otherwise end the list.
  processed = mergeDisplayMathIntoListItems(processed)
  processed = mergeIndentedQuotesIntoItems(processed)

  processed = processed.replace(/^- \[([ x])\] (.+)$/gm, (_, checked, text) => {
    const isChecked = checked === 'x'
    const processedText = processListContent(text)
    return `__TASK_${isChecked ? 'checked' : 'unchecked'}__${processedText}__/TASK__`
  })

  processed = processed.replace(/^([ \t]*)- (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })
  processed = processed.replace(/^([ \t]*)\* (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })

  // Unicode bullet character (•) used by some models (e.g., Claude Haiku 3.5)
  processed = processed.replace(/^([ \t]*)•[ \t]*(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })

  processed = processed.replace(
    /^([ \t]*)(\d+)[.)][ \t]+(.+?)$/gm,
    (_match, indent, num, content) => {
      const level = indent.length
      const processedContent = processListContent(content)
      return `__OL_${level}_${num}__${processedContent}__/OL__`
    }
  )

  processed = processed.replace(
    /__OL_(\d+)_(\d+)__([\s\S]*?)__\/OL__(?:\n((?:[ \t]{3,}[^\n]+(?:\n|$)|[ \t]*\n)*))?/g,
    (_fullMatch, level, num, content, continuationBlock) => {
      let result = `__OL_${level}_${num}__${content}`

      if (continuationBlock && continuationBlock.trim()) {
        const lines = continuationBlock.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) {
            // Same inline markdown as the list item itself. Raw `**$x = 0$**` in
            // an ordered-list continuation (Gemini 3.1 Flash Lite 04) left
            // leftover asterisks after math restore.
            result += `<div style="margin-left: 2em; margin-top: 0.5em;">${processListContent(trimmed)}</div>`
          }
        }
      }

      // Keep the line breaks the continuation match consumed so following blocks
      // (e.g. a heading after the list) still start on their own line.
      const consumedNewlines =
        continuationBlock === undefined
          ? ''
          : '\n' + continuationBlock.slice(continuationBlock.trimEnd().length).replace(/[ \t]/g, '')
      return result + '__/OL__' + consumedNewlines
    }
  )

  return processed
}

/**
 * A display formula after the item's words must not be `:first-child`.
 * That selector (and the `<br>` + formula rule) drops the top margin, which
 * is only right when the formula itself starts the item.
 */
function separateLeadingProse(content: string): string {
  // List HTML is built after KaTeX, so the formula is already a display span.
  // Placeholders remain when this runs on the pre-render list pass.
  const marker = content.search(/__DISPLAY_MATH_\d+__|<span class="katex-display"/)
  if (marker <= 0) return content
  const lead = content.slice(0, marker)
  if (!lead.trim()) return content
  // Keep one space before the formula. trimEnd() glued "formula:" to the math.
  const prose = lead.replace(/[ \t]+$/, '')
  const spacer = /[ \t]$/.test(lead) ? ' ' : ''
  return `<span class="list-item-text">${prose}${spacer}</span>${content.slice(marker)}`
}

interface ListItem {
  tag: 'ul' | 'ol'
  indent: number
  num?: string
  content: string
  start: number
  end: number
  gapBefore: string
}

/** A column-0 `<hr>` splits two lists. An indented one stays inside the item. */
function gapSplitsList(gap: string): boolean {
  if (/^\s*$/.test(gap)) return false
  const lines = gap.split('\n')
  const onlyHr = lines.every(line => /^\s*(<hr\b[^>]*>)?\s*$/i.test(line))
  if (!onlyHr) return true
  return lines.some(line => /^<hr\b/i.test(line))
}

const LIST_ITEM_RE = /__UL_(\d+)__([\s\S]*?)__\/UL__|__OL_(\d+)_(\d+)__([\s\S]*?)__\/OL__/g

function buildListHTML(items: ListItem[]): string {
  const stack: { indent: number; tag: 'ul' | 'ol' }[] = []
  let html = ''
  for (const item of items) {
    while (stack.length > 0 && item.indent < stack[stack.length - 1].indent) {
      html += `</li></${stack.pop()!.tag}>`
    }
    const top = stack[stack.length - 1]
    if (!top || item.indent > top.indent) {
      html += `<${item.tag}>`
      stack.push({ indent: item.indent, tag: item.tag })
    } else if (top.tag !== item.tag) {
      html += `</li></${top.tag}><${item.tag}>`
      top.tag = item.tag
    } else {
      const hrs = item.gapBefore.match(/<hr\b[^>]*>/gi)
      if (hrs && item.indent > 0) {
        html += `</li></${top.tag}>${hrs.join('')}<${top.tag}>`
      } else {
        html += '</li>'
      }
    }
    const content = separateLeadingProse(item.content.trim())
    html += item.tag === 'ol' ? `<li value="${item.num}">${content}` : `<li>${content}`
  }
  while (stack.length > 0) {
    html += `</li></${stack.pop()!.tag}>`
  }
  return html
}

/**
 * Convert `__UL_indent__…__/UL__` and `__OL_indent_num__…__/OL__` placeholders into
 * nested `<ul>`/`<ol>` HTML. Consecutive items (separated only by whitespace) form one
 * list; indentation decides nesting, so ordered and unordered lists can nest in each other.
 */
export function convertListPlaceholdersToHTML(text: string): string {
  const items: ListItem[] = []
  let m: RegExpExecArray | null
  LIST_ITEM_RE.lastIndex = 0
  while ((m = LIST_ITEM_RE.exec(text)) !== null) {
    const isOrdered = m[3] !== undefined
    const start = m.index
    const previous = items[items.length - 1]
    items.push({
      tag: isOrdered ? 'ol' : 'ul',
      indent: parseInt(isOrdered ? m[3] : m[1], 10),
      num: isOrdered ? m[4] : undefined,
      content: isOrdered ? m[5] : m[2],
      start,
      end: m.index + m[0].length,
      gapBefore: previous ? text.slice(previous.end, start) : '',
    })
  }
  if (items.length === 0) return text

  const groups: ListItem[][] = []
  for (const item of items) {
    const current = groups[groups.length - 1]
    const previous = current?.[current.length - 1]
    if (previous && !gapSplitsList(text.slice(previous.end, item.start))) {
      current.push(item)
    } else {
      groups.push([item])
    }
  }

  let result = ''
  let cursor = 0
  for (const group of groups) {
    result += text.slice(cursor, group[0].start) + buildListHTML(group)
    cursor = group[group.length - 1].end
  }
  return result + text.slice(cursor)
}
