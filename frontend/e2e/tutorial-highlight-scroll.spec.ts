import { mkdirSync } from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  clickTutorialDoneButton,
  completeTutorialPromptInput,
  expandTutorialProvider,
  runTutorialComparison,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

const mockModel = (id: string, name: string, provider: string) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: 'unregistered' as const,
})

const fillers = ['Amazon', 'Cohere', 'Google', 'Meta', 'Mistral']
const MOCK_MODELS: Record<string, ReturnType<typeof mockModel>[]> = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
}
for (const name of fillers) {
  MOCK_MODELS[name] = [mockModel(`${name.toLowerCase()}/filler`, `${name} Filler`, name)]
}
MOCK_MODELS.OpenAI = [mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI')]

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    project === 'Mobile Chrome - Pixel 5'
  )
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const root = process.env.TUTORIAL_HIGHLIGHT_SHOTS
  if (!root) return
  const folder = isMobileE2eProject(testInfo.project.name)
    ? testInfo.project.name.includes('Pixel')
      ? 'android'
      : 'iphone'
    : 'desktop'
  const dir = `${root}/${folder}`
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' })
}

/**
 * Scroll the page in a few large jumps with no wait between them. The highlight
 * and tooltip must already match their targets on that same turn and on the
 * next frame. A position:fixed overlay updated from a scroll listener fails
 * the same-turn check.
 */
