/**
 * Full-section audit: each previously fixed bug is compared against a
 * CommonMark/GFM + KaTeX reference for the WHOLE affected section.
 */
import fs from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'
import {
  BUG_CASES,
  compareSignatures,
  loadBugSection,
  REPO_ROOT,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
  type CompareResult,
} from '../renderingAudit'

beforeAll(async () => {
  await initializeRegistry()
})

function renderLatex(markdown: string, modelId: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

const reports: Array<{
  bug: number
  id: string
  verdict: 'pass' | 'fail'
  diffs: CompareResult['diffs']
  sectionChars: number
  usedFullDocumentFallback: boolean
}> = []

describe('full-section CommonMark+KaTeX audit', () => {
  it.each(BUG_CASES.map(c => [c.id, c] as const))('%s', (_id, bug) => {
    const { markdown, section } = loadBugSection(bug)
    const usedFullDocumentFallback =
      section.trim() === markdown.trim() && !!bug.startRe && bug.startRe !== '.'
    const body = section
    expect(body.trim().length, `empty section for bug ${bug.bug}`).toBeGreaterThan(5)

    const refHtml = renderReferenceHtml(body)
    const ref = signatureFromHtml(refHtml)
    const el = renderLatex(body, bug.modelId)
    const actual = signatureFromElement(el)
    const result = compareSignatures(ref, actual)
    const sectionDir = path.join(REPO_ROOT, 'rendering-harness/full-section-audit/sections')
    fs.mkdirSync(sectionDir, { recursive: true })
    fs.writeFileSync(path.join(sectionDir, `${bug.id}.md`), body)
    reports.push({
      bug: bug.bug,
      id: bug.id,
      title: bug.title,
      modelId: bug.modelId,
      promptName: bug.promptName,
      verdict: result.pass ? 'pass' : 'fail',
      diffs: result.diffs,
      sectionChars: body.length,
      usedFullDocumentFallback,
    })
    if (!result.pass) {
      expect.fail(
        `${bug.id} full-section diffs:\n${result.diffs
          .map(
            d =>
              `- ${d.field}\n  expected: ${JSON.stringify(d.expected).slice(0, 400)}\n  actual:   ${JSON.stringify(d.actual).slice(0, 400)}`
          )
          .join('\n')}`
      )
    }
  })

  it('writes audit report JSON and markdown table', () => {
    const outDir = path.join(REPO_ROOT, 'rendering-harness/full-section-audit')
    fs.mkdirSync(outDir, { recursive: true })
    const visualPath = path.join(outDir, 'visual.json')
    const visualById = fs.existsSync(visualPath)
      ? Object.fromEntries(
          (JSON.parse(fs.readFileSync(visualPath, 'utf8')) as Array<{ id: string; visualPass: boolean }>).map(
            v => [v.id, v]
          )
        )
      : {}
    const reportsWithVisual = reports.map(r => ({
      ...r,
      visualPass: visualById[r.id]?.visualPass ?? null,
      screenshot: `screenshots/${r.id}.png`,
      sourceExcerpt: `sections/${r.id}.md`,
    }))
    const payload = {
      generatedAt: new Date().toISOString(),
      standard: 'whole affected section vs CommonMark/GFM + KaTeX',
      reports: reportsWithVisual,
    }
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(payload, null, 2) + '\n')
    const lines = [
      '| bug | id | verdict | visual | what differed |',
      '| --- | --- | --- | --- | --- |',
      ...reportsWithVisual.map(r => {
        const diff = r.diffs.length
          ? r.diffs.map(d => d.field).join(', ')
          : 'whole section matches CommonMark/GFM + KaTeX'
        const vis = r.visualPass === true ? 'pass' : r.visualPass === false ? 'fail' : 'n/a'
        return `| ${String(r.bug).padStart(2, '0')} | ${r.id} | ${r.verdict} | ${vis} | ${diff} |`
      }),
    ]
    fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n') + '\n')
    expect(reports).toHaveLength(BUG_CASES.length)
  })
})
