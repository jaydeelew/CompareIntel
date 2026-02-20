/**
 * Layout Component
 *
 * Shared layout wrapper that provides consistent UI elements (footer)
 * across all pages using React Router's Outlet pattern.
 * Includes scroll-to-top behavior on route changes.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { updatePageMeta } from '../utils/pageMeta'
import { updatePageTitle } from '../utils/pageTitles'

import { Footer } from './Footer'
import { SkipLink } from './layout'

export const Layout: React.FC = () => {
  const { pathname } = useLocation()
  const prevPathnameRef = useRef<string>(pathname)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const rafRef = useRef<number | null>(null)

  // Set page title and meta tags when route changes
  useEffect(() => {
    updatePageTitle(pathname)
    updatePageMeta(pathname)
  }, [pathname])

  // Disable browser's automatic scroll restoration on mount
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  // Comprehensive scroll-to-top function
  const scrollToTop = () => {
    // Scroll the .app container (which has overflow-y: auto) to top
    const appContainer = document.querySelector('.app') as HTMLElement
    if (appContainer) {
      appContainer.scrollTop = 0
    }

    // Scroll window/document as fallback
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0

    // Also try scrolling any other scrollable containers
    const scrollableContainers = document.querySelectorAll(
      '[style*="overflow"], [style*="overflow-y"]'
    )
    scrollableContainers.forEach(container => {
      const el = container as HTMLElement
      if (el.scrollTop !== undefined) {
        el.scrollTop = 0
      }
    })
  }

  // Update page title, meta tags, and scroll to top on route change - immediate attempt
  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      // Update page title immediately (synchronously before paint)
      updatePageTitle(pathname)
      // Update page meta tags immediately (synchronously before paint)
      updatePageMeta(pathname)
      // Scroll immediately (synchronously before paint)
      scrollToTop()
    }
  }, [pathname])

  // Multiple fallback attempts to ensure scroll happens after DOM updates
  // This catches cases where components render asynchronously
  useEffect(() => {
    // Clear any existing timeouts/RAF from previous renders
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
    timeoutRefs.current = []

    // Use requestAnimationFrame for the first attempt (after paint)
    rafRef.current = requestAnimationFrame(() => {
      scrollToTop()

      // Additional attempts with small delays to catch late renders
      timeoutRefs.current.push(setTimeout(() => scrollToTop(), 0))
      timeoutRefs.current.push(setTimeout(() => scrollToTop(), 10))
      timeoutRefs.current.push(setTimeout(() => scrollToTop(), 50))
      timeoutRefs.current.push(setTimeout(() => scrollToTop(), 100))
    })

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
      timeoutRefs.current = []
    }
  }, [pathname])

  return (
    <>
      {/* Skip link for keyboard navigation accessibility */}
      <SkipLink />
      {/* Hero provides H1 on homepage; other pages define their own */}
      <Outlet />
      <Footer />
    </>
  )
}
