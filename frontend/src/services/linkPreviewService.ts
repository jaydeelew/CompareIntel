/**
 * Link preview API — metadata for rich cards under web-search answers.
 */

import { apiClient } from './api/client'

export interface LinkPreviewData {
  title: string
  site_name: string | null
  image: string | null
  description: string | null
  price: string | null
  currency: string | null
  fetched_at: string
  url: string
  error?: string
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData> {
  const encoded = encodeURIComponent(url)
  const response = await apiClient.get<LinkPreviewData>(`/link-preview?url=${encoded}`)
  return response.data
}

/** Same-origin image proxy (SSRF-safe server fetch). */
export function linkPreviewImageSrc(imageUrl: string): string {
  return `/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`
}
