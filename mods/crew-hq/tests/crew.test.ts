import { expect, mock, test } from 'claude-code/testing'

import { assign, parseHuddle } from '../hooks/crew'
import type { Task } from '../types'

const t = (text: string) => ({ text, owner: 'claude' }) as Task

test('routes real tasks to the right crew member', async () => {
  expect(assign(t('Draft replies for warm leads that went quiet'))).toBe('scout')
  expect(assign(t('Scripts pack: 25 ad scripts + page video scripts'))).toBe('quill')
  expect(assign(t('Landing page (VSL + form) and thank-you page on Vercel'))).toBe('pixel')
  expect(assign(t('Tracking sheet: spend, CPL, cost per show, CAC, ROAS'))).toBe('ledger')
  expect(assign(t('Something nobody claims'))).toBe('atlas')
})

test('parses the huddle into messages and drops junk lines', async () => {
  const msgs = parseHuddle('Atlas → Quill: scripts first.\nnoise\nPixel -> crew: I edit after Quill.', 1)
  expect(msgs.length).toBe(2)
  expect(msgs[0]).toEqual({ id: 'h1-0', from: 'atlas', to: 'quill', text: 'scripts first.', at: 1 })
  expect(msgs[1]?.to).toBe(null)
})

test('the crew pane draws profiles and a huddle fills the chat', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  const clock = mock.clock(on, { now: new Date(2026, 9, 7, 9).getTime() })
  on('fs.read', ($, e) => {
    if (e.path === '/h/.claude/crew-hq.json') return { value: JSON.stringify({ owner: 'Sam', team: 'a studio', projects: [{ name: 'Content', file: 'Content/TASKS.md' }] }) }
    if (e.path === '/h/Content/TASKS.md') return { value: '- [ ] Write the VSL scripts @claude\n- [ ] Edit the 25 webinar ads @claude' }
    throw new Error('ENOENT')
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: 'Atlas → Quill: VSL scripts first.\nQuill → Pixel: Scripts to you by noon.', usage: {} } as never,
  }))
  await $.command.run({ command: 'hq', args: 'refresh', origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 50 } } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'crew-hq',
      surface,
      component: 'Pane',
      requestId: 'crew',
      props: { title: 'Crew', isFocused: false } as never,
      viewport: { columns: 50, rows: 80 },
    })
    expect(await ui.find({ text: /THE CREW/ })).toBeDefined()
    expect(await ui.find({ key: 'bot-pixel-go' })).toBeDefined()
    expect(await ui.find({ key: 'bot-scout-go' })).toBeUndefined()
    const pressed = ui.press({ key: 'crew-huddle' })
    for (let i = 0; i < 4; i++) await clock.advance(1100) // the chat types out one line at a time
    await pressed
    expect(await ui.find({ text: /Scripts to you by noon/ })).toBeDefined()
    await ui.press({ key: 'crew-clear' })
    await ui.unmount()
  }
})

test('a crew agent lights up while it works and reports back to Atlas', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  mock.clock(on, { now: new Date(2026, 9, 7, 9).getTime() })
  on('fs.read', () => { throw new Error('ENOENT') })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))
  const ui = await $.ui.mount({
    plugin: 'crew-hq', surface: 'desktop', component: 'Pane', requestId: 'crew',
    props: { title: 'Crew', isFocused: false } as never, viewport: { columns: 60, rows: 80 },
  })
  await $.agent.spawn({ prompt: 'Write the mods write-up', description: 'Mods write-up', subagentType: 'crew-hq:quill' } as never)
  expect(await ui.find({ text: /● working/ })).toBeDefined()
  expect(await ui.find({ text: /On it: Mods write-up/ })).toBeDefined()
  await $.turn.complete({ agentId: 'a1', answer: 'Drafted it.\nAtlas: write-up saved to posts/mods-guide.md, ready to DM.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'completed' } as never)
  expect(await ui.find({ text: /write-up saved to posts\/mods-guide.md/ })).toBeDefined()
  expect(await ui.find({ text: /1 shipped/ })).toBeDefined()
  expect(await ui.find({ text: /● working/ })).toBeUndefined()
  await ui.unmount()
})
