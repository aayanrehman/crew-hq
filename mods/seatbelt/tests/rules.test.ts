import { expect, test } from 'claude-code/testing'

import { blockedCommand, blockedPath } from '../hooks/rules'

test('blocks the dangerous commands', async () => {
  for (const cmd of ['rm -rf src', 'rm -fr ~/Desktop/site', 'cd x && rm -rf ./app', 'git push --force origin main', 'git push -f',
    'git reset --hard HEAD~3', 'git clean -fd', 'psql -c "DROP TABLE leads"', 'echo hi; truncate table users']) {
    expect(blockedCommand(cmd)).not.toBe(null)
  }
})

test('lets the safe ones through', async () => {
  for (const cmd of ['rm -rf node_modules', 'rm -rf /tmp/build-123', 'rm -rf dist .next', 'rm file.txt', 'rm -r old',
    'git push origin main', 'git push --force-with-lease', 'git reset --soft HEAD~1', 'ls -la', 'npm test']) {
    expect(blockedCommand(cmd)).toBe(null)
  }
})

test('guards .env files but not the examples', async () => {
  expect(blockedPath('/x/.env')).not.toBe(null)
  expect(blockedPath('/x/.env.local')).not.toBe(null)
  expect(blockedPath('/x/.env.example')).toBe(null)
  expect(blockedPath('/x/src/env.ts')).toBe(null)
})
