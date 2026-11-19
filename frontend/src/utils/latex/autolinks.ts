const CODE_SPAN_RE = /(<code\b[^>]*>[\s\S]*?<\/code>)/gi
const PRE_BLOCK_RE = /(<pre\b[^>]*>[\s\S]*?<\/pre>)/gi
const KATEX_BLOCK_RE = /(<span class="katex(?:-display)?">[\s\S]*?<\/span>(?:\s*<\/span>)?)/gi
const ANCHOR_BLOCK_RE = /(<a\b[^>]*>[\s\S]*?<\/a>)/gi

const URI_AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^>\s]+)>/gi
const EMAIL_AUTOLINK_RE = /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g

/** markdown-it / linkify-it http(s) recognition on plain text */
const BARE_HTTPS_RE = /https?:\/\/[^\s<>\]"']+/gi

/**
 * GFM autolink extension www. form (linkify-it does not enable this by default;
 * markdown-it linkify: true likewise skips bare www).
 */
const WWW_BARE_RE =
  /(?:^|[^\w/])(www\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<]*)?)/gi

/** Renderer list/math/code placeholders must not be swallowed by bare URL regex. */
const INTERNAL_PLACEHOLDER_RE =
  /__(?:(?:OL|UL|TASK|INLINE_MATH|DISPLAY_MATH|CODE_BLOCK)(?:_\d+)?__|MDPH\d+)/i

function trimInternalPlaceholderSuffix(raw: string): string {
  const hit = raw.match(INTERNAL_PLACEHOLDER_RE)
  if (hit == null || hit.index === undefined) return raw
  return raw.slice(0, hit.index)
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderAutolinkAnchor(url: string, label?: string): string {
  const href = escapeHtmlAttr(url)
  const text = escapeHtmlText(label ?? url)
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
}

/** Strip trailing punctuation the way GFM / linkify-it does. */
export function stripTrailingGfmUrlPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ''
  let changed = true
  while (changed) {
    changed = false
    if (url.endsWith(')')) {
      const open = (url.match(/\(/g) || []).length
      const close = (url.match(/\)/g) || []).length
      if (close > open) {
        trailing = `)${trailing}`
        url = url.slice(0, -1)
        changed = true
        continue
      }
    }
    if (/[.,;:!?]$/.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
      changed = true
    }
  }
  return { url, trailing }
}

function replaceAngleBracketAutolinks(segment: string): string {
  let out = segment.replace(URI_AUTOLINK_RE, (_match, url: string) => renderAutolinkAnchor(url))
  out = out.replace(EMAIL_AUTOLINK_RE, (_match, email: string) =>
    renderAutolinkAnchor(`mailto:${email}`, email)
  )
  return out
}

function replaceHttpsBareUrlsInPlainText(text: string): string {
  BARE_HTTPS_RE.lastIndex = 0
  const matches = [...text.matchAll(BARE_HTTPS_RE)]
  if (matches.length === 0) return text
  let out = ''
  let last = 0
  for (const match of matches) {
    const index = match.index ?? 0
    out += text.slice(last, index)
    const { url, trailing } = stripTrailingGfmUrlPunctuation(
      trimInternalPlaceholderSuffix(match[0])
    )
    if (url) {
      out += renderAutolinkAnchor(url, url)
    } else {
      out += match[0]
    }
    out += trailing
    last = index + match[0].length
  }
  return out + text.slice(last)
}

function replaceWwwBareUrlsInPlainText(text: string): string {
  WWW_BARE_RE.lastIndex = 0
  const matches = [...text.matchAll(WWW_BARE_RE)]
  if (matches.length === 0) return text
  let out = ''
  let last = 0
  for (const match of matches) {
    const full = match[0]
    const index = match.index ?? 0
    const lead = full.match(/^[^\w/]/) ? full[0] : ''
    const rawHost = lead ? full.slice(lead.length) : full
    out += text.slice(last, index)
    if (lead) out += lead
    const { url, trailing } = stripTrailingGfmUrlPunctuation(rawHost)
    if (url) {
      out += renderAutolinkAnchor(`http://${url}`, url)
    } else {
      out += rawHost
    }
    out += trailing
    last = index + full.length
  }
  return out + text.slice(last)
}

function linkifyPlainText(text: string): string {
  return replaceWwwBareUrlsInPlainText(replaceHttpsBareUrlsInPlainText(text))
}

/** Linkify bare URLs only in HTML text nodes (between tags). */
function linkifyTextNodesOnly(segment: string): string {
  return segment.replace(/(^|>)([^<]+)(?=<|$)/g, (_match, prefix: string, text: string) => {
    return `${prefix}${linkifyPlainText(text)}`
  })
}

function replaceOutsidePattern(
  html: string,
  pattern: RegExp,
  replacer: (segment: string) => string
): string {
  const splitPattern = new RegExp(pattern.source, pattern.flags)
  const parts = html.split(splitPattern)
  return parts.map((part, index) => (index % 2 === 1 ? part : replacer(part))).join('')
}

function protectAndTransform(segment: string, transform: (plain: string) => string): string {
  return replaceOutsidePattern(segment, ANCHOR_BLOCK_RE, anchorPart =>
    replaceOutsidePattern(anchorPart, CODE_SPAN_RE, codePart =>
      replaceOutsidePattern(codePart, KATEX_BLOCK_RE, transform)
    )
  )
}

function linkifyBareUrlsInSegment(segment: string): string {
  return protectAndTransform(segment, linkifyTextNodesOnly)
}

function replaceAutolinksInSegment(segment: string): string {
  return linkifyBareUrlsInSegment(replaceAngleBracketAutolinks(segment))
}

function replaceAngleBracketsInSegment(segment: string): string {
  return protectAndTransform(segment, replaceAngleBracketAutolinks)
}

/** CommonMark angle-bracket autolinks only (safe before list placeholders). */
export function replaceAngleBracketAutolinksOutsideCode(html: string): string {
  return replaceOutsidePattern(html, PRE_BLOCK_RE, replaceAngleBracketsInSegment)
}

/** CommonMark angle-bracket autolinks + GFM bare http(s) and www outside protected HTML. */
export function replaceAutolinksOutsideCode(html: string): string {
  return replaceOutsidePattern(html, PRE_BLOCK_RE, replaceAutolinksInSegment)
}

/** GFM bare http(s) and www only (run after list placeholders are converted to HTML). */
export function replaceBareUrlsOutsideCode(html: string): string {
  return replaceOutsidePattern(html, PRE_BLOCK_RE, linkifyBareUrlsInSegment)
}

/** Post-process markdown-it HTML: link bare www when linkify: true already handled https. */
export function linkifyWwwInHtml(html: string): string {
  return replaceOutsidePattern(html, PRE_BLOCK_RE, htmlSegment =>
    replaceOutsidePattern(htmlSegment, ANCHOR_BLOCK_RE, anchorPart =>
      replaceOutsidePattern(anchorPart, CODE_SPAN_RE, codePart =>
        replaceOutsidePattern(codePart, KATEX_BLOCK_RE, linkifyTextNodesOnly)
      )
    )
  )
}
