export function formatDateToCST(utcDateString: string): string {
  const date = new Date(utcDateString)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const parts = formatter.formatToParts(date)
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''
  const year = parts.find(p => p.type === 'year')?.value || ''
  const hour = parts.find(p => p.type === 'hour')?.value || ''
  const minute = parts.find(p => p.type === 'minute')?.value || ''
  const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || '').toLowerCase()
  return `${month}/${day}/${year} ${hour}:${minute} ${dayPeriod}`
}

export function formatName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function waitForServerRestart(
  getAuthHeaders: () => Record<string, string>,
  maxRetries = 20,
  delayMs = 500
): Promise<boolean> {
  const headers = getAuthHeaders()
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/admin/models', {
        headers,
        credentials: 'include',
      })
      if (response.ok) return true
    } catch {
      // Server not ready yet, wait and retry
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
}
