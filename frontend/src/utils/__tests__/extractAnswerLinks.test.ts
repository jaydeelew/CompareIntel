import { describe, expect, it } from 'vitest'

import {
  extractExternalUrlsFromAnswer,
  splitAnswerIntoBlocksWithPreviewUrls,
} from '../extractAnswerLinks'

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

describe('splitAnswerIntoBlocksWithPreviewUrls', () => {
  it('assigns one preview URL per list item and dedupes repeats', () => {
    const text = [
      'Sources cited:',
      '- https://a.example/first',
      '- https://a.example/first',
      '- https://b.example/second',
    ].join('\n')

    const blocks = splitAnswerIntoBlocksWithPreviewUrls(text)
    const withPreview = blocks.filter(b => b.previewUrls.length > 0)
    expect(withPreview).toHaveLength(2)
    expect(withPreview[0]?.previewUrls).toEqual(['https://a.example/first'])
    expect(withPreview[1]?.previewUrls).toEqual(['https://b.example/second'])
  })
})
