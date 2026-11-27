import fs from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  expandTutorialProvider,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

/**
 * Computed paint of the tutorial target, its provider wrapper, and the cutout
 * that draws the single blue frame.
 */
interface FramePaint {
  step: string | null
  targetKind: 'model-option' | 'provider-dropdown' | 'other'
  target: BoxPaint
  wrapperHighlighted: boolean
  wrapperIsTarget: boolean
  wrapper: BoxPaint | null
  siblingBorderColor: string | null
  cutout: { boxShadow: string; borderRadius: string } | null
}

interface BoxPaint {
  boxShadow: string
  outlineStyle: string
  outlineWidth: string
  borderTopWidth: string
  borderTopStyle: string
  borderTopColor: string
  borderRadius: string
}

const mockModel = (id: string, name: string, provider: string) => ({
  id,
  name,
  description: `${name} is a test model for the tutorial ring.`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: 'unregistered' as const,
})

/** Extra rows in each provider so desktop frames the model, not the whole card. */
const MOCK_MODELS = {
  Anthropic: [
    mockModel('anthropic/claude-haiku-5.5', 'Claude Haiku 5.5', 'Anthropic'),
    mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic'),
  ],
  OpenAI: [
    mockModel('openai/gpt-5-nano', 'GPT-5 Nano', 'OpenAI'),
    mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI'),
  ],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function px(value: string): number {
  return Math.round(Number.parseFloat(value))
}

async function readFrame(page: Page): Promise<FramePaint> {
  return page.evaluate(() => {
    const paint = (el: Element): BoxPaint => {
      const cs = window.getComputedStyle(el)
      return {
        boxShadow: cs.boxShadow,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        borderTopColor: cs.borderTopColor,
        borderRadius: cs.borderTopLeftRadius,
      }
    }
    const highlighted = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-highlight, .mobile-tutorial-highlight')
    )
    const row = highlighted.find(el => el.classList.contains('model-option'))
    const provider = highlighted.find(el => el.classList.contains('provider-dropdown'))
    const target = row ?? provider ?? highlighted[0]
    if (!target) {
      return {
        step: document.documentElement.getAttribute('data-tutorial-step'),
        targetKind: 'other',
        target: {
          boxShadow: '',
          outlineStyle: '',
          outlineWidth: '',
          borderTopWidth: '',
          borderTopStyle: '',
          borderTopColor: '',
          borderRadius: '',
        },
        wrapperHighlighted: false,
        wrapperIsTarget: false,
        wrapper: null,
        siblingBorderColor: null,
        cutout: null,
      }
    }
    const wrapper = target.closest('.provider-dropdown')
    const sibling = target.classList.contains('model-option')
      ? (Array.from(target.parentElement?.querySelectorAll('.model-option') ?? []).find(
          el => el !== target
        ) ?? null)
      : null
    const cutout = document.querySelector<HTMLElement>(
      '.tutorial-backdrop-cutout, .mobile-tutorial-backdrop-cutout'
    )
    const cutoutStyle = cutout ? window.getComputedStyle(cutout) : null
    const targetKind = target.classList.contains('model-option')
      ? 'model-option'
      : target.classList.contains('provider-dropdown')
        ? 'provider-dropdown'
        : 'other'
    return {
      step: document.documentElement.getAttribute('data-tutorial-step'),
      targetKind,
      target: paint(target),
      wrapperHighlighted: Boolean(
        wrapper &&
        wrapper !== target &&
        (wrapper.classList.contains('tutorial-highlight') ||
          wrapper.classList.contains('mobile-tutorial-highlight'))
      ),
      wrapperIsTarget: wrapper === target,
      wrapper: wrapper && wrapper !== target ? paint(wrapper) : null,
      siblingBorderColor: sibling ? window.getComputedStyle(sibling).borderTopColor : null,
      cutout: cutoutStyle
        ? {
            boxShadow: cutoutStyle.boxShadow,
            borderRadius: cutoutStyle.borderTopLeftRadius,
          }
        : null,
    }
  })
}

async function waitForStepFrame(page: Page, step: string): Promise<FramePaint> {
  let latest: FramePaint | null = null
  await expect
    .poll(
      async () => {
        latest = await readFrame(page)
        if (latest.step !== step || !latest.cutout || !latest.target.borderTopWidth) return false
        return latest.cutout.boxShadow.includes('inset')
      },
      { timeout: 20_000, message: `tutorial frame for ${step}` }
    )
    .toBe(true)
  return latest!
}

