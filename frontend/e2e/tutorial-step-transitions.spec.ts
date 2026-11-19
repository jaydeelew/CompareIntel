import fs from 'node:fs'
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

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

/**
 * Frame log of tooltip placement while a step changes.
 * Opacity > 0.9 frames must not travel or reverse — the spotlight stays hidden
 * until scroll and visualViewport settle, then eases in at the final coordinates.
 */
interface TooltipSample {
  t: number
  opacity: number | null
  top: number | null
  left: number | null
  settling: boolean
  scroll: number
}

interface TransitionReport {
  label: string
  hidden: boolean
  opaqueFrames: number
  topTravel: number
  leftTravel: number
  reversals: number
  samples: TooltipSample[]
}

const mockModel = (
  id: string,
  name: string,
  provider: string,
  tier: 'unregistered' | 'free' | 'paid' = 'unregistered'
) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: tier,
})

const MOCK_MODELS = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
  OpenAI: [mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI')],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function placementWhileOpaque(samples: TooltipSample[]) {
  // Only the frames after the spotlight has faded back in. Earlier opaque frames
  // are the previous step, before it was hidden for the scroll.
  let revealAt = 0
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    if (sample.settling || sample.opacity == null || sample.opacity < 0.2) revealAt = i + 1
  }
  const opaque = samples
    .slice(revealAt)
    .filter(
      (sample): sample is TooltipSample & { top: number; left: number } =>
        sample.opacity != null && sample.opacity > 0.9 && sample.top != null && sample.left != null
    )
  if (opaque.length < 2) {
    return { opaqueFrames: opaque.length, topTravel: 0, leftTravel: 0, reversals: 0 }
  }
  const tops = opaque.map(sample => sample.top)
  const lefts = opaque.map(sample => sample.left)
  let reversals = 0
  let lastSign = 0
  for (let i = 1; i < opaque.length; i++) {
    const dy = opaque[i].top - opaque[i - 1].top
    if (Math.abs(dy) < 1.5) continue
    const sign = dy > 0 ? 1 : -1
    if (lastSign !== 0 && sign !== lastSign) reversals += 1
    lastSign = sign
  }
  return {
    opaqueFrames: opaque.length,
    topTravel: Math.max(...tops) - Math.min(...tops),
    leftTravel: Math.max(...lefts) - Math.min(...lefts),
    reversals,
  }
}

async function watchTransition(
  page: Page,
  label: string,
  action: () => Promise<void>
): Promise<TransitionReport> {
  await page.evaluate(() => {
    const w = window as Window & { __ttSamples?: TooltipSample[]; __ttRaf?: number }
    w.__ttSamples = []
    const tick = () => {
      const tip = document.querySelector(
        '.tutorial-tooltip, .mobile-tutorial-tooltip'
      ) as HTMLElement | null
      const rect = tip?.getBoundingClientRect()
      const opacity = tip ? Number(getComputedStyle(tip).opacity) : null
      w.__ttSamples?.push({
        t: Math.round(performance.now()),
        opacity: Number.isFinite(opacity) ? opacity : null,
        top: rect ? Math.round(rect.top * 10) / 10 : null,
        left: rect ? Math.round(rect.left * 10) / 10 : null,
        settling: document.documentElement.classList.contains('tutorial-spotlight-settling'),
        scroll: Math.round((document.querySelector('.app') as HTMLElement | null)?.scrollTop ?? 0),
      })
      // A 10s actionability wait is ~600 frames. Stopping at 480 kept only the
      // frames from before the step change, so the hide was never recorded.
      if ((w.__ttSamples?.length ?? 0) >= 2400) return
      w.__ttRaf = requestAnimationFrame(tick)
    }
    tick()
  })

  await action()
  await page.waitForTimeout(1200)

  const samples = await page.evaluate(() => {
    const w = window as Window & { __ttSamples?: TooltipSample[]; __ttRaf?: number }
    if (w.__ttRaf) cancelAnimationFrame(w.__ttRaf)
    return w.__ttSamples ?? []
  })

  const placement = placementWhileOpaque(samples)
  const hidden = samples.some(
    sample => sample.settling || sample.opacity == null || sample.opacity < 0.2
  )
  return { label, hidden, ...placement, samples }
}

