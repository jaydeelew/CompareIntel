import type { ExtractedPageContent } from '../shared/extractPageContent'

type PageContentResponse = { type: 'PAGE_CONTENT'; content: ExtractedPageContent }

function originPattern(url: string): string | null {
  try {
    const { origin } = new URL(url)
    return `${origin}/*`
  } catch {
    return null
  }
}

async function requestOriginAccess(url: string): Promise<boolean> {
  const pattern = originPattern(url)
  if (!pattern) return false
  if (await chrome.permissions.contains({ origins: [pattern] })) return true
  return chrome.permissions.request({ origins: [pattern] })
}

async function extractViaScripting(tabId: number): Promise<ExtractedPageContent | null> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
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
      },
    })
    return (result as ExtractedPageContent) ?? null
  } catch {
    return null
  }
}

/** Extract page text from a tab via the side panel (submit click context). */
export async function extractTabContentFromSidePanel(
  tabId: number,
  tabUrl?: string
): Promise<ExtractedPageContent | null> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT_PAGE_CONTENT',
    })) as PageContentResponse | undefined
    if (response?.type === 'PAGE_CONTENT' && response.content) {
      return response.content
    }
  } catch {
    // Content script unavailable — fall through to executeScript.
  }

  let content = await extractViaScripting(tabId)
  if (content) return content

  if (tabUrl && (await requestOriginAccess(tabUrl))) {
    content = await extractViaScripting(tabId)
  }

  return content
}
