import { describe, expect, it } from 'vitest'

import {
  addPinnedContext,
  matchOpenTabsToContexts,
  MAX_PINNED_TABS,
  normalizePageUrl,
  promoteActiveContextsToPinned,
  removePageContext,
  replaceActiveContext,
} from '../pageContextSnapshot'

describe('normalizePageUrl', () => {
  it('strips hash and trailing slash', () => {
    expect(normalizePageUrl('https://example.com/docs/#intro')).toBe(
      'https://example.com/docs'
    )
  })
})

describe('replaceActiveContext', () => {
  it('shows the current tab plus existing pins', () => {
    expect(
      replaceActiveContext(
        [{ url: 'https://example.com/p', title: 'P', source: 'pinned' }],
        { url: 'https://example.com/a', title: 'A', favIconUrl: 'https://example.com/a.ico' },
        true
      )
    ).toEqual([
      {
        url: 'https://example.com/a',
        title: 'A',
        favIconUrl: 'https://example.com/a.ico',
        source: 'active',
      },
      { url: 'https://example.com/p', title: 'P', source: 'pinned' },
    ])
  })

  it('drops a former active tab when the browser tab changes', () => {
    expect(
      replaceActiveContext(
        [
          { url: 'https://example.com/a', title: 'A', source: 'active' },
          { url: 'https://example.com/p', title: 'P', source: 'pinned' },
        ],
        { url: 'https://example.com/b', title: 'B' },
        true
      )
    ).toEqual([
      { url: 'https://example.com/b', title: 'B', source: 'active' },
      { url: 'https://example.com/p', title: 'P', source: 'pinned' },
    ])
  })

  it('does not add a second chip when the active tab is already pinned', () => {
    expect(
      replaceActiveContext(
        [{ url: 'https://example.com/a', title: 'A', source: 'pinned' }],
        { url: 'https://example.com/a', title: 'A live' },
        true
      )
    ).toEqual([{ url: 'https://example.com/a', title: 'A', source: 'pinned' }])
  })

  it('keeps only pins when sharing the active tab is off', () => {
    expect(
      replaceActiveContext(
        [
          { url: 'https://example.com/a', title: 'A', source: 'active' },
          { url: 'https://example.com/p', title: 'P', source: 'pinned' },
        ],
        { url: 'https://example.com/a', title: 'A' },
        false
      )
    ).toEqual([{ url: 'https://example.com/p', title: 'P', source: 'pinned' }])
  })

  it('keeps an existing active chip while the current tab is still unknown', () => {
    expect(
      replaceActiveContext(
        [
          { url: 'https://example.com/a', title: 'A', source: 'active' },
          { url: 'https://example.com/p', title: 'P', source: 'pinned' },
        ],
        null,
        true
      )
    ).toEqual([
      { url: 'https://example.com/a', title: 'A', source: 'active' },
      { url: 'https://example.com/p', title: 'P', source: 'pinned' },
    ])
  })
})

describe('addPinnedContext', () => {
  it('appends a new pin without dropping the active tab', () => {
    expect(
      addPinnedContext(
        [{ url: 'https://example.com/a', title: 'A', source: 'active' }],
        { url: 'https://example.com/b', title: 'B' }
      )
    ).toEqual([
      { url: 'https://example.com/a', title: 'A', source: 'active' },
      { url: 'https://example.com/b', title: 'B', source: 'pinned' },
    ])
  })

  it('upgrades the active tab to a pin in place', () => {
    expect(
      addPinnedContext(
        [{ url: 'https://example.com/a', title: 'A', source: 'active' }],
        { url: 'https://example.com/a', title: 'A' }
      )
    ).toEqual([{ url: 'https://example.com/a', title: 'A', source: 'pinned' }])
  })

  it('is idempotent for an already pinned URL', () => {
    const saved = [{ url: 'https://example.com/b', title: 'B', source: 'pinned' as const }]
    expect(addPinnedContext(saved, { url: 'https://example.com/b/', title: 'B2' })).toEqual([
      { url: 'https://example.com/b/', title: 'B2', source: 'pinned' },
    ])
  })

  it('does not add past the pin limit', () => {
    const saved = Array.from({ length: MAX_PINNED_TABS }, (_, index) => ({
      url: `https://example.com/${index}`,
      title: `${index}`,
      source: 'pinned' as const,
    }))
    expect(addPinnedContext(saved, { url: 'https://example.com/new', title: 'New' })).toEqual(
      saved
    )
  })
})

describe('removePageContext', () => {
  it('removes a pin without restoring it from other entries', () => {
    expect(
      removePageContext(
        [
          { url: 'https://example.com/a', title: 'A', source: 'active' },
          { url: 'https://example.com/b', title: 'B', source: 'pinned' },
        ],
        'https://example.com/b/'
      )
    ).toEqual([{ url: 'https://example.com/a', title: 'A', source: 'active' }])
  })
})

describe('promoteActiveContextsToPinned', () => {
  it('turns restored active pages into pins and dedupes by URL', () => {
    expect(
      promoteActiveContextsToPinned([
        { url: 'https://example.com/a', title: 'A', source: 'active' },
        { url: 'https://example.com/a/', title: 'A2', source: 'pinned' },
        { url: 'https://example.com/b', title: 'B', source: 'pinned' },
      ])
    ).toEqual([
      { url: 'https://example.com/a', title: 'A', source: 'pinned' },
      { url: 'https://example.com/b', title: 'B', source: 'pinned' },
    ])
  })
})

describe('matchOpenTabsToContexts', () => {
  it('matches only pinned saved pages to open tabs by normalized URL', () => {
    expect(
      matchOpenTabsToContexts(
        [
          { url: 'https://example.com/docs#top', title: 'Docs', source: 'active' },
          { url: 'https://other.test/', title: 'Other', source: 'pinned' },
        ],
        [
          { tabId: 3, url: 'https://other.test' },
          { tabId: 7, url: 'https://example.com/docs/' },
        ]
      )
    ).toEqual([3])
  })
})
