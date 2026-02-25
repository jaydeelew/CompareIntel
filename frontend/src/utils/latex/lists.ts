import { convertImplicitMath } from './implicitMath'

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
    processedContent = processedContent.replace(/__INLINE_MATH_\d+__/g, match => {
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

  processed = processed.replace(/^- \[([ x])\] (.+)$/gm, (_, checked, text) => {
    const isChecked = checked === 'x'
    const processedText = processListContent(text)
    return `__TASK_${isChecked ? 'checked' : 'unchecked'}__${processedText}__/TASK__`
  })

  processed = processed.replace(/^(\s*)- (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })
  processed = processed.replace(/^(\s*)\* (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })

  // Unicode bullet character (•) used by some models (e.g., Claude Haiku 3.5)
  processed = processed.replace(/^(\s*)•\s*(.+)$/gm, (_, indent, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__UL_${level}__${processedContent}__/UL__`
  })

  processed = processed.replace(/^(\s*)(\d+)\.\s+(.+?)$/gm, (_match, indent, num, content) => {
    const level = indent.length
    const processedContent = processListContent(content)
    return `__OL_${level}_${num}__${processedContent}__/OL__`
  })

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

      return result + '__/OL__'
    }
  )

  return processed
}
