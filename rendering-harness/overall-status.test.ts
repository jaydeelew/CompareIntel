import { test, expect } from '@playwright/test'
import {
  isTruncatedReply,
  isEmptyVisibleReply,
  isIncompleteReply,
  overallStatus,
  uniqueCoverageRecords,
} from './overall-status.js'

test.describe('Truncation vs renderer loss', () => {
  test('length / max_tokens finish is truncated', () => {
    expect(isTruncatedReply({ finishReason: 'length' })).toBe(true)
    expect(isTruncatedReply({ nativeFinishReason: 'max_tokens' })).toBe(true)
    expect(isTruncatedReply({ nativeFinishReason: 'max_output_tokens' })).toBe(true)
    expect(isTruncatedReply({ truncated: true, finishReason: 'stop' })).toBe(true)
    expect(isTruncatedReply({ finishReason: 'stop', nativeFinishReason: 'end_turn' })).toBe(false)
  })

  test('empty visible reply is incomplete even when finish is length and DOM would be not-covered', () => {
    expect(isEmptyVisibleReply('')).toBe(true)
    expect(isEmptyVisibleReply('   ')).toBe(true)
    expect(isEmptyVisibleReply('$x$')).toBe(false)
    expect(
      isIncompleteReply({
        finishReason: 'length',
        nativeFinishReason: 'max_output_tokens',
        response: '',
      })
    ).toBe(true)
    expect(
      overallStatus({
        truncated: true,
        emptyVisible: true,
        validation: { status: 'not-covered', assertions: [] },
      })
    ).toBe('incomplete')
  })

  test('empty visible is incomplete, not pass and not renderer fail', () => {
    expect(
      overallStatus({
        truncated: true,
        emptyVisible: true,
        validation: { status: 'pass', assertions: [] },
      })
    ).toBe('incomplete')
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

  test('unique coverage keeps original 24 cells and prefers complete reruns', () => {
    const unique = uniqueCoverageRecords([
      {
        modelId: 'anthropic/claude-haiku-5.5',
        promptName: '05-complex-scenarios',
        truncated: true,
        finishReason: 'length',
        timestamp: '2026-11-08T17:44:05.550Z',
      },
      {
        modelId: 'qwen/qwen3-coder-flash',
        promptName: '01-math-basics',
        truncated: false,
        finishReason: 'stop',
        timestamp: '2026-11-08T17:44:13.950Z',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        promptName: '05-complex-scenarios',
        truncated: false,
        finishReason: 'stop',
        timestamp: '2026-11-08T17:53:40.000Z',
      },
    ])
    expect(unique).toHaveLength(2)
    const haiku05 = unique.find(
      r => r.modelId === 'anthropic/claude-haiku-5.5' && r.promptName === '05-complex-scenarios'
    )
    expect(haiku05?.finishReason).toBe('stop')
    expect(haiku05?.truncated).toBe(false)
  })
})
