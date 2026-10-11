export type Owner = 'claude' | 'me' | 'client'

export type Task = {
  line: number
  text: string
  done: boolean
  owner: Owner | null
  due: string | null
  dueAt: number | null
  section: string | null
}

export type Project = {
  id: string
  name: string
  path: string
  isMissing: boolean
  tasks: Task[]
}

/** ~/.claude/crew-hq.json: who the crew works for and which TASKS.md files it reads. */
export type CrewConfig = {
  owner: string
  team: string
  /** `file` is relative to $HOME */
  projects: { name: string; file: string }[]
}

export type BotId = 'atlas' | 'scout' | 'quill' | 'pixel' | 'ledger'

/** One message in the crew chat. `to: null` is to the whole crew. */
export type Chat = { id: string; from: BotId; to: BotId | null; text: string; at: number }

export type BotLive = { status: 'idle' | 'working' | 'talking'; doing: string | null; shipped: number }

declare module 'claude-code' {
  interface PluginState {
    'crew-hq': {
      projects: Project[]
      config: CrewConfig | null
      openIds: string[]
      isBandHidden: boolean
      chat: Chat[]
      live: Record<BotId, BotLive>
      /** subagent id -> the bot it is, while it runs */
      runs: Record<string, BotId>
      isHuddling: boolean
    }
  }
}
