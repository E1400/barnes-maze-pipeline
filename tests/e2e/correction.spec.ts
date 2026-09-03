import { existsSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function trackFixture(page: Page): Promise<Locator> {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/741 frames tracked/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.correction')
  await section.locator('svg.correction-canvas').waitFor({ timeout: 10_000 })
  await section.scrollIntoViewIfNeeded()
  return section
}

async function screenPoint(svg: Locator, viewX: number, viewY: number) {
  const box = (await svg.boundingBox())!
  const viewBoxWidth = await svg.evaluate((el: SVGSVGElement) => el.viewBox.baseVal.width)
  const scale = box.width / viewBoxWidth
  return { x: box.x + viewX * scale, y: box.y + viewY * scale, scale }
}

test('correction viewer is gated until tracking exists', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze/ }).click()
  await expect(page.locator('section.correction')).toContainText(/track the video above first/i)
})

test('expand toggle, click-to-jump, drag-to-correct, and revert', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  const svg = section.locator('svg.correction-canvas')
  const range = section.locator('.scrubber-range')

  // Starts expanded (no point defaulting to a tiny viewer); shrinking and
  // re-expanding both visibly resize it.
  await expect(section.getByRole('button', { name: 'Shrink viewer' })).toBeVisible()
  const expandedWidth = (await svg.boundingBox())!.width
  await section.getByRole('button', { name: 'Shrink viewer' }).click()
  const smallWidth = (await svg.boundingBox())!.width
  expect(smallWidth).toBeLessThan(expandedWidth)
  await section.getByRole('button', { name: 'Expand viewer' }).click()
  expect((await svg.boundingBox())!.width).toBeGreaterThan(smallWidth)

  // Clicking near the plotted path jumps the scrubber to that frame.
  const pathPoint = await svg
    .locator('polyline.tracking-path')
    .evaluate((el: SVGPolylineElement) => {
      const points = el.getAttribute('points')!.split(' ')
      const [x, y] = points[Math.floor(points.length / 2)]!.split(',').map(Number)
      return { x: x!, y: y! }
    })
  const before = await range.inputValue()
  const click = await screenPoint(svg, pathPoint.x, pathPoint.y)
  await page.mouse.click(click.x, click.y)
  await expect(range).not.toHaveValue(before)

  // Dragging the current frame's point registers a manual correction.
  const point = svg.locator('circle.correction-point').first()
  const pointBox = (await point.boundingBox())!
  const from = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 6 })
  await page.mouse.up()

  await expect(section.locator('.correction-toolbar .hint')).not.toHaveText('Corrected frames: none')
  await expect(svg.locator('circle.correction-point--manual')).toHaveCount(2) // centroid + nose

  // Reverting clears it back to the automatic value.
  await section.getByRole('button', { name: 'Revert this frame to automatic' }).click()
  await expect(section.locator('.correction-toolbar .hint')).toHaveText('Corrected frames: none')
  await expect(svg.locator('circle.correction-point--manual')).toHaveCount(0)
})

test('a correction survives a reload', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  const svg = section.locator('svg.correction-canvas')

  const point = svg.locator('circle.correction-point').first()
  await point.waitFor()
  const pointBox = (await point.boundingBox())!
  const from = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y - 25, { steps: 6 })
  await page.mouse.up()
  // Clear of the correction store's 750ms max autosave delay.
  await page.waitForTimeout(1_200)

  const before = await section.locator('.correction-toolbar .hint').innerText()
  expect(before).toBe('Corrected frames: 1')

  await page.reload()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  const reloadedSection = page.locator('section.correction')
  await reloadedSection.locator('svg.correction-canvas').waitFor({ timeout: 20_000 })
  await expect(reloadedSection.locator('.correction-toolbar .hint')).toHaveText(before)
  await expect(reloadedSection.locator('circle.correction-point--manual')).toHaveCount(2)
})

test('a non-TRACKED frame is not draggable and says so', async ({ page }) => {
  test.setTimeout(150_000)
  // test51 tracks 100% here, so it has no LOST frame to exercise this with.
  // test53's own clip opens on a LOST stretch (frames 1-150, measured
  // earlier against this exact fixture) before the trial visibly begins.
  const SECOND_FIXTURE = 'data/barnes-maze/test53.mp4'
  test.skip(!existsSync(SECOND_FIXTURE), `Missing ${SECOND_FIXTURE} — run npm run fetch:samples`)

  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(SECOND_FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/905 frames tracked/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.correction')
  const svg = section.locator('svg.correction-canvas')
  await svg.waitFor({ timeout: 10_000 })
  await section.scrollIntoViewIfNeeded()

  await expect(section).toContainText('Tracking lost')
  await expect(svg.locator('circle.correction-point')).toHaveCount(0)
  await expect(svg.locator('text.correction-state-badge')).toHaveText('Tracking lost')
  await expect(section.locator('.hint').filter({ hasText: /planned but not built yet/ })).toBeVisible()
})
