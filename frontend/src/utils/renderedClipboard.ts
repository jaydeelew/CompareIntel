/**
 * Serialize a DOM selection inside rendered model output for clipboard paste.
 */

export interface ClipboardPayload {
  plain: string
  html: string
}

function decodeCodeBase64(encoded: string | null): string | null {
  if (!encoded) return null
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function getKatexTex(katexEl: Element): string | null {
  const ann = katexEl.querySelector('annotation[encoding="application/x-tex"]')
  const tex = ann?.textContent?.trim()
  return tex || null
}

function isDisplayKatex(katexEl: Element): boolean {
  if (katexEl.closest('.katex-display')) return true
  const mathEl = katexEl.querySelector('math[display="block"]')
  return Boolean(mathEl)
}

function formatTexAsMarkdown(tex: string, display: boolean): string {
  if (display) {
    return `\n$$\n${tex}\n$$\n`
  }
  return `\\(${tex}\\)`
}

function replaceKatexNodes(root: ParentNode): void {
  const nodes = Array.from(root.querySelectorAll('.katex'))
  for (const katexEl of nodes) {
    const tex = getKatexTex(katexEl)
    if (!tex) continue
    const text = formatTexAsMarkdown(tex, isDisplayKatex(katexEl))
    katexEl.replaceWith(document.createTextNode(text))
  }
}

function stripCopyChrome(root: ParentNode): void {
  root.querySelectorAll('.code-block-header, .code-copy-btn').forEach(el => {
    el.remove()
  })
  root.querySelectorAll('.katex-mathml').forEach(el => {
    el.remove()
  })
}

function extractCodeFromBlock(block: Element): string | null {
  const fromB64 = decodeCodeBase64(block.getAttribute('data-code-base64'))
  if (fromB64 != null) return fromB64
  const code = block.querySelector('code')
  return code?.textContent ?? null
}

function normalizeCodeBlocks(root: ParentNode): void {
  const blocks = root.querySelectorAll('.code-block-direct, .preformatted-text, .code-block')
  for (const block of blocks) {
    const source = extractCodeFromBlock(block)
    if (source == null) continue
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = source
    pre.appendChild(code)
    block.replaceWith(pre)
  }
}

function tableToTsv(table: HTMLTableElement): string {
  const rows: string[] = []
  const rowEls = table.querySelectorAll('tr')
  for (const tr of rowEls) {
    const cells = Array.from(tr.querySelectorAll('th, td')).map(cell =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
    )
    rows.push(cells.join('\t'))
  }
  return rows.join('\n')
}

function cloneRangeContents(range: Range): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.appendChild(range.cloneContents())
  return wrapper
}

function resolveTableForTsv(wrapper: HTMLDivElement): HTMLTableElement | null {
  const direct = wrapper.firstElementChild
  if (direct?.tagName === 'TABLE') return direct as HTMLTableElement
  if (direct?.tagName === 'TBODY') {
    const table = document.createElement('table')
    table.appendChild(direct.cloneNode(true))
    return table
  }
  const nested = wrapper.querySelector('table')
  return nested
}

function hydrateKatexAnnotations(
  wrapper: HTMLDivElement,
  range: Range,
  container: HTMLElement
): void {
  if (typeof range.intersectsNode !== 'function') return
  const liveNodes = Array.from(container.querySelectorAll('.katex')).filter(k =>
    range.intersectsNode(k)
  )
  const cloneNodes = Array.from(wrapper.querySelectorAll('.katex'))
  if (cloneNodes.length === 0 && liveNodes.length === 1) {
    const tex = getKatexTex(liveNodes[0])
    if (tex) {
      wrapper.replaceChildren(
        document.createTextNode(formatTexAsMarkdown(tex, isDisplayKatex(liveNodes[0])))
      )
    }
    return
  }
  const count = Math.min(liveNodes.length, cloneNodes.length)
  for (let i = 0; i < count; i++) {
    const tex = getKatexTex(liveNodes[i])
    if (!tex || getKatexTex(cloneNodes[i])) continue
    const mathml =
      cloneNodes[i].querySelector('.katex-mathml') ??
      (() => {
        const span = document.createElement('span')
        span.className = 'katex-mathml'
        cloneNodes[i].prepend(span)
        return span
      })()
    const ann = document.createElement('annotation')
    ann.setAttribute('encoding', 'application/x-tex')
    ann.textContent = tex
    mathml.appendChild(ann)
  }
}

