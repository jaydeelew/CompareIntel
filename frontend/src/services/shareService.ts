/**
 * Public comparison snapshot API.
 *
 * Creates an immutable server-side snapshot and reads it back for permalink pages.
 */

import { apiClient } from './api/client'

export interface ShareModelInfo {
  id: string
  name: string
}

export interface ShareResponseItem {
  model_id: string
  model_name: string
  content: string
}

export interface CreateShareRequest {
  prompt: string
  models: ShareModelInfo[]
  responses: ShareResponseItem[]
}

export interface CreateShareResponse {
  slug: string
  url: string
  revoke_token: string
}

export interface PublicShareSnapshot {
  slug: string
  prompt: string
  models: ShareModelInfo[]
  responses: ShareResponseItem[]
  created_at: string
}

export async function createSharedComparison(
  payload: CreateShareRequest
): Promise<CreateShareResponse> {
  const response = await apiClient.post<CreateShareResponse>('/shares', payload, { retry: false })
  return response.data
}

export async function getSharedComparison(slug: string): Promise<PublicShareSnapshot> {
  const response = await apiClient.get<PublicShareSnapshot>(`/shares/${slug}`, {
    skipAuth: true,
    enableCache: false,
    retry: false,
  })
  return response.data
}

export async function unshareComparison(slug: string, revokeToken?: string): Promise<void> {
  await apiClient.post(
    `/shares/${slug}/unshare`,
    { revoke_token: revokeToken ?? null },
    { retry: false }
  )
}
