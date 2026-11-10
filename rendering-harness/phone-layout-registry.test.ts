import { test, expect } from '@playwright/test'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Full-registry phone/dark audit (render-only). Fails with a printed report when
 * any cell has layout issues. Uses pageStateReady inside layout-audit.ts.
 */
test('phone layout audit: 0 failures across unique saved cells', async () => {
  test.setTimeout(60 * 60 * 1000)
  const proc = spawnSync('npm', ['run', 'layout-audit'], {
    cwd: harnessRoot,
    encoding: 'utf-8',
    env: { ...process.env, CI: process.env.CI || 'true' },
    timeout: 55 * 60 * 1000,
  })
  if (proc.status !== 0) {
    throw new Error(
      [`layout-audit exited ${proc.status}`, proc.stdout?.slice(-8000), proc.stderr?.slice(-4000)]
        .filter(Boolean)
        .join('\n')
    )
  }
  expect(proc.stderr || '').not.toMatch(/Phone failures/)
})
