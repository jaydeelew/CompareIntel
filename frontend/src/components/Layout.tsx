/**
 * Layout Component
 *
 * Shared layout wrapper that provides consistent UI elements (footer)
 * across all pages using React Router's Outlet pattern.
 * Includes scroll-to-top behavior on route changes.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Footer } from './Footer'

export const Layout: React.FC = () => {
  const { pathname } = useLocation()
  const prevPathnameRef = useRef<string>(pathname)

  // Disable browser's automatic scroll restoration on mount
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  // Scroll to top on route change
  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname

      // Scroll the .app container (which has overflow-y: auto) to top
      const appContainer = document.querySelector('.app')
      if (appContainer) {
        appContainer.scrollTop = 0
      }
      
      // Also scroll window/document as fallback
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
  }, [pathname])

  return (
    <>
      <Outlet />
      <Footer />
    </>
  )
}
