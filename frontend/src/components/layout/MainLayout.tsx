import React from 'react'

/**
 * MainLayout component props
 */
export interface MainLayoutProps {
  /** Main content children */
  children: React.ReactNode
  /** Optional className for the main element */
  className?: string
}

/**
 * Main layout wrapper for the application content
 *
 * @example
 * ```tsx
 * <MainLayout>
 *   <HeroSection />
 *   <ResultsSection />
 * </MainLayout>
 * ```
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children, className = '' }) => {
  return (
    <main id="main-content" className={`app-main ${className}`.trim()}>
      {children}
    </main>
  )
}

MainLayout.displayName = 'MainLayout'
