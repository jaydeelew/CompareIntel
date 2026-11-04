import { convertImplicitMath } from './implicitMath'

const BULLET_ITEM_RE = /^([ \t]*)[-*•][ \t]+\S/
const ANY_LIST_ITEM_RE = /^[ \t]*(?:[-*•][ \t]|\d+\.[ \t])/
const BLOCK_PLACEHOLDER_RE = /__(?:DISPLAY_MATH|CODE_BLOCK|HR_PLACEHOLDER)_\d+__|<hr/
const DISPLAY_MATH_LINE_RE = /^[ \t]*__DISPLAY_MATH_\d+__[ \t]*$/

/**
 * Fold lazily indented continuation lines into the bullet item above them, e.g.
 * `- Calculate:  ` followed by `     $c = 5$`. A trailing double space keeps the line break.
 * An indented display-math block joins the bullet above it even at the bullet's own indent
 * (`   - Find c:` / `   \[ … \]` / `   - Therefore …`), so it doesn't split the list.
 */
function mergeBulletContinuationLines(text: string): string {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const previous = out[out.length - 1]
    const bullet = previous?.match(BULLET_ITEM_RE)
    const indent = line.match(/^[ \t]*/)![0].length
    if (
      bullet &&
      indent > 0 &&
      indent >= bullet[1].length &&
      DISPLAY_MATH_LINE_RE.test(line)
    ) {
      out[out.length - 1] = previous.trimEnd() + ' ' + line.trim()
      continue
    }
    if (
      bullet &&
      line.trim() &&
      indent > bullet[1].length &&
      !ANY_LIST_ITEM_RE.test(line) &&
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
    processedContent = processedContent.replace(/__(?:INLINE|DISPLAY)_MATH_\d+__/g, match => {
      const tempPlaceholder = `%%MATHPH${placeholderCounter}%%`
      mathPlaceholders.set(tempPlaceholder, match)
      placeholderCounter++
      return tempPlaceholder
    })

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
    processedContent = processedContent.replace(
      /(?<!\*)\*((?:(?!\*)[^\n])+?)\*(?!\*)/g,
      '<em>$1</em>'
    )
    processedContent = processedContent.replace(/(?<!_)_((?:(?!_)[^\n])+?)_(?!_)/g, '<em>$1</em>')

    mathPlaceholders.forEach((original, placeholder) => {
      processedContent = processedContent.replaceAll(placeholder, original)
    })
    processedContent = processedContent.replace(
      /`([^`\n]+?)`/g,
      '<code class="inline-code">$1</code>'
    )

    return processedContent
  }

  processed = mergeBulletContinuationLines(processed)

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
    /^([ \t]*)(\d+)\.[ \t]+(.+?)$/gm,
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
            result += `<div style="margin-left: 2em; margin-top: 0.5em;">${trimmed}</div>`
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

interface ListItem {
  tag: 'ul' | 'ol'
  indent: number
  num?: string
  content: string
  start: number
  end: number
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
      html += '</li>'
    }
    const content = item.content.trim()
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
    items.push({
      tag: isOrdered ? 'ol' : 'ul',
      indent: parseInt(isOrdered ? m[3] : m[1], 10),
      num: isOrdered ? m[4] : undefined,
      content: isOrdered ? m[5] : m[2],
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  if (items.length === 0) return text

  const groups: ListItem[][] = []
  for (const item of items) {
    const current = groups[groups.length - 1]
    const previous = current?.[current.length - 1]
    if (previous && /^\s*$/.test(text.slice(previous.end, item.start))) {
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
