/** @deprecated Use inline func in executeScript calls. Kept for test imports. */
export function inlineExtractPageContent() {
  const selection = window.getSelection()?.toString() ?? ''
  const url = location.href
  const title = document.title
  const body = document.body?.cloneNode(true) as HTMLElement | null
  if (body) {
    body.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove())
    return {
      url,
      title,
      text: body.innerText?.trim() ?? '',
      selection,
    }
  }
  return { url, title, text: '', selection }
}
