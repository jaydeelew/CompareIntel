import { expect, type Page } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPassword123!'

/**
 * Turn on backend mock mode for the page's signed-in user.
 *
 * Uses an isolated admin login (not the page cookie jar) so the current session
 * stays intact. Compare-stream then writes real conversations without OpenRouter,
 * which is what Breakout needs when Cross-Browser jobs share one 402-prone key.
 */
export async function ensureBackendMockMode(page: Page): Promise<void> {
  const meRes = await page.request.get('/api/auth/me')
  expect(meRes.ok(), `GET /api/auth/me failed: ${meRes.status()}`).toBeTruthy()
  const me = (await meRes.json()) as { id: number; mock_mode_enabled?: boolean }
  if (me.mock_mode_enabled) return

  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!loginRes.ok) {
    throw new Error(`admin login for mock mode failed: ${loginRes.status} ${await loginRes.text()}`)
  }
  const tokens = (await loginRes.json()) as { access_token?: string }
  if (!tokens.access_token) {
    throw new Error('admin login missing access_token')
  }

  const toggleRes = await fetch(`${BACKEND_URL}/api/admin/users/${me.id}/toggle-mock-mode`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const toggleBody = await toggleRes.text()
  if (!toggleRes.ok) {
    throw new Error(`toggle-mock-mode failed: ${toggleRes.status} ${toggleBody}`)
  }
  const updated = JSON.parse(toggleBody) as { mock_mode_enabled?: boolean }
  expect(updated.mock_mode_enabled, 'expected mock_mode_enabled after toggle').toBe(true)
}
