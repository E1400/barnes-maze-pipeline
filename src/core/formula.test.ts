import { describe, expect, it } from 'vitest'
import { evaluateFormula, formulaVariables, parseFormula } from './formula.ts'

function evaluate(text: string, variables: Record<string, number | null> = {}): number | null {
  const node = parseFormula(text)
  if ('error' in node) throw new Error(node.error)
  return evaluateFormula(node, variables)
}

describe('parseFormula / evaluateFormula', () => {
  it('evaluates basic arithmetic with correct precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('(2 + 3) * 4')).toBe(20)
    expect(evaluate('10 - 2 - 3')).toBe(5)
    expect(evaluate('10 / 2 / 5')).toBe(1)
  })

  it('handles unary minus and decimals', () => {
    expect(evaluate('-5 + 3')).toBe(-2)
    expect(evaluate('2.5 * 2')).toBe(5)
  })

  it('substitutes named variables', () => {
    expect(evaluate('totalErrors / pathLengthCm', { totalErrors: 4, pathLengthCm: 200 })).toBe(0.02)
  })

  it('returns null (not NaN or a throw) for division by zero', () => {
    expect(evaluate('1 / x', { x: 0 })).toBeNull()
  })

  it('returns null when a referenced variable is missing or itself null', () => {
    expect(evaluate('a + b', { a: 1 })).toBeNull()
    expect(evaluate('a + b', { a: 1, b: null })).toBeNull()
  })

  it('reports a parse error for malformed input rather than silently guessing', () => {
    expect(parseFormula('2 +')).toHaveProperty('error')
    expect(parseFormula('(2 + 3')).toHaveProperty('error')
    expect(parseFormula('2 3')).toHaveProperty('error')
    expect(parseFormula('')).toHaveProperty('error')
  })

  it('lists every variable referenced, including duplicates', () => {
    const node = parseFormula('a + b * a')
    if ('error' in node) throw new Error(node.error)
    expect(formulaVariables(node)).toEqual(['a', 'b', 'a'])
  })
})
