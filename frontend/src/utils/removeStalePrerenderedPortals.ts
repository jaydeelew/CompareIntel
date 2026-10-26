/**
 * HTML prerendered before #68 was fixed (and possibly still cached by the service worker or CDN)
 * contains a static copy of the welcome modal portal outside #root. createRoot() never adopts it,
 * so it would sit on screen with no listeners. Call before React mounts.
 */
export function removeStalePrerenderedPortals(doc: Document = document): number {
  const stale = doc.querySelectorAll('body > .tutorial-welcome-backdrop')
  stale.forEach(el => el.remove())
  return stale.length
}
