import type { Register } from 'claude-code'

import { blockedCommand, blockedPath } from './rules'

export const register: Register = on => {
  let saves = 0

  on('session.start', ($, e, next) => {
    $.ui.status('🛡 seatbelt on')
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const reason = blockedCommand(e.command)
    if (!reason) return next(e)
    saves += 1
    $.ui.toast(`🛡 Seatbelt blocked ${reason}`)
    $.ui.status(`🛡 seatbelt · ${saves} blocked`)
    void $.audio.play({ asset: 'sounds/block.wav' }).catch(() => undefined)
    return { deny: `Seatbelt blocked this (${reason}). If it is really needed, ask the user to run it themselves.` }
  })

  on('tool.call', { tool: 'Edit' }, ($, e, next) => {
    const reason = blockedPath(e.file_path)
    if (!reason) return next(e)
    saves += 1
    $.ui.toast(`🛡 Seatbelt blocked ${reason}`)
    $.ui.status(`🛡 seatbelt · ${saves} blocked`)
    void $.audio.play({ asset: 'sounds/block.wav' }).catch(() => undefined)
    return { deny: `Seatbelt blocked ${reason}. Ask the user to change secrets themselves.` }
  })

  on('tool.call', { tool: 'Write' }, ($, e, next) => {
    const reason = blockedPath(e.file_path)
    if (!reason) return next(e)
    saves += 1
    $.ui.toast(`🛡 Seatbelt blocked ${reason}`)
    $.ui.status(`🛡 seatbelt · ${saves} blocked`)
    void $.audio.play({ asset: 'sounds/block.wav' }).catch(() => undefined)
    return { deny: `Seatbelt blocked ${reason}. Ask the user to change secrets themselves.` }
  })
}
