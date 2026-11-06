/**
 * Tests for UsersTab's admin "delete user" confirmation flow.
 *
 * Regression coverage for: a mistaken click on Delete must not immediately
 * remove the account. Delete must open a confirmation dialogue; Cancel must
 * leave the user unchanged; Confirm must call the existing delete endpoint.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthHeaders = () => ({ 'Content-Type': 'application/json' })

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@example.com', role: 'super_admin', is_admin: true },
    refreshUser: vi.fn(),
  }),
  useAuthHeaders: () => mockAuthHeaders,
}))

import UsersTab from '../UsersTab'

const TARGET_USER = {
  id: 2,
  email: 'target-user@example.com',
  is_verified: true,
  is_active: true,
  role: 'user',
  is_admin: false,
  subscription_tier: 'free',
  subscription_status: 'active',
  subscription_period: 'monthly',
  monthly_overage_count: 0,
  monthly_credits_allocated: 50,
  credits_used_this_period: 0,
  mock_mode_enabled: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_access: null,
}

const USERS_RESPONSE = {
  users: [TARGET_USER],
  total: 1,
  page: 1,
  per_page: 20,
  total_pages: 1,
}

function buildDefaultProps() {
  return {
    appSettings: null,
    fetchStats: vi.fn().mockResolvedValue(undefined),
    fetchAppSettings: vi.fn().mockResolvedValue(undefined),
    setError: vi.fn(),
  }
}

describe('UsersTab - delete user confirmation', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url.includes('/api/admin/users') && method === 'GET') {
        return new Response(JSON.stringify(USERS_RESPONSE), { status: 200 })
      }
      if (url.endsWith('/api/auth/me') && method === 'GET') {
        return new Response(JSON.stringify({ role: 'super_admin' }), { status: 200 })
      }
      if (url.includes(`/api/admin/users/${TARGET_USER.id}`) && method === 'DELETE') {
        return new Response(null, { status: 204 })
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  async function renderAndOpenDeleteModal() {
    render(<UsersTab {...buildDefaultProps()} />)

    await waitFor(() => screen.getAllByText(TARGET_USER.email).length > 0)

    const user = userEvent.setup()
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[0])

    await waitFor(() => screen.getByRole('heading', { name: /confirm delete/i }))
    return user
  }

  it('opens a confirmation dialogue naming the action and the target user before deleting', async () => {
    await renderAndOpenDeleteModal()

    const heading = screen.getByRole('heading', { name: /confirm delete/i })
    const modal = heading.closest('.modal-content') as HTMLElement
    expect(within(modal).getByText(TARGET_USER.email)).toBeInTheDocument()

    // No DELETE call should have been made just by opening the dialogue.
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining(`/api/admin/users/${TARGET_USER.id}`),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('Cancel dismisses the dialogue without deleting the user', async () => {
    const user = await renderAndOpenDeleteModal()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /confirm delete/i })).not.toBeInTheDocument()
    })

    const deleteCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE'
    )
    expect(deleteCalls).toHaveLength(0)
    // The user row is still present (not removed from the UI).
    expect(screen.getAllByText(TARGET_USER.email).length).toBeGreaterThan(0)
  })

  it('Confirm proceeds with the existing delete call', async () => {
    const user = await renderAndOpenDeleteModal()

    await user.click(screen.getByRole('button', { name: /delete user/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/users/${TARGET_USER.id}`),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /confirm delete/i })).not.toBeInTheDocument()
    })
  })
})
