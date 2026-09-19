import { describe, expect, it } from 'vitest'

import { trimHistoryEntries } from '../historyRetention'

describe('trimHistoryEntries', () => {
  it('keeps the newest unsaved entries up to the cap', () => {
    const items = [
      { id: 'a', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', created_at: '2026-01-02T00:00:00.000Z' },
      { id: 'c', created_at: '2026-01-03T00:00:00.000Z' },
    ]
    expect(trimHistoryEntries(items, 2).map(item => item.id)).toEqual(['c', 'b'])
  })

  it('does not drop saved entries when trimming', () => {
    const items = [
      { id: 'old', created_at: '2026-01-01T00:00:00.000Z', saved: true },
      { id: 'mid', created_at: '2026-01-02T00:00:00.000Z' },
      { id: 'new', created_at: '2026-01-03T00:00:00.000Z' },
    ]
    const trimmed = trimHistoryEntries(items, 2)
    expect(trimmed.map(item => item.id)).toEqual(['new', 'old'])
  })

  it('still keeps the newest unsaved entry when every slot is already saved', () => {
    const items = [
      { id: 'saved-1', created_at: '2026-01-01T00:00:00.000Z', saved: true },
      { id: 'saved-2', created_at: '2026-01-02T00:00:00.000Z', saved: true },
      { id: 'stale', created_at: '2026-01-03T00:00:00.000Z' },
      { id: 'current', created_at: '2026-01-04T00:00:00.000Z' },
    ]
    expect(trimHistoryEntries(items, 2).map(item => item.id)).toEqual([
      'current',
      'saved-2',
      'saved-1',
    ])
  })
})
