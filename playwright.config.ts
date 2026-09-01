import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

// Must match `base` in vite.config.ts. GitHub Pages serves this project from
// /<repo>/, and the preview server mirrors that. Pointing baseURL at the base
// path (rather than the origin) keeps the tests on the same URL production
// serves: `vite preview` happens to 302 from the origin root to the base path,
// but GitHub Pages does not, so relying on that redirect would test a path
// that only exists locally.
const BASE_PATH = '/barnes-maze-pipeline/'
const BASE_URL = `${ORIGIN}${BASE_PATH}`

// End-to-end smoke coverage runs against the production build, because that
// is what actually ships to GitHub Pages.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
