import { looksMathematical, looksProse } from './helpers'

export function convertImplicitMath(text: string): string {
  let converted = text

  converted = converted.replace(/\bd\/d([a-zA-Z])\(([^)]+)\)/g, (_match, variable, expression) => {
    return `⟨⟨DERIVATIVE_${variable}⟩⟩(${expression})`
  })

  converted = converted.replace(/\bd\/d([a-zA-Z])\[([^\]]+)\]/g, (_match, variable, expression) => {
    return `⟨⟨DERIVATIVE_${variable}⟩⟩[${expression}]`
  })

  converted = converted.replace(/\(\s+((?:[^()]|\([^()]*\))+?)\s+\)/g, (_match, content) => {
    if (content.includes('*') || content.includes('_') || content.includes('`')) return _match
    if (looksMathematical(content) && !looksProse(content)) {
      return `\\(${content.trim()}\\)`
    }
    return _match
  })

  converted = converted.replace(/\[\s+((?:[^[\]]|\[[^\]]*\])+?)\s+\]/g, (_match, content) => {
    if (content.includes('\\boxed')) return _match
    if (looksMathematical(content) && !looksProse(content)) {
      return `\\(${content.trim()}\\)`
    }
    return _match
  })

  converted = converted.replace(/(?<![a-zA-Z])\(([^()]+)\)/g, (_match, content) => {
    if (_match.includes('\\(') || content.includes('\\boxed')) return _match
    if (content.match(/^(a|an)\s+/i)) return _match
    if (content.includes('*') || content.includes('_') || content.includes('`')) return _match

    let trimmed = content.trim()

    const supMap: { [key: string]: string } = {
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
    for (const [unicode, latex] of Object.entries(supMap)) {
      trimmed = trimmed.replace(
        new RegExp(`([a-zA-Z0-9])${unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
        `$1${latex}`
      )
    }

    if (content.includes('\\cdot') || content.includes('\\pm') || content.includes('\\sqrt')) {
      return _match
    }

    const beforeMatch = text.substring(0, text.indexOf(_match))
    const afterMatch = text.substring(text.indexOf(_match) + _match.length)

    const mathContextPattern = /[=+\-×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹]/
    if (
      mathContextPattern.test(beforeMatch.slice(-20)) ||
      mathContextPattern.test(afterMatch.slice(0, 20))
    ) {
      return _match
    }

    if (trimmed.includes(' ')) return _match

    if (
      /^[a-zA-Z0-9]$/.test(trimmed) ||
      /^[+-]?\s*[A-Z]$/.test(trimmed) ||
      (looksMathematical(content) && !looksProse(content) && content.length < 100)
    ) {
      return `\\(${trimmed}\\)`
    }

    return _match
  })

  return converted
}
