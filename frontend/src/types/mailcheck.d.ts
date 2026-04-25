/**
 * Type declarations for the mailcheck (CommonJS) package.
 */
declare module 'mailcheck' {
  export interface MailcheckSuggestion {
    full: string
    address: string
    domain: string
  }

  interface MailcheckRunOptions {
    email: string
    suggested?: (s: MailcheckSuggestion) => unknown
    empty?: () => unknown
    domains?: string[]
    secondLevelDomains?: string[]
    topLevelDomains?: string[]
  }

  interface MailcheckAPI {
    run<T = unknown>(opts: MailcheckRunOptions): T
  }

  const Mailcheck: MailcheckAPI
  export default Mailcheck
}
