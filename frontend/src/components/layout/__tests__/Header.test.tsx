/**
 * Tests for Header component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { Header } from '../Header'

// Mock UserMenu component
vi.mock('../../auth', () => ({
  UserMenu: () => <div data-testid="user-menu">User Menu</div>,
}))

describe('Header', () => {
  const mockUser = {
    email: 'test@example.com',
    is_admin: false,
  }

  describe('Rendering', () => {
    it('should render header with branding', () => {
      render(<Header isAuthenticated={false} />)
      expect(screen.getByText(/compareintel/i)).toBeInTheDocument()
      expect(screen.getByText(/ai model comparison platform/i)).toBeInTheDocument()
    })

    it('should render logo', () => {
      const { container } = render(<Header isAuthenticated={false} />)
      const logo = container.querySelector('.logo-icon')
      expect(logo).toBeInTheDocument()
    })
  })

  describe('Unauthenticated State', () => {
    it('should render Sign In button when not authenticated', () => {
      render(<Header isAuthenticated={false} />)
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('should render Sign Up button when not authenticated', () => {
      render(<Header isAuthenticated={false} />)
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    })

    it('should call onSignInClick when Sign In is clicked', async () => {
      const user = userEvent.setup()
      const handleSignIn = vi.fn()
      render(<Header isAuthenticated={false} onSignInClick={handleSignIn} />)

      const signInButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(signInButton)

      expect(handleSignIn).toHaveBeenCalledTimes(1)
    })

    it('should call onSignUpClick when Sign Up is clicked', async () => {
      const user = userEvent.setup()
      const handleSignUp = vi.fn()
      render(<Header isAuthenticated={false} onSignUpClick={handleSignUp} />)

      const signUpButton = screen.getByRole('button', { name: /sign up/i })
      await user.click(signUpButton)

      expect(handleSignUp).toHaveBeenCalledTimes(1)
    })
  })

  describe('Authenticated State', () => {
    it('should render UserMenu when authenticated', () => {
      render(<Header isAuthenticated={true} user={mockUser} />)
      expect(screen.getByTestId('user-menu')).toBeInTheDocument()
    })

    it('should not render Sign In/Sign Up buttons when authenticated', () => {
      render(<Header isAuthenticated={true} user={mockUser} />)
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument()
    })
  })

  describe('Admin Features', () => {
    it('should render admin button for admin users', () => {
      const adminUser = { ...mockUser, is_admin: true }
      render(<Header isAuthenticated={true} user={adminUser} />)

      const adminButton = screen.getByRole('button', { name: /admin panel/i })
      expect(adminButton).toBeInTheDocument()
    })

    it('should not render admin button for non-admin users', () => {
      render(<Header isAuthenticated={true} user={mockUser} />)
      expect(screen.queryByRole('button', { name: /admin panel/i })).not.toBeInTheDocument()
    })

    it('should call onAdminToggle when admin button is clicked', async () => {
      const user = userEvent.setup()
      const handleAdminToggle = vi.fn()
      const adminUser = { ...mockUser, is_admin: true }
      render(<Header isAuthenticated={true} user={adminUser} onAdminToggle={handleAdminToggle} />)

      const adminButton = screen.getByRole('button', { name: /admin panel/i })
      await user.click(adminButton)

      expect(handleAdminToggle).toHaveBeenCalledTimes(1)
    })

    it('should show "Back to Main App" when currentView is admin', () => {
      const adminUser = { ...mockUser, is_admin: true }
      render(<Header isAuthenticated={true} user={adminUser} currentView="admin" />)

      const adminButton = screen.getByRole('button', { name: /back to main app/i })
      expect(adminButton).toBeInTheDocument()
    })

    it('should show "Admin Panel" when currentView is main', () => {
      const adminUser = { ...mockUser, is_admin: true }
      render(<Header isAuthenticated={true} user={adminUser} currentView="main" />)

      const adminButton = screen.getByRole('button', { name: /admin panel/i })
      expect(adminButton).toBeInTheDocument()
    })
  })

  describe('Default Values', () => {
    it('should default currentView to main', () => {
      const adminUser = { ...mockUser, is_admin: true }
      render(<Header isAuthenticated={true} user={adminUser} />)

      const adminButton = screen.getByRole('button', { name: /admin panel/i })
      expect(adminButton).toBeInTheDocument()
    })
  })
})
