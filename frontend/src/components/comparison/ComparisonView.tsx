import type { ReactNode } from 'react'

// TODO: Expand this to hold more of the comparison logic from App.tsx
// Currently just a wrapper but should eventually contain the results grid,
// follow-up mode state, and model selection. See ResultsDisplay.tsx for the
// extracted grid component that's not being used yet.

interface ComparisonViewProps {
  children: ReactNode
}

export function ComparisonView({ children }: ComparisonViewProps) {
  return <main className="app-main">{children}</main>
}
