import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURE = 'data/barnes-maze/test51.mp4'

test.skip(!existsSync(FIXTURE), `Missing ${FIXTURE} — run npm run fetch:samples`)

async function trackFixture(page: Page) {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/741 frames tracked/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.measures-panel')
  await section.scrollIntoViewIfNeeded()
  return section
}

test('measures panel is gated until tracking exists', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze/ }).click()
  await expect(page.locator('section.measures-panel')).toContainText(/track the video above first/i)
})

test('computes and displays hole investigations and measures for a tracked video', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.goto('./')
  await page.getByLabel('Choose video files').setInputFiles(FIXTURE)
  await page.getByTestId('video-row').first().waitFor()
  await page.getByRole('button', { name: /Define maze|Review maze/ }).click()
  await page.locator('circle.roi-hole').first().waitFor({ timeout: 30_000 })
  // A hole this trial's animal actually investigates repeatedly, established
  // against the real clip -- see the tracking-panel verification in
  // AI_NOTES.md for how this was picked.
  await page.getByLabel('Target hole number').fill('20')
  await page.getByLabel('Platform diameter (cm)').fill('92')

  await page.getByRole('button', { name: 'Track this video' }).click()
  await page.getByText(/741 frames tracked/).waitFor({ timeout: 120_000 })

  const section = page.locator('section.measures-panel')
  await section.scrollIntoViewIfNeeded()
  await section.locator('.investigation-table').waitFor({ timeout: 10_000 })

  await expect(section).toContainText(/Primary latency \(first reached the target\): \d/)
  await expect(section).toContainText(/Path length: \d/)
  await expect(section.locator('tr.investigation-row--target')).not.toHaveCount(0)
})

test('the investigation threshold is a live, adjustable control, not a buried constant', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await section.locator('.investigation-table, .hint').first().waitFor({ timeout: 10_000 })

  const heading = section.locator('h3')
  const before = await heading.innerText()

  // Widening the proximity radius can only ever find the same or more
  // investigations -- a live recompute, not a cached/stale count.
  await section.getByLabel('Nose must come within (× hole radius)').fill('10')
  await expect(heading).not.toHaveText(before)
})

test('says why latency, errors and path length are unavailable before the maze is fully defined', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const section = await trackFixture(page)
  await expect(section).toContainText(/Mark an escape target/)
  await expect(section).toContainText(/Enter the platform diameter/)
  await expect(section).toContainText('Path length: —')
})
