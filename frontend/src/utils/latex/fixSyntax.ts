/**
 * Detect lines that are bare LaTeX (commands like \frac{}{}, \sqrt{}, etc.
 * without $, $$, \(\), or \[\] delimiters) and wrap them in $$ for display
 * math rendering.
 *
 * Must run AFTER code block extraction and BEFORE math delimiter extraction.
 */
export function wrapBareLatexBlocks(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0
  let insideMathBlock = false

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (!insideMathBlock && /^\\\[\s*$/.test(trimmed)) {
      insideMathBlock = true
      result.push(lines[i])
      i++
      continue
    }
    if (insideMathBlock && /^\\\]\s*$/.test(trimmed)) {
      insideMathBlock = false
      result.push(lines[i])
      i++
      continue
    }
    if (!insideMathBlock && /^\$\$\s*$/.test(trimmed)) {
      insideMathBlock = true
      result.push(lines[i])
      i++
      continue
    }
    if (insideMathBlock && /^\$\$\s*$/.test(trimmed)) {
      insideMathBlock = false
      result.push(lines[i])
      i++
      continue
    }

    if (insideMathBlock) {
      result.push(lines[i])
      i++
      continue
    }

    if (isBareLatexLine(trimmed)) {
      const blockLines: string[] = [lines[i]]
      i++

      while (i < lines.length) {
        const t = lines[i].trim()
        if (isBareLatexLine(t)) {
          blockLines.push(lines[i])
          i++
        } else if (!t && blockLines.length > 0) {
          let peek = i + 1
          while (peek < lines.length && !lines[peek].trim()) peek++
          if (peek < lines.length && isBareLatexLine(lines[peek].trim())) {
            blockLines.push(lines[i])
            i++
          } else {
            break
          }
        } else {
          break
        }
      }

      const block = blockLines
        .map(l => l.trim())
        .join('\n')
        .trim()
      result.push(`$$${block}$$`)
    } else {
      result.push(lines[i])
      i++
    }
  }

  return result.join('\n')
}

function isBareLatexLine(line: string): boolean {
  if (!line) return false

  if (
    /^\$\$/.test(line) ||
    /\$\$$/.test(line) ||
    /^\\\[/.test(line) ||
    /\\\]$/.test(line) ||
    /^\\\(/.test(line) ||
    /\\\)$/.test(line)
  ) {
    return false
  }

  if (/\\\(/.test(line) && /\\\)/.test(line)) return false

  if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) return false

  if (/^__/.test(line)) return false

  const hasBracedCmd = /\\(?:frac|sqrt|binom|overline|underline|hat|bar|vec|tilde|boxed)\s*\{/.test(
    line
  )
  if (!hasBracedCmd) return false

  const proseStarters =
    /^(Note|Where|If|Let|For|The|Since|Because|When|Then|Given|Assume|Suppose|Corrected|Replaced|Using|This|That|Here|Thus|Hence|Therefore|Also|So|Now|To|From|By|In|On|At|As|With|We|It|A|An)\b/i
  if (proseStarters.test(line)) return false

  const cmdCount = (line.match(/\\[a-zA-Z]+/g) || []).length

  const stripped = line
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}_^$\\|]/g, ' ')
    .replace(/[=+\-*/<>()[\],.:;!?0-9∫∇⋅∂ε₀ρμσπ∞²³⁴⁵⁶⁷⁸⁹⁰¹]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const proseWords = (stripped.match(/[a-zA-Z]{3,}/g) || []).filter(
    w =>
      ![
        'sin',
        'cos',
        'tan',
        'log',
        'exp',
        'lim',
        'sup',
        'inf',
        'max',
        'min',
        'det',
        'dim',
        'ker',
        'deg',
        'gcd',
        'lcm',
      ].includes(w.toLowerCase())
  )

  return cmdCount > proseWords.length
}

