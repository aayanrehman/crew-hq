// Each rule names what it stops. Order matters only for which reason is shown.
const SAFE_RM_TARGET = /^(\/tmp\/|\/private\/tmp\/|(\.\/)?(node_modules|dist|build|out|\.next|\.cache|coverage)(\/|$))/

const RULES: { reason: string; test: (cmd: string) => boolean }[] = [
  {
    reason: 'rm -rf outside temp/build folders',
    test: cmd => {
      for (const m of cmd.matchAll(/\brm\s+((?:-[a-zA-Z]+\s+)+)([^;&|]+)/g)) {
        const flags = m[1] ?? ''
        if (!/r/i.test(flags) || !/f/.test(flags)) continue
        const targets = (m[2] ?? '').trim().split(/\s+/).map(t => t.replace(/^["']|["']$/g, ''))
        if (targets.some(t => !SAFE_RM_TARGET.test(t))) return true
      }
      return false
    },
  },
  { reason: 'git push --force', test: cmd => /\bgit\s+push\b[^;&|]*\s(--force(?!-with-lease)|-f)\b/.test(cmd) },
  { reason: 'git reset --hard', test: cmd => /\bgit\s+reset\b[^;&|]*--hard\b/.test(cmd) },
  { reason: 'git clean -f', test: cmd => /\bgit\s+clean\b[^;&|]*-[a-zA-Z]*f/.test(cmd) },
  { reason: 'dropping or truncating a database table', test: cmd => /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i.test(cmd) },
]

/** Why this shell command should be blocked, or null if it may run. */
export function blockedCommand(cmd: string): string | null {
  return RULES.find(r => r.test(cmd))?.reason ?? null
}

/** Why editing this path should be blocked, or null. .env.example / .env.sample stay editable. */
export function blockedPath(path: string): string | null {
  const name = path.split('/').pop() ?? ''
  if (/^\.env(\.(?!example$|sample$|template$)[\w.-]+)?$/.test(name)) return `editing ${name} (secrets)`
  return null
}
