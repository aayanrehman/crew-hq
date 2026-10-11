import type { BotId, Chat, CrewConfig, Project, Task } from '../types'

export type Bot = {
  id: BotId
  name: string
  avatar: string
  role: string
  color: string
  bio: string
  /** Words in a task that route it to this bot. Atlas takes whatever nobody claims. */
  words: RegExp
}

// Atlas is the main Claude thread. The other four are real subagent types: crew-hq:<id>.
// Rename them, change their lanes or add a sixth: routing reads `words`, first match wins (see assign).
export const BOTS: Bot[] = [
  { id: 'atlas', name: 'Atlas', avatar: '🧭', role: 'chief of staff', color: 'cyan', bio: 'Reads every TASKS.md, hands work out, ticks it off.', words: /$^/ },
  { id: 'scout', name: 'Scout', avatar: '🔭', role: 'leads & CRM', color: 'green', bio: 'Warm leads, replies, call outcomes, research.', words: /lead|crm|repl|outreach|call outcome|audience|research/i },
  { id: 'quill', name: 'Quill', avatar: '✒️', role: 'scripts & copy', color: 'yellow', bio: 'Scripts, emails, posts, frameworks, write-ups.', words: /script|copy|email|sms|sequence|post|write|slides|framework|kit|headline|profile|update/i },
  { id: 'pixel', name: 'Pixel', avatar: '🎬', role: 'creative & pages', color: 'magenta', bio: 'Edits, statics, carousels, landing pages.', words: /edit|static|carousel|landing|page|video|ugc|design|thumbnail/i },
  { id: 'ledger', name: 'Ledger', avatar: '📊', role: 'numbers & ops', color: 'blue', bio: 'Analytics, tracking sheets, kill/scale calls, SOPs.', words: /analytic|track|result|sop|checkpoint|budget|cpl|roas|kill|scale|metric/i },
]

export const bot = (id: BotId): Bot => BOTS.find(b => b.id === id) ?? BOTS[0]!

/** Who on the crew owns a @claude task. First match wins: Ledger before Quill ("tracking sheet"), Quill before Pixel ("page video scripts"). */
export function assign(t: Task): BotId {
  for (const id of ['scout', 'ledger', 'quill', 'pixel'] as const) if (bot(id).words.test(t.text)) return id
  return 'atlas'
}

export type Queued = { project: Project; task: Task }

export function queues(open: Queued[]): Record<BotId, Queued[]> {
  const q = { atlas: [], scout: [], quill: [], pixel: [], ledger: [] } as Record<BotId, Queued[]>
  for (const x of open) if (x.task.owner === 'claude') q[assign(x.task)].push(x)
  return q
}

export function agentPrompt(b: Bot, cfg: Pick<CrewConfig, 'owner' | 'team'> | null): string {
  const whose = cfg ? `${cfg.owner}'s crew (${cfg.team})` : 'the crew'
  return [
    `You are ${b.name}, the ${b.role} specialist on ${whose}.`,
    `Your lane: ${b.bio}`,
    'Atlas, the chief of staff, hands you one task at a time. Read the project notes next to its TASKS.md first, do the work for real, and save files in that project.',
    'Finish with one short line to Atlas, in your own voice, saying what you shipped and where (e.g. "Atlas: 9 replies drafted in crm/replies.md, 3 are hot."). If another crew member should pick up next, name them.',
  ].join('\n')
}

/** The standup prompt: the crew talks through the real queue. */
export function huddlePrompt(q: Record<BotId, Queued[]>): string {
  const lines = BOTS.map(b => {
    const mine = q[b.id].slice(0, 3).map(x => `"${x.task.text}" (${x.project.name}${x.task.due ? `, due ${x.task.due}` : ''})`)
    return `- ${b.name} (${b.role}): ${mine.length ? mine.join('; ') : 'nothing queued'}`
  })
  return [
    'Write a quick standup chat between five AI agents on one small team. Their queues:',
    ...lines,
    '',
    'Atlas opens and calls the priority. The others answer, claim their work, and hand off to each other where one task feeds another (e.g. Quill writes the script, Pixel edits it; Ledger flags a budget call). Confident, specific, a little personality, no emojis, no hashtags. Use only the tasks above; do not invent numbers.',
    'Output 7 lines exactly, each "Name → Name: message" (under 110 characters), nothing else.',
  ].join('\n')
}

const LINE = /^\s*(Atlas|Scout|Quill|Pixel|Ledger)\s*(?:→|->)\s*(Atlas|Scout|Quill|Pixel|Ledger|all|team|crew)\s*:\s*(.+)$/i

export function parseHuddle(text: string, at: number): Chat[] {
  return text.split('\n').flatMap((l, i) => {
    const m = l.match(LINE)
    if (!m) return []
    const id = (s: string) => s.toLowerCase() as BotId
    const to = /all|team|crew/i.test(m[2]!) ? null : id(m[2]!)
    return [{ id: `h${at}-${i}`, from: id(m[1]!), to, text: m[3]!.trim(), at }]
  })
}

/** One line for what a tool call is doing, for a bot's live status. */
export function activity(tool: string, input: Record<string, unknown>): string {
  const arg = input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url ?? input.query ?? ''
  const s = String(arg).split('/').slice(-2).join('/')
  return `${tool}${s ? ` ${s}` : ''}`.slice(0, 60)
}
