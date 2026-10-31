const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'https://compareintel.com/api'

function isDevBuild(isDev = import.meta.env.DEV): boolean {
  return isDev === true
}

export function getWebAppOrigin(isDev = import.meta.env.DEV): string {
  const configured = import.meta.env.VITE_WEB_APP_URL
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      return configured.replace(/\/$/, '')
    }
  }

  if (isDevBuild(isDev) && API_BASE_URL.includes('localhost:8000')) {
    return 'http://localhost:5173'
  }

  const base = API_BASE_URL.replace(/\/api\/?$/, '') || 'https://compareintel.com'
  try {
    return new URL(base).origin
  } catch {
    return base
  }
}

export function allowedWebAppOrigins(isDev = import.meta.env.DEV): string[] {
  const origins = ['https://compareintel.com']
  if (isDevBuild(isDev)) origins.push('http://localhost:5173')
  origins.push(getWebAppOrigin(isDev))
  return origins.filter((origin, index, list) => list.indexOf(origin) === index)
}

export const WEB_APP_ORIGINS = allowedWebAppOrigins()

export function isAllowedWebAppOrigin(
  origin: string | undefined,
  isDev = import.meta.env.DEV,
): boolean {
  if (!origin) return false
  if (origin === 'http://localhost:5173' && !isDevBuild(isDev)) return false
  return allowedWebAppOrigins(isDev).includes(origin)
}
