import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BotId, BotLive, CrewConfig, Project, Task } from '../types'
import { activity, agentPrompt, assign, bot, BOTS, huddlePrompt, parseHuddle, queues, type Bot, type Queued } from './crew'
import { mascot } from './mascots'
import { bar, brief, counts, dueState, parseTasks, toggleLine, upNext } from './tasks'

const PLUGIN = 'crew-hq'
const AGENT_PREFIX = `${PLUGIN}:`
const CONFIG_FILE = '.claude/crew-hq.json' // relative to $HOME; the setup skill writes it
const PANE = 'hq'
const TITLE = 'HQ'
const projects = atom({ plugin: 'crew-hq', key: 'projects' } as const, [])
const config = atom({ plugin: 'crew-hq', key: 'config' } as const, null)
const openIds = atom({ plugin: 'crew-hq', key: 'openIds' } as const, [])
const isBandHidden = atom({ plugin: 'crew-hq', key: 'isBandHidden' } as const, false)

const CREW = 'crew'
const CREW_TITLE = 'Crew'
const IDLE: BotLive = { status: 'idle', doing: null, shipped: 0 }
const chat = atom({ plugin: 'crew-hq', key: 'chat' } as const, [])
const live = atom({ plugin: 'crew-hq', key: 'live' } as const, { atlas: IDLE, scout: IDLE, quill: IDLE, pixel: IDLE, ledger: IDLE })
const runs = atom({ plugin: 'crew-hq', key: 'runs' } as const, {})
const isHuddling = atom({ plugin: 'crew-hq', key: 'isHuddling' } as const, false)

async function say($: EngineInterface, from: BotId, to: BotId | null, text: string) {
  const at = await $.clock.now()
  await update($, chat, c => [...c, { id: `${at}-${c.length}`, from, to, text, at }].slice(-40))
}
const setLive = ($: EngineInterface, id: BotId, patch: (b: BotLive) => Partial<BotLive>) =>
  update($, live, l => ({ ...l, [id]: { ...l[id], ...patch(l[id]) } }))

/** The line a subagent ends on, addressed to Atlas. */
const reportOf = (answer: string) => {
  const lines = answer.split('\n').map(l => l.trim()).filter(Boolean)
  const line = lines.find(l => /^\**atlas\b/i.test(l)) ?? lines.at(-1) ?? 'Done.'
  return line.replace(/^\**atlas\**\s*[:,]\s*/i, '').slice(0, 160)
}

const crewBrief = () =>
  ['# Crew HQ', 'Specialist subagents for @claude tasks. Delegate with the Agent tool and these types, then tick the task off yourself:',
    ...BOTS.filter(b => b.id !== 'atlas').map(b => `- ${AGENT_PREFIX}${b.id}: ${b.name}, ${b.role}. ${b.bio}`)].join('\n')

async function huddle($: EngineInterface) {
  if (await read($, isHuddling)) return
  await update($, isHuddling, () => true)
  const q = queues(upNext(await read($, projects)))
  const r = await $.model.complete({ model: 'haiku', prompt: huddlePrompt(q), maxTokens: 600 })
  const lines = r.isAnswered ? parseHuddle(r.text, await $.clock.now()) : []
  if (!lines.length) await say($, 'atlas', null, `Huddle didn't come through (${r.isAnswered ? 'no lines' : r.reason}). Try again.`)
  for (const m of lines) {
    await setLive($, m.from, b => ({ status: b.status === 'working' ? 'working' : 'talking' }))
    await say($, m.from, m.to, m.text)
    await $.clock.sleep(1100)
    await setLive($, m.from, b => ({ status: b.status === 'working' ? 'working' : 'idle' }))
  }
  await update($, isHuddling, () => false)
}

