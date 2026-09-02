import { existsSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function openEditor(page: Page): Promise<Locator> {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze/ }).click()
  const svg = page.locator('svg.roi-canvas')
  await svg.waitFor({ timeout: 30_000 })
  // Detection runs on open; wait for the ring it produces.
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await svg.scrollIntoViewIfNeeded()
  return svg
}

/**
 * The overlay is laid out beside the controls, so it renders smaller than its
 * viewBox. Pointer coordinates must be scaled or every drag lands in the wrong
 * place — which is exactly what made a working drag look broken in manual testing.
 */
async function screenPoint(svg: Locator, point: { x: number; y: number }) {
  const box = (await svg.boundingBox())!
  const viewBoxWidth = await svg.evaluate((el: SVGSVGElement) => el.viewBox.baseVal.width)
  const scale = box.width / viewBoxWidth
  return { x: box.x + point.x * scale, y: box.y + point.y * scale, scale }
}

async function attr(locator: Locator, name: string): Promise<number> {
  return Number(await locator.getAttribute(name))
}

test('detection places the whole ring with no clicks at all', async ({ page }) => {
  const svg = await openEditor(page)
  expect(svg).toBeTruthy()
  // The point of the change: the user reviews a proposal instead of eyeballing
  // a centre that is not visible in the frame.
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  await expect(page.getByText(/Layout found automatically/)).toBeVisible()
})

test('dragging the centre moves the whole maze with it', async ({ page }) => {
  const svg = await openEditor(page)
  const hole = page.locator('circle.roi-hole').first()
  const beforeX = await attr(hole, 'cx')
  const beforeY = await attr(hole, 'cy')

  const centre = page.locator('circle.roi-center-hit')
  const from = await screenPoint(svg, { x: await attr(centre, 'cx'), y: await attr(centre, 'cy') })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 20 * from.scale, from.y + 12 * from.scale, { steps: 8 })
  await page.mouse.up()

  expect(await attr(hole, 'cx')).toBeCloseTo(beforeX + 20, 0)
  expect(await attr(hole, 'cy')).toBeCloseTo(beforeY + 12, 0)
})

test('dragging the ring handle stretches the ring', async ({ page }) => {
  const svg = await openEditor(page)
  const radiusField = page.getByLabel('Ring radius (px)')
  const before = Number(await radiusField.inputValue())

  const handle = page.locator('circle.roi-handle--ring')
  const from = await screenPoint(svg, { x: await attr(handle, 'cx'), y: await attr(handle, 'cy') })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 25 * from.scale, from.y, { steps: 8 })
  await page.mouse.up()

  expect(Number(await radiusField.inputValue())).toBeGreaterThan(before)
})

test('a hole nudges by keyboard and is marked as human-placed', async ({ page }) => {
  const svg = await openEditor(page)
  const hole = page.locator('circle.roi-hole').first()
  const point = await screenPoint(svg, { x: await attr(hole, 'cx'), y: await attr(hole, 'cy') })
  await page.mouse.click(point.x, point.y)
  await expect(page.getByText(/Hole \d+ of 20 \(auto-placed\)/)).toBeVisible()

  const before = await attr(hole, 'cx')
  await svg.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await attr(hole, 'cx')).toBeCloseTo(before + 2, 5)
  await expect(page.getByText(/\(moved by hand\)/)).toBeVisible()
})

test('calibration reports real-world sizes, not just a ratio', async ({ page }) => {
  await openEditor(page)
  await page.getByLabel('Platform diameter (cm)').fill('92')
  // Previously this only changed one line of small text, which read as doing
  // nothing at all.
  await expect(page.locator('.measures')).toContainText('92.0 cm')
  await expect(page.locator('.measures')).toContainText('Hole ring')
  await expect(page.locator('.roi-scalebar')).toHaveCount(1)
})

test('the layout, target and pins survive a reload', async ({ page }) => {
  const svg = await openEditor(page)
  const hole = page.locator('circle.roi-hole').first()
  const point = await screenPoint(svg, { x: await attr(hole, 'cx'), y: await attr(hole, 'cy') })
  await page.mouse.click(point.x, point.y)
  await svg.focus()
  await page.keyboard.press('t')
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)

  await page.getByRole('button', { name: 'Pin this frame' }).click()
  const section = page.locator('section.roi')
  const saves = Number(await section.getAttribute('data-save-count'))
  await page.getByLabel('Platform diameter (cm)').fill('92')
  await expect
    .poll(async () => Number(await section.getAttribute('data-save-count')))
    .toBeGreaterThan(saves)

  await page.reload()
  await page.getByRole('button', { name: /Define maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
  await expect(page.getByLabel('Platform diameter (cm)')).toHaveValue('92')
  await expect(page.getByRole('button', { name: 'Remove pin' })).toBeVisible()
})

test('the scrubber jumps to an exact frame and pins it', async ({ page }) => {
  await openEditor(page)
  const entry = page.getByLabel('Go to frame')
  await entry.fill('317')
  await entry.press('Enter')
  await expect(page.getByLabel(/^Frame, 1 to 741$/)).toHaveValue('316') // 0-based

  await page.getByRole('button', { name: 'Pin this frame' }).click()
  await expect(page.locator('.scrubber-pin')).toHaveCount(1)
  await entry.fill('1')
  await entry.press('Enter')
  await page.getByRole('button', { name: 'Pin ▶' }).click()
  await expect(page.getByLabel(/^Frame, 1 to 741$/)).toHaveValue('316')
})

test('manual placement is still available as a fallback', async ({ page }) => {
  const svg = await openEditor(page)
  await page.getByRole('button', { name: 'Place by hand' }).click()
  await expect(page.locator('circle.roi-hole')).toHaveCount(0)

  for (const point of [{ x: 282, y: 244 }, { x: 500, y: 244 }, { x: 478, y: 224 }]) {
    const screen = await screenPoint(svg, point)
    await page.mouse.click(screen.x, screen.y)
  }
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  // Both the status line and the sidebar hint say "placed by hand" -- that's
  // real UI, not a test bug, so scope to the sidebar rather than loosen the
  // match and risk it passing for the wrong element.
  await expect(page.locator('.roi-controls .hint').first()).toHaveText('Layout placed by hand.')
})
