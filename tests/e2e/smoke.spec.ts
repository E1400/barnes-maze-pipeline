import { expect, test } from '@playwright/test'

// Milestone 1 smoke test: the built app loads and renders its shell. This
// grows into the full workflow walkthrough (load -> ROI -> track -> correct
// -> export) as those milestones land.
test('app shell loads', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('./')

  await expect(
    page.getByRole('heading', { name: 'Barnes Maze Analysis Pipeline', level: 1 }),
  ).toBeVisible()
  await expect(page).toHaveTitle(/Barnes Maze Analysis Pipeline/)

  // Guards the `base` setting in vite.config.ts. A missing base is invisible
  // locally -- the preview server's SPA fallback serves the page and the
  // assets resolve from the root anyway -- but on GitHub Pages, which serves
  // this project from /barnes-maze-pipeline/, root-relative asset URLs 404
  // and the deployed page renders blank. The asset URL is the only local
  // symptom, so assert on it directly.
  const moduleSrc = await page
    .locator('script[type="module"]')
    .first()
    .getAttribute('src')
  expect(moduleSrc).toContain('/barnes-maze-pipeline/assets/')

  expect(consoleErrors).toEqual([])
})