async function expectHighlightLockedDuringFastScroll(page: Page, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const cutout = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
            )
          ).find(el => {
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity) > 0.8 &&
              rect.width > 2 &&
              rect.height > 2
            )
          })
          return cutout ? 'ready' : 'waiting'
        }),
      { timeout: 12_000, message: `${label} should paint a highlight cutout` }
    )
    .toBe('ready')

  // The processing panel unmounts when the stream ends and the results block
  // jumps. Scroll after that handoff so the check measures scroll lock, not
  // the one-frame gap before ResizeObserver publishes the new box.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const loading = document.querySelector('.loading-section')
          if (loading && loading.getBoundingClientRect().height > 2) return 'loading'
          return 'settled'
        }),
      { timeout: 15_000, message: `${label} should finish the processing panel before the fling` }
    )
    .toBe('settled')

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const cutout = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
            )
          ).find(el => {
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity) > 0.8 &&
              rect.width > 2 &&
              rect.height > 2
            )
          })
          return cutout ? 'ready' : 'waiting'
        }),
      { timeout: 12_000, message: `${label} should paint a highlight cutout after the stream` }
    )
    .toBe('ready')

  const report = await page.evaluate(async () => {
    const box = (el: Element) => fromRect(el.getBoundingClientRect())
    const fromRect = (r: DOMRect) => ({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
      right: r.right,
    })
    const highlightNodes = () =>
      Array.from(
        document.querySelectorAll(
          [
            '.mobile-tutorial-highlight',
            '.tutorial-highlight',
            '.provider-header',
            '.provider-dropdown',
            '.model-option',
            '.composer:not(.composer-placeholder)',
            '.composer-input-wrapper',
            '.results-section',
            '.loading-section',
            '.history-toggle-button',
            '.saved-selections-button',
          ].join(',')
        )
      ).filter(el => {
        const r = el.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })
    // History and save draw one ring around the composer plus the open panel.
    // The panel can stick out of the composer's border box.
    const frameCandidates = () => {
      const nodes = highlightNodes()
      const frames: Array<{ el: HTMLElement; rect: DOMRect; label: string }> = nodes.map(el => ({
        el: el as HTMLElement,
        rect: el.getBoundingClientRect(),
        label: (el as HTMLElement).className.split(/\s+/).slice(0, 3).join('.'),
      }))
      const composer = document.querySelector(
        '.composer.mobile-tutorial-highlight, .composer.tutorial-highlight'
      ) as HTMLElement | null
      const panel = document.querySelector(
        '.saved-selections-dropdown, .history-inline-list'
      ) as HTMLElement | null
      if (composer && panel) {
        const a = composer.getBoundingClientRect()
        const b = panel.getBoundingClientRect()
        if (b.width > 2 && b.height > 2) {
          const top = Math.min(a.top, b.top)
          const left = Math.min(a.left, b.left)
          const right = Math.max(a.right, b.right)
          const bottom = Math.max(a.bottom, b.bottom)
          frames.push({
            el: composer,
            rect: new DOMRect(left, top, right - left, bottom - top),
            label: 'composer+panel',
          })
        }
      }
      return frames
    }
    const cutouts = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
        )
      ).filter(el => {
        const style = getComputedStyle(el)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) < 0.4
        )
          return false
        const r = el.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })
    let lockSeq = 0
    const lockId = (el: HTMLElement) => {
      if (!el.dataset.lockId) el.dataset.lockId = String(++lockSeq)
      return el.dataset.lockId
    }
    const pair = () =>
      cutouts().map(cutout => {
        const c = box(cutout)
        const lockedId = cutout.dataset.lockTarget
        const frames = frameCandidates()
        let frame = lockedId
          ? frames.find(
              item => item.el.dataset.lockId === lockedId && item.label === cutout.dataset.lockLabel
            )
          : undefined
        if (!frame) {
          let best: (typeof frames)[number] | null = null
          let bestErr = Infinity
          for (const candidate of frames) {
            const r = candidate.rect
            const sides = [r.top - c.top, r.left - c.left, c.right - r.right, c.bottom - r.bottom]
            const mean = sides.reduce((sum, side) => sum + side, 0) / sides.length
            const err = Math.max(...sides) - Math.min(...sides) + Math.abs(mean - 8)
            if (err < bestErr) {
              bestErr = err
              best = candidate
            }
          }
          frame = best ?? undefined
          if (frame) {
            cutout.dataset.lockTarget = lockId(frame.el)
            cutout.dataset.lockLabel = frame.label
          }
        }
        const target = frame ? fromRect(frame.rect) : null
        return {
          lock: cutout.dataset.lockTarget ?? '',
          position: getComputedStyle(cutout).position,
          targetClass: frame?.label ?? '',
          cutout: c,
          target,
        }
      })
    const visibleTip = () => {
      const tips = Array.from(
        document.querySelectorAll<HTMLElement>('.mobile-tutorial-tooltip, .tutorial-tooltip')
      )
      const tip = tips.find(el => {
        const style = getComputedStyle(el)
        return (
          style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.9
        )
      })
      if (!tip) return null
      const r = tip.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) return null
      const arrow = tip.querySelector('.tutorial-arrow, .mobile-tutorial-arrow')
      let arrowDir = ''
      if (
        arrow?.classList.contains('mobile-tutorial-arrow-up') ||
        arrow?.classList.contains('tutorial-arrow-bottom')
      ) {
        arrowDir = 'up'
      } else if (
        arrow?.classList.contains('mobile-tutorial-arrow-down') ||
        arrow?.classList.contains('tutorial-arrow-top')
      ) {
        arrowDir = 'down'
      }
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        position: getComputedStyle(tip).position,
        fullscreen: tip.classList.contains('mobile-tutorial-fullscreen-tooltip'),
        arrow: arrowDir,
      }
    }

    const clearLocks = () => {
      document
        .querySelectorAll<HTMLElement>('[data-lock-id], [data-lock-target], [data-lock-label]')
        .forEach(el => {
          delete el.dataset.lockId
          delete el.dataset.lockTarget
          delete el.dataset.lockLabel
        })
    }
    const outsetOf = (item: ReturnType<typeof pair>[number]) => {
      if (!item.target) return null
      const topOut = item.target.top - item.cutout.top
      const leftOut = item.target.left - item.cutout.left
      const rightOut = item.cutout.left + item.cutout.width - (item.target.left + item.target.width)
      const bottomOut =
        item.cutout.top + item.cutout.height - (item.target.top + item.target.height)
      return [topOut, leftOut, rightOut, bottomOut]
    }
    const framesTight = (items: ReturnType<typeof pair>) =>
      items.length > 0 &&
      items.every(item => {
        if (item.position !== 'absolute') return false
        const sides = outsetOf(item)
        if (!sides) return false
        return (
          Math.max(...sides) - Math.min(...sides) <= 2 &&
          sides.every(side => side >= -1 && side <= 20)
        )
      })

    // The history list closes on the click that opens the next step. Give that
    // frame one paint to catch the composer before the fling.
    clearLocks()
    let rest = pair()
    const frameDeadline = performance.now() + 2500
    while (!framesTight(rest) && performance.now() < frameDeadline) {
      clearLocks()
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve())
      })
      rest = pair()
    }
    if (rest.length === 0) return 'no cutout'
    const problems: string[] = []
    for (const item of rest) {
      if (item.position !== 'absolute') problems.push(`cutout position ${item.position}`)
      if (!item.target) {
        problems.push('cutout has no highlight')
        continue
      }
      const sides = outsetOf(item)
      if (!sides) continue
      const [topOut, leftOut, rightOut, bottomOut] = sides
      const uniform = Math.max(...sides) - Math.min(...sides) <= 2
      const outsetOk = sides.every(side => side >= -1 && side <= 20)
      if (!uniform || !outsetOk) {
        const stepName = document.documentElement.dataset.tutorialStep ?? ''
        problems.push(
          `rest outset t${topOut.toFixed(1)} l${leftOut.toFixed(1)} r${rightOut.toFixed(1)} b${bottomOut.toFixed(1)} ${item.targetClass} step ${stepName}`
        )
      }
    }
    const tipRest = visibleTip()
    if (tipRest && !tipRest.fullscreen && tipRest.position !== 'absolute') {
      problems.push(`tooltip position ${tipRest.position}`)
    }

    const app = document.querySelector('.app') as HTMLElement | null
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const scrollRange = (el: HTMLElement | null) =>
      el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0
    // `.app` is the overflow scroller when it clips. Otherwise the document
    // pans the page (and `.app` moves with it). Scroll the one that can move.
    const scroller = scrollRange(app) >= scrollRange(doc) && scrollRange(app) > 1 ? app! : doc
    const start = scroller.scrollTop
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const jumps = [260, 540, -320, 780]
    let moved = 0
    for (const jump of jumps) {
      const before = pair()
      const tipBefore = visibleTip()
      const next = Math.max(0, Math.min(max, scroller.scrollTop + jump))
      if (Math.abs(next - scroller.scrollTop) < 40) continue
      scroller.scrollTop = next
      moved += 1
      const framesTarget = (item: (typeof before)[number]) => {
        if (!item.target) return false
        const topOut = item.target.top - item.cutout.top
        const leftOut = item.target.left - item.cutout.left
        const rightOut =
          item.cutout.left + item.cutout.width - (item.target.left + item.target.width)
        const bottomOut =
          item.cutout.top + item.cutout.height - (item.target.top + item.target.height)
        const sides = [topOut, leftOut, rightOut, bottomOut]
        return (
          Math.max(...sides) - Math.min(...sides) <= 2 &&
          sides.every(side => side >= -1 && side <= 20)
        )
      }
      const check = (after: ReturnType<typeof pair>, when: string) => {
        const afterByLock = new Map(after.map(item => [item.lock, item]))
        for (const prev of before) {
          const item = afterByLock.get(prev.lock)
          if (!item || !item.target || !prev.target) {
            problems.push(`${when} jump ${jump} lost ${prev.targetClass || 'cutout'}`)
            continue
          }
          const dCutTop = item.cutout.top - prev.cutout.top
          const dTgtTop = item.target.top - prev.target.top
          const dCutLeft = item.cutout.left - prev.cutout.left
          const dTgtLeft = item.target.left - prev.target.left
          if (Math.abs(dCutTop - dTgtTop) > 2 || Math.abs(dCutLeft - dTgtLeft) > 2) {
            problems.push(
              `${when} jump ${jump} ${item.targetClass} cutout Δ ${dCutTop.toFixed(1)},${dCutLeft.toFixed(1)} target Δ ${dTgtTop.toFixed(1)},${dTgtLeft.toFixed(1)}`
            )
          }
        }
        for (const item of after) {
          if (before.some(prev => prev.lock === item.lock)) continue
          if (!framesTarget(item)) {
            problems.push(`${when} jump ${jump} new cutout off ${item.targetClass}`)
          }
        }
        const tipAfter = visibleTip()
        if (
          tipBefore &&
          tipAfter &&
          !tipAfter.fullscreen &&
          before[0]?.target &&
          after[0]?.target
        ) {
          const dTip = tipAfter.top - tipBefore.top
          const dTgt = after[0].target.top - before[0].target.top
          // Step 8 moves the card from above the results to just under the
          // panel once the top edge leaves the viewport. That jump is the
          // seat change. Same-side motion still has to match the panel.
          const reviewFlip =
            document.documentElement.dataset.tutorialStep === 'view-follow-up-results' &&
            tipBefore.arrow !== '' &&
            tipAfter.arrow !== tipBefore.arrow
          if (reviewFlip) {
            const results = document.querySelector('.results-section')?.getBoundingClientRect()
            const overlaps = (box: DOMRect | undefined) => {
              if (!box || box.width < 2 || box.height < 2) return false
              const overlapW =
                Math.min(tipAfter.right, box.right) - Math.max(tipAfter.left, box.left)
              const overlapH =
                Math.min(tipAfter.bottom, box.bottom) - Math.max(tipAfter.top, box.top)
              return overlapW > 1 && overlapH > 1
            }
            if (!results) {
              problems.push(`${when} review flip lost the results panel`)
            } else if (overlaps(results)) {
              problems.push(`${when} review flip covers the results`)
            } else if (tipAfter.arrow === 'up') {
              const gap = tipAfter.top - results.bottom
              if (gap < -2 || gap > 28) {
                problems.push(`${when} review flip gap ${gap.toFixed(1)}`)
              }
            } else if (tipAfter.arrow === 'down' && tipAfter.bottom > results.top + 2) {
              problems.push(`${when} review flip arrow down but the card is not above the panel`)
            }
          } else if (Math.abs(dTip - dTgt) > 2) {
            problems.push(`${when} tooltip Δ ${dTip.toFixed(1)} target Δ ${dTgt.toFixed(1)}`)
          }
        }
      }
      check(pair(), 'sync')
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve())
      })
      check(pair(), 'frame')
    }
    scroller.scrollTop = start
    if (moved === 0) problems.push('page did not scroll')
    return problems.length === 0 ? 'ok' : problems.join(' | ')
  })
  expect(report, `${label} highlight should stay on its target`).toBe('ok')
}

