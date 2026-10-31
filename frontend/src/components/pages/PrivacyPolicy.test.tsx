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
    expect(
      screen.getByText(
        /If you are signed in, your prompt, including any page text or selection you included/i
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/SHA-256 hash of your browser/i)).toBeInTheDocument()
    expect(screen.getByText(/named model-selection defaults/i)).toBeInTheDocument()
    expect(screen.getByText(/held in memory only/i)).toBeInTheDocument()
    expect(
      screen.getByText(/The extension itself does not include analytics or tracking software/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Sentry, including Session Replay/i)).toBeInTheDocument()
    expect(screen.getByText(/cleanup is not run automatically/i)).toBeInTheDocument()
    const supportLinks = screen.getAllByRole('link', { name: 'support@compareintel.com' })
    expect(supportLinks.length).toBeGreaterThan(0)
    expect(supportLinks[0]).toHaveAttribute('href', 'mailto:support@compareintel.com')
  })
})
