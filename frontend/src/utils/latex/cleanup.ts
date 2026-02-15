import type { PreprocessingOptions } from '../../types/rendererConfig'

export function cleanMalformedContent(
  text: string,
  preprocessOpts: PreprocessingOptions = {}
): string {
  let cleaned = text

  cleaned = cleaned.replace(/<\s*spanclass\s*=\s*["']katex[^"']*["'][^>]*>/gi, '')
  cleaned = cleaned.replace(/spanclass/gi, '')
  cleaned = cleaned.replace(/mathxmlns/gi, '')
  cleaned = cleaned.replace(/annotationencoding/gi, '')

  if (preprocessOpts.removeMathML !== false) {
    cleaned = cleaned.replace(/<math[^>]*xmlns[^>]*>[\s\S]*?<\/math>/gi, '')
    cleaned = cleaned.replace(/xmlns:?[^=]*="[^"]*w3\.org\/1998\/Math\/MathML[^"]*"/gi, '')
    cleaned = cleaned.replace(/https?:\/\/www\.w3\.org\/1998\/Math\/MathML[^\s<>]*/gi, '')
    cleaned = cleaned.replace(/www\.w3\.org\/1998\/Math\/MathML[^\s<>]*/gi, '')

    const mathmlTags = [
      'math',
      'mrow',
      'mi',
      'mn',
      'mo',
      'msup',
      'msub',
      'mfrac',
      'mtext',
      'mspace',
    ]
    mathmlTags.forEach(tag => {
      cleaned = cleaned.replace(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi'), '$1')
      cleaned = cleaned.replace(new RegExp(`</?${tag}[^>]*>`, 'gi'), '')
    })
  }

  if (preprocessOpts.removeSVG !== false) {
    cleaned = cleaned.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    cleaned = cleaned.replace(/<path[^>]*\/>/gi, '')

    cleaned = cleaned.replace(/[a-zA-Z0-9\s,.-]{50,}/g, match => {
      const hasMany = (pattern: RegExp, threshold: number) =>
        (match.match(pattern) || []).length > threshold
      if (hasMany(/\d/g, 10) && hasMany(/,/g, 5) && hasMany(/[a-zA-Z]/g, 5)) {
        return ''
      }
      return match
    })
  }

  if (preprocessOpts.removeHtmlFromMath) {
    cleaned = cleaned.replace(/(\$\$?[^$]*?)<[^>]+>([^$]*?\$\$?)/g, '$1$2')
  }

  if (preprocessOpts.fixEscapedDollars) {
    cleaned = cleaned.replace(/\\\$/g, '$')
  }

  cleaned = cleaned.replace(
    /<frac>([\s\S]*?)<\/frac>\s*<div[^>]*style\s*=\s*["'][^"']*border-top[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<div[^>]*style\s*=\s*["'][^"']*margin-left[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    (_match, numerator, denominator) => {
      const num = numerator
        .replace(/<sup>(\d+)<\/sup>/g, '^{$1}')
        .replace(/<sup>([^<]+)<\/sup>/g, '^{$1}')
        .replace(/(&#x221A;|√)\(([^)]+)\)/g, '\\sqrt{$2}')
        .replace(/&#x221A;|√/g, '\\sqrt')
        .replace(/±/g, '\\pm')
        .replace(/<[^>]*>/g, '')
        .trim()

      const den = denominator.replace(/<[^>]*>/g, '').trim()

      return `\\(\\frac{${num}}{${den}}\\)`
    }
  )

  cleaned = cleaned.replace(/<frac>([\s\S]*?)<\/frac>/gi, (_match, content) => {
    const converted = content
      .replace(/<sup>(\d+)<\/sup>/g, '^{$1}')
      .replace(/<sup>([^<]+)<\/sup>/g, '^{$1}')
      .replace(/(&#x221A;|√)\(([^)]+)\)/g, '\\sqrt{$2}')
      .replace(/&#x221A;|√/g, '\\sqrt')
      .replace(/±/g, '\\pm')
      .replace(/<[^>]*>/g, '')
      .trim()

    return `(${converted})`
  })

  while (cleaned.includes('((MDPH')) {
    cleaned = cleaned.replace(/\(\(MDPH\d+\)\)/g, '')
  }
  while (cleaned.includes('{{MDPH')) {
    cleaned = cleaned.replace(/\{\{MDPH\d+\}\}/g, '')
  }
  cleaned = cleaned.replace(/\(MDPH\d+\)/g, '')
  cleaned = cleaned.replace(/\{MDPH\d+\}/g, '')
  cleaned = cleaned.replace(/([^\n])\s*---+\s*(?=\S)/g, '$1 ')
  cleaned = cleaned.replace(/(MDPH\d+)\s*---+\s*(?=\S)/g, '$1 ')

  if (preprocessOpts.customPreprocessors) {
    for (const preprocessor of preprocessOpts.customPreprocessors) {
      cleaned = preprocessor(cleaned)
    }
  }

  return cleaned
}
