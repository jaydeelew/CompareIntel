/**
 * AuthModal — RTL smoke (open/close, modes). Uses AuthProvider via renderWithProviders
 * because login/register forms call useAuth.
 */

import { describe, it, expect, vi } from 'vitest'

import { render, renderWithProviders, screen, waitFor, userEvent } from '../../../__tests__/utils'
import { AuthModal } from '../AuthModal'

describe('AuthModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AuthModal isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders login when open and closes via close button', async () => {
    const ue = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<AuthModal isOpen initialMode="login" onClose={onClose} />)

    expect(await screen.findByTestId('auth-modal')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()

    await ue.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('supports forgot-password initial mode', async () => {
    renderWithProviders(<AuthModal isOpen initialMode="forgot-password" onClose={vi.fn()} />)

    await waitFor(async () => {
      expect(await screen.findByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    })
  })
})
