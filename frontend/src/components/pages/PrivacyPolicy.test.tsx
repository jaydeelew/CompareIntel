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
    expect(
      screen.getByText(
        /held only in the extension's memory and discarded when the tab closes or navigates/i
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The extension itself does not include analytics or tracking software/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Sentry, including Session Replay/i)).toBeInTheDocument()
    expect(screen.getByText(/cleanup is not run automatically/i)).toBeInTheDocument()
    expect(
      screen.getByText(/except to store it in your history when you're signed in/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/masks all text and blocks images, video, and audio/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Detailed usage-log rows/i)).toBeInTheDocument()
    const sentryLinks = screen.getAllByRole('link', { name: "Sentry's privacy policy" })
    expect(sentryLinks.length).toBeGreaterThanOrEqual(2)
    expect(sentryLinks[0]).toHaveAttribute('href', 'https://sentry.io/privacy/')
    const supportLinks = screen.getAllByRole('link', { name: 'support@compareintel.com' })
    expect(supportLinks.length).toBeGreaterThan(0)
    expect(supportLinks[0]).toHaveAttribute('href', 'mailto:support@compareintel.com')
  })
})
