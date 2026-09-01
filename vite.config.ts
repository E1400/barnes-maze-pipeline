import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/, so assets must be
  // requested from there and not from the domain root.
  base: '/barnes-maze-pipeline/',
  plugins: [react()],
  // Exports have to carry the version of the tool that produced them, so the
  // app reads it from package.json at build time rather than duplicating it.
  define: { __TOOL_VERSION__: JSON.stringify(pkg.version) },
  test: {
    // src/core is pure logic; anything needing a DOM is covered by Playwright.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
