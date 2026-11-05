import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthIntentEffects } from '../../hooks/useAuthIntentEffects'
import { peekPendingAuthIntent, savePendingAuthIntent } from '../../utils/authIntent'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

interface HarnessProps {
  isAuthenticated?: boolean
  authLoading?: boolean
  openLogin: () => void
  openRegister: () => void
}

function Home({
  isAuthenticated = false,
  authLoading = false,
  openLogin,
  openRegister,
}: HarnessProps) {
  useAuthIntentEffects({ isAuthenticated, authLoading, openLogin, openRegister })
  return <LocationProbe />
}

function renderHome(initialEntry: string, props: Partial<HarnessProps> = {}) {
  const openLogin = vi.fn()
  const openRegister = vi.fn()
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={<Home openLogin={openLogin} openRegister={openRegister} {...props} />}
        />
        <Route path="/pricing" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
  return { openLogin, openRegister }
}

describe('useAuthIntentEffects', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('opens the register modal for ?showAuthModal=signup and removes the param', async () => {
    const { openRegister, openLogin } = renderHome('/?showAuthModal=signup')

    await waitFor(() => expect(openRegister).toHaveBeenCalledTimes(1))
    expect(openLogin).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
  })

  it('opens the login modal for ?showAuthModal=login and keeps other params', async () => {
    const { openRegister, openLogin } = renderHome('/?models=a&showAuthModal=login')

    await waitFor(() => expect(openLogin).toHaveBeenCalledTimes(1))
    expect(openRegister).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?models=a'))
  })

  it('ignores unknown values', () => {
    const { openLogin, openRegister } = renderHome('/?showAuthModal=bogus')

    expect(openLogin).not.toHaveBeenCalled()
    expect(openRegister).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/?showAuthModal=bogus')
  })

  it('waits for auth to finish loading before acting', async () => {
    const { openRegister } = renderHome('/?showAuthModal=signup', { authLoading: true })

    expect(openRegister).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/?showAuthModal=signup')
  })

  it('only strips the param when the user is already signed in', async () => {
    const { openRegister, openLogin } = renderHome('/?showAuthModal=signup', {
      isAuthenticated: true,
    })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(openRegister).not.toHaveBeenCalled()
    expect(openLogin).not.toHaveBeenCalled()
  })

  it('sends an authenticated user back to the stored returnTo path', async () => {
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'pro' })

    renderHome('/', { isAuthenticated: true })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/pricing'))
    expect(peekPendingAuthIntent()?.tier).toBe('pro')
  })

  it('does not redirect signed-out users with a stored intent', () => {
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'pro' })

    renderHome('/', { isAuthenticated: false })

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
