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
      result.push(`$$${normalizeUnicodeMath(block)}$$`)
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

  // Detect Unicode math operators (∫, ∑, ∇, …) combined with LaTeX-style
  // subscript/superscript notation (_{…}, ^{…}) or Unicode subscript digits.
  // This catches model output that uses a mix of Unicode symbols and LaTeX
  // notation but omits math-mode delimiters entirely.
  const hasUnicodeMathOperators = /[∫∑∏∮∬∭∇∀∃∈∉]/.test(line)
  const hasLatexSubSup = /[_^]\{/.test(line) || /[₀₁₂₃₄₅₆₇₈₉]/.test(line)
  const hasUnicodeMath = hasUnicodeMathOperators && hasLatexSubSup

  if (!hasBracedCmd && !hasUnicodeMath) return false

  const proseStarters =
    /^(Note|Where|If|Let|For|The|Since|Because|When|Then|Given|Assume|Suppose|Corrected|Replaced|Using|This|That|Here|Thus|Hence|Therefore|Also|So|Now|To|From|By|In|On|At|As|With|We|It|A|An)\b/i
  if (proseStarters.test(line)) return false

  const cmdCount = (line.match(/\\[a-zA-Z]+/g) || []).length
  const unicodeMathCount = (line.match(/[∫∑∏∮∬∭∇∀∃∈∉∞αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΥΦΨΩ]/g) || [])
    .length

  const stripped = line
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}_^$\\|]/g, ' ')
    .replace(/[=+\-*/<>()[\],.:;!?0-9∫∇⋅∂ε₀ρμσπ∞²³⁴⁵⁶⁷⁸⁹⁰¹]/g, ' ')
    .replace(/[∑∏∮∬∭∀∃∈∉αβγδζηθικλμνξστυφχψωΓΔΘΛΞΠΣΥΦΨΩ→←⇒⇐·×÷±≤≥≈≠⊂⊃∪∩∅ℂℕℝℤℚ₁₂₃₄₅₆₇₈₉−‒–—]/g, ' ')
    .replace(/[\u{1D400}-\u{1D433}]/gu, ' ')
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

  return cmdCount + unicodeMathCount > proseWords.length
}

/**
 * Convert Unicode math symbols, Greek letters, bold math, subscripts/superscripts,
 * and bare function names into their LaTeX equivalents so the content can be
 * rendered by KaTeX after being wrapped in display-math delimiters.
 *
 * Called by wrapBareLatexBlocks on detected bare-math lines BEFORE they are
 * wrapped in $$ and extracted – i.e. before fixLatexIssues runs.
 */
