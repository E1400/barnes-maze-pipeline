import { existsSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function openEditor(page: Page): Promise<Locator> {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
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
  await page.getByLabel('Platform diameter (cm) for this video').fill('92')
  // Previously this only changed one line of small text, which read as doing
  // nothing at all.
  await expect(page.locator('.measures')).toContainText('92.0 cm')
  await expect(page.locator('.measures')).toContainText('Hole ring')
  await expect(page.locator('.roi-scalebar')).toHaveCount(1)
})

test('a global default platform diameter seeds a newly detected layout automatically', async ({ page }) => {
  // Real, reported bug: the per-video field seeds from a ref populated by a
  // separate mount-time effect, racing the auto-detection effect with no
  // ordering guarantee -- on some videos the default hadn't loaded yet when
  // detection ran, silently leaving the diameter (and therefore path length
  // and speed) blank with no explanation. Set the default BEFORE any video
  // is even loaded, the least favourable ordering for the race to lose.
  await page.goto('./')
  await page.getByLabel('Platform diameter (cm)').fill('92')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  const svg = page.locator('svg.roi-canvas')
  await svg.waitFor({ timeout: 30_000 })
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })

  await expect(page.getByLabel('Platform diameter (cm) for this video')).toHaveValue('92')
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
  await page.getByLabel('Platform diameter (cm) for this video').fill('92')
  await expect
    .poll(async () => Number(await section.getAttribute('data-save-count')))
    .toBeGreaterThan(saves)

  await page.reload()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await expect(page.locator('circle.roi-hole')).toHaveCount(20)
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
  await expect(page.getByLabel('Platform diameter (cm) for this video')).toHaveValue('92')
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

test('the displayed frame updates continuously while scrubbing, not only on release', async ({
  page,
}) => {
  await openEditor(page)
  const range = page.getByLabel(/^Frame, 1 to 741$/)
  const readHref = () =>
    page.evaluate(() => document.querySelector('svg.roi-canvas image')!.getAttribute('href'))

  // The scrubber sits below the frame image; at the default test viewport
  // height its bounding box can fall outside the visible page, and mouse
  // coordinates outside the viewport don't hit anything.
  await range.scrollIntoViewIfNeeded()
  const box = (await range.boundingBox())!
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  const seenDuringDrag = new Set<string | null>()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + (box.width * i) / 8, box.y + box.height / 2, { steps: 3 })
    await page.waitForTimeout(60)
    seenDuringDrag.add(await readHref())
  }
  await page.mouse.up()

  // The whole point: several distinct frames must have been drawn while the
  // mouse was still down, not just the one at the end of the drag.
  expect(seenDuringDrag.size).toBeGreaterThan(4)
})

test('a target hole can be set by typing its number, without clicking a hole first', async ({
  page,
}) => {
  await openEditor(page)
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(0)

  await page.getByLabel('Target hole number').fill('12')
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
  const targetLabel = page.locator('text.roi-hole-label', { hasText: /^T$/ })
  await expect(targetLabel).toHaveCount(1)

  // Retypes to a different hole rather than accumulating targets.
  await page.getByLabel('Target hole number').fill('5')
  await expect(page.locator('circle.roi-hole--target-ring')).toHaveCount(1)
})

test('the target hole can still be dragged like any other hole', async ({ page }) => {
  // Regression test: .roi-hole--target and .roi-hole--target-ring were
  // grouped under one CSS rule that set fill: none on both. That's correct
  // for the ring (a hollow outline), but it also stripped the fill from the
  // *main* hole circle -- and SVG only registers pointer events within a
  // shape's painted area, so with no fill only the ~2px stroke at the very
  // edge was clickable. A drag starting at the shape's own centre (exactly
  // where every other hole works) silently missed it and hit the frame
  // image underneath instead.
  const svg = await openEditor(page)
  await page.getByLabel('Target hole number').fill('1')

  const target = page.locator('circle.roi-hole--target')
  const before = { x: await attr(target, 'cx'), y: await attr(target, 'cy') }
  const from = await screenPoint(svg, before)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 25 * from.scale, from.y + 18 * from.scale, { steps: 8 })
  await page.mouse.up()

  // A tight pixel-exact check is flaky here (the test's own screen<->viewBox
  // scale approximation vs. the app's real getScreenCTM conversion can differ
  // by a sub-pixel rounding amount); the bug this guards was "doesn't move at
  // all," so a clear, substantial move in the right direction is what matters.
  expect(await attr(target, 'cx')).toBeGreaterThan(before.x + 15)
  expect(await attr(target, 'cy')).toBeGreaterThan(before.y + 10)
})

test('the displayed frame shows real pixel data, not a blank canvas', async ({ page }) => {
  // Regression test: the auto-detect effect and the display effect both grab
  // frame 0 concurrently when the editor opens. An earlier version of the
  // seek-coalescing logic (added to make scrubbing live) judged which
  // request was "superseded" by call order rather than by frame index, so
  // one of these two concurrent same-frame requests could be skipped before
  // it ever seeked -- its caller then read an untouched canvas and rendered
  // solid black, even though detection (fed by the other request) succeeded
  // with real geometry moments later. A JPEG data URL existing isn't enough
  // to catch this; the pixels themselves have to be checked.
  const svg = await openEditor(page)
  const meanLuminance = await svg.evaluate(async (svgEl) => {
    const img = svgEl.querySelector('image')!
    const bitmap = new Image()
    bitmap.src = img.getAttribute('href')!
    await bitmap.decode()
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.naturalWidth
    canvas.height = bitmap.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    for (let i = 0; i < data.length; i += 4) sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3
    return sum / (data.length / 4)
  })
  expect(meanLuminance).toBeGreaterThan(20)
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
