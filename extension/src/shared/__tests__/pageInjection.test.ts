import { afterEach, describe, expect, it, vi } from 'vitest'

import { executeExtractPageContent, executeExtractPageContentIfAllowed } from '../pageInjection'

describe('pageInjection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads the current selection and page text through executeScript', async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: {
          url: 'https://example.com/a',
          title: 'A',
          text: 'visible text',
          selection: 'highlighted',
        },
      },
    ])
    vi.stubGlobal('chrome', { scripting: { executeScript } })

    await expect(executeExtractPageContent(9)).resolves.toEqual({
      url: 'https://example.com/a',
      title: 'A',
      text: 'visible text',
      selection: 'highlighted',
    })
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 9 },
      func: expect.any(Function),
    })
  })

  it('returns null when scripting is blocked', async () => {
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: vi.fn().mockRejectedValue(new Error('Cannot access contents of the page')),
      },
    })

    await expect(executeExtractPageContent(1)).resolves.toBeNull()
  })

  it('does not inject into restricted pages', async () => {
    const executeScript = vi.fn()
    vi.stubGlobal('chrome', { scripting: { executeScript } })

    await expect(
      executeExtractPageContentIfAllowed(4, 'chrome://extensions'),
    ).resolves.toBeNull()
    await expect(
      executeExtractPageContentIfAllowed(4, 'https://chromewebstore.google.com/detail/x'),
    ).resolves.toBeNull()
    expect(executeScript).not.toHaveBeenCalled()
  })
})
