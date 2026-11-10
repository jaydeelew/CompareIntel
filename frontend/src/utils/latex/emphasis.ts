/**
 * CommonMark flanking for `**` and `*`. A run preceded by whitespace is not a
 * closer, so ` **$x^2$**` opens at the second run and the first `**` stays literal.
 */
const CM_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

/**
 * Pair `**` runs of length exactly 2 the way CommonMark does.
 * A run preceded by whitespace is not a closer, so ` **$x$**` opens at the
 * second run. Longer runs (`***`) are left for the fallback regex.
 */
export function replaceExactlyTwoStrong(text: string): string {
  const runs: Array<{ start: number; left: boolean; right: boolean }> = []
  let i = 0
  while (i < text.length) {
    if (text[i] !== '*') {
      i += 1
      continue
    }
    const start = i
    while (i < text.length && text[i] === '*') i += 1
    if (i - start !== 2) continue
    const before = start > 0 ? text[start - 1] : ' '
    const after = i < text.length ? text[i] : ' '
    const beforeSpace = /\s/.test(before)
    const afterSpace = /\s/.test(after)
    const beforePunct = CM_PUNCT.test(before)
    const afterPunct = CM_PUNCT.test(after)
    const left = !afterSpace && (!afterPunct || beforeSpace || beforePunct)
    const right = !beforeSpace && (!beforePunct || afterSpace || afterPunct)
    if (left || right) runs.push({ start, left, right })
  }
  if (!runs.length) return text
  const stack: number[] = []
  const closeAt = new Map<number, number>()
  const usedAsCloser = new Set<number>()
  for (let r = 0; r < runs.length; r++) {
    if (runs[r].right) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (runs[stack[s]].left) {
          closeAt.set(stack[s], r)
          usedAsCloser.add(r)
          stack.splice(s, 1)
          break
        }
      }
    }
    if (runs[r].left && !usedAsCloser.has(r)) stack.push(r)
  }
  if (!closeAt.size) return text
  let out = ''
  let cursor = 0
  const openByStart = new Map(runs.map((run, index) => [run.start, index]))
  while (cursor < text.length) {
    const index = openByStart.get(cursor)
    const closer = index === undefined ? undefined : closeAt.get(index)
    if (index !== undefined && closer !== undefined) {
      const inner = text.slice(runs[index].start + 2, runs[closer].start)
      out += `<strong>${replaceExactlyTwoStrong(inner)}</strong>`
      cursor = runs[closer].start + 2
      continue
    }
    out += text[cursor]
    cursor += 1
  }
  return out
}

function skipMarkup(text: string, i: number): number {
  if (text.startsWith('<span class="katex', i)) {
    const re = /<(\/?)span\b[^>]*>/g
    re.lastIndex = i
    let depth = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      depth += match[1] === '/' ? -1 : 1
      if (depth === 0) return match.index + match[0].length
    }
    return text.length
  }
  if (text[i] === '<') {
    const end = text.indexOf('>', i)
    return end === -1 ? text.length : end + 1
  }
  return i
}

/** Pair single `*` the way CommonMark does, so `*not*` can sit inside a longer italic. */
export function replaceSingleStarEm(text: string): string {
  const runs: Array<{ start: number; left: boolean; right: boolean }> = []
  let i = 0
  while (i < text.length) {
    const skipped = skipMarkup(text, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    if (text[i] !== '*') {
      i += 1
      continue
    }
    const start = i
    while (i < text.length && text[i] === '*') i += 1
    if (i - start !== 1) continue
    const before = start > 0 ? text[start - 1] : ' '
    const after = i < text.length ? text[i] : ' '
    const beforeSpace = /\s/.test(before)
    const afterSpace = /\s/.test(after)
    const beforePunct = CM_PUNCT.test(before)
    const afterPunct = CM_PUNCT.test(after)
    const left = !afterSpace && (!afterPunct || beforeSpace || beforePunct)
    const right = !beforeSpace && (!beforePunct || afterSpace || afterPunct)
    if (left || right) runs.push({ start, left, right })
  }
  if (!runs.length) return text
  const stack: number[] = []
  const closeAt = new Map<number, number>()
  const usedAsCloser = new Set<number>()
  for (let r = 0; r < runs.length; r++) {
    if (runs[r].right) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (runs[stack[s]].left) {
          closeAt.set(stack[s], r)
          usedAsCloser.add(r)
          stack.splice(s, 1)
          break
        }
      }
    }
    if (runs[r].left && !usedAsCloser.has(r)) stack.push(r)
  }
  if (!closeAt.size) return text
  let out = ''
  let cursor = 0
  const openByStart = new Map(runs.map((run, index) => [run.start, index]))
  while (cursor < text.length) {
    const index = openByStart.get(cursor)
    const closer = index === undefined ? undefined : closeAt.get(index)
    if (index !== undefined && closer !== undefined) {
      const inner = text.slice(runs[index].start + 1, runs[closer].start)
      out += `<em>${replaceSingleStarEm(inner)}</em>`
      cursor = runs[closer].start + 1
      continue
    }
    out += text[cursor]
    cursor += 1
  }
  return out
}
