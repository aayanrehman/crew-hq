export type Limit = { kind: string; pct: number; resetsAt: string | null }

export type Snap = {
  now: number
  tick: number
  costUsd: number | null
  ctxPct: number | null
  ctxTokens: number | null
  ctxWindow: number
  limits: Limit[]
  spark: number[]
  turnStartedAt: number | null
  turnTools: number
  lastTool: string | null
  files: string[]
  totalTools: number
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: { snap: Snap | null }
  }
}
