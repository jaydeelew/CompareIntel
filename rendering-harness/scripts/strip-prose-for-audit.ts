/**
 * Strip delimited math and code before scanning for undelimited LaTeX commands.
 */
export function stripDelimitedMathAndCode(markdown: string): string {
  let s = markdown
  s = s.replace(/```[\s\S]*?```/g, '')
  s = s.replace(/`[^`\n]+`/g, '')
  s = s.replace(/\$\$[\s\S]*?\$\$/g, '')
  s = s.replace(/\\\[[\s\S]*?\\\]/g, '')
  s = s.replace(/\\\([\s\S]*?\\\)/g, '')
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/\$(?!\$)([\s\S]*?)\$(?!\$)/g, '')
  }
  return s
}

const UNDELIMITED_CMD =
  /(?<![A-Za-z$])\\(?:sqrt|frac|dfrac|tfrac|cdot|times|pi|theta|alpha|beta|gamma|le|ge|leq|geq|approx)\b/g

export function proseHasUndelimitedLatex(markdown: string): boolean {
  return UNDELIMITED_CMD.test(stripDelimitedMathAndCode(markdown))
}

export function findUndelimitedMatches(markdown: string): string[] {
  const prose = stripDelimitedMathAndCode(markdown)
  return [...prose.matchAll(UNDELIMITED_CMD)].map(m => m[0])
}