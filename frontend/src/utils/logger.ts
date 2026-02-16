const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true

const logger = {
  debug(...args: unknown[]): void {
    if (isDev) console.debug(...args)
  },
  info(...args: unknown[]): void {
    if (isDev) console.info(...args)
  },
  warn(...args: unknown[]): void {
    console.warn(...args)
  },
  error(...args: unknown[]): void {
    console.error(...args)
  },
}

export default logger
