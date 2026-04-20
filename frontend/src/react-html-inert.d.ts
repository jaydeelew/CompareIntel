import 'react'

/** HTML `inert` — not on @types/react 18 JSX yet; supported in browsers */
declare module 'react' {
  interface HTMLAttributes<_T> {
    inert?: boolean | ''
  }
}
