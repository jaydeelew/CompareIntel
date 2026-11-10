import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/** Unified line diff. `diff` exits 1 when the files differ; that is not a failure. */
export function unifiedDiff(before: string, after: string, beforeLabel: string, afterLabel: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-diff-'))
  const beforePath = path.join(dir, 'before.txt')
  const afterPath = path.join(dir, 'after.txt')
  fs.writeFileSync(beforePath, before.endsWith('\n') ? before : `${before}\n`)
  fs.writeFileSync(afterPath, after.endsWith('\n') ? after : `${after}\n`)
  const result = spawnSync('diff', ['-u', beforePath, afterPath], { encoding: 'utf-8' })
  fs.rmSync(dir, { recursive: true, force: true })
  const body = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(body || `diff exited ${result.status}`)
  }
  return body.split(beforePath).join(beforeLabel).split(afterPath).join(afterLabel)
}
