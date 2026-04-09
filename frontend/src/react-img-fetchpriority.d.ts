import 'react'

// HTML `fetchpriority` on <img>: React 18.2 dev warns on camelCase `fetchPriority`; DOM uses lowercase.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- matches React's ImgHTMLAttributes<T>
  interface ImgHTMLAttributes<T> {
    fetchpriority?: 'high' | 'low' | 'auto'
  }
}
