/**
 * A small, safe arithmetic expression evaluator for the export step's
 * "custom column" builder -- a user can write e.g. `totalErrors /
 * pathLengthCm` and get a derived column without touching Excel formulas.
 *
 * Deliberately not `eval`/`new Function`: this only ever needs +, -, *, /,
 * parentheses, numbers, and named variables, so a tiny hand-written
 * recursive-descent parser covers the whole feature with no arbitrary code
 * execution surface at all, regardless of how low the risk would otherwise
 * be in a single-user, fully client-side tool.
 */

export interface FormulaError {
  readonly error: string
}

type Node =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'unary'; readonly op: '-'; readonly operand: Node }
  | { readonly kind: 'binary'; readonly op: '+' | '-' | '*' | '/'; readonly left: Node; readonly right: Node }

type Token =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'identifier'; readonly name: string }
  | { readonly kind: 'op'; readonly value: '+' | '-' | '*' | '/' | '(' | ')' }

function tokenize(input: string): Token[] | FormulaError {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++
      const text = input.slice(i, j)
      const value = Number(text)
      if (!Number.isFinite(value)) return { error: `Invalid number "${text}"` }
      tokens.push({ kind: 'number', value })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++
      tokens.push({ kind: 'identifier', name: input.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch as '+' | '-' | '*' | '/' | '(' | ')' })
      i++
      continue
    }
    return { error: `Unexpected character "${ch}"` }
  }
  return tokens
}

/** Recursive-descent: expr -> term (('+'|'-') term)*; term -> factor (('*'|'/') factor)*; factor -> '-'factor | number | variable | '(' expr ')'. */
class Parser {
  private pos = 0
  private readonly tokens: readonly Token[]

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private consumeOp(value: '+' | '-' | '*' | '/' | '(' | ')'): boolean {
    const t = this.peek()
    if (t?.kind === 'op' && t.value === value) {
      this.pos++
      return true
    }
    return false
  }

  parseExpression(): Node | FormulaError {
    let left = this.parseTerm()
    if ('error' in left) return left
    for (;;) {
      if (this.consumeOp('+')) {
        const right = this.parseTerm()
        if ('error' in right) return right
        left = { kind: 'binary', op: '+', left, right }
      } else if (this.consumeOp('-')) {
        const right = this.parseTerm()
        if ('error' in right) return right
        left = { kind: 'binary', op: '-', left, right }
      } else {
        break
      }
    }
    return left
  }

  private parseTerm(): Node | FormulaError {
    let left = this.parseFactor()
    if ('error' in left) return left
    for (;;) {
      if (this.consumeOp('*')) {
        const right = this.parseFactor()
        if ('error' in right) return right
        left = { kind: 'binary', op: '*', left, right }
      } else if (this.consumeOp('/')) {
        const right = this.parseFactor()
        if ('error' in right) return right
        left = { kind: 'binary', op: '/', left, right }
      } else {
        break
      }
    }
    return left
  }

  private parseFactor(): Node | FormulaError {
    if (this.consumeOp('-')) {
      const operand = this.parseFactor()
      if ('error' in operand) return operand
      return { kind: 'unary', op: '-', operand }
    }
    if (this.consumeOp('(')) {
      const inner = this.parseExpression()
      if ('error' in inner) return inner
      if (!this.consumeOp(')')) return { error: 'Missing closing parenthesis' }
      return inner
    }
    const t = this.peek()
    if (t?.kind === 'number') {
      this.pos++
      return { kind: 'number', value: t.value }
    }
    if (t?.kind === 'identifier') {
      this.pos++
      return { kind: 'variable', name: t.name }
    }
    return { error: t ? `Unexpected token near "${JSON.stringify(t)}"` : 'Unexpected end of formula' }
  }

  isAtEnd(): boolean {
    return this.pos >= this.tokens.length
  }
}

export function parseFormula(input: string): Node | FormulaError {
  const tokens = tokenize(input)
  if ('error' in tokens) return tokens
  if (tokens.length === 0) return { error: 'Empty formula' }
  const parser = new Parser(tokens)
  const node = parser.parseExpression()
  if ('error' in node) return node
  if (!parser.isAtEnd()) return { error: 'Unexpected trailing input' }
  return node
}

/** Every variable name referenced in a parsed formula, for validating against known measure columns. */
export function formulaVariables(node: Node): string[] {
  switch (node.kind) {
    case 'number':
      return []
    case 'variable':
      return [node.name]
    case 'unary':
      return formulaVariables(node.operand)
    case 'binary':
      return [...formulaVariables(node.left), ...formulaVariables(node.right)]
  }
}

/** Null on division by zero or a missing variable, rather than NaN/Infinity or a thrown error -- consistent with this project's "a missing value is null, not a guess" convention. */
export function evaluateFormula(node: Node, variables: Readonly<Record<string, number | null>>): number | null {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'variable': {
      const value = variables[node.name]
      return value === undefined ? null : value
    }
    case 'unary': {
      const operand = evaluateFormula(node.operand, variables)
      return operand === null ? null : -operand
    }
    case 'binary': {
      const left = evaluateFormula(node.left, variables)
      const right = evaluateFormula(node.right, variables)
      if (left === null || right === null) return null
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return right === 0 ? null : left / right
      }
    }
  }
}
