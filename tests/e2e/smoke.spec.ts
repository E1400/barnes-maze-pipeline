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

  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Barnes Maze Analysis Pipeline', level: 1 }),
  ).toBeVisible()
  await expect(page).toHaveTitle(/Barnes Maze Analysis Pipeline/)
  expect(consoleErrors).toEqual([])
})
