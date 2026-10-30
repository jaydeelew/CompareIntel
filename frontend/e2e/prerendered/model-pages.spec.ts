import { test, expect } from '@playwright/test'

test.describe('Prerendered model pages', () => {
  test('served HTML for /models/claude-opus-5 has title, canonical, and specs without JS', async ({
    request,
  }) => {
    const response = await request.get('/models/claude-opus-5')
    expect(response.status()).toBe(200)
    const html = await response.text()

    expect(html).toContain('<title>Claude Opus 5 by Anthropic - CompareIntel</title>')
    expect(html).toMatch(
      /<link rel="canonical" href="https:\/\/compareintel\.com\/models\/claude-opus-5"/
    )
    expect(html).toContain('Claude Opus 5 by Anthropic')
    expect(html).toContain('Context window')
    expect(html).toContain('1M tokens')
    expect(html).toContain('Compare Claude Opus 5 side by side')
    expect(html).toContain('"@type":"SoftwareApplication"')
    expect(html).toContain('"@type":"BreadcrumbList"')
  })

  test('unknown model slugs return HTTP 404', async ({ request }) => {
    const response = await request.get('/models/not-a-real-model')
    expect(response.status()).toBe(404)
  })

  test('models index is prerendered and lists featured models', async ({ request }) => {
    const response = await request.get('/models')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<title>AI Models - CompareIntel</title>')
    expect(html).toContain('Claude Opus 5')
    expect(html).toContain('GPT-5.5')
  })

  test('model page renders in the browser and CTA opens the app with the model preselected', async ({
    page,
  }) => {
    await page.goto('/models/claude-opus-5')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Claude Opus 5 by Anthropic')
    await expect(page.getByRole('rowheader', { name: 'Context window' })).toBeVisible()
    await page.getByRole('link', { name: 'Compare Claude Opus 5 side by side' }).click()
    await expect(page).toHaveURL(/models=anthropic%2Fclaude-opus-5/)
  })
})