function assertSameSingleBorder(expand: FramePaint, select: FramePaint, label: string): void {
  expect(expand.cutout, `${label} expand cutout`).toBeTruthy()
  expect(select.cutout, `${label} select cutout`).toBeTruthy()
  expect(select.cutout!.boxShadow, `${label} cutout glow`).toBe(expand.cutout!.boxShadow)
  expect(select.target.boxShadow, `${label} target shadow`).toBe(expand.target.boxShadow)
  expect(select.target.outlineStyle, `${label} outline`).toBe(expand.target.outlineStyle)
  expect(select.target.outlineStyle, `${label} outline style`).toBe('none')
  expect(select.target.borderTopWidth, `${label} border width`).toBe(expand.target.borderTopWidth)
  expect(select.target.borderTopStyle, `${label} border style`).toBe(expand.target.borderTopStyle)
  expect(select.target.borderTopColor, `${label} border color`).toBe(expand.target.borderTopColor)
  expect(select.target.boxShadow, `${label} must not paint a second spread ring`).not.toMatch(
    /0px 0px 0px [1-9]/
  )
  expect(expand.target.boxShadow, `${label} expand shadow`).not.toMatch(/0px 0px 0px [1-9]/)

  const expandRadius = px(expand.target.borderRadius)
  const selectRadius = px(select.target.borderRadius)
  expect(px(expand.cutout!.borderRadius), `${label} expand ring radius`).toBe(expandRadius + 8)
  expect(px(select.cutout!.borderRadius), `${label} select ring radius`).toBe(selectRadius + 8)

  if (!select.wrapperIsTarget) {
    expect(select.wrapperHighlighted, `${label} wrapper highlight`).toBe(false)
    expect(select.wrapper?.boxShadow ?? '', `${label} wrapper shadow`).not.toMatch(
      /0px 0px 0px [1-9]/
    )
  }
  if (select.siblingBorderColor) {
    expect(select.siblingBorderColor, `${label} untouched row`).not.toBe(
      select.target.borderTopColor
    )
  }
}

function shotName(project: string): string {
  if (project === 'chromium') return 'desktop'
  if (project.includes('Pixel')) return 'pixel'
  if (project.includes('iPhone')) return 'iphone'
  return ''
}

async function shoot(page: Page, project: string, step: string): Promise<void> {
  const surface = shotName(project)
  if (!surface) return
  const phase = process.env.RING_SHOT === 'before' ? 'before' : 'after'
  const dir = `/opt/cursor/artifacts/tutorial-model-ring/${phase}`
  fs.mkdirSync(dir, { recursive: true })
  const box = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      '.tutorial-backdrop-cutout, .mobile-tutorial-backdrop-cutout'
    )
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const pad = 28
    return {
      x: Math.max(0, rect.x - pad),
      y: Math.max(0, rect.y - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    }
  })
  const viewport = page.viewportSize()
  const clip =
    box && viewport
      ? {
          x: box.x,
          y: box.y,
          width: Math.min(box.width, viewport.width - box.x),
          height: Math.min(box.height, viewport.height - box.y),
        }
      : undefined
  await page.screenshot({
    path: `${dir}/${surface}-${step}.png`,
    clip: clip && clip.width > 20 && clip.height > 20 ? clip : undefined,
  })
}

test.describe('Tutorial model-row ring matches provider steps', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('select steps use the same single border as expand steps', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const project = testInfo.project.name
    if (project === 'Mobile Chrome - Pixel 5') {
      await page.setViewportSize({ width: 393, height: 851 })
    }

    const [firstId, secondId] = TUTORIAL_MODEL_IDS
    const [firstProvider, secondProvider] = TUTORIAL_PROVIDERS
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstProvider).not.toBe(secondProvider)

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(tutorialTooltip(page).first()).toBeVisible({ timeout: 15000 })
    await dismissMobileBlockers(page)

    const expandFirst = await waitForStepFrame(page, 'expand-provider')
    await shoot(page, project, 'step1')

    await expandTutorialProvider(page, firstProvider!, testInfo)
    await page.mouse.move(2, 2)
    const selectFirst = await waitForStepFrame(page, 'select-starter-model-1')
    await shoot(page, project, 'step2')

    await selectTutorialModelCheckbox(page, firstId!, firstProvider!, testInfo, {
      afterSelectPartnerModelId: secondId,
    })
    const expandSecond = await waitForStepFrame(page, 'expand-starter-provider-2')
    await shoot(page, project, 'step3')

    await expandTutorialProvider(page, secondProvider!, testInfo)
    await page.mouse.move(2, 2)
    const selectSecond = await waitForStepFrame(page, 'select-starter-model-2')
    await shoot(page, project, 'step4')

    expect(expandFirst.targetKind).toBe('provider-dropdown')
    expect(expandSecond.targetKind).toBe('provider-dropdown')
    if (!isMobileE2eProject(project)) {
      expect(selectFirst.targetKind).toBe('model-option')
      expect(selectSecond.targetKind).toBe('model-option')
    }
    assertSameSingleBorder(expandFirst, selectFirst, 'step 2')
    assertSameSingleBorder(expandFirst, expandSecond, 'step 3')
    assertSameSingleBorder(expandSecond, selectSecond, 'step 4')
  })
})
