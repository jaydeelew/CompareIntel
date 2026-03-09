/**
 * Layout Component
 *
 * Shared layout wrapper that provides consistent UI elements (footer)
 * across all pages using React Router's Outlet pattern.
 * Includes scroll-to-top behavior on route changes (skipped when URL has a hash).
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { updatePageMeta } from '../utils/pageMeta'
import { updatePageTitle } from '../utils/pageTitles'

import { Footer } from './Footer'
import { InstallPrompt, SkipLink } from './layout'

function getScrollTop(): number {
  return (
    window.scrollY ??
    window.pageYOffset ??
    document.documentElement.scrollTop ??
    document.body.scrollTop ??
    0
  )
}

function scrollAllToTop(): void {
  const opts: ScrollToOptions = { top: 0, left: 0, behavior: 'auto' }
  window.scrollTo(opts)
  const el = document.scrollingElement ?? document.documentElement
  el.scrollTop = 0
  el.scrollLeft = 0
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  const app = document.querySelector('.app') as HTMLElement
  if (app) app.scrollTop = 0
  const root = document.getElementById('root')
  if (root) root.scrollTop = 0
}

export const Layout: React.FC = () => {
  const location = useLocation()
  const { pathname, hash } = location
  const prevPathnameRef = useRef<string>(pathname)
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  const rafRef = useRef<number | null>(null)
  const scrollGuardEndRef = useRef<number>(0)

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

  // Reset scroll position to top on route change. Skip when URL has a hash.
  const scrollToTop = () => {
    if (hash) return
    scrollAllToTop()
  }

  // Update page title, meta tags, and scroll to top on route change - immediate attempt
  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      updatePageTitle(pathname)
      updatePageMeta(pathname)
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual'
      }
      scrollToTop()
      // Start scroll guard for 800ms after navigation
      scrollGuardEndRef.current = Date.now() + 800
    }
  }, [pathname, hash])

  // Delayed attempts after DOM updates (lazy-loaded content, layout shifts)
  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
    timeoutRefs.current = []

    rafRef.current = requestAnimationFrame(() => {
      scrollToTop()
      const delays = [0, 50, 100, 150, 200, 300, 400, 500]
      delays.forEach(delay => {
        timeoutRefs.current.push(setTimeout(() => scrollToTop(), delay))
      })
    })

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
      timeoutRefs.current = []
    }
  }, [pathname, hash])

  // Scroll guard: for a short period after navigation, force scroll to top whenever
  // we detect scroll position has drifted (e.g. from browser restoration or layout).
  useEffect(() => {
    if (hash) return

    let rafId: number
    const tick = () => {
      if (Date.now() > scrollGuardEndRef.current) return
      if (getScrollTop() > 0) {
        scrollAllToTop()
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    const t = setTimeout(() => cancelAnimationFrame(rafId), 900)

    return () => {
      clearTimeout(t)
      cancelAnimationFrame(rafId)
    }
  }, [pathname, hash])

  return (
    <>
      {/* Skip link for keyboard navigation accessibility */}
      <SkipLink />
      {/* Hero provides H1 on homepage; other pages define their own */}
      <Outlet />
      <Footer />
      {/* PWA install banner - shows after engagement, respects dismissal */}
      <InstallPrompt />
    </>
  )
}
