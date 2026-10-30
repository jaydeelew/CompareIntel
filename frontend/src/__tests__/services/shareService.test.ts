/**
 * Tests for shareService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as shareService from '../../services/shareService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

const snapshot = {
  slug: 'abc123xyz9',
  prompt: 'Explain gravity',
  models: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
  responses: [
    { model_id: 'openai/gpt-4o', model_name: 'GPT-4o', content: 'It pulls things down.' },
  ],
  created_at: '2026-10-30T00:00:00Z',
}

describe('shareService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it('creates a share snapshot and returns a public URL', async () => {
    server.use(
      http.post(apiPathGlob('/api/shares'), async ({ request }) => {
        const body = (await request.json()) as { prompt: string }
        expect(body.prompt).toBe('Explain gravity')
        return HttpResponse.json(
          {
            slug: snapshot.slug,
            url: `https://compareintel.com/c/${snapshot.slug}`,
            revoke_token: 'tok',
          },
          { status: 201 }
        )
      })
    )

    const result = await shareService.createSharedComparison({
      prompt: 'Explain gravity',
      models: snapshot.models,
      responses: snapshot.responses,
    })

    expect(result.slug).toBe(snapshot.slug)
    expect(result.url).toContain(`/c/${snapshot.slug}`)
  })

  it('fetches a public snapshot without requiring auth', async () => {
    server.use(
      http.get(apiPathGlob(`/api/shares/${snapshot.slug}`), () => HttpResponse.json(snapshot))
    )

    const result = await shareService.getSharedComparison(snapshot.slug)
    expect(result.prompt).toBe('Explain gravity')
    expect(result.responses).toHaveLength(1)
  })

  it('surfaces a 404 when the snapshot is missing or unshared', () => {
    server.use(
      http.get(apiPathGlob(`/api/shares/${snapshot.slug}`), () =>
        HttpResponse.json({ detail: 'Shared comparison not found' }, { status: 404 })
      )
    )

    return expect(shareService.getSharedComparison(snapshot.slug)).rejects.toThrow(ApiError)
  })
})
