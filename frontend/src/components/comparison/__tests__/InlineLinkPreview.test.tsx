/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InlineLinkPreview } from '../InlineLinkPreview'

vi.mock('../../../services/linkPreviewService', () => ({
  fetchLinkPreview: vi.fn(async (url: string) => ({
    title: 'Mock Product',
    site_name: 'example.com',
    image: url.includes('no-image') ? null : 'https://cdn.example/img.jpg',
    description: null,
    price: '9.99',
    currency: 'USD',
    fetched_at: '2026-01-01T00:00:00Z',
    url,
    error: url.includes('no-image') ? 'preview_unavailable' : undefined,
  })),
  linkPreviewImageSrc: (u: string) => `/api/link-preview/image?url=${encodeURIComponent(u)}`,
}))

describe('InlineLinkPreview', () => {
  it('shows card only after the image loads', async () => {
    render(<InlineLinkPreview url="https://shop.example/product/42" />)

    await waitFor(() => {
      expect(document.querySelector('.link-preview-preload')).toBeInTheDocument()
    })

    const preload = document.querySelector('.link-preview-preload') as HTMLImageElement
    fireEvent.load(preload)

    await waitFor(() => {
      expect(screen.getByTestId('link-preview-card-inline')).toBeInTheDocument()
    })
    expect(screen.getByText('Mock Product')).toBeInTheDocument()
  })

  it('renders nothing when preview has no image', async () => {
    const { container } = render(<InlineLinkPreview url="https://no-image.example/x" />)
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('renders nothing while deferred', () => {
    const { container } = render(<InlineLinkPreview url="https://shop.example/x" defer />)
    expect(container).toBeEmptyDOMElement()
  })
})