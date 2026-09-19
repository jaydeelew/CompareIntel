import { describe, expect, it } from 'vitest'

import { MAX_RECENT_CHATS, mergeRecentHistory, trimRecentChats } from '../recentChatLimits'

describe('trimRecentChats', () => {
  it('keeps the newest chats up to the maximum', () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      id: `chat-${index}`,
      updatedAt: index,
    }))

    expect(trimRecentChats(items).map((item) => item.id)).toEqual([
      'chat-13',
      'chat-12',
      'chat-11',
      'chat-10',
      'chat-9',
      'chat-8',
      'chat-7',
      'chat-6',
      'chat-5',
      'chat-4',
    ])
  })

  it('never auto-deletes saved chats and fills remaining slots with newest unsaved', () => {
    const items = [
      { id: 'old-saved', updatedAt: 1, saved: true },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `unsaved-${index}`,
        updatedAt: 10 + index,
      })),
    ]

    const trimmed = trimRecentChats(items)
    expect(trimmed).toHaveLength(MAX_RECENT_CHATS)
    expect(trimmed.some((item) => item.id === 'old-saved')).toBe(true)
    expect(trimmed.filter((item) => item.id.startsWith('unsaved-'))).toHaveLength(9)
  })

  it('still keeps the newest unsaved chat when every slot is already saved', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `saved-${index}`,
        updatedAt: index,
        saved: true as const,
      })),
      { id: 'current', updatedAt: 100 },
      { id: 'stale', updatedAt: 50 },
    ]

    const trimmed = trimRecentChats(items)
    expect(trimmed).toHaveLength(11)
    expect(trimmed.some((item) => item.id === 'current')).toBe(true)
    expect(trimmed.some((item) => item.id === 'stale')).toBe(false)
  })
})

describe('mergeRecentHistory', () => {
  it('dedupes the same comparison stored locally and on the server', () => {
    const items = mergeRecentHistory({
      localChats: [
        {
          id: 'local-1',
          title: 'Local copy',
          updatedAt: 2_000,
          conversationId: 42,
        },
      ],
      serverHistory: [
        {
          id: 42,
          input_data: 'Server copy',
          created_at: '2026-01-01T00:00:00.000Z',
          client_source: 'extension',
        },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'local', chat: { id: 'local-1' } })
  })

  it('does not count duplicated local+server rows toward the recent-chat cap', () => {
    const localChats = Array.from({ length: 7 }, (_, index) => ({
      id: `local-${index}`,
      title: `Prompt ${index}`,
      updatedAt: 1_000 + index,
      conversationId: index + 1,
    }))
    const serverHistory = localChats.map((chat, index) => ({
      id: chat.conversationId as number,
      input_data: chat.title,
      created_at: new Date(500 + index).toISOString(),
      client_source: 'extension' as const,
    }))

    const items = mergeRecentHistory({ localChats, serverHistory })
    expect(items).toHaveLength(7)
  })

  it('caps a combined unique local+server list at ten, keeping the newest', () => {
    const localChats = Array.from({ length: 7 }, (_, index) => ({
      id: `local-${index}`,
      title: `Local ${index}`,
      updatedAt: 2_000 + index,
    }))
    const serverHistory = Array.from({ length: 7 }, (_, index) => ({
      id: index + 100,
      input_data: `Server ${index}`,
      created_at: new Date(1_000 + index).toISOString(),
      client_source: 'web' as const,
    }))

    const items = mergeRecentHistory({ localChats, serverHistory })
    expect(items).toHaveLength(MAX_RECENT_CHATS)
    expect(items.filter((item) => item.kind === 'local')).toHaveLength(7)
    expect(
      items
        .filter((item) => item.kind === 'server')
        .map((item) => (item.kind === 'server' ? item.summary.id : null))
    ).toEqual([106, 105, 104])
  })

  it('keeps an older saved server conversation even when it is outside the newest ten', () => {
    const serverHistory = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      input_data: `Prompt ${index + 1}`,
      created_at: new Date(index * 1_000).toISOString(),
      client_source: 'web' as const,
    }))

    const items = mergeRecentHistory({
      localChats: [],
      serverHistory,
      savedServerIds: [1],
    })

    expect(items).toHaveLength(MAX_RECENT_CHATS)
    expect(items.some((item) => item.kind === 'server' && item.summary.id === 1)).toBe(true)
    expect(items.find((item) => item.kind === 'server' && item.summary.id === 1)?.saved).toBe(true)
  })
})
