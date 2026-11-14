import type { Page, Locator } from '@playwright/test'

import {
  loadHarnessResponse,
  openHarnessWithContent,
  waitForHarnessRender,
} from './harnessKatexOverflow'

export const WIDE_CODE_MARKDOWN = `# Wide code\n\n\`\`\`javascript\nconst marker = ${'"x"'.repeat(120)};\nconsole.log(marker + ${'"y"'.repeat(120)});\n\`\`\`\n\n${'Filler line for vertical scroll.\n'.repeat(40)}`

export function isMobileTouchScrollProject(projectName: string): boolean {
  return projectName.startsWith('Mobile Chrome') || projectName.startsWith('Mobile Safari')
}

export function isMobileChromeProject(projectName: string): boolean {
  return projectName.startsWith('Mobile Chrome')
}

/** Mirror tabbed multi-model results so production touch-action rules apply. */
export async function applyTabbedResultsHarnessContext(page: Page): Promise<void> {
  await waitForHarnessRender(page)
  await page.evaluate(() => {
    // Ancestor wrapper only: adding tabbed to `.results-section` hides `.results-grid` in production CSS.
    const blocks = document.querySelectorAll(
      '.code-block-direct, .katex-display, .markdown-table-scroll'
    )
    blocks.forEach(node => {
      const parent = node.parentElement
      if (!parent || parent.classList.contains('results-section-tabbed')) return
      const shell = document.createElement('div')
      shell.className = 'results-section-tabbed'
      shell.dataset.harnessTabbedShell = 'true'
      parent.insertBefore(shell, node)
      shell.appendChild(node)
    })
    document.documentElement.style.scrollBehavior = 'auto'
    document.documentElement.style.height = 'auto'
    document.body.style.minHeight = '240vh'
    const tail = document.createElement('div')
    tail.setAttribute('data-testid', 'harness-scroll-pad-tail')
    tail.style.cssText = 'height: 120vh; width: 100%;'
    document.body.append(tail)
  })
}

const HORIZ_SCROLLABLE_SELECTOR =
  '.code-block-direct, .message-content .latex-content .code-block, .message-content .latex-content pre'

export async function findWidestHorizScrollable(
  page: Page,
  selector: string = HORIZ_SCROLLABLE_SELECTOR
): Promise<{ locator: Locator; scrollRange: number } | null> {
  const index = await page.evaluate(sel => {
    const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
    let best = -1
    let bestRange = 0
    for (let i = 0; i < nodes.length; i++) {
      const range = nodes[i].scrollWidth - nodes[i].clientWidth
      if (range > bestRange + 4) {
        bestRange = range
        best = i
      }
    }
    return bestRange > 8 ? best : -1
  }, selector)

  if (index < 0) return null
  const locator = page.locator(selector).nth(index)
  const scrollRange = await locator.evaluate(el => el.scrollWidth - el.clientWidth)
  return { locator, scrollRange }
}

async function touchSwipeViaCdp(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number
): Promise<void> {
  const session = await page.context().newCDPSession(page)
  const points = Array.from({ length: steps + 1 }, (_, i) => ({
    x: fromX + ((toX - fromX) * i) / steps,
    y: fromY + ((toY - fromY) * i) / steps,
  }))

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: points[0].x, y: points[0].y }],
  })

  for (let i = 1; i < points.length; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: points[i].x, y: points[i].y }],
    })
  }

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
}

/** CDP touch drag (Mobile Chrome emulation only — WebKit has no CDP and mouse drag does not scroll). */
export async function touchSwipe(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 14
): Promise<void> {
  await touchSwipeViaCdp(page, fromX, fromY, toX, toY, steps)
}

export async function openHarnessWideCode(
  page: Page,
  harnessBase: string,
  modelId = 'anthropic/claude-sonnet-4.6'
): Promise<void> {
  await openHarnessWithContent(page, harnessBase, modelId, WIDE_CODE_MARKDOWN)
  await applyTabbedResultsHarnessContext(page)
  await page.addStyleTag({
    content: `
      .code-block code,
      .code-block pre {
        white-space: pre !important;
      }
    `,
  })
}

export async function openHarnessSavedFixture(
  page: Page,
  harnessBase: string,
  jsonRelPath: string
): Promise<void> {
  const { modelId, content } = loadHarnessResponse(jsonRelPath)
  await openHarnessWithContent(page, harnessBase, modelId, content)
  await applyTabbedResultsHarnessContext(page)
}

export async function assertTouchActionAllowsVerticalPan(locator: Locator): Promise<void> {
  const touchAction = await locator.evaluate(el => getComputedStyle(el).touchAction)
  const tokens = touchAction.split(/\s+/).filter(Boolean)
  const allowsVertical =
    touchAction === 'auto' || touchAction === 'manipulation' || tokens.includes('pan-y')
  const panXOnly = tokens.includes('pan-x') && !tokens.includes('pan-y')
  if (!allowsVertical || panXOnly) {
    throw new Error(`touch-action blocks vertical page scroll: "${touchAction}"`)
  }
}
