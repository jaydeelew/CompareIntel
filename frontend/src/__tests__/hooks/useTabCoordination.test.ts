/**
 * Tests for useTabCoordination hook
 *
 * Tests BroadcastChannel coordination for email verification and password reset.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useTabCoordination } from '../../hooks/useTabCoordination'

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private listeners: Map<string, Set<EventListener>> = new Map()

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown) {
    // Simulate broadcast to other instances
    MockBroadcastChannel.instances
      .filter(instance => instance !== this && instance.name === this.name)
      .forEach(instance => {
        const event = new MessageEvent('message', { data })
        instance.listeners.get('message')?.forEach(listener => listener(event))
        instance.onmessage?.(event)
      })
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.listeners.clear()
    const index = MockBroadcastChannel.instances.indexOf(this)
    if (index > -1) {
      MockBroadcastChannel.instances.splice(index, 1)
    }
  }

  static instances: MockBroadcastChannel[] = []
  static clear() {
    MockBroadcastChannel.instances = []
  }
}

describe('useTabCoordination', () => {
  const mockConfig = {
    onOpenAuthModal: vi.fn(),
    onCloseAuthModal: vi.fn(),
    onSetLoginEmail: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    MockBroadcastChannel.clear()

    // Mock BroadcastChannel globally
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000',
        pathname: '/',
        search: '',
      },
      writable: true,
    })

    // Mock window.opener
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
    })

    // Mock window.history.pushState
    window.history.pushState = vi.fn()

    // Mock window.focus
    window.focus = vi.fn()

    // Mock window.close
    window.close = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useTabCoordination(mockConfig))

    expect(result.current.verificationToken).toBeNull()
    expect(result.current.suppressVerification).toBe(false)
    expect(result.current.showPasswordReset).toBe(false)
  })

  it('should detect password reset from URL on mount', () => {
    // Set URL with token and reset-password path
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/reset-password?token=test-token',
        pathname: '/reset-password',
        search: '?token=test-token',
      },
      writable: true,
    })

    const { result } = renderHook(() => useTabCoordination(mockConfig))

    expect(result.current.showPasswordReset).toBe(true)
  })

  it('should handle password reset close', () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/reset-password?token=test-token',
        pathname: '/reset-password',
        search: '?token=test-token',
      },
      writable: true,
    })

    const { result } = renderHook(() => useTabCoordination(mockConfig))

    expect(result.current.showPasswordReset).toBe(true)

    // Close password reset with email
    act(() => {
      result.current.handlePasswordResetClose('user@example.com')
    })

    expect(result.current.showPasswordReset).toBe(false)
    expect(mockConfig.onSetLoginEmail).toHaveBeenCalledWith('user@example.com')
    expect(mockConfig.onOpenAuthModal).toHaveBeenCalledWith('login')
    expect(window.history.pushState).toHaveBeenCalled()
  })

  it('should handle password reset close without email', () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/reset-password?token=test-token',
        pathname: '/reset-password',
        search: '?token=test-token',
      },
      writable: true,
    })

    const { result } = renderHook(() => useTabCoordination(mockConfig))

    act(() => {
      result.current.handlePasswordResetClose()
    })

    expect(result.current.showPasswordReset).toBe(false)
    expect(mockConfig.onSetLoginEmail).not.toHaveBeenCalled()
    expect(mockConfig.onOpenAuthModal).toHaveBeenCalledWith('login')
  })

  it('should set suppressVerification when new tab with token', () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/?token=verify-token',
        pathname: '/',
        search: '?token=verify-token',
      },
      writable: true,
    })

    const { result } = renderHook(() => useTabCoordination(mockConfig))

    // suppressVerification should be true initially for new tabs with tokens
    expect(result.current.suppressVerification).toBe(true)
  })

  it('should handle verify-email message from another tab', async () => {
    const { result } = renderHook(() => useTabCoordination(mockConfig))

    // Simulate receiving verification token from another tab
    const channel = MockBroadcastChannel.instances[0]

    act(() => {
      const event = new MessageEvent('message', {
        data: { type: 'verify-email', token: 'new-token' },
      })
      channel.listeners.get('message')?.forEach(listener => listener(event))
    })

    await waitFor(() => {
      expect(result.current.verificationToken).toBe('new-token')
    })
    expect(window.focus).toHaveBeenCalled()
    expect(window.history.pushState).toHaveBeenCalled()
  })

  it('should handle password-reset message from another tab', async () => {
    const { result } = renderHook(() => useTabCoordination(mockConfig))

    const channel = MockBroadcastChannel.instances[0]

    act(() => {
      const event = new MessageEvent('message', {
        data: { type: 'password-reset', token: 'reset-token' },
      })
      channel.listeners.get('message')?.forEach(listener => listener(event))
    })

    await waitFor(() => {
      expect(result.current.showPasswordReset).toBe(true)
    })
    expect(mockConfig.onCloseAuthModal).toHaveBeenCalled()
    expect(window.focus).toHaveBeenCalled()
  })

  it('should respond to ping with pong', async () => {
    renderHook(() => useTabCoordination(mockConfig))

    // Create another channel instance to simulate another tab
    const otherTabChannel = new MockBroadcastChannel('compareintel-verification')
    const pongHandler = vi.fn()
    otherTabChannel.addEventListener('message', (event: Event) => {
      const messageEvent = event as MessageEvent
      if (messageEvent.data.type === 'pong') {
        pongHandler()
      }
    })

    // Send ping from the other tab
    act(() => {
      otherTabChannel.postMessage({ type: 'ping' })
    })

    await waitFor(() => {
      expect(pongHandler).toHaveBeenCalled()
    })
  })

  it('should clean up BroadcastChannel on unmount', () => {
    const { unmount } = renderHook(() => useTabCoordination(mockConfig))

    const channelsBefore = MockBroadcastChannel.instances.length

    unmount()

    // Channel should be closed (removed from instances)
    expect(MockBroadcastChannel.instances.length).toBeLessThan(channelsBefore)
  })

  it('should handle BroadcastChannel not being supported', () => {
    // Remove BroadcastChannel
    vi.stubGlobal('BroadcastChannel', undefined)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useTabCoordination(mockConfig))

    expect(result.current.verificationToken).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[useTabCoordination] BroadcastChannel not supported')

    consoleSpy.mockRestore()
  })

  it('should allow setting showPasswordReset directly', () => {
    const { result } = renderHook(() => useTabCoordination(mockConfig))

    expect(result.current.showPasswordReset).toBe(false)

    act(() => {
      result.current.setShowPasswordReset(true)
    })

    expect(result.current.showPasswordReset).toBe(true)
  })
})
