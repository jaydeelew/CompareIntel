/**
 * Ensures MSW is wired; global setup in setup.ts starts the server.
 */
import { HttpResponse, http } from 'msw'
import { describe, it, expect } from 'vitest'

import { server } from './server'

describe('MSW infrastructure', () => {
  it('intercepts requests matching */api/msw-smoke', async () => {
    server.use(http.get('*/api/msw-smoke', () => HttpResponse.json({ ok: true, source: 'msw' })))
    const res = await fetch('http://localhost/api/msw-smoke')
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { ok: boolean; source: string }
    expect(body).toEqual({ ok: true, source: 'msw' })
  })
})
