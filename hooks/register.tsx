import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown } from 'claude-code'

import type { Row, Snapshot } from '../types'

const PANE = 'context'
const TITLE = 'Context'
const COLS = 26
const BAR = 20
const FOOTER_BAR = 15
// short labels so the pane fits a narrow dock
const SHORT: Record<string, string> = {
  'System prompt': 'System', 'System tools': 'Tools', 'Memory files': 'Memory', 'Custom agents': 'Agents',
  'Autocompact buffer': 'Buffer', 'Free space': 'Free', 'MCP tools': 'MCP', 'Slash commands': 'Commands',
}
const short = (name: string) => (SHORT[name] ?? name).slice(0, 9)
const snap = atom({ plugin: 'context-pane', key: 'snap' } as const, null)

// Desktop's popover spelling: 529, 18.6k, 33k, 1M
export const fmt = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n)

// the engine's keys are two greys (promptBorder, inactive) and *_FOR_SUBAGENTS_ONLY keys no plugin can paint,
// so each used category gets its own colour
const PALETTE: Record<string, string> = {
  'System prompt': '#9ca3af', 'System tools': '#60a5fa', 'MCP server instructions': '#34d399',
  'MCP tools': '#2dd4bf', 'Custom agents': '#f472b6', 'Memory files': '#fb923c', 'Skills': '#facc15',
  'Messages': '#c084fc', 'Slash commands': '#22d3ee',
}
// a category the palette does not know gets a hue hashed from its name: the same in every session
const HUES = ['#f87171', '#fbbf24', '#a3e635', '#4ade80', '#22d3ee', '#818cf8', '#e879f9', '#fb7185']
const hashed = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]!
export const colorOf = (name: string, kind: string) => PALETTE[name] ?? (kind === 'used' ? hashed(name) : '#4b5563')

const ORDER: Record<string, number> = { used: 0, buffer: 1, free: 2, deferred: 3 }

export function summarize(b: SessionContextBreakdown, liveTokens?: number): Snapshot {
  const perServer = new Map<string, number>()
  for (const t of b.mcpTools) perServer.set(t.serverName, (perServer.get(t.serverName) ?? 0) + t.tokens)
  const mcp: Row[] = [...perServer]
    .map(([name, tokens]) => ({ name, tokens, kind: 'used', color: 'inactive' }))
    .sort((a, c) => c.tokens - a.tokens)
  // as Desktop: used rows biggest first, then Autocompact buffer, Free space last
  // the breakdown's Messages leaves out tool results (anthropics/claude-code#94436); the live fill counts them,
  // so whatever the live figure has beyond the other used rows is Messages
  const others = b.categories.filter(c => c.kind === 'used' && c.name !== 'Messages').reduce((a, c) => a + c.tokens, 0)
  const rows: Row[] = b.categories
    .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind, color: colorOf(c.name, c.kind) }))
    .map(r => (r.name === 'Messages' && liveTokens ? { ...r, tokens: Math.max(r.tokens, liveTokens - others) } : r))
    .sort((a, c) => (ORDER[a.kind] ?? 0) - (ORDER[c.kind] ?? 0) || c.tokens - a.tokens)
  return { total: b.totalTokens, max: b.rawMaxTokens, percent: b.percentage, rows, mcp }
}

// cells per row summing to exactly `width` (largest remainder); every non-empty used row gets >= 1
export function barCells(rows: Row[], max: number, width: number): number[] {
  const exact = rows.map(r => (r.tokens / max) * width)
  const cells = exact.map((x, i) => (rows[i]!.kind === 'used' && rows[i]!.tokens > 0 ? Math.max(1, Math.floor(x)) : Math.floor(x)))
  let left = width - cells.reduce((a, b) => a + b, 0)
  const byRemainder = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of byRemainder) if (left > 0) { cells[i]!++; left-- }
  // the min-1 bumps can overshoot: take it back from the biggest row (Free space)
  while (left < 0) { const i = cells.indexOf(Math.max(...cells)); cells[i]!--; left++ }
  return cells
}

// the whole window: the used share (live fill, which counts tool results the breakdown misses) split by
// category in proportion, the rest free; a category smaller than a cell shows once the context grows
export function windowBar(used: Row[], percent: number, width: number) {
  const usedCells = percent > 0 ? Math.min(width, Math.max(1, Math.round((percent / 100) * width))) : 0
  const sum = used.reduce((a, r) => a + r.tokens, 0) || 1
  const cells = barCells(used.map(r => ({ ...r, kind: 'part' })), sum, usedCells)
  return { cells, free: width - usedCells }
}

