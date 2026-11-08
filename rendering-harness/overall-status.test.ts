import { test, expect } from '@playwright/test'
import { isTruncatedReply, overallStatus } from './overall-status.js'

test.describe('Truncation vs renderer loss', () => {
  test('length / max_tokens finish is truncated', () => {
    expect(isTruncatedReply({ finishReason: 'length' })).toBe(true)
    expect(isTruncatedReply({ nativeFinishReason: 'max_tokens' })).toBe(true)
    expect(isTruncatedReply({ truncated: true, finishReason: 'stop' })).toBe(true)
    expect(isTruncatedReply({ finishReason: 'stop', nativeFinishReason: 'end_turn' })).toBe(false)
  })

  test('truncated + passing DOM is truncated, never comprehensive pass', () => {
    expect(
      overallStatus({
        truncated: true,
        validation: { status: 'pass', assertions: [] },
      })
    ).toBe('truncated')
  })

  test('truncated + KaTeX error is truncated, not renderer fail', () => {
    expect(
      overallStatus({
        truncated: true,
        validation: {
          status: 'fail',
          assertions: [
            {
              pass: false,
              status: 'fail',
              expected: 'no KaTeX errors',
              actual: '1 KaTeX errors',
              message: 'Found 1 KaTeX rendering errors',
            },
          ],
        },
      })
    ).toBe('truncated')
  })

  test('truncated + source feature lost in DOM is still renderer fail', () => {
    expect(
      overallStatus({
        truncated: true,
        validation: {
          status: 'fail',
          assertions: [
            {
              pass: false,
              status: 'fail',
              expected: 'tables present',
              actual: 'no tables',
              message: 'Source included tables but rendered DOM lost it',
            },
          ],
        },
      })
    ).toBe('fail')
  })

  test('complete reply with pass stays pass', () => {
    expect(
      overallStatus({
        truncated: false,
        validation: { status: 'pass', assertions: [] },
      })
    ).toBe('pass')
  })
})
