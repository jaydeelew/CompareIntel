/**
 * Public shared comparison page: snapshot render, CTA, 404.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { apiPathGlob } from '../../../__tests__/msw/paths'
import { server } from '../../../__tests__/msw/server'
import { SharedComparison } from '../SharedComparison'

const snapshot = {
  slug: 'abc123xyz9',
  prompt: 'Explain gravity to a child',
  models: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
  responses: [
    { model_id: 'openai/gpt-4o', model_name: 'GPT-4o', content: 'Gravity pulls things down.' },
  ],
  created_at: '2026-10-30T00:00:00Z',
}

function renderPage(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/c/${slug}`]}>
      <Routes>
        <Route path="/c/:shareSlug" element={<SharedComparison />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SharedComparison', () => {
  it('renders the snapshot and a Try your own comparison CTA', async () => {
    server.use(
      http.get(apiPathGlob(`/api/shares/${snapshot.slug}`), () => HttpResponse.json(snapshot))
    )

    renderPage(snapshot.slug)

    expect(await screen.findByText('Explain gravity to a child')).toBeInTheDocument()
    expect(screen.getByText('Gravity pulls things down.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPT-4o' })).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /try your own comparison/i })
    expect(cta).toHaveAttribute('href', '/')
  })

  it('shows a 404-style message when the snapshot is missing', async () => {
    server.use(
      http.get(apiPathGlob('/api/shares/zzzzzzzzzz'), () =>
        HttpResponse.json({ detail: 'Shared comparison not found' }, { status: 404 })
      )
    )

    renderPage('zzzzzzzzzz')

    await waitFor(() => {
      expect(screen.getByText(/no longer public/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /try your own comparison/i })).toHaveAttribute(
      'href',
      '/'
    )
  })
})
