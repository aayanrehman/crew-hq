import { expect, mock, test } from 'claude-code/testing'

const FILE = '## Now\n- [ ] Signed agreement back @client (due Oct 7)\n- [ ] Write the VSL scripts @claude\n## Done\n- [x] Kickoff @me'
const CONFIG = JSON.stringify({
  owner: 'Sam',
  team: 'a two-person studio',
  projects: [
    { name: 'Client A', file: 'Desktop/client-a/TASKS.md' },
    { name: 'Client B', file: 'Desktop/client-b/TASKS.md' },
  ],
})
const FILES: Record<string, string> = {
  '/h/.claude/crew-hq.json': CONFIG,
  '/h/Desktop/client-a/TASKS.md': FILE,
  '/h/Desktop/client-b/TASKS.md': '- [ ] Launch warm-up @me',
}

test('the pane draws, expands several projects at once, and fits a narrow panel', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  mock.clock(on, { now: new Date(2026, 9, 6, 12).getTime() })
  on('fs.read', ($, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  await $.command.run({ command: 'hq', args: 'refresh', origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 44 } } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'crew-hq',
      surface,
      component: 'Pane',
      requestId: 'hq',
      props: { title: 'HQ', isFocused: false } as never,
      viewport: { columns: 44, rows: 40 },
    })
    expect(await ui.find({ text: /done/ })).toBeDefined()
    expect(await ui.find({ text: /No projects yet/ })).toBeUndefined()
    expect(await ui.find({ text: /Write the VSL scripts/ })).toBeUndefined()

    await ui.press({ key: 'hq-expand-all' })
    expect(await ui.find({ text: /Write the VSL scripts/ })).toBeDefined()
    expect(await ui.find({ text: /Launch warm-up/ })).toBeDefined()
    expect(await ui.find({ key: 'p-client-a-toggle' })).toBeDefined()

    await ui.press({ key: 'p-client-a-toggle' })
    expect(await ui.find({ text: /Write the VSL scripts/ })).toBeUndefined()
    expect(await ui.find({ text: /Launch warm-up/ })).toBeDefined()
    await ui.press({ key: 'hq-collapse-all' })
    await ui.unmount()
  }
})

test('without a config the pane says how to set it up', async ($, on) => {
  mock.env(on, { HOME: '/h' })
  mock.clock(on, { now: new Date(2026, 9, 6, 12).getTime() })
  on('fs.read', () => { throw new Error('ENOENT') })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  await $.command.run({ command: 'hq', args: 'refresh', origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 44 } } as never)
  const ui = await $.ui.mount({
    plugin: 'crew-hq', surface: 'terminal', component: 'Pane', requestId: 'hq',
    props: { title: 'HQ', isFocused: false } as never, viewport: { columns: 44, rows: 40 },
  })
  expect(await ui.find({ text: /No projects yet/ })).toBeDefined()
  await ui.unmount()
})
