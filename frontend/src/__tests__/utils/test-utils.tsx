/**
 * Test Utilities for React Testing Library
 *
 * Provides custom render functions and test helpers for consistent
 * component testing across the application.
 */

import { render, type RenderOptions } from '@testing-library/react'
import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { AuthProvider } from '../../contexts/AuthContext'
import type { User } from '../../types'

/**
 * Options for custom render function
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /**
   * Initial authentication state
   */
  authState?: {
    user: User | null
    isAuthenticated: boolean
    isLoading?: boolean
  }
  /**
   * Custom route path (defaults to '/')
   */
  route?: string
  /**
   * Whether to wrap with Router (defaults to true)
   */
  withRouter?: boolean
  /**
   * Whether to wrap with AuthProvider (defaults to true)
   */
  withAuth?: boolean
}

/**
 * Custom render function that wraps components with necessary providers
 *
 * @param ui - React component to render
 * @param options - Render options including auth state and routing
 * @returns Render result with all queries and utilities
 *
 * @example
 * ```tsx
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   authState: { user: mockUser, isAuthenticated: true }
 * });
 * ```
 */
export function renderWithProviders(ui: React.ReactElement, options: CustomRenderOptions = {}) {
  const {
    authState = { user: null, isAuthenticated: false, isLoading: false },
    route = '/',
    withRouter = true,
    withAuth = true,
    ...renderOptions
  } = options

  // Set up initial route
  if (withRouter && typeof window !== 'undefined') {
    window.history.pushState({}, 'Test page', route)
  }

  // Set up localStorage for auth state
  if (authState.user && authState.isAuthenticated) {
    localStorage.setItem('access_token', 'mock-access-token')
    localStorage.setItem('refresh_token', 'mock-refresh-token')
  } else {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  // Create wrapper component
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let content = children

    // Wrap with AuthProvider if needed
    if (withAuth) {
      content = <AuthProvider>{content}</AuthProvider>
    }

    // Wrap with Router if needed
    if (withRouter) {
      content = <BrowserRouter>{content}</BrowserRouter>
    }

    return <>{content}</>
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Re-export everything from React Testing Library
 */
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'

/**
 * Re-export user-event utilities
 */
export { default as userEvent } from '@testing-library/user-event'

/**
 * Helper to wait for async operations
 *
 * @param ms - Milliseconds to wait
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Helper to wait for element to appear
 *
 * @param queryFn - Query function to find element
 * @param options - Wait options
 */
export async function waitForElement(
  queryFn: () => HTMLElement | null,
  options: { timeout?: number; interval?: number } = {}
): Promise<HTMLElement> {
  const { timeout = 5000, interval = 50 } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const element = queryFn()
    if (element) {
      return element
    }
    await wait(interval)
  }

  throw new Error(`Element not found within ${timeout}ms`)
}

/**
 * Helper to create a mock event
 */
export function createMockEvent(type: string, properties: Record<string, unknown> = {}) {
  return {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...properties,
  } as unknown as Event
}

/**
 * Helper to mock window.location
 */
export function mockWindowLocation(url: string) {
  delete (window as { location?: unknown }).location
  window.location = { ...window.location, href: url } as Location
}
