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
    fixed = fixed.replace(new RegExp(`\\b${cmd}\\{`, 'g'), `\\${cmd}{`)
    fixed = fixed.replace(new RegExp(`\\b${cmd}([_^])`, 'g'), `\\${cmd}$1`)
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
    fixed = fixed.replace(new RegExp(`\\b${op}\\b`, 'g'), `\\${op}`)
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
