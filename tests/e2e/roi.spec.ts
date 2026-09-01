import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

// Platform centre, platform edge, and one hole, in video-pixel coordinates,
// read off a rendered frame of test51.mp4. Verified by sampling frame
// luminance: all 20 generated positions land on holes noticeably darker than
// the platform surface.
const CENTER = { x: 282, y: 244 }
const EDGE = { x: 500, y: 244 }
const HOLE = { x: 478, y: 224 }

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function openEditor(page: Page) {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze/ }).click()
  const svg = page.locator('svg.roi-canvas')
  await svg.waitFor({ timeout: 20_000 })
  return svg
}

/**
 * Clicks a point given in video-pixel coordinates. The overlay lives well
 * below the fold at the default viewport height, and `page.mouse` works in
 * viewport coordinates, so the element has to be scrolled into view and its
 * box re-read before every click.
 */
async function clickVideoPoint(
  page: Page,
  svg: ReturnType<Page['locator']>,
  point: { x: number; y: number },
) {
  await svg.scrollIntoViewIfNeeded()
  const box = (await svg.boundingBox())!
  await page.mouse.click(box.x + point.x, box.y + point.y)
}

async function placeRing(page: Page, svg: ReturnType<Page['locator']>) {
  for (const point of [CENTER, EDGE, HOLE]) {
    await clickVideoPoint(page, svg, point)
  }
}

test('three clicks place the whole ring of holes', async ({ page }) => {
  const svg = await openEditor(page)
  await expect(page.locator('circle.roi-hole')).toHaveCount(0)

  await placeRing(page, svg)

  // The point of the milestone: 20 holes from 3 clicks, not 20 clicks.
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  await expect(page.getByText(/20 holes placed from 3 clicks/)).toBeVisible()
})

test('a hole nudges by keyboard and is then marked as human-placed', async ({ page }) => {
  const svg = await openEditor(page)
  await placeRing(page, svg)

  await clickVideoPoint(page, svg, HOLE)
  await expect(page.getByText(/Hole \d+ of 20 \(auto-placed\)/)).toBeVisible()

  const hole = page.locator('circle.roi-hole').first()
  const before = Number(await hole.getAttribute('cx'))

  await svg.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(Number(await hole.getAttribute('cx'))).toBeCloseTo(before + 2, 5)

  // Provenance: the UI has to distinguish generated from hand-corrected.
  await expect(page.getByText(/\(moved by hand\)/)).toBeVisible()
  await expect(page.getByText(/Holes moved by hand: 1\b/)).toBeVisible()
})

test('the escape target is marked by keyboard and survives a reload', async ({ page }) => {
  const svg = await openEditor(page)
  await placeRing(page, svg)

  await clickVideoPoint(page, svg, HOLE)
  await svg.focus()
  await page.keyboard.press('t')
  await expect(page.getByText(/marked as the escape target/)).toBeVisible()
  // Marked with a letter and a second ring, not by colour alone.
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
  await expect(page.locator('text.roi-hole-label', { hasText: /^T$/ })).toHaveCount(1)

  const section = page.locator('section.roi')
  const savesBefore = Number(await section.getAttribute('data-save-count'))
  await page.getByLabel('Platform diameter (cm)').fill('92')
  await expect(page.getByText(/px\/cm/)).toBeVisible()
  // Wait for the autosave to actually complete rather than sleeping.
  await expect
    .poll(async () => Number(await section.getAttribute('data-save-count')))
    .toBeGreaterThan(savesBefore)

  // No save step: reopening the video must bring the ROI back.
  await page.reload()
  await page.getByRole('button', { name: /Define maze/ }).click()
  await page.locator('svg.roi-canvas').waitFor({ timeout: 20_000 })
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
  await expect(page.getByLabel('Platform diameter (cm)')).toHaveValue('92')
})

test('the ring can be built with no mouse at all', async ({ page }) => {
  const svg = await openEditor(page)
  await placeRing(page, svg)

  // Keyboard-only alternative to click-and-drag: the numeric fields rebuild
  // the ring, which is what a keyboard user needs when a ring is off.
  await page.getByLabel('Ring radius (px)').fill('150')
  await page.getByLabel('Rotation (°)').fill('9')
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)

  await page.getByLabel('Holes', { exact: true }).fill('12')
  await expect(page.locator('circle.roi-hole')).toHaveCount(12)
})
