import type { ReactNode } from 'react'

interface ComparisonViewProps {
  children: ReactNode
}

export function ComparisonView({ children }: ComparisonViewProps) {
  return <main className="app-main">{children}</main>
}
