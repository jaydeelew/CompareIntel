/**
 * MSW request handlers for Vitest (Node). Service tests override or extend via server.use().
 */

import { HttpResponse, http } from 'msw'

/** Default: unhandled API calls return 404 so tests fail fast if a handler is missing. */
export function createDefaultHandlers() {
  return [
    http.all('*/api/*', ({ request }) => {
      const msg = `[MSW] Unhandled ${request.method} ${request.url}`
      return HttpResponse.json({ error: msg }, { status: 404 })
    }),
  ]
}

export const defaultHandlers = createDefaultHandlers()
