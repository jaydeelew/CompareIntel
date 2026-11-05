import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthIntentEffects } from '../../../hooks/useAuthIntentEffects'
import { createSubscriptionCheckoutSession } from '../../../services/billingService'
import { peekPendingAuthIntent, savePendingAuthIntent } from '../../../utils/authIntent'
import { Pricing } from '../Pricing'

const authState = vi.hoisted(() => ({
  user: null as { id: number } | null,
  isLoading: false,
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../../services/billingService', () => ({
  createSubscriptionCheckoutSession: vi.fn(),
}))

const openRegister = vi.fn()
const openLogin = vi.fn()

function Home() {
  const location = useLocation()
  useAuthIntentEffects({
    isAuthenticated: !!authState.user,
    authLoading: authState.isLoading,
    openLogin,
    openRegister,
  })
  return <div data-testid="home">{`${location.pathname}${location.search}`}</div>
}

function renderApp(initialEntry = '/pricing') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Pricing signed-out auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    authState.user = null
    authState.isLoading = false
  })

  it('Get Started Free opens the signup modal on the home page', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Get Started Free' }))

    await waitFor(() => expect(openRegister).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('home')).toHaveTextContent(/^\/$/)
    expect(peekPendingAuthIntent()).toBeNull()
  })

  it('Subscribe opens the signup modal and remembers the tier', async () => {
    renderApp()

    fireEvent.click(screen.getAllByRole('button', { name: 'Subscribe' })[1])

    await waitFor(() => expect(openRegister).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('home')).toHaveTextContent(/^\/$/)
    expect(peekPendingAuthIntent()).toMatchObject({ returnTo: '/pricing', tier: 'starter_plus' })
    expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled()
  })

  it('resumes checkout for the remembered tier after signing in', async () => {
    vi.mocked(createSubscriptionCheckoutSession).mockRejectedValue(new Error('stripe offline'))
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'pro' })
    authState.user = { id: 1 }

    renderApp('/pricing')

    await waitFor(() => expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith('pro'))
    expect(await screen.findByText('stripe offline')).toBeInTheDocument()
    expect(peekPendingAuthIntent()).toBeNull()
  })

  it('returns to /pricing from the home page after authenticating', async () => {
    vi.mocked(createSubscriptionCheckoutSession).mockRejectedValue(new Error('stripe offline'))
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'starter' })
    authState.user = { id: 1 }

    renderApp('/')

    await waitFor(() => expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith('starter'))
    expect(screen.queryByTestId('home')).not.toBeInTheDocument()
  })
})
