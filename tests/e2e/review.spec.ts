import { existsSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function trackFixture(page: Page, options: { calibrate?: boolean } = {}): Promise<Locator> {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  // A hole this trial's animal actually investigates repeatedly, established
  // against the real clip -- see AI_NOTES.md.
  await page.getByLabel('Target hole number').fill('20')
  if (options.calibrate) {
    await page.getByLabel('Platform diameter (cm) for this video').fill('92')
  }
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/741 frames processed/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.review-workspace')
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

test('the workspace is gated with one message, not two, until tracking exists', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze/ }).click()
  await expect(page.locator('section.review-workspace')).toContainText(/define the maze layout/i)

  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await expect(page.locator('section.review-workspace')).toContainText(/track the video above first/i)
})

test('the viewer and the investigation panel render side by side', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await expect(section.locator('.track-viewer')).toBeVisible()
  await expect(section.locator('.investigation-panel')).toBeVisible()
})

test('expand toggle, click-to-jump, drag-to-correct, and revert', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  const svg = section.locator('svg.correction-canvas')
  const range = section.locator('.scrubber-range')

  await expect(section.getByRole('button', { name: 'Shrink viewer' })).toBeVisible()
  const expandedWidth = (await svg.boundingBox())!.width
  await section.getByRole('button', { name: 'Shrink viewer' }).click()
  const smallWidth = (await svg.boundingBox())!.width
  expect(smallWidth).toBeLessThan(expandedWidth)
  await section.getByRole('button', { name: 'Expand viewer' }).click()
  expect((await svg.boundingBox())!.width).toBeGreaterThan(smallWidth)

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

  const point = svg.locator('circle.correction-point').first()
  const pointBox = (await point.boundingBox())!
  const from = { x: pointBox.x + pointBox.width / 2, y: pointBox.y + pointBox.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 6 })
  await page.mouse.up()

  await expect(section.locator('.correction-toolbar .hint')).not.toHaveText('Corrected: none')
  await expect(svg.locator('circle.correction-point--manual')).toHaveCount(2)

  await section.getByRole('button', { name: 'Undo correction on this frame' }).click()
  await expect(section.locator('.correction-toolbar .hint')).toHaveText('Corrected: none')
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
  await page.waitForTimeout(1_200)

  const before = await section.locator('.correction-toolbar .hint').innerText()
  expect(before).toBe('Corrected: 1')

  await page.reload()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  const reloadedSection = page.locator('section.review-workspace')
  await reloadedSection.locator('svg.correction-canvas').waitFor({ timeout: 20_000 })
  await expect(reloadedSection.locator('.correction-toolbar .hint')).toHaveText(before)
  await expect(reloadedSection.locator('circle.correction-point--manual')).toHaveCount(2)
})

test('a non-TRACKED frame is not draggable and says so', async ({ page }) => {
  test.setTimeout(150_000)
  const SECOND_FIXTURE = 'data/barnes-maze/test53.mp4'
  test.skip(!existsSync(SECOND_FIXTURE), `Missing ${SECOND_FIXTURE} — run npm run fetch:samples`)

  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(SECOND_FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/905 frames processed/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.review-workspace')
  const svg = section.locator('svg.correction-canvas')
  await svg.waitFor({ timeout: 10_000 })
  await section.scrollIntoViewIfNeeded()

  await expect(section).toContainText('Mouse not in view')
  await expect(svg.locator('circle.correction-point')).toHaveCount(0)
  await expect(svg.locator('text.correction-state-badge')).toHaveText('Mouse not in view')
  await expect(section.locator('.hint').filter({ hasText: /planned but not built yet/ })).toBeVisible()
})

test('computes and displays hole investigations and measures for a tracked video', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page, { calibrate: true })
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  await expect(section.locator('.stat-card', { hasText: 'To target' })).toContainText(/\d/)
  await expect(section.locator('.stat-card', { hasText: 'Length' })).toContainText(/\d/)
  await expect(section.locator('tr.investigation-row--target')).not.toHaveCount(0)
})

test('the detection criteria are shown and edited in real units, and recompute live', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  const radiusInput = section.locator('.detection-criteria input').first()
  const minTimeInput = section.locator('.detection-criteria input').nth(1)
  // Uncalibrated in this test (no platform diameter entered), so the radius
  // reads in px, not an opaque "x hole radius" multiplier.
  await expect(section.locator('.detection-criteria label').first()).toContainText('px')
  expect(Number(await radiusInput.inputValue())).toBeGreaterThan(0)
  expect(Number(await minTimeInput.inputValue())).toBeGreaterThan(0)

  const heading = section.locator('.investigation-table-header h3')
  const before = await heading.innerText()
  await radiusInput.fill('200')
  await expect(heading).not.toHaveText(before)
})

test('a jump button moves the shared viewer to that investigation', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  const range = section.locator('.scrubber-range')
  const before = await range.inputValue()
  await section.locator('.investigation-table tbody tr').first().getByRole('button', { name: 'Jump' }).click()
  await expect(range).not.toHaveValue(before)
})

test('an investigation can be added by hand, edited, and deleted', async ({ page }) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  const heading = section.locator('.investigation-table-header h3')
  const countOf = async () => Number((await heading.innerText()).match(/\((\d+)\)/)![1])
  const before = await countOf()

  await section.getByRole('button', { name: '+ Add at current frame' }).click()
  expect(await countOf()).toBe(before + 1)

  const manualRow = section.locator('.investigation-table tbody tr').filter({ has: page.locator('input') })
  await expect(manualRow).toHaveCount(1)
  await expect(manualRow).toContainText('added by hand')

  const holeInput = manualRow.locator('input').first()
  await holeInput.fill('5')
  await expect(holeInput).toHaveValue('5')

  await manualRow.getByRole('button', { name: '×' }).click()
  expect(await countOf()).toBe(before)
})

test('an auto-detected investigation can be deleted, and investigation edits survive a reload', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  const heading = section.locator('.investigation-table-header h3')
  const countOf = async () => Number((await heading.innerText()).match(/\((\d+)\)/)![1])
  const before = await countOf()

  await section.locator('.investigation-table tbody tr').first().getByRole('button', { name: '×' }).click()
  expect(await countOf()).toBe(before - 1)
  await page.waitForTimeout(500)

  await page.reload()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  const reloaded = page.locator('section.review-workspace')
  await reloaded.locator('.investigation-table').waitFor({ timeout: 15_000 })
  expect(await countOf()).toBe(before - 1)
})
