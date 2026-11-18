/// <reference types="@testing-library/jest-dom" />

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LinkPreviewCards } from '../LinkPreviewCards'

vi.mock('../../../services/linkPreviewService', () => ({
  fetchLinkPreview: vi.fn(async (url: string) => ({
    title: 'Mock Product',
    site_name: 'example.com',
    image: 'https://cdn.example/img.jpg',
    description: null,
    price: '9.99',
    currency: 'USD',
    fetched_at: '2026-01-01T00:00:00Z',
    url,
  })),
  linkPreviewImageSrc: (u: string) => `/api/link-preview/image?url=${encodeURIComponent(u)}`,
}))

describe('LinkPreviewCards', () => {
  it('renders cards after fetch when enabled and stream complete', async () => {
    render(
      <LinkPreviewCards
        enabled
        defer={false}
        answerText="Buy it here: https://shop.example/product/42"
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('link-preview-row')).toBeInTheDocument()
    })
    expect(screen.getByText('Mock Product')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /mock product/i })).toHaveAttribute(
      'href',
      'https://shop.example/product/42'
    )
  })

  it('renders nothing while deferred', () => {
    const { container } = render(
      <LinkPreviewCards enabled defer answerText="https://shop.example/x" />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
