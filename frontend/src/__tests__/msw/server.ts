/**
 * Shared MSW server for unit tests (Vitest + Node).
 */
import { setupServer } from 'msw/node'

import { defaultHandlers } from './handlers'

export const server = setupServer(...defaultHandlers)
