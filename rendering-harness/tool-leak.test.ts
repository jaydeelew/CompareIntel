import { test, expect } from '@playwright/test'
import { loadUniqueSavedCells } from './saved-cells.js'
import { findToolLeakFormats } from './tool-leak.js'

const JACK_SAMPLE = [
  "I'll look up suppliers of NDS Dura Slope products in your area.",
  '<\uFF5CDSML\uFF5Cfunction_calls>',
  '<\uFF5CDSML\uFF5Cinvoke name="search_web">',
  '<\uFF5CDSML\uFF5Cparameter name="query" string="true">Ferguson plumbing supply',
].join('\n')

test('tool leak detector recognizes DSML and ignores ordinary prose', () => {
  expect(findToolLeakFormats(JACK_SAMPLE)).toContain('deepseek_dsml')
  expect(findToolLeakFormats('a < b and search_web is a tool name')).toEqual([])
  expect(findToolLeakFormats('<tool_call>{"name":"search_web","arguments":{"query":"q"}}</tool_call>')).toEqual(
    expect.arrayContaining(['qwen_hermes_tool_call', 'bare_json'])
  )
})

test('saved rendering replies do not contain tool-call markup', async () => {
  const cells = await loadUniqueSavedCells()
  const hits = cells
    .map(cell => ({
      modelId: cell.modelId,
      promptName: cell.promptName,
      formats: findToolLeakFormats(cell.response),
    }))
    .filter(hit => hit.formats.length > 0)
  expect(hits).toEqual([])
})
