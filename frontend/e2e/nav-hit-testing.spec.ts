import {
  test,
  expect,
  dismissTutorialOverlay,
  ensureUnfoldedNavbar,
  waitForReactHydration,
} from './fixtures'

type HitProbe = {
  testId: string
  x: number
  y: number
  topTag: string
  topClass: string
  topTestId: string
  inHero: boolean
  inHeader: boolean
}

async function probeNavHitTargets(
  page: import('@playwright/test').Page,
  testIds: string[]
): Promise<HitProbe[]> {
  return page.evaluate(ids => {
    return ids.map(testId => {
      const el = document.querySelector(`[data-testid="${testId}"]`)
      if (!(el instanceof HTMLElement)) {
        return {
          testId,
          x: -1,
          y: -1,
          topTag: '',
          topClass: '',
          topTestId: '',
          inHero: false,
          inHeader: false,
        }
      }
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const top = document.elementFromPoint(x, y)
      return {
        testId,
        x,
        y,
        topTag: top?.tagName ?? '',
        topClass: top instanceof HTMLElement ? top.className : '',
        topTestId: top instanceof HTMLElement ? (top.dataset.testid ?? '') : '',
        inHero: !!top?.closest('.hero-section'),
        inHeader: !!top?.closest('.app-header-shell, .app-header, .navbar'),
      }
    })
  }, testIds)
}

async function openHomeAndRevealNav(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {})
  await waitForReactHydration(page)
  await dismissTutorialOverlay(page)
  await ensureUnfoldedNavbar(page)
}

async function assertNavButtonsAreHitTargets(page: import('@playwright/test').Page) {
  const signUp = page.getByTestId('nav-sign-up-button')
  const signIn = page.getByTestId('nav-sign-in-button')
  await expect(signUp).toBeVisible({ timeout: 20000 })
  await expect(signIn).toBeVisible({ timeout: 20000 })

  await expect(page.locator('.hero-section').first()).toHaveCSS('pointer-events', 'none')

  // Descendants must remain hittable (pointer-events is not inherited).
  const composer = page.getByTestId('comparison-input-textarea')
  await expect(composer).toBeVisible({ timeout: 20000 })
  const composerHit = await composer.evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const top = document.elementFromPoint(
      rect.left + Math.min(24, rect.width / 2),
      rect.top + Math.min(16, rect.height / 2)
    )
    return {
      inComposer: !!(top && (top === el || el.contains(top) || top.closest('.hero-input-section'))),
      className: top instanceof HTMLElement ? top.className : '',
    }
  })
  expect(composerHit.inComposer, `composer not hittable: ${JSON.stringify(composerHit)}`).toBe(true)

  const testIds = ['nav-sign-up-button', 'nav-sign-in-button']
  const themeToggle = page.getByTestId('theme-toggle')
  if (await themeToggle.isVisible().catch(() => false)) {
    testIds.push('theme-toggle')
  }

  const probes = await probeNavHitTargets(page, testIds)

  for (const probe of probes) {
    expect(
      probe.inHero,
      `${probe.testId} is covered by .hero-section at (${probe.x}, ${probe.y}): ${JSON.stringify(probe)}`
    ).toBe(false)
    expect(
      probe.inHeader,
      `${probe.testId} hit target is not in the header: ${JSON.stringify(probe)}`
    ).toBe(true)
  }

  // Real pointer click — no force / DOM-click workaround.
  await signUp.click({ timeout: 10000 })
  await expect(page.getByTestId('auth-modal')).toBeVisible({ timeout: 15000 })
}

test.describe('Navbar hit-testing above the hero', () => {
  test('nav Sign Up / Sign In receive real clicks, not .hero-section', async ({ page }) => {
    test.setTimeout(90000)
    await openHomeAndRevealNav(page)
    await assertNavButtonsAreHitTargets(page)
  })

  test('folded desktop nav: .hero-section does not steal the Sign Up hit target', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90000)
    const projectName = test.info().project.name || ''
    const isMobileProject =
      projectName.includes('Mobile') ||
      projectName.includes('iPhone') ||
      projectName.includes('iPad') ||
      projectName.includes('Pixel') ||
      projectName.includes('Galaxy')
    test.skip(
      browserName !== 'webkit' || isMobileProject,
      'Desktop WebKit fold is the #97 intercept; mobile keeps the bar visible'
    )

    await openHomeAndRevealNav(page)
    // Desktop navbar auto-hides ~5s after skip/load. After fold the hero sits at
    // y=0 while Sign Up still reports a box — that is the CI intercept.
    await page.waitForTimeout(5500)

    const shell = page.locator('.app-header-shell').first()
    await expect(shell).toHaveClass(/app-header-shell--folded/)

    const probes = await probeNavHitTargets(page, ['nav-sign-up-button'])
    expect(
      probes[0].inHero,
      `.hero-section intercepts Sign Up after fold: ${JSON.stringify(probes[0])}`
    ).toBe(false)

    await ensureUnfoldedNavbar(page)
    await assertNavButtonsAreHitTargets(page)
  })

  test('nav Sign Up is clickable at the 1024px hero pull-up breakpoint', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90000)
    const projectName = test.info().project.name || ''
    const isMobileProject =
      projectName.includes('Mobile') ||
      projectName.includes('iPhone') ||
      projectName.includes('iPad') ||
      projectName.includes('Pixel') ||
      projectName.includes('Galaxy')
    test.skip(
      browserName !== 'webkit' || isMobileProject,
      'Desktop WebKit tablet width is the #97 pull-up case'
    )

    await page.setViewportSize({ width: 1024, height: 720 })
    await openHomeAndRevealNav(page)
    await assertNavButtonsAreHitTargets(page)
  })
})