export function normalizeUnicodeMath(text: string): string {
  let r = text

  // Dash / minus variants → ASCII hyphen-minus
  r = r.replace(/[−‒–—]/g, '-')

  // Unicode subscript digits → LaTeX subscripts
  r = r
    .replace(/₀/g, '_0')
    .replace(/₁/g, '_1')
    .replace(/₂/g, '_2')
    .replace(/₃/g, '_3')
    .replace(/₄/g, '_4')
    .replace(/₅/g, '_5')
    .replace(/₆/g, '_6')
    .replace(/₇/g, '_7')
    .replace(/₈/g, '_8')
    .replace(/₉/g, '_9')

  // Unicode superscript digits → LaTeX superscripts
  const supEntries: [string, string][] = [
    ['²', '2'],
    ['³', '3'],
    ['⁴', '4'],
    ['⁵', '5'],
    ['⁶', '6'],
    ['⁷', '7'],
    ['⁸', '8'],
    ['⁹', '9'],
    ['⁰', '0'],
    ['¹', '1'],
  ]
  for (const [uc, digit] of supEntries) {
    const escaped = uc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    r = r.replace(new RegExp(`([a-zA-Z0-9)\\]])${escaped}`, 'g'), `$1^{${digit}}`)
    r = r.replace(new RegExp(escaped, 'g'), `^{${digit}}`)
  }

  // Mathematical Bold letters (U+1D400‒U+1D433)
  r = r.replace(/[\u{1D400}-\u{1D419}]/gu, ch => {
    const offset = ch.codePointAt(0)! - 0x1d400
    return `\\mathbf{${String.fromCharCode(65 + offset)}}`
  })
  r = r.replace(/[\u{1D41A}-\u{1D433}]/gu, ch => {
    const offset = ch.codePointAt(0)! - 0x1d41a
    return `\\mathbf{${String.fromCharCode(97 + offset)}}`
  })

  // Blackboard-bold
  r = r
    .replace(/ℂ/g, '\\mathbb{C}')
    .replace(/ℕ/g, '\\mathbb{N}')
    .replace(/ℝ/g, '\\mathbb{R}')
    .replace(/ℤ/g, '\\mathbb{Z}')
    .replace(/ℚ/g, '\\mathbb{Q}')

  // Multi-char operators first to avoid partial matches (∭ before ∫, etc.)
  r = r
    .replace(/∭/g, '\\iiint ')
    .replace(/∬/g, '\\iint ')
    .replace(/∮/g, '\\oint ')
    .replace(/∫/g, '\\int ')
    .replace(/∑/g, '\\sum ')
    .replace(/∏/g, '\\prod ')
    .replace(/∇/g, '\\nabla ')
    .replace(/∂/g, '\\partial ')
    .replace(/∀/g, '\\forall ')
    .replace(/∃/g, '\\exists ')
    .replace(/∈/g, '\\in ')
    .replace(/∉/g, '\\notin ')
    .replace(/∞/g, '\\infty ')
    .replace(/→/g, '\\to ')
    .replace(/←/g, '\\leftarrow ')
    .replace(/⇒/g, '\\Rightarrow ')
    .replace(/⇐/g, '\\Leftarrow ')
    .replace(/±/g, '\\pm ')
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/≤/g, '\\leq ')
    .replace(/≥/g, '\\geq ')
    .replace(/≈/g, '\\approx ')
    .replace(/≠/g, '\\neq ')
    .replace(/⊂/g, '\\subset ')
    .replace(/⊃/g, '\\supset ')
    .replace(/∪/g, '\\cup ')
    .replace(/∩/g, '\\cap ')
    .replace(/∅/g, '\\emptyset ')
    .replace(/⋅/g, '\\cdot ')
    .replace(/·/g, '\\cdot ')

  // Greek lowercase
  r = r
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/δ/g, '\\delta ')
    .replace(/ε/g, '\\varepsilon ')
    .replace(/ζ/g, '\\zeta ')
    .replace(/η/g, '\\eta ')
    .replace(/θ/g, '\\theta ')
    .replace(/ι/g, '\\iota ')
    .replace(/κ/g, '\\kappa ')
    .replace(/λ/g, '\\lambda ')
    .replace(/μ/g, '\\mu ')
    .replace(/ν/g, '\\nu ')
    .replace(/ξ/g, '\\xi ')
    .replace(/π/g, '\\pi ')
    .replace(/ρ/g, '\\rho ')
    .replace(/σ/g, '\\sigma ')
    .replace(/τ/g, '\\tau ')
    .replace(/υ/g, '\\upsilon ')
    .replace(/φ/g, '\\varphi ')
    .replace(/χ/g, '\\chi ')
    .replace(/ψ/g, '\\psi ')
    .replace(/ω/g, '\\omega ')

  // Greek uppercase (only those that differ from Latin)
  r = r
    .replace(/Γ/g, '\\Gamma ')
    .replace(/Δ/g, '\\Delta ')
    .replace(/Θ/g, '\\Theta ')
    .replace(/Λ/g, '\\Lambda ')
    .replace(/Ξ/g, '\\Xi ')
    .replace(/Π/g, '\\Pi ')
    .replace(/Σ/g, '\\Sigma ')
    .replace(/Υ/g, '\\Upsilon ')
    .replace(/Φ/g, '\\Phi ')
    .replace(/Ψ/g, '\\Psi ')
    .replace(/Ω/g, '\\Omega ')

  // Bare math function names → \cmd (longer names first to avoid partial match)
  const fns = [
    'arcsin',
    'arccos',
    'arctan',
    'sinh',
    'cosh',
    'tanh',
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'csc',
    'log',
    'ln',
    'exp',
    'lim',
    'max',
    'min',
    'sup',
    'det',
    'dim',
    'ker',
    'deg',
    'gcd',
    'infty',
  ]
  fns.forEach(fn => {
    r = r.replace(new RegExp(`(?<!\\\\)\\b${fn}\\b`, 'g'), `\\${fn}`)
  })
  r = r.replace(/(?<!\\)\binf\b(?!ty)/g, '\\inf')

  // Collapse runs of spaces
  r = r.replace(/ {2,}/g, ' ')

  return r
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
