const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'https://compareintel.com/api'

export function getWebAppOrigin(): string {
  const configured = import.meta.env.VITE_WEB_APP_URL
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      return configured.replace(/\/$/, '')
    }
  }

  if (API_BASE_URL.includes('localhost:8000')) {
    return 'http://localhost:5173'
  }

  const base = API_BASE_URL.replace(/\/api\/?$/, '') || 'https://compareintel.com'
  try {
    return new URL(base).origin
  } catch {
    return base
  }
}

export const WEB_APP_ORIGINS = [
  'https://compareintel.com',
  'http://localhost:5173',
  getWebAppOrigin(),
].filter((origin, index, list) => list.indexOf(origin) === index)

export function isAllowedWebAppOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return WEB_APP_ORIGINS.includes(origin)
}