function dispatch($: EngineInterface, b: Bot, p: Project, t: Task) {
  void say($, 'atlas', b.id === 'atlas' ? null : b.id, b.id === 'atlas' ? `Taking this one myself: ${t.text}` : `${t.text} (${p.name}). Yours.`)
  const text = b.id === 'atlas'
    ? `Let's work on this ${p.name} task: "${t.text}". The project's notes are next to ${p.path}. When it's finished, tick it off in that TASKS.md.`
    : `Hand this ${p.name} task to ${b.name}: "${t.text}". Spawn the ${AGENT_PREFIX}${b.id} agent with the task and the project path ${p.path}. When ${b.name} reports back, check the work and tick the task off in that TASKS.md.`
  void $.prompt.submit({ text })
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'

/** ~/.claude/crew-hq.json, or null when it is missing or not valid JSON. */
async function loadConfig($: EngineInterface, home: string): Promise<CrewConfig | null> {
  const raw = await $.fs.read(`${home}/${CONFIG_FILE}`).catch(() => null)
  if (raw === null) return null
  try {
    const c = JSON.parse(raw as string) as Partial<CrewConfig>
    const list = Array.isArray(c.projects) ? c.projects.filter(p => p && typeof p.name === 'string' && typeof p.file === 'string') : []
    return { owner: c.owner || 'my', team: c.team || 'a small team', projects: list }
  } catch {
    return null
  }
}

const OWNER_COLOR = { claude: 'cyan', me: 'yellow', client: 'magenta' } as const
const OWNER_LABEL = { claude: 'Claude', me: 'you', client: 'waiting' } as const
const due = (t: Task) => (t.due ? ` · due ${t.due}` : '')

async function refresh($: EngineInterface): Promise<Project[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const year = new Date(await $.clock.now()).getFullYear()
  const cfg = await loadConfig($, home)
  const list: Project[] = await Promise.all(
    (cfg?.projects ?? []).map(async s => {
      const path = `${home}/${s.file}`
      const text = await $.fs.read(path).catch(() => null)
      return { id: slug(s.name), name: s.name, path, isMissing: text === null, tasks: text ? parseTasks(text as string, year) : [] }
    }),
  )
  await update($, config, () => cfg)
  await update($, projects, () => list)
  if (!cfg) {
    $.ui.status('HQ · not set up: run /crew-hq:setup')
    return list
  }
  const all = counts(list.flatMap(p => p.tasks))
  const first = upNext(list)[0]
  $.ui.status(first ? `HQ ${all.done}/${all.total} · next: ${first.task.text.slice(0, 40)}` : `HQ ${all.done}/${all.total} · all clear`)
  return list
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hq', description: 'Crew HQ: every project task, progress and what to do next', argumentHint: '[next|refresh]' })
    await $.command.register({ name: 'crew', description: 'Crew HQ: the agent team, their queues and their chat', argumentHint: '[huddle]' })
    const list = await refresh($)
    const cfg = await read($, config)
    for (const b of BOTS.filter(b => b.id !== 'atlas'))
      await $.agent.register({ name: b.id, description: `${b.name}, crew ${b.role}: ${b.bio}`, prompt: agentPrompt(b, cfg) }).catch(() => undefined)
    const open = upNext(list)
    const forClaude = open.filter(x => x.task.owner === 'claude').length
    if (open[0]) $.ui.toast(`HQ: ${open.length} open (${forClaude} Claude can do). Next: ${open[0].project.name}, ${open[0].task.text}`)
    void $.ui.open({ id: PANE, title: TITLE })
    void $.ui.open({ id: CREW, title: CREW_TITLE })
    if (!(await read($, chat)).length) {
      const q = queues(open)
      const who = BOTS.filter(b => q[b.id].length).map(b => `${b.name} ${q[b.id].length}`).join(', ')
      await say($, 'atlas', null, `Morning, crew. ${forClaude} tasks are ours today${who ? `: ${who}` : ''}.`)
    }
    $.clock.every(60_000, () => void refresh($))
    return next(e)
  })

  on('command.run', { command: 'crew' }, async ($, e) => {
    await $.ui.open({ id: CREW, title: CREW_TITLE })
    if (e.args.trim().toLowerCase() === 'huddle') void huddle($)
    return { text: 'Crew opened.' }
  })

  // Crew agents: who's running, what they're touching, what they report back
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const id = e.subagentType.startsWith(AGENT_PREFIX) ? (e.subagentType.slice(AGENT_PREFIX.length) as BotId) : null
    if (id && BOTS.some(b => b.id === id) && r.agentId) {
      await Promise.all([
        update($, runs, m => ({ ...m, [r.agentId!]: id })),
        setLive($, id, () => ({ status: 'working', doing: e.description })),
        say($, id, 'atlas', `On it: ${e.description}`),
      ]).catch(() => undefined)
    }
    return r
  })
  on('tool.call', async ($, e, next) => {
    // ponytail: bookkeeping only; a failure here must never block the tool
    const doing = activity(e.tool, e as unknown as Record<string, unknown>)
    const id = e.agentId ? (await read($, runs).catch(() => ({}) as Record<string, BotId>))[e.agentId] : 'atlas'
    if (id) await setLive($, id, () => (id === 'atlas' ? { status: 'working', doing } : { doing })).catch(() => undefined)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      await setLive($, 'atlas', () => ({ status: 'idle', doing: null }))
      return r
    }
    const id = (await read($, runs))[e.agentId]
    if (id) {
      await update($, runs, m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== e.agentId)))
      await setLive($, id, b => ({ status: 'idle', doing: null, shipped: b.shipped + (e.isAborted ? 0 : 1) }))
      await say($, id, 'atlas', e.isAborted ? 'Stopped before finishing.' : reportOf(e.answer))
    }
    return r
  })

  on('command.run', { command: 'hq' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const list = await refresh($)
    if (arg === 'next') {
      const lines = upNext(list).slice(0, 6).map((x, i) => `${i + 1}. [${x.project.name}] ${x.task.text}${x.task.owner ? ` @${x.task.owner}` : ''}${due(x.task)}`)
      return { text: lines.length ? `Up next:\n${lines.join('\n')}` : 'Nothing open. Nice.' }
    }
    if (arg === 'refresh') return { text: 'HQ refreshed.' }
    await update($, isBandHidden, () => false)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'HQ opened.' }
  })

  // Claude ticks a box in a TASKS.md -> the pane, band and status line update right away
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.file_path.endsWith('TASKS.md')) await refresh($)
    return ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.file_path.endsWith('TASKS.md')) await refresh($)
    return ran
  })

  // Claude always knows what's open, so "what's next?" just works
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const list = await read($, projects)
    if (!list.some(p => p.tasks.some(t => !t.done))) return composed
    const owner = (await read($, config))?.owner
    return { ...composed, sections: [...composed.sections, { id: 'crew-hq:open-work', text: `${brief(list, owner)}\n\n${crewBrief()}`, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isBandHidden))) return next(e)
    const first = upNext(await read($, projects))[0]
    if (!first) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box gap={1}>
        <Text color="cyan" bold>▸ Next</Text>
        <Text>
          [{first.project.name}] {first.task.text}
          {first.task.owner ? ` @${first.task.owner}` : ''}
          {due(first.task)}
        </Text>
        <Button key="hq-open" label="Open HQ" onPress={() => void $.ui.open({ id: PANE, title: TITLE })} />
        <Button key="hq-hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, projects)
    const expanded = await read($, openIds)
    const now = await $.clock.now()
    const cols = e.viewport?.columns ?? 60
    const barW = Math.max(10, Math.min(40, cols - 14))
    const all = counts(list.flatMap(p => p.tasks))
    const open = list.flatMap(p => p.tasks.filter(t => !t.done))
    const byOwner = (o: 'claude' | 'me' | 'client') => open.filter(t => t.owner === o).length
    const overdue = open.filter(t => dueState(t, now) === 'overdue').length
    const today = open.filter(t => dueState(t, now) === 'today').length

    const toggle = async (p: Project, t: Task) => {
      const text = await $.fs.read(p.path)
      await $.fs.write(p.path, toggleLine(text as string, t.line))
      await refresh($)
      $.ui.toast(`${t.done ? 'Reopened' : '✓ Done'}: ${t.text}`)
    }
    const flip = (id: string) => update($, openIds, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))

    const dueText = (t: Task) => {
      const st = dueState(t, now)
      if (!t.due) return null
      return (
        <Text color={st === 'overdue' ? 'red' : st === 'today' ? 'yellow' : undefined} dimColor={st === null}>
          {st === 'overdue' ? `⚑ overdue ${t.due}` : st === 'today' ? `⚑ today` : `due ${t.due}`}
        </Text>
      )
    }

    const taskRow = (p: Project, t: Task) => (
      <Box key={`t-${p.id}-${t.line}`} flexDirection="column" paddingLeft={2}>
        <Box gap={1}>
          <Button key={`t-${p.id}-${t.line}-box`} label={t.done ? '✓' : '○'} plain onPress={() => void toggle(p, t)} />
          <Box flexShrink={1}>
            <Text dimColor={t.done} strikethrough={t.done} wrap="wrap">{t.text}</Text>
          </Box>
        </Box>
        {!t.done && (t.owner || t.due) && (
          <Box gap={1} paddingLeft={2}>
            {t.owner && <Text color={OWNER_COLOR[t.owner]}>● {OWNER_LABEL[t.owner]}</Text>}
            {dueText(t)}
            {t.owner === 'claude' && (
              <Button key={`t-${p.id}-${t.line}-go`} label={`▶ ${bot(assign(t)).name}`} plain onPress={() => dispatch($, bot(assign(t)), p, t)} />
            )}
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold color="cyan">HQ</Text>
            <Text dimColor>{all.done}/{all.total} done</Text>
          </Box>
          <Text color="cyan">{bar(all.pct, barW)} {all.pct}%</Text>
          <Box gap={2} flexWrap="wrap">
            <Text color="cyan">● {byOwner('claude')} Claude</Text>
            <Text color="yellow">● {byOwner('me')} you</Text>
            <Text color="magenta">● {byOwner('client')} waiting</Text>
          </Box>
          {(overdue > 0 || today > 0) && (
            <Box gap={2}>
              {overdue > 0 && <Text color="red">⚑ {overdue} overdue</Text>}
              {today > 0 && <Text color="yellow">⚑ {today} due today</Text>}
            </Box>
          )}
          <Box gap={1}>
            <Button key="hq-crew" label="Crew" plain onPress={() => void $.ui.open({ id: CREW, title: CREW_TITLE })} />
            <Text dimColor>·</Text>
            <Button key="hq-expand-all" label="Expand all" plain onPress={() => update($, openIds, () => list.map(p => p.id))} />
            <Text dimColor>·</Text>
            <Button key="hq-collapse-all" label="Collapse all" plain onPress={() => update($, openIds, () => [])} />
          </Box>
        </Box>

        {!(await read($, config)) && (
          <Text color="yellow" wrap="wrap">No projects yet. Run /crew-hq:setup, or write ~/{CONFIG_FILE} (see the README).</Text>
        )}
        {list.map(p => {
          const c = counts(p.tasks)
          const isOpen = expanded.includes(p.id)
          const nextUp = upNext([p])[0]
          const sections = [...new Set(p.tasks.map(t => t.section))]
          return (
            <Box key={`p-${p.id}`} flexDirection="column">
              <Box justifyContent="space-between">
                <Button key={`p-${p.id}-toggle`} label={`${isOpen ? '▾' : '▸'} ${p.name}`} plain onPress={() => flip(p.id)} />
                <Text dimColor>{c.done}/{c.total}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={c.pct === 100 ? 'green' : 'cyan'}>{bar(c.pct, barW - 2)}</Text>
              </Box>
              {p.isMissing && <Text color="red">  no TASKS.md at {p.path}</Text>}
              {!isOpen && nextUp && (
                <Box paddingLeft={2} flexShrink={1}>
                  <Text dimColor wrap="wrap">→ {nextUp.task.text}</Text>
                </Box>
              )}
              {isOpen &&
                sections.map(sec => (
                  <Box key={`s-${p.id}-${sec ?? 'none'}`} flexDirection="column">
                    {sec && (
                      <Box paddingLeft={2}>
                        <Text dimColor bold>{sec.toUpperCase()}</Text>
                      </Box>
                    )}
                    {p.tasks.filter(t => t.section === sec).map(t => taskRow(p, t))}
                  </Box>
                ))}
            </Box>
          )
        })}
        <Text dimColor wrap="wrap">○ tick to finish · ▶ hands it to the crew · /hq next · /crew</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: CREW }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg = 'Svg' in els ? els.Svg : null
    const face = (id: BotId, size: number) =>
      Svg ? <Svg key={`face-${id}-${size}`} source={mascot(id, l[id].status, size)} alt={`${bot(id).name} mascot`} width={size} height={size} /> : null
    const q = queues(upNext(await read($, projects)))
    const l = await read($, live)
    const feed = (await read($, chat)).slice(-14)
    const huddling = await read($, isHuddling)
    const busy = BOTS.filter(b => l[b.id].status === 'working').length
    const shipped = BOTS.reduce((n, b) => n + l[b.id].shipped, 0)
    const hhmm = (at: number) => new Date(at).toTimeString().slice(0, 5)
    const tag = (id: BotId) => `${bot(id).avatar} ${bot(id).name}`
    const STATUS = { working: ['● working', 'green'], talking: ['◆ talking', 'yellow'], idle: ['○ idle', undefined] } as const

    const card = (b: Bot) => {
      const me = l[b.id]
      const next: Queued | undefined = q[b.id][0]
      const [label, color] = STATUS[me.status]
      return (
        <Box key={`bot-${b.id}`} flexDirection="row" gap={1} borderStyle="round" borderColor={b.color} paddingX={1}>
          {face(b.id, 56)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box justifyContent="space-between">
            <Text>
              <Text>{b.avatar} </Text>
              <Text bold color={b.color}>{b.name}</Text>
              <Text dimColor> @{b.id} · {b.role}</Text>
            </Text>
            <Text color={color} dimColor={!color}>{label}</Text>
          </Box>
          <Text dimColor wrap="wrap">{b.bio}</Text>
          {me.doing && <Text color="green" wrap="truncate-end">↳ {me.doing}</Text>}
          <Box gap={2}>
            <Text>{q[b.id].length} queued</Text>
            <Text>{me.shipped} shipped</Text>
          </Box>
          {next && (
            <Box gap={1}>
              <Button key={`bot-${b.id}-go`} label="▶" plain onPress={() => dispatch($, b, next.project, next.task)} />
              <Box flexShrink={1}>
                <Text wrap="truncate-end">{next.task.text}</Text>
              </Box>
            </Box>
          )}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold color="cyan">THE CREW</Text>
            <Text dimColor>{BOTS.length} agents · {busy} working · {shipped} shipped</Text>
          </Box>
          <Box gap={1}>
            <Button key="crew-huddle" label={huddling ? 'Huddling…' : '◆ Huddle'} plain onPress={() => void huddle($)} />
            <Text dimColor>·</Text>
            <Button key="crew-hq" label="HQ" plain onPress={() => void $.ui.open({ id: PANE, title: TITLE })} />
            <Text dimColor>·</Text>
            <Button key="crew-clear" label="Clear chat" plain onPress={() => update($, chat, () => [])} />
          </Box>
        </Box>
        {BOTS.map(card)}
        <Box flexDirection="column">
          <Text dimColor bold>CREW CHAT</Text>
          {feed.length === 0 && <Text dimColor>Quiet. Hit ◆ Huddle.</Text>}
          {feed.map(m => (
            <Box key={`m-${m.id}`} flexDirection="column" marginTop={1}>
              <Box gap={1} alignItems="center">
              {face(m.from, 22)}
              <Text>
                <Text bold color={bot(m.from).color}>{tag(m.from)}</Text>
                <Text dimColor> → </Text>
                <Text color={m.to ? bot(m.to).color : undefined}>{m.to ? tag(m.to) : 'crew'}</Text>
                <Text dimColor>  {hhmm(m.at)}</Text>
              </Text>
              </Box>
              <Box paddingLeft={3} flexShrink={1}>
                <Text wrap="wrap">{m.text}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
