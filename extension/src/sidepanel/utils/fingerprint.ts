/** Lightweight browser fingerprint for anonymous rate limiting. */
export async function generateBrowserFingerprint(): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('CompareIntel extension', 2, 2)
  }
  const canvasData = canvas.toDataURL()

  const components = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasData,
  ].join('|')

  const encoder = new TextEncoder()
  const data = encoder.encode(components)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
