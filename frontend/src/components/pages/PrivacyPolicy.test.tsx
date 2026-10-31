import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PrivacyPolicy } from './PrivacyPolicy'

function renderPolicy() {
  return render(
    <MemoryRouter>
      <PrivacyPolicy />
    </MemoryRouter>
  )
}

describe('PrivacyPolicy', () => {
  it('has a Browser extension section with verified extension facts', () => {
    renderPolicy()

    expect(screen.getByRole('heading', { level: 2, name: 'Browser extension' })).toBeInTheDocument()
    expect(screen.getByText(/chrome\.storage\.session/)).toBeInTheDocument()
    expect(screen.getByText(/chrome\.storage\.local/)).toBeInTheDocument()
    expect(
      screen.getByText(/only when you submit a comparison with page context turned on/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/through OpenRouter/i)).toBeInTheDocument()
    expect(screen.getByText(/does not include analytics or tracking software/i)).toBeInTheDocument()
    const supportLinks = screen.getAllByRole('link', { name: 'support@compareintel.com' })
    expect(supportLinks.length).toBeGreaterThan(0)
    expect(supportLinks[0]).toHaveAttribute('href', 'mailto:support@compareintel.com')
  })
})