function assertSettledTransition(report: TransitionReport) {
  expect(report.hidden, `${report.label} should hide the spotlight while scrolling`).toBe(true)
  expect(report.opaqueFrames, `${report.label} should finish visible`).toBeGreaterThan(5)
  expect(report.reversals, `${report.label} tooltip reversed direction while visible`).toBe(0)
  expect(
    report.topTravel,
    `${report.label} tooltip moved ${report.topTravel}px while opaque`
  ).toBeLessThan(8)
  expect(report.leftTravel, `${report.label} tooltip shifted sideways while opaque`).toBeLessThan(8)
}

test.describe('Tutorial step transitions stay settled', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const mobileChromium =
      project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1'
    test.skip(
      project !== 'chromium' && project !== 'Mobile Safari - iPhone 12' && !mobileChromium,
      'Sampled on desktop Chromium and Mobile Safari'
    )
    if (isMobileE2eProject(project)) {
      await page.setViewportSize({ width: 412, height: 915 })
    } else {
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await mockComparisonStream(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('every forward step eases in once on desktop and mobile', async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const reports: TransitionReport[] = []
    const mobile = isMobileE2eProject(testInfo.project.name)
    const [firstId, secondId] = TUTORIAL_MODEL_IDS
    const firstProvider = TUTORIAL_PROVIDERS[0]!
    const secondProvider = TUTORIAL_PROVIDERS[1]!

    reports.push(
      await watchTransition(page, 'welcome-to-1', async () => {
        await page.getByRole('button', { name: 'Start Tutorial' }).click()
        await expect(tutorialTooltip(page).first()).toBeVisible({ timeout: 15000 })
      })
    )
    await dismissMobileBlockers(page)

    reports.push(
      await watchTransition(page, '1-to-2', async () => {
        await expandTutorialProvider(page, firstProvider, testInfo)
      })
    )
    reports.push(
      await watchTransition(page, '2-to-3', async () => {
        await selectTutorialModelCheckbox(page, firstId!, firstProvider, testInfo)
      })
    )
    reports.push(
      await watchTransition(page, '3-to-4', async () => {
        await expandTutorialProvider(page, secondProvider, testInfo)
      })
    )
    reports.push(
      await watchTransition(page, '4-to-5', async () => {
        await selectTutorialModelCheckbox(page, secondId!, secondProvider, testInfo, {
          requireMinSelected: 2,
        })
      })
    )

    if (mobile) {
      reports.push(
        await watchTransition(page, 'keyboard-viewport', async () => {
          await page.setViewportSize({ width: 412, height: 540 })
        })
      )
      await page.setViewportSize({ width: 412, height: 915 })
    }

    reports.push(
      await watchTransition(page, '5-to-6', async () => {
        await completeTutorialPromptInput(page, 'Hello from the transition test.', testInfo)
      })
    )
    reports.push(
      await watchTransition(page, '6-to-7', async () => {
        await runTutorialComparison(page, testInfo, 20_000, 'Hello from the transition test.')
      })
    )
    reports.push(
      await watchTransition(page, '7-to-8', async () => {
        await runTutorialComparison(page, testInfo, 20_000, 'Follow-up for the transition test.')
      })
    )
    reports.push(
      await watchTransition(page, '8-to-9', async () => {
        await clickTutorialDoneButton(page, testInfo)
      })
    )
    reports.push(
      await watchTransition(page, '9-to-10', async () => {
        await page.evaluate(() => {
          const slotted = document.querySelector(
            '[data-after-results-composer-slot] .history-toggle-button'
          ) as HTMLButtonElement | null
          const fallback = document.querySelector(
            '.history-toggle-button'
          ) as HTMLButtonElement | null
          ;(slotted ?? fallback)?.click()
        })
        await clickTutorialDoneButton(page, testInfo)
      })
    )

    const artifactDir = '/opt/cursor/artifacts'
    fs.mkdirSync(artifactDir, { recursive: true })
    const surface = mobile ? 'mobile-412x915' : 'desktop-1440x900'
    const summary = reports.map(({ samples: _samples, ...rest }) => rest)
    fs.writeFileSync(
      path.join(artifactDir, `tutorial-transitions-${surface}.json`),
      JSON.stringify({ surface, browser: testInfo.project.name, summary, reports }, null, 2)
    )

    for (const report of reports) {
      if (report.label === 'keyboard-viewport') {
        expect(report.reversals, 'keyboard resize should not oscillate the tooltip').toBe(0)
        continue
      }
      assertSettledTransition(report)
    }
  })
})
