import { expect, test } from 'claude-code/testing'

import { brief, counts, dueState, parseTasks, toggleLine, upNext } from '../hooks/tasks'

const FILE = [
  '# Client A',
  '- [ ] Signed agreement back @client (due Oct 7)',
  '- [x] Kickoff call @me',
  '- [ ] Write the VSL scripts @claude',
  'not a task',
].join('\n')

test('parses checkboxes, owners and due dates', async () => {
  const tasks = parseTasks(FILE, 2026)
  expect(tasks.length).toBe(3)
  expect(tasks[0]?.text).toBe('Signed agreement back')
  expect(tasks[0]?.owner).toBe('client')
  expect(tasks[0]?.due).toBe('Oct 7')
  expect(tasks[1]?.done).toBe(true)
  expect(counts(tasks).pct).toBe(33)
})

test('ticking a box flips only that line', async () => {
  const once = toggleLine(FILE, 3)
  expect(once.split('\n')[3]).toBe('- [x] Write the VSL scripts @claude')
  expect(toggleLine(once, 3)).toBe(FILE)
  expect(toggleLine(FILE, 4)).toBe(FILE)
})

test('next up is the soonest due open task, and the brief lists open work only', async () => {
  const project = { id: 'm', name: 'Client A', path: '/x/TASKS.md', isMissing: false, tasks: parseTasks(FILE, 2026) }
  expect(upNext([project])[0]?.task.text).toBe('Signed agreement back')
  const text = brief([project])
  expect(text.includes('Kickoff call')).toBe(false)
  expect(text.includes('Write the VSL scripts @claude')).toBe(true)
})

test('tasks carry their ## section, and due dates know overdue vs today', async () => {
  const tasks = parseTasks('## Now\n- [ ] A (due Oct 5)\n- [ ] B (due Oct 6)\n## Later\n- [ ] C (due Oct 9)\n- [x] D (due Oct 1)', 2026)
  expect(tasks.map(t => t.section)).toEqual(['Now', 'Now', 'Later', 'Later'])
  const now = new Date(2026, 9, 6, 15, 0).getTime()
  expect(tasks.map(t => dueState(t, now))).toEqual(['overdue', 'today', null, null])
})
