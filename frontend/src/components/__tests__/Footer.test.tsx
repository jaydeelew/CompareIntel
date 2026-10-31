import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { Footer } from '../Footer'

function renderFooter(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>
  )
}

describe('Footer', () => {
  it('hides the AGPL source offer on the home page', () => {
    renderFooter('/')

    expect(screen.queryByRole('link', { name: 'Source code' })).not.toBeInTheDocument()
    expect(screen.queryByText(/open source under AGPL-3.0/i)).not.toBeInTheDocument()
  })

  it('shows the AGPL source offer on secondary pages', () => {
    renderFooter('/about')

    const sourceLink = screen.getByRole('link', { name: 'Source code' })
    expect(sourceLink).toHaveAttribute('href', 'https://github.com/jaydeelew/CompareIntel')
    expect(screen.getByText(/open source under AGPL-3.0/i)).toBeInTheDocument()
  })
})
