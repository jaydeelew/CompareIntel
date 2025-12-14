/**
 * Layout Component
 *
 * Shared layout wrapper that provides consistent UI elements (footer)
 * across all pages using React Router's Outlet pattern.
 */

import React from 'react'
import { Outlet } from 'react-router-dom'
import { Footer } from './Footer'

export const Layout: React.FC = () => {
  return (
    <>
      <Outlet />
      <Footer />
    </>
  )
}