export function fixLatexIssues(text: string): string {
  let fixed = text

  fixed = fixed
    // eslint-disable-next-line no-control-regex -- intentionally match backspace to convert to \b
    .replace(/\x08/g, '\\b')
    .replace(/\f/g, '\\f')
    .replace(/\t/g, '\\t')
    .replace(/\v/g, '\\v')
  fixed = fixed.replace(/\r(?!\n)/g, '\\r')

  fixed = fixed.replace(/^\\\[\s*$/gm, '')
  fixed = fixed.replace(/^\\\]\s*$/gm, '')
  fixed = fixed.replace(/^\$\$\s*$/gm, '')

  const commands = [
    'frac',
    'boxed',
    'sqrt',
    'sum',
    'prod',
    'int',
    'lim',
    'sin',
    'cos',
    'tan',
    'log',
    'ln',
    'exp',
  ]
  commands.forEach(cmd => {
    fixed = fixed.replace(new RegExp(`(?<!\\\\)\\b${cmd}\\{`, 'g'), `\\${cmd}{`)
    fixed = fixed.replace(new RegExp(`(?<!\\\\)\\b${cmd}([_^])`, 'g'), `\\${cmd}$1`)
  })

  const operators = [
    'neq',
    'leq',
    'geq',
    'cdot',
    'times',
    'div',
    'pm',
    'mp',
    'approx',
    'equiv',
    'sim',
    'infty',
  ]
  operators.forEach(op => {
    fixed = fixed.replace(new RegExp(`(?<!\\\\)\\b${op}\\b`, 'g'), `\\${op}`)
  })

  fixed = fixed.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
  fixed = fixed.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
  fixed = fixed.replace(/\\left\\\{/g, '\\{').replace(/\\right\\\}/g, '\\}')

  fixed = fixed.replace(/\(\s*\\boxed\{([^}]+)\}\s*\)\.?/g, '\\boxed{$1}')
  fixed = fixed.replace(/\[\s*\\boxed\{([^}]+)\}\s*\]\.?/g, '\\boxed{$1}')
  fixed = fixed.replace(/\\boxed\{\s*\(\s*([^)]+)\s*\)\s*\}/g, '\\boxed{$1}')
  fixed = fixed.replace(/\\boxed\{\s*\[\s*([^\]]+)\s*\]\s*\}/g, '\\boxed{$1}')

  fixed = fixed.replace(/\(\(\s*([^()]+)\s*\)\)/g, '( $1 )')

  fixed = fixed.replace(/\(-\s*\(-\s*(\d+)\s*\)\s*\)/g, '(-(-$1))')
  fixed = fixed.replace(/--(\d+)/g, '-(-$1)')
  fixed = fixed.replace(/\((\d+)\s*\((\d+)\s*\)\s*\)/g, '($1 \\cdot $2)')
  fixed = fixed.replace(/\((\d)(\d)\)/g, '($1 \\cdot $2)')
  fixed = fixed.replace(/\(--(\d+)\)/g, '(-(-$1))')

  fixed = fixed.replace(/√(\d+)/g, '\\sqrt{$1}')
  fixed = fixed.replace(/±+/g, '\\pm')
  fixed = fixed.replace(/×/g, '\\times')
  fixed = fixed.replace(/\((\d+)\\times(\d+)\)/g, '($1 \\times $2)')

  fixed = fixed.replace(/−/g, '-')
  fixed = fixed.replace(/‒/g, '-')
  fixed = fixed.replace(/–/g, '-')
  fixed = fixed.replace(/—/g, '-')

  fixed = fixed.replace(/fracdx\[([^\]]+)\]/g, '\\frac{d}{dx}[$1]')
  fixed = fixed.replace(/fracd([a-z])\[([^\]]+)\]/g, '\\frac{d}{d$1}[$2]')

  fixed = fixed.replace(/\\boxed\{[^}]*style="[^"]*"[^}]*\}/g, match => {
    const content = match
      .replace(/\\boxed\{/, '')
      .replace(/\}$/, '')
      .replace(/<[^>]*>/g, '')
      .replace(/style="[^"]*"/g, '')
      .trim()
    return `\\boxed{${content}}`
  })

  return fixed
}
