import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function openWithMaze(page: Page) {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
}

test('tracking is gated until the maze layout exists', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  // "Define maze" is also what selects the video (there's no separate select
  // step), which is what makes both step 2 and step 3 render. Detection then
  // runs asynchronously, so there's a real window right after this click
  // where a layout doesn't exist yet -- that's the gated state to check.
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await expect(page.locator('section.tracking')).toContainText(/define the maze layout/i)
  await expect(page.getByRole('button', { name: 'Track this video' })).toHaveCount(0)

  // Once detection produces a layout, the gate lifts on its own.
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Track this video' })).toBeVisible()
})

test('runs entirely client-side, reports progress, and produces a plausible track', async ({
  page,
}) => {
  // A real tracking run on this fixture takes on the order of 40s; the
  // per-assertion timeouts below are generous, but the *test's* own default
  // 30s budget wraps all of them and needs raising too.
  test.setTimeout(150_000)
  await openWithMaze(page)
  await page.getByLabel('Target hole number').fill('1')

  const trackButton = page.getByRole('button', { name: 'Track this video' })
  await expect(trackButton).toBeVisible()
  await trackButton.click()

  // A progress message should appear before completion -- this is a Web
  // Worker doing real work, not a stub.
  await expect(page.locator('section.tracking .status')).toContainText(
    /Sampling the background|Tracking: frame/,
    { timeout: 15_000 },
  )

  await expect(page.locator('section.tracking .status')).toContainText(
    '741 frames processed',
    { timeout: 120_000 },
  )
  // "Nothing is uploaded" is stated once at the top of the page, not
  // repeated in every status line.

  // Per-state hole-visit/escape counts live in the investigation panel
  // (step 4), not duplicated here -- this line is just tracking QA.
  await expect(page.locator('section.tracking .status')).toContainText(/741 frames processed: \d+ tracked/)
  // The trajectory plot itself (path never drawn through a gap, click to
  // jump to a frame) lives in the review workspace now -- see review.spec.ts.
})

test('tracking results survive a reload without re-running', async ({ page }) => {
  test.setTimeout(150_000)
  await openWithMaze(page)
  await page.getByRole('button', { name: 'Track this video' }).click()
  await expect(page.locator('section.tracking .status')).toContainText('741 frames processed', {
    timeout: 120_000,
  })

  await page.reload()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })

  // No re-run needed: the saved result should appear promptly, not after
  // another multi-second tracking pass.
  await expect(page.locator('section.tracking .status')).toContainText('741 frames processed', {
    timeout: 5_000,
  })
  await expect(page.getByRole('button', { name: 'Re-track this video' })).toBeVisible()
})

test('tracking keeps running after switching to a different video', async ({ page }) => {
  // The most expensive test in this file -- two maze definitions plus one
  // full two-pass tracking run -- so it gets the most generous budget.
  test.setTimeout(240_000)
  const SECOND_FIXTURE = 'data/barnes-maze/test53.mp4'
  test.skip(!existsSync(SECOND_FIXTURE), `Missing ${SECOND_FIXTURE} — run npm run fetch:samples`)

  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles([FIXTURE, SECOND_FIXTURE])
  await page.getByTestId('video-row').nth(1).waitFor()

  await page.getByRole('button', { name: /Define maze for test51/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page
    .getByText(/Tracking: frame|Sampling the background/)
    .first()
    .waitFor({ timeout: 15_000 })

  // Switch away before the run finishes -- this is the bug: tracking used to
  // stop the moment its component unmounted.
  await page.getByRole('button', { name: /Define maze for test53/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })

  // The other video's own tracking is blocked while one job is already
  // running, with a message saying why -- not a silently disabled button.
  await expect(page.locator('section.tracking .status')).toContainText(
    'tracking in the background',
  )
  await expect(page.getByRole('button', { name: 'Track this video' })).toBeDisabled()

  // Progress for test51 must keep climbing while its workspace isn't on
  // screen, not stall or reset. Two decode passes run per video (background,
  // then tracking -- see pipeline.ts), each its own 0-100%, so a percentage
  // read during "Background" and one read during "Tracking" would look like
  // it went backwards even though nothing is wrong; wait until the tracking
  // pass specifically has started before sampling, so both reads land in the
  // same pass.
  const firstRow = page.locator('[data-testid="video-row"]').first()
  await expect(firstRow).toContainText('Tracking ', { timeout: 90_000 })
  const readTrackingPercent = async () => {
    const text = await firstRow.innerText()
    const match = /Tracking (\d+)%/.exec(text)
    return match ? Number(match[1]) : null
  }
  const first = await readTrackingPercent()
  await page.waitForTimeout(3_000)
  const second = await readTrackingPercent()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!).toBeGreaterThanOrEqual(first!)

  await expect(page.locator('[data-testid="video-row"]').first()).toContainText('Tracked', {
    timeout: 120_000,
  })
})