function cleanupClipboardRoot(wrapper: HTMLDivElement): void {
  replaceKatexNodes(wrapper)
  stripCopyChrome(wrapper)
  normalizeCodeBlocks(wrapper)
  wrapper.querySelectorAll('.markdown-table-scroll').forEach(scroll => {
    const table = scroll.querySelector('table')
    if (table) scroll.replaceWith(table.cloneNode(true))
  })
}

function isFullContainerSelection(range: Range, container: HTMLElement): boolean {
  const full = document.createRange()
  full.selectNodeContents(container)
  try {
    return (
      range.compareBoundaryPoints(Range.START_TO_START, full) === 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, full) === 0
    )
  } catch {
    return false
  }
}

function buildHtmlFragment(wrapper: HTMLDivElement): string {
  let fragment = wrapper.innerHTML.trim()
  if (!fragment) return ''
  if (wrapper.firstElementChild?.tagName === 'TBODY') {
    fragment = `<table>${fragment}</table>`
  }
  return `<meta charset="utf-8">${fragment}`
}

function getEnclosedCodeBlockSource(range: Range, container: HTMLElement): string | null {
  if (typeof range.intersectsNode !== 'function') return null
  const blocks = Array.from(
    container.querySelectorAll('.code-block-direct, .preformatted-text, .code-block')
  )
  const hits = blocks.filter(block => range.intersectsNode(block))
  if (hits.length !== 1) return null
  const block = hits[0]
  const blockRange = document.createRange()
  blockRange.selectNodeContents(block)
  const inside =
    range.compareBoundaryPoints(Range.START_TO_START, blockRange) >= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, blockRange) <= 0
  if (!inside) return null
  return extractCodeFromBlock(block)
}

function elementPlainText(el: HTMLElement): string {
  const raw =
    ('innerText' in el && typeof el.innerText === 'string' ? el.innerText : el.textContent) ?? ''
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Build plain + HTML clipboard payloads for a selection inside rendered markdown output.
 */
export function serializeSelectionForClipboard(
  range: Range,
  container: HTMLElement,
  markdownSource?: string
): ClipboardPayload | null {
  if (range.collapsed) return null
  if (!container.contains(range.commonAncestorContainer)) return null

  if (markdownSource && isFullContainerSelection(range, container)) {
    const htmlWrapper = cloneRangeContents(range)
    cleanupClipboardRoot(htmlWrapper)
    return {
      plain: markdownSource,
      html: buildHtmlFragment(htmlWrapper),
    }
  }

  const enclosedCode = getEnclosedCodeBlockSource(range, container)

  const wrapper = cloneRangeContents(range)
  hydrateKatexAnnotations(wrapper, range, container)
  cleanupClipboardRoot(wrapper)

  if (enclosedCode != null) {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = enclosedCode
    pre.appendChild(code)
    const codeWrap = document.createElement('div')
    codeWrap.appendChild(pre)
    return {
      plain: enclosedCode,
      html: buildHtmlFragment(codeWrap),
    }
  }

  const tableForTsv = resolveTableForTsv(wrapper)
  const tableOnly =
    tableForTsv &&
    !wrapper.querySelector('.katex, pre code, .code-block-direct, .preformatted-text, p, li')
  const plain = tableOnly ? tableToTsv(tableForTsv) : elementPlainText(wrapper)

  const html = buildHtmlFragment(wrapper)
  return { plain, html }
}

/**
 * Apply clipboard payloads on a copy event (call after preventDefault).
 */
export function applyClipboardPayload(event: ClipboardEvent, payload: ClipboardPayload): void {
  const dt = event.clipboardData
  if (!dt) return
  dt.setData('text/plain', payload.plain)
  if (payload.html) {
    dt.setData('text/html', payload.html)
  }
}
