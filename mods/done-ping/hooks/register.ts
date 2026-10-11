import type { Register } from 'claude-code'

const LONG_TASK_MS = 45_000 // only celebrate turns that took a while

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export const register: Register = on => {
  let startedAt = 0
  let tools = 0
  const files = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ping', description: 'Test the done chime' })
    return next(e)
  })

  on('command.run', { command: 'ping' }, async $ => {
    void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
    $.ui.toast('✓ Done in 2m 14s · 18 tool calls · 4 files changed (test)')
    return { text: 'Played the done chime.' }
  })

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    tools = 0
    files.clear()
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    tools += 1
    if (e.tool === 'Edit' || e.tool === 'Write') files.add(e.file_path)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const took = (await $.clock.now()) - startedAt
    if (startedAt && took >= LONG_TASK_MS) {
      void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
      const changed = files.size ? ` · ${files.size} file${files.size === 1 ? '' : 's'} changed` : ''
      $.ui.toast(`✓ Done in ${fmt(took)} · ${tools} tool call${tools === 1 ? '' : 's'}${changed}`)
    }
    startedAt = 0
    return next(e)
  })
}
