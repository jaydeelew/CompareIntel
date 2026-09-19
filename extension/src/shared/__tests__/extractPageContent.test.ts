/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractPageContent, MAX_PAGE_TEXT_CHARS } from '../extractPageContent'

function setPage(html: string, href = 'https://example.com/article') {
  document.title = 'Example page'
  document.body.innerHTML = html
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  })
  vi.spyOn(window, 'getSelection').mockReturnValue({
    toString: () => '',
  } as unknown as Selection)
}

describe('extractPageContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('does not clone the live document', () => {
    setPage('<article><p>Visible article text</p></article>')
    const cloneSpy = vi.spyOn(Node.prototype, 'cloneNode')

    const result = extractPageContent()

    expect(result.text).toContain('Visible article text')
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('skips scripts, styles, and media while keeping article text', () => {
    setPage(`
      <article>
        <h1>Title</h1>
        <script>window.__shouldNotExtract = true</script>
        <style>.secret { color: red }</style>
        <img alt="huge" src="https://example.com/photo.jpg" />
        <p>Keep this paragraph</p>
      </article>
    `)

    const result = extractPageContent()

    expect(result.text).toContain('Title')
    expect(result.text).toContain('Keep this paragraph')
    expect(result.text).not.toContain('__shouldNotExtract')
    expect(result.text).not.toContain('color: red')
  })

  it('caps extracted text so a huge page cannot allocate unbounded strings', () => {
    document.title = 'Huge'
    document.body.innerHTML = `<main><p>${'word '.repeat(12_000)}</p></main>`
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'x'.repeat(10_000),
    } as unknown as Selection)

    const result = extractPageContent()

    expect(result.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARS)
    expect(result.selection.length).toBeLessThanOrEqual(2_000)
  })

  it('falls back to body text when article content is tiny', () => {
    setPage(`
      <article></article>
      <div>Body copy that should be used instead</div>
    `)

    const result = extractPageContent()

    expect(result.text).toContain('Body copy that should be used instead')
  })

  it('is self-contained for chrome.scripting.executeScript serialization', () => {
    const source = extractPageContent.toString()
    expect(source).not.toMatch(/\bimport\b/)
    expect(source).not.toMatch(/cloneNode/)
    expect(source).not.toMatch(/Readability/)
  })
})
