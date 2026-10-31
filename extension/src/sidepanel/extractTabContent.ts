import type { ExtractedPageContent } from '../shared/extractPageContent'
import { executeExtractPageContentIfAllowed } from '../shared/pageInjection'

/** Extract page text and the current selection from a tab (submit / panel-open user gesture). */
export async function extractTabContentFromSidePanel(
  tabId: number,
  tabUrl?: string,
): Promise<ExtractedPageContent | null> {
  return executeExtractPageContentIfAllowed(tabId, tabUrl)
}
