/**
 * Vitest setup file for test configuration.
 * This file runs before all tests and sets up the testing environment.
 */

import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { apiClient } from '../services/api/client'

import { server } from './msw/server'

// MSW: intercept /api in service tests; non-API requests pass through to avoid breaking geo etc.
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'bypass',
  })
})

afterEach(() => {
  server.resetHandlers()
  apiClient.clearCache()
  cleanup()
})

afterAll(() => {
  server.close()
})

// Extend Vitest's expect with jest-dom matchers
// This allows us to use matchers like toBeInTheDocument(), toHaveClass(), etc.

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as unknown as typeof ResizeObserver

// Suppress console errors/warnings in tests (optional - uncomment if needed)
// global.console = {
//   ...console,
//   error: vi.fn(),
//   warn: vi.fn(),
// }
