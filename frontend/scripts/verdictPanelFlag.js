/**
 * Build-time mirror of frontend/src/config/featureFlags.ts for Node scripts
 * (sitemap, prerender). Keeps SEO routes in sync with the client flag.
 */

export function isVerdictPanelEnabledInBuild(env = process.env) {
  const raw = String(env.VITE_ENABLE_VERDICT_PANEL ?? '')
    .trim()
    .toLowerCase()
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  return false
}
