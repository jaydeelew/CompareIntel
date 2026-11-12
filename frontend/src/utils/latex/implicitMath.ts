import { looksMathematical, looksProse } from './helpers'
import { containsProtectedToken } from './protection'

/**
 * Commands that mean "this parenthesis is LaTeX", not a regex or a path.
 * Unknown letter commands (`\d`, `\w`, `\n`, `\Users`) stay text.
 * Longer names are matched by consuming the whole letter run, so `\leq`
 * is not read as `\le`.
 */
const KATEX_COMMANDS = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'varpi',
  'rho',
  'varrho',
  'sigma',
  'varsigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega',
  'sqrt',
  'surd',
  'frac',
  'dfrac',
  'tfrac',
  'cfrac',
  'binom',
  'cdot',
  'times',
  'div',
  'pm',
  'mp',
  'ast',
  'circ',
  'oplus',
  'otimes',
  'le',
  'leq',
  'ge',
  'geq',
  'ne',
  'neq',
  'll',
  'gg',
  'approx',
  'equiv',
  'sim',
  'simeq',
  'cong',
  'propto',
  'infty',
  'partial',
  'nabla',
  'sum',
  'prod',
  'int',
  'oint',
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
  'to',
  'rightarrow',
  'leftarrow',
  'Rightarrow',
  'Leftarrow',
  'mapsto',
  'ldots',
  'cdots',
  'vdots',
  'ddots',
  'dots',
  'left',
  'right',
  'bar',
  'hat',
  'vec',
  'dot',
  'ddot',
  'tilde',
  'overline',
  'underline',
  'mathbb',
  'mathbf',
  'mathrm',
  'mathit',
  'mathcal',
  'ell',
  'hbar',
  'in',
  'ni',
  'subset',
  'subseteq',
  'cap',
  'cup',
  'setminus',
  'forall',
  'exists',
  'neg',
  'land',
  'lor',
  'langle',
  'rangle',
  'vert',
  'Vert',
  'mid',
  'not',
])

/** Bare function names and differentials that are math, not prose. */
const MATH_WORDS = new Set([
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
  'det',
  'gcd',
  'mod',
  'dim',
  'ker',
  'sup',
  'inf',
  'arg',
  'sinh',
  'cosh',
  'tanh',
])

const UNICODE_SUPERSCRIPTS: Record<string, string> = {
  '²': '^{2}',
  '³': '^{3}',
  '⁴': '^{4}',
  '⁵': '^{5}',
  '⁶': '^{6}',
  '⁷': '^{7}',
  '⁸': '^{8}',
  '⁹': '^{9}',
  '⁰': '^{0}',
  '¹': '^{1}',
}