test('tutorial highlights stay locked to their targets during fast scroll', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000)
  test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
  const mobile = isMobileE2eProject(testInfo.project.name)
  const width = mobile ? (testInfo.project.name.includes('Pixel') ? 390 : 390) : 1280
  const height = mobile ? 844 : 900

  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('compareintel_tutorial_completed')
    localStorage.removeItem('compareintel_tutorial_progress')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Tutorial' }).click()
  await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
  await dismissMobileBlockers(page)

  await expectHighlightLockedDuringFastScroll(page, 'step 1')
  await shot(page, testInfo, 'step1')

  const first = TUTORIAL_PROVIDERS[0]!
  const second = TUTORIAL_PROVIDERS[1]!
  await expandTutorialProvider(page, first, testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 2')
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 3')
  await expandTutorialProvider(page, second, testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 4')
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
    requireMinSelected: 2,
  })
  await expectHighlightLockedDuringFastScroll(page, 'step 5')
  await completeTutorialPromptInput(page, 'Hello from the highlight scroll test.', testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 6')
  await shot(page, testInfo, 'step6')
  await runTutorialComparison(page, testInfo, 20_000, 'Hello from the highlight scroll test.')
  await expectHighlightLockedDuringFastScroll(page, 'step 7')
  await runTutorialComparison(page, testInfo, 20_000, 'Follow-up for the highlight scroll test.')
  await expectHighlightLockedDuringFastScroll(page, 'step 8')
  await shot(page, testInfo, 'step8')
  await clickTutorialDoneButton(page, testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 9')
  await page.evaluate(() => {
    const slotted = document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) as HTMLButtonElement | null
    const fallback = document.querySelector('.history-toggle-button') as HTMLButtonElement | null
    ;(slotted ?? fallback)?.click()
  })
  await clickTutorialDoneButton(page, testInfo)
  await expectHighlightLockedDuringFastScroll(page, 'step 10')
})
