import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PrivacyPolicy } from '../PrivacyPolicy'

describe('PrivacyPolicy', () => {
  it('describes cookieless Cloudflare Web Analytics', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
    expect(screen.getByText(/Cloudflare Web Analytics is cookieless/i)).toBeInTheDocument()
  })
})
