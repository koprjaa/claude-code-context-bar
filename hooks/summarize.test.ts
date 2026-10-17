import { expect, test } from 'claude-code/testing'

import { barCells, colorOf, fmt, summarize, windowBar } from './register'

const cat = (name: string, tokens: number, kind: string) => ({ name, tokens, color: 'x', isDeferred: kind === 'deferred', kind })

test('rows in Desktop order, MCP summed per server', () => {
  const s = summarize({
    categories: [cat('Free space', 900, 'free'), cat('Skills', 40, 'used'), cat('Autocompact buffer', 30, 'buffer'), cat('System tools', 180, 'used')],
    totalTokens: 250, maxTokens: 1000, rawMaxTokens: 1000, percentage: 25,
    mcpTools: [
      { name: 'a', serverName: 'github', tokens: 100, isLoaded: false },
      { name: 'b', serverName: 'comfyui', tokens: 500, isLoaded: false },
      { name: 'c', serverName: 'github', tokens: 50, isLoaded: true },
    ],
  } as never)
  expect(s.rows.map(r => r.name)).toEqual(['System tools', 'Skills', 'Autocompact buffer', 'Free space'])
  expect(s.mcp.map(r => [r.name, r.tokens])).toEqual([['comfyui', 500], ['github', 150]])
})

test('token spelling matches Desktop', () => {
  expect([529, 18600, 33000, 904600, 1e6].map(fmt)).toEqual(['529', '18.6k', '33k', '904.6k', '1M'])
})

test('bar is exactly the width, tiny rows still visible', () => {
  const r = (tokens: number, kind: string) => ({ name: 'x', tokens, kind, color: 'x' })
  const rows = [r(18600, 'used'), r(529, 'used'), r(33000, 'buffer'), r(947871, 'free')]
  for (const w of [10, 37, 40]) {
    const c = barCells(rows, 1e6, w)
    expect(c.reduce((a, b) => a + b, 0)).toBe(w)
    expect(c[1]).toBeGreaterThan(0)
  }
})

test('used categories get distinct paintable colours', () => {
  const names = ['System prompt', 'System tools', 'MCP server instructions', 'Custom agents', 'Memory files', 'Skills', 'Messages']
  const colours = names.map(n => colorOf(n, 'used'))
  expect(new Set(colours).size).toBe(names.length)
  for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/)
})

test('bar over used tokens follows real proportions', () => {
  const r = (tokens: number) => ({ name: 'x', tokens, kind: 'used', color: 'x' })
  // live numbers from this machine: messages 17.3k dominate, memory 1.7k is small
  const rows = [r(4192), r(9012), r(5065), r(2054), r(1665), r(7196), r(17286)]
  const c = barCells(rows, rows.reduce((a, x) => a + x.tokens, 0), 16)
  expect(c.reduce((a, b) => a + b, 0)).toBe(16)
  expect(c[6]).toBeGreaterThanOrEqual(5)
  expect(Math.min(...c)).toBeGreaterThan(0)
})

test('window bar: used share from the live fill, split by category, rest free', () => {
  const r = (tokens: number) => ({ name: 'x', tokens, kind: 'used', color: 'x' })
  const rows = [r(17286), r(9012), r(1665)]
  const a = windowBar(rows, 5, 30)
  expect(a.cells.reduce((x, y) => x + y, 0) + a.free).toBe(30)
  expect(a.free).toBe(28)
  expect(a.cells[0]).toBeGreaterThanOrEqual(1)
  const b = windowBar(rows, 50, 30)
  expect(b.free).toBe(15)
  expect(b.cells[0]).toBeGreaterThan(b.cells[1]!)
  expect(windowBar(rows, 0, 30).free).toBe(30)
})

test('Messages takes the tool results the breakdown misses', () => {
  const cat = (name: string, tokens: number, kind = 'used') => ({ name, tokens, color: 'x', isDeferred: false, kind })
  const b = { categories: [cat('Messages', 17000), cat('System tools', 9000), cat('Skills', 7000)], totalTokens: 33000,
    maxTokens: 1e6, rawMaxTokens: 1e6, percentage: 3, mcpTools: [] } as never
  const s = summarize(b, 170000)
  expect(s.rows[0]).toMatchObject({ name: 'Messages', tokens: 154000 })
  expect(summarize(b).rows[0]!.tokens).toBe(17000)
})

test('an unknown category always gets the same colour', () => {
  expect(colorOf('Plugin hooks', 'used')).toBe(colorOf('Plugin hooks', 'used'))
  expect(colorOf('Plugin hooks', 'used')).toMatch(/^#[0-9a-f]{6}$/)
  expect(colorOf('Messages', 'used')).toBe('#c084fc')
})