// summary = local estimate, no token-count API calls; refreshed after every turn
async function refresh($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const b = context.breakdown
  if (!b) return
  // live figures as the status line has them; the breakdown undercounts tool results
  const live = { tokens: context.tokens ?? b.totalTokens, window: context.window, percent: context.percent ?? b.percentage }
  await update($, snap, () => ({ ...summarize(b, context.tokens), live }))
}

const HOVER = 'context-details'

// the used-context rows of the pane
function details(Text: any, s: Snapshot) {
  const pct = (n: number) => {
    const p = (n / s.max) * 100
    return `${p >= 10 ? p.toFixed(0) : p.toFixed(1)}%`
  }
  const W = 'white'
  // only what occupies the window: no free space, buffer, deferred tools or MCP
  return s.rows.filter(r => r.kind === 'used').map(r => (
    <Text wrap="truncate-end">
      <Text color={r.color}>■</Text>
      <Text color={W}> {short(r.name).padEnd(9)}{fmt(r.tokens).padStart(6)}</Text>
      <Text color="gray">{pct(r.tokens).padStart(5)}</Text>
    </Text>
  ))
}

// the hover card: the used categories stacked in two columns, so it stays 4 rows tall;
// the band above the prompt cuts a taller tree to its height and an "n more" row
function compact(Box: any, Text: any, s: Snapshot) {
  const pct = (n: number) => {
    const p = (n / s.max) * 100
    return `${p >= 10 ? p.toFixed(0) : p.toFixed(1)}%`
  }
  const used = s.rows.filter(r => r.kind === 'used')
  const half = Math.ceil(used.length / 2)
  const column = (rows: Row[]) => (
    <Box flexDirection="column" marginRight={3}>
      {rows.map(r => (
        <Text wrap="truncate-end">
          <Text color={r.color}>■</Text>
          <Text color="white"> {short(r.name).padEnd(9)}{fmt(r.tokens).padStart(6)}</Text>
          <Text color="gray">{pct(r.tokens).padStart(5)}</Text>
        </Text>
      ))}
    </Box>
  )
  return (
    <Box flexDirection="row" backgroundColor="black" paddingX={1}>
      {column(used.slice(0, half))}
      {column(used.slice(half))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'context-pane', description: 'Open the live context window pane' })
    const ran = await next(e)
    await refresh($)
    return ran
  })

  on('command.run', { command: 'context-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, columns: COLS })
    await refresh($)
    return { text: 'Context window pane opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const ran = await next(e)
    if (e.changed.includes('context')) await refresh($)
    return ran
  })

  // right end of the footer row (beside "bypass permissions"): the modes, then the coloured bar
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await read($, snap)
    if (!s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const inWindow = s.rows.filter(r => r.kind === 'used')
    const { tokens, window, percent } = s.live ?? { tokens: s.total, window: s.max, percent: s.percent }
    const { cells, free } = windowBar(inWindow, percent, FOOTER_BAR)

    // fullscreen: an absolute card floats over the transcript; the main screen clips it to the footer row,
    // so there the hover reveals the AbovePrompt band instead (same hover scope)
    const floats = e.viewport?.isFullscreen === true
    return (
      <Box key="context-bar" flexDirection="row" hover={{ scope: HOVER }}>
        {floats && (
          <Box position="absolute" bottom={1} right={0} display="none"
            hover={{ display: 'flex' }}>
            {compact(Box, Text, s)}
          </Box>
        )}
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}  </Text>}
        <Text>
          {inWindow.map((r, i) => <Text color={r.color}>{'█'.repeat(cells[i]!)}</Text>)}
          <Text color="#4b5563">{'░'.repeat(free)}</Text>
        </Text>
        <Text dimColor> {percent}% {fmt(tokens)}/{fmt(window)}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    if (!s) return <Text dimColor>Waiting for the first measurement…</Text>

    const inWindow = s.rows.filter(r => r.kind === 'used')
    const { cells, free } = windowBar(inWindow, s.live?.percent ?? s.percent, BAR)
    const W = 'white'

    // black like a classic terminal and filling the whole pane; white text so a light theme stays readable
    return (
      <Box flexDirection="column" flexGrow={1} height="100%" backgroundColor="black">
        <Text bold color={W}>{fmt(s.total)}/{fmt(s.max)} {s.percent}%</Text>
        <Text wrap="truncate-end">
          {inWindow.map((r, i) => <Text color={r.color}>{'█'.repeat(cells[i]!)}</Text>)}
          <Text color="#4b5563">{'░'.repeat(free)}</Text>
        </Text>
        {details(Text, s)}
      </Box>
    )
  })

  // the details, hidden above the prompt until the footer bar is hovered
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    if (!s || e.viewport?.isFullscreen === true) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box display="none" hover={{ scope: HOVER, display: 'flex' }}>
          {compact(Box, Text, s)}
        </Box>
      </Box>
    )
  })
}
