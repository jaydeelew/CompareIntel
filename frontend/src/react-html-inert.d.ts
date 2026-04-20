import 'react'

/** HTML `inert` — not on @types/react 18 JSX yet; supported in browsers */
declare module 'react' {
  // Must use the same type parameter name as @types/react (`T`), not `_T`, or TS
  // treats this as a separate interface and breaks merging (children/className vanish).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `T` must mirror @types/react for merge
  interface HTMLAttributes<T> {
    inert?: boolean | ''
  }
}
