import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { getSeoModelBySlug } from '../../data/seo/catalog'

import { ModelPage } from './ModelPage'
import { ModelsIndex } from './ModelsIndex'

function renderModel(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/models/${slug}`]}>
      <Routes>
        <Route path="/models/:slug" element={<ModelPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ModelPage', () => {
  it('renders H1, original summary, spec table, CTA, related links, and JSON-LD', () => {
    const model = getSeoModelBySlug('claude-opus-5')
    expect(model).toBeDefined()
    renderModel('claude-opus-5')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Claude Opus 5 by Anthropic'
    )
    expect(screen.getByText(model!.summary)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Compare Claude Opus 5 side by side' })
    ).toHaveAttribute('href', '/?models=anthropic%2Fclaude-opus-5')

    expect(
      screen.getByRole('rowheader', { name: 'Context window' }).closest('tr')
    ).toHaveTextContent('1M tokens')
    expect(screen.queryByText('Knowledge cutoff')).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Claude Sonnet 4.6 by Anthropic' })).toHaveAttribute(
      'href',
      '/models/claude-sonnet-4-6'
    )

    const software = document.getElementById('model-software-application')
    const breadcrumb = document.getElementById('model-breadcrumb')
    expect(software?.textContent).toContain('"SoftwareApplication"')
    expect(software?.textContent).toContain('Claude Opus 5')
    expect(software?.textContent).toContain('"price":"5.00"')
    expect(software?.textContent).not.toContain('"price":"5.001"')
    expect(breadcrumb?.textContent).toContain('"BreadcrumbList"')
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getByText(/OpenRouter spec snapshot/)).toBeInTheDocument()
  })

  it('renders NotFound for an unknown slug', () => {
    renderModel('not-a-real-model')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404 - Page Not Found')
  })
})

describe('ModelsIndex', () => {
  it('groups featured models by provider', () => {
    render(
      <MemoryRouter>
        <ModelsIndex />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Models on CompareIntel')
    expect(screen.getByRole('heading', { name: 'Anthropic' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Claude Opus 5' })).toHaveAttribute(
      'href',
      '/models/claude-opus-5'
    )
    expect(screen.getByRole('link', { name: 'GPT-5.5' })).toHaveAttribute('href', '/models/gpt-5-5')
  })
})
