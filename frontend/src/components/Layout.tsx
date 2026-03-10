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

const SCROLL_LOCK_MS = 700

function scrollAllToTop(): void {
  window.scrollTo(0, 0)
  const el = document.scrollingElement ?? document.documentElement
  el.scrollTop = 0
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
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Update page title, meta tags, and scroll to top on route change.
  // Apply body scroll lock to prevent compositor-level inertial scroll momentum
  // from carrying over. position:fixed on body stops all scroll during the lock.
  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      updatePageTitle(pathname)
      updatePageMeta(pathname)
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual'
      }

      if (hash) {
        scrollToTop()
        return
      }

      // Clear any existing lock timer
      if (scrollLockTimerRef.current) {
        clearTimeout(scrollLockTimerRef.current)
        scrollLockTimerRef.current = null
      }

      const html = document.documentElement
      const body = document.body

      // Lock: position fixed stops compositor scroll entirely. Use top:0 so the
      // new page content (which renders during the lock) appears at top.
      body.style.position = 'fixed'
      body.style.top = '0'
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
      html.style.overflow = 'hidden'

      scrollLockTimerRef.current = setTimeout(() => {
        scrollLockTimerRef.current = null
        body.style.position = ''
        body.style.top = ''
        body.style.left = ''
        body.style.right = ''
        body.style.width = ''
        body.style.overflow = ''
        html.style.overflow = ''
        scrollAllToTop()
      }, SCROLL_LOCK_MS)

      return () => {
        if (scrollLockTimerRef.current) {
          clearTimeout(scrollLockTimerRef.current)
          scrollLockTimerRef.current = null
        }
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        document.documentElement.style.overflow = ''
      }
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
