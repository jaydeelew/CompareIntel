/**
 * Dev-only: React logs an info line suggesting the DevTools browser extension.
 * Import this module before `react-dom/client` so the message is filtered.
 */
if (import.meta.env.DEV) {
  const shouldFilter = (args: unknown[]) => {
    const first = args[0]
    return (
      typeof first === 'string' &&
      (first.includes('Download the React DevTools') || first.includes('react-devtools'))
    )
  }
  const origInfo = console.info.bind(console)
  const origLog = console.log.bind(console)
  console.info = (...args: unknown[]) => {
    if (shouldFilter(args)) return
    origInfo(...args)
  }
  console.log = (...args: unknown[]) => {
    if (shouldFilter(args)) return
    origLog(...args)
  }
}
