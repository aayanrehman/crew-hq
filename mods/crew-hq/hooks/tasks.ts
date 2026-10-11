import type { Owner, Project, Task } from '../types'

// "- [ ] text @claude (due Oct 7)" / "- [x] text"
const CHECKBOX = /^(\s*[-*]\s+\[)( |x|X)(\]\s+)(.*)$/
const OWNER = /@(claude|me|client)\b/i
const DUE = /\(due ([^)]+)\)/i
const HEADING = /^#{2,3}\s+(.+?)\s*$/

export function parseTasks(text: string, year: number): Task[] {
  const tasks: Task[] = []
  let section: string | null = null
  text.split('\n').forEach((raw, line) => {
    const h = raw.match(HEADING)
    if (h) {
      section = h[1] ?? null
      return
    }
    const m = raw.match(CHECKBOX)
    if (!m) return
    const body = m[4] ?? ''
    const owner = (body.match(OWNER)?.[1]?.toLowerCase() ?? null) as Owner | null
    const due = body.match(DUE)?.[1]?.trim() ?? null
    const parsed = due ? Date.parse(`${due} ${year}`) : NaN
    tasks.push({
      line,
      text: body.replace(OWNER, '').replace(DUE, '').replace(/\s{2,}/g, ' ').trim(),
      done: m[2] !== ' ',
      owner,
      due,
      dueAt: Number.isNaN(parsed) ? null : parsed,
      section,
    })
  })
  return tasks
}

/** Flips the checkbox on one line; returns the text unchanged if that line has none. */
export function toggleLine(text: string, line: number): string {
  const lines = text.split('\n')
  const m = lines[line]?.match(CHECKBOX)
  if (!m) return text
  lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}${m[4]}`
  return lines.join('\n')
}

export function counts(tasks: Task[]) {
  const done = tasks.filter(t => t.done).length
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 }
}

/** Open tasks across projects, soonest due first, undated after, file order kept. */
export function upNext(projects: Project[]): { project: Project; task: Task }[] {
  const open = projects.flatMap(project => project.tasks.filter(t => !t.done).map(task => ({ project, task })))
  return open
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => (a.task.dueAt ?? Infinity) - (b.task.dueAt ?? Infinity) || a.i - b.i)
    .map(({ project, task }) => ({ project, task }))
}

export function bar(pct: number, width = 14): string {
  const fill = Math.round((pct / 100) * width)
  return '█'.repeat(fill) + '░'.repeat(width - fill)
}

/** The brief Claude reads every turn, so it always knows what is open. */
export function brief(projects: Project[], owner = 'my'): string {
  const parts = [`# Crew HQ: ${owner === 'my' ? 'my' : `${owner}'s`} open work`,
    'Read from each project\'s TASKS.md. When a task is finished, tick its "- [ ]" to "- [x]" in that file. When asked "what\'s next", start with the earliest due @claude task.']
  for (const p of projects) {
    const open = p.tasks.filter(t => !t.done)
    if (!open.length) continue
    parts.push(`\n## ${p.name} (${p.path})`)
    for (const t of open) parts.push(`- [ ] ${t.text}${t.owner ? ` @${t.owner}` : ''}${t.due ? ` (due ${t.due})` : ''}`)
  }
  return parts.join('\n')
}

const DAY = 86_400_000

/** "overdue" | "today" | null, against the start of today (local). */
export function dueState(t: Task, now: number): 'overdue' | 'today' | null {
  if (t.done || t.dueAt === null) return null
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (t.dueAt < start) return 'overdue'
  if (t.dueAt < start + DAY) return 'today'
  return null
}
