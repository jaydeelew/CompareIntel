import { extractPageContent, type ExtractedPageContent } from './extractPageContent'
import { canExtractTab } from './urlPolicy'

/**
 * Read the current selection and visible page text via chrome.scripting.
 * Relies on activeTab (user invoked the extension) or host access to the tab.
 */
export async function executeExtractPageContent(
  tabId: number,
): Promise<ExtractedPageContent | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
    })
    return (results[0]?.result as ExtractedPageContent | undefined) ?? null
  } catch {
    return null
  }
}

export async function executeExtractPageContentIfAllowed(
  tabId: number,
  tabUrl?: string,
): Promise<ExtractedPageContent | null> {
  if (tabUrl && !canExtractTab(tabUrl)) return null
  return executeExtractPageContent(tabId)
}
