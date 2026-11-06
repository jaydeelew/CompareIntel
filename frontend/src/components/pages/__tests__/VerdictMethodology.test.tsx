import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { VerdictMethodology } from '../VerdictMethodology'

describe('VerdictMethodology', () => {
  it('explains agreement, cost, latency, and what Verdict does not claim', () => {
    render(
      <MemoryRouter>
        <VerdictMethodology />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'How Verdict Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agreement' })).toBeInTheDocument()
    expect(screen.getByText(/Needs 2\+ models/)).toBeInTheDocument()
    expect(screen.getByText(/not a judgment of correctness/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Cost (this run, via OpenRouter)' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Response time (this run)' })).toBeInTheDocument()
    expect(
      screen.getByText(/including OpenRouter, the model provider, and the network/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/which answer is correct, better, or safer/i)).toBeInTheDocument()
    expect(screen.getByText(/Cheapest here/)).toBeInTheDocument()
    expect(screen.getByText(/Fastest here/)).toBeInTheDocument()
  })
})
