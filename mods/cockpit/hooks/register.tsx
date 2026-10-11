import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snap } from '../types'

const PANE = 'cockpit'
const TITLE = 'Cockpit'
const snap = atom({ plugin: 'cockpit', key: 'snap' } as const, null)

const BUCKET_MS = 10_000 // one sparkline bar = 10s of tool calls
const BUCKETS = 18 // 3 minutes of history
const SPEND_ALERTS = [1, 5, 10, 20]
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const BLOCKS = '▁▂▃▄▅▆▇█'

// live counters, folded into the snapshot once a second
let tick = 0
let totalTools = 0
let turnStartedAt: number | null = null
let turnTools = 0
let lastTool: string | null = null
const files: string[] = []
const buckets = new Map<number, number>()
let usage: { costUsd: number | null; ctxPct: number | null; ctxTokens: number | null; ctxWindow: number; limits: Limit[] } = {
  costUsd: null, ctxPct: null, ctxTokens: null, ctxWindow: 0, limits: [],
}
let alerted = 0

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage().catch(() => null)
  if (!u) return
  usage = {
    costUsd: u.cost?.usd ?? null,
    ctxPct: u.context.percent ?? null,
    ctxTokens: u.context.tokens ?? null,
    ctxWindow: u.context.window,
    limits: u.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt ?? null })),
  }
  const cost = usage.costUsd ?? 0
  const crossed = SPEND_ALERTS.filter(a => cost >= a).length
  if (crossed > alerted) {
    alerted = crossed
    $.ui.toast(`💸 This session just passed $${SPEND_ALERTS[crossed - 1]}`)
  }
}

async function tickOnce($: EngineInterface) {
  tick += 1
  const now = await $.clock.now()
  if (tick % 3 === 1) await refreshUsage($)
  const nowBucket = Math.floor(now / BUCKET_MS)
  const spark = Array.from({ length: BUCKETS }, (_, i) => buckets.get(nowBucket - (BUCKETS - 1 - i)) ?? 0)
  for (const k of buckets.keys()) if (k < nowBucket - BUCKETS) buckets.delete(k)
  await update($, snap, () => ({
    now, tick, ...usage, spark, turnStartedAt, turnTools, lastTool, files: files.slice(-4), totalTools,
  }))
  const cost = usage.costUsd === null ? '' : `$${usage.costUsd.toFixed(2)} · `
  const ctx = usage.ctxPct === null ? '' : `ctx ${Math.round(usage.ctxPct)}%`
  $.ui.status(`⚡ ${cost}${ctx}`.trim())
}

const bar = (pct: number, width = 22) => {
  const fill = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(fill) + '░'.repeat(width - fill)
}
const tone = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')
const clock = (ms: number) => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}
const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const sparkline = (values: number[]) => {
  const max = Math.max(1, ...values)
  return values.map(v => (v === 0 ? '·' : BLOCKS[Math.min(7, Math.ceil((v / max) * 7))])).join('')
}
const label = (kind: string) => kind.replace(/[_-]+/g, ' ').toUpperCase().slice(0, 10).padEnd(10)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Live gauges: cost, context, rate limits, tool activity' })
    $.clock.every(1000, () => void tickOnce($))
    void tickOnce($).then(() => $.ui.open({ id: PANE, title: TITLE }))
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async $ => {
    await tickOnce($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Cockpit opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    turnTools = 0
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const b = Math.floor(now / BUCKET_MS)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
    totalTools += 1
    turnTools += 1
    lastTool = e.tool
    if (e.tool === 'Edit' || e.tool === 'Write') {
      const name = e.file_path.split('/').pop() ?? e.file_path
      if (!files.includes(name)) files.push(name)
    }
    return next(e)
  })

  on('turn.complete', (_$, e, next) => {
    turnStartedAt = null
    lastTool = null
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    if (!s) return <Text dimColor>Warming up…</Text>
    const isLive = s.turnStartedAt !== null
    const ctxPct = s.ctxPct ?? 0
    const row = (name: string) => <Text dimColor>{name.padEnd(10)}</Text>

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold color="cyan">COCKPIT</Text>
          <Text color={isLive ? 'green' : 'gray'}>{isLive ? '● LIVE' : '○ idle'}</Text>
          <Text dimColor>{clock(s.now)}</Text>
        </Box>
        <Text> </Text>
        <Box gap={1}>
          {row('COST')}
          <Text bold>{s.costUsd === null ? 'n/a' : `$${s.costUsd.toFixed(2)}`}</Text>
          <Text dimColor>this session</Text>
        </Box>
        <Box gap={1}>
          {row('CONTEXT')}
          <Text color={tone(ctxPct)}>{bar(ctxPct)}</Text>
          <Text>{s.ctxPct === null ? 'n/a' : `${Math.round(ctxPct)}%`}</Text>
          {s.ctxTokens !== null && <Text dimColor>{Math.round(s.ctxTokens / 1000)}k / {Math.round(s.ctxWindow / 1000)}k</Text>}
        </Box>
        {s.limits.map(l => (
          <Box key={`lim-${l.kind}`} gap={1}>
            <Text dimColor>{label(l.kind)}</Text>
            <Text color={tone(l.pct)}>{bar(l.pct)}</Text>
            <Text>{Math.round(l.pct)}%</Text>
            {l.resetsAt && <Text dimColor>resets {l.resetsAt}</Text>}
          </Box>
        ))}
        <Box gap={1}>
          {row('ACTIVITY')}
          <Text color="cyan">{sparkline(s.spark)}</Text>
          <Text dimColor>tool calls · last 3 min</Text>
        </Box>
        <Box gap={1}>
          {row('NOW')}
          {isLive ? (
            <Text color="green">
              {SPIN[s.tick % SPIN.length]} {s.lastTool ?? 'thinking'} · {elapsed(s.now - (s.turnStartedAt ?? s.now))} · {s.turnTools} tools this turn
            </Text>
          ) : (
            <Text dimColor>waiting for your next prompt</Text>
          )}
        </Box>
        <Box gap={1}>
          {row('FILES')}
          <Text>{s.files.length ? s.files.join(', ') : 'none yet'}</Text>
        </Box>
        <Box gap={1}>
          {row('TOTAL')}
          <Text>{s.totalTools} tool calls this session</Text>
        </Box>
      </Box>
    )
  })
}
