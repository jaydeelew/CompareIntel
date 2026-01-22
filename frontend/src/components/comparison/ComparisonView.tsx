import type { ReactNode } from 'react'

// TODO: Expand to hold more comparison logic from App.tsx
// ResultsDisplay.tsx is now feature-complete and ready to replace the inline
// grid rendering in App.tsx when doing the MainPage extraction.

interface ComparisonViewProps {
  children: ReactNode
}

export function ComparisonView({ children }: ComparisonViewProps) {
  return <main className="app-main">{children}</main>
}