function applyUnicodeSuperscripts(content: string): string {
  let trimmed = content
  for (const [unicode, latex] of Object.entries(UNICODE_SUPERSCRIPTS)) {
    trimmed = trimmed.replace(
      new RegExp(`([a-zA-Z0-9])${unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      `$1${latex}`
    )
  }
  return trimmed
}

function letterCommands(content: string): string[] {
  return Array.from(content.matchAll(/\\([A-Za-z]+)/g), match => match[1])
}

/**
 * True when the parenthesis content is an expression: at least one known
 * command or a braced superscript/subscript, and no prose word outside
 * command names and braces.
 */
function isPureLatexParenthetical(content: string): boolean {
  const commands = letterCommands(content)
  if (commands.some(name => !KATEX_COMMANDS.has(name))) return false
  const hasBraceScript = /[\^_]\{/.test(content)
  if (commands.length === 0 && !hasBraceScript) return false

  let rest = content.replace(/\\[A-Za-z]+/g, ' ')
  let previous = ''
  while (rest !== previous) {
    previous = rest
    rest = rest.replace(/\{[^{}]*\}/g, ' ')
  }
  rest = rest.replace(/[\^_]/g, ' ')
  if (rest.includes('\\')) return false

  const words = rest.match(/[A-Za-z]{2,}/g) ?? []
  return words.every(word => MATH_WORDS.has(word) || /^d[a-z]$/.test(word))
}

type BareParenDecision = 'render' | 'leave' | 'ignore'

function classifyBareParenLatex(content: string): BareParenDecision {
  if (!/\\[A-Za-z]+/.test(content) && !/[\^_]\{/.test(content)) return 'ignore'
  return isPureLatexParenthetical(content) ? 'render' : 'leave'
}

function keepParensAroundInlineMath(content: string): string {
  return `(\\(${content}\\))`
}

export function convertImplicitMath(text: string): string {
  let converted = text

  converted = converted.replace(/\bd\/d([a-zA-Z])\(([^)]+)\)/g, (_match, variable, expression) => {
    return `⟨⟨DERIVATIVE_${variable}⟩⟩(${expression})`
  })

  converted = converted.replace(/\bd\/d([a-zA-Z])\[([^\]]+)\]/g, (_match, variable, expression) => {
    return `⟨⟨DERIVATIVE_${variable}⟩⟩[${expression}]`
  })

  converted = converted.replace(
    /\(\s+((?:[^()]|\([^()]*\))+?)\s+\)/g,
    (match, content: string, offset: number, source: string) => {
      if (containsProtectedToken(content)) return match
      if (offset > 0 && (source[offset - 1] === '\\' || source[offset - 1] === ']')) return match
      const trimmed = applyUnicodeSuperscripts(content.trim())
      const decision = classifyBareParenLatex(trimmed)
      if (decision === 'render') return keepParensAroundInlineMath(trimmed)
      if (decision === 'leave') return match
      if (/[*_`]/.test(content)) return match
      if (looksMathematical(content) && !looksProse(content)) {
        return `\\(${content.trim()}\\)`
      }
      return match
    }
  )

  converted = converted.replace(/\[\s+((?:[^[\]]|\[[^\]]*\])+?)\s+\]/g, (_match, content) => {
    if (content.includes('\\boxed')) return _match
    if (looksMathematical(content) && !looksProse(content)) {
      return `\\(${content.trim()}\\)`
    }
    return _match
  })

  converted = converted.replace(
    /(?<![a-zA-Z])\(([^()]+)\)/g,
    (match, content: string, offset: number, source: string) => {
      if (match.includes('\\(') || content.includes('\\boxed')) return match
      if (content.match(/^(a|an)\s+/i)) return match
      if (containsProtectedToken(content)) return match
      // A preceding `\` is already `\(...\)`. A preceding `]` is a link or image destination.
      if (offset > 0 && (source[offset - 1] === '\\' || source[offset - 1] === ']')) return match

      const trimmed = applyUnicodeSuperscripts(content.trim())

      // The old guard returned every parenthetical that contained `\sqrt`,
      // `\cdot`, or `\pm`, so `(\sqrt{2})` stayed literal after a missed
      // `\(...\)` was unescaped. Only non-expressions stay text: unknown
      // commands (`\d`, `\w`, `\n`, `\Users`) and prose outside commands
      // and braces. A pure expression renders with the parentheses kept
      // as text around the math, `(√2)`.
      const decision = classifyBareParenLatex(trimmed)
      if (decision === 'render') return keepParensAroundInlineMath(trimmed)
      if (decision === 'leave') return match

      if (/[*_`]/.test(content)) return match

      const beforeMatch = source.substring(0, offset)
      const afterMatch = source.substring(offset + match.length)

      const mathContextPattern = /[=+\-×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹]/
      if (
        mathContextPattern.test(beforeMatch.slice(-20)) ||
        mathContextPattern.test(afterMatch.slice(0, 20))
      ) {
        return match
      }

      if (trimmed.includes(' ')) return match

      // Unicode code point notes like (U+00B2) contain `+` so looksMathematical
      // is true, but they are not math (Qwen 05 rerun: KaTeX `U+00B2\`).
      if (/^U\+[0-9A-Fa-f]{2,6}$/.test(trimmed)) return match
      // Hyphenated prose labels like (Non-Math) match looksMathematical only
      // because `-` is an operator (Mistral Medium 01: KaTeX `\Non`).
      if (/^[A-Za-z]{2,}(?:-[A-Za-z]{2,})+$/.test(trimmed)) return match
      // A parenthetical run of hyphens is a prose dash, not an expression
      // (gpt-5-mini 05: "Horizontal rules (---) separate sections").
      if (/^-+$/.test(trimmed)) return match

      if (
        /^[a-zA-Z0-9]$/.test(trimmed) ||
        /^[+-]?\s*[A-Z]$/.test(trimmed) ||
        (looksMathematical(content) && !looksProse(content) && content.length < 100)
      ) {
        return `\\(${trimmed}\\)`
      }

      return match
    }
  )

  return converted
}
