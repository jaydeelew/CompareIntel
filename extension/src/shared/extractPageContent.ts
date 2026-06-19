import { Readability } from '@mozilla/readability'

export interface ExtractedPageContent {
  url: string
  title: string
  text: string
  selection: string
}

/** Runs inside the page via chrome.scripting.executeScript */
export function extractPageContent(): ExtractedPageContent {
  const selection = window.getSelection()?.toString() ?? ''
  const url = location.href
  const title = document.title

  try {
    const clone = document.cloneNode(true) as Document
    const article = new Readability(clone).parse()
    if (article?.textContent?.trim()) {
      return {
        url,
        title: article.title || title,
        text: article.textContent.trim(),
        selection,
      }
    }
  } catch {
    // fall through to innerText
  }

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
