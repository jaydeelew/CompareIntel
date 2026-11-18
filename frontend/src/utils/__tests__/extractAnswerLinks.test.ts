import { describe, expect, it } from 'vitest'

import { extractExternalUrlsFromAnswer } from '../extractAnswerLinks'

describe('extractExternalUrlsFromAnswer', () => {
  it('collects markdown and bare URLs up to max', () => {
    const text = [
      'See [Product](https://shop.example/item/1) and',
      'also https://news.example/story/2',
    ].join(' ')
    expect(extractExternalUrlsFromAnswer(text)).toEqual([
      'https://shop.example/item/1',
      'https://news.example/story/2',
    ])
  })

  it('skips localhost', () => {
    const urls = extractExternalUrlsFromAnswer('http://localhost:8000/secret')
    expect(urls).toHaveLength(0)
  })
})
