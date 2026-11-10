import { test, expect } from '@playwright/test'
import { sectionByHeading, splitHeadingSections } from './section-slice.js'
import { unifiedDiff } from './line-diff.js'

test('heading range runs until the next same-or-higher heading and ignores fences', () => {
  const markdown = [
    '# Title',
    'intro',
    '## Math',
    'body',
    '```',
    '# not a heading',
    '```',
    'tail',
    '## Next',
    'after',
  ].join('\n')
  const sections = splitHeadingSections(markdown)
  expect(sections.map(section => section.text)).toEqual(['Title', 'Math', 'Next'])
  expect(sectionByHeading(markdown, 'Math')).toContain('# not a heading')
  expect(sectionByHeading(markdown, 'Math')).not.toContain('## Next')
  expect(sectionByHeading('no headings here\njust prose\n', 'missing').trim()).toBe('no headings here\njust prose')
})

test('unified diff labels both sides', () => {
  const diff = unifiedDiff('alpha\n', 'beta\n', 'reference.html', 'ours.html')
  expect(diff).toContain('reference.html')
  expect(diff).toContain('ours.html')
  expect(diff).toContain('-alpha')
  expect(diff).toContain('+beta')
})
