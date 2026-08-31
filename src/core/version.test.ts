import { describe, expect, it } from 'vitest'
import { TOOL_VERSION, toolIdentifier } from './version.ts'

describe('version stamp', () => {
  it('is injected from package.json at build time', () => {
    // Guards the Vite `define` wiring: without it this is `undefined` at
    // runtime and every export ships an unattributable version.
    expect(TOOL_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('identifies the tool by name and version', () => {
    expect(toolIdentifier()).toBe(`barnes-maze-pipeline ${TOOL_VERSION}`)
  })
})
