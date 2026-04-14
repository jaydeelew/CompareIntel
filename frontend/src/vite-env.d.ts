/// <reference types="vite/client" />

// Per-icon lucide-react ESM paths (tree-shaking); package does not ship .d.ts for these modules.
declare module 'lucide-react/dist/esm/icons/eye' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}
declare module 'lucide-react/dist/esm/icons/eye-closed' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}
declare module 'lucide-react/dist/esm/icons/image' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}
declare module 'lucide-react/dist/esm/icons/file-text' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}
declare module 'lucide-react/dist/esm/icons/x' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}
declare module 'lucide-react/dist/esm/icons/search' {
  import type { LucideIcon } from 'lucide-react'
  const Icon: LucideIcon
  export default Icon
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_RECAPTCHA_SITE_KEY?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_PERFORMANCE_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Type declaration for VitePWA virtual module (must match vite-plugin-pwa/vanillajs.d.ts)
declare module 'virtual:pwa-register' {
  import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

  export type { RegisterSWOptions }

  /** Returns a callback to activate the waiting worker and reload (use in onNeedRefresh). */
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>
}

// Web Speech API type definitions
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

declare const webkitSpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

interface Window {
  SpeechRecognition: typeof SpeechRecognition
  webkitSpeechRecognition: typeof SpeechRecognition
  // Test environment flags (used by Playwright E2E tests)
  __TEST_ENV__?: boolean
  __PLAYWRIGHT__?: boolean
  __PW_INTERNAL__?: boolean
}

interface Document {
  // Test environment flag (used by Playwright E2E tests)
  __TEST_ENV__?: boolean
}
