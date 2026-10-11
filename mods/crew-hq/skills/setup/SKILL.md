---
name: setup
description: Set up Crew HQ for this person. Finds or creates a TASKS.md for each of their projects, writes ~/.claude/crew-hq.json, and opens the HQ and Crew panes. Use when they install Crew HQ, say "set up my crew", or the HQ pane says "No projects yet".
---

# Set up Crew HQ

Crew HQ reads one `TASKS.md` per project and hands every task tagged `@claude` to a
crew of five agents: Atlas (chief of staff, the main thread), Scout (leads and research),
Quill (scripts and copy), Pixel (creative and pages) and Ledger (numbers and ops).
Your job is to wire it to this person's real work in a few minutes.

## 1. Find their projects

Ask what they're working on: clients, products, a job search, a content calendar. Anything
with a to-do list counts. Then look for task files that already exist:

```bash
find ~ -maxdepth 4 -name TASKS.md -not -path "*/node_modules/*" 2>/dev/null
```

Show what you found and confirm which ones belong on the HQ. For a project without one,
offer to create `TASKS.md` in its folder.

## 2. Write or tidy each TASKS.md

The format is plain Markdown, so it stays readable without the mod:

```markdown
## This week
- [ ] Draft the onboarding email sequence @claude (due Oct 14)
- [ ] Call the printer about the proof @me (due Oct 13)
- [ ] Logo files from the client @client
- [x] Kickoff call @me
```

- `@claude` means the crew can take it, `@me` means it's theirs, and `@client` means it's waiting on someone else.
- `(due Mon D)` is optional; the soonest due open task becomes "Next" above the prompt.
- `## headings` become sections in the pane.

Routing is by keywords in the task text. Leads, CRM and research go to Scout. Scripts, emails, posts and copy go to Quill. Edits, pages, carousels and video go to Pixel. Tracking, results, budgets and SOPs go to Ledger. Atlas takes anything else. Phrase tasks so the right agent picks them up.

## 3. Write ~/.claude/crew-hq.json

```json
{
  "owner": "Sam",
  "team": "Sam's design studio",
  "projects": [
    { "name": "Client A", "file": "Projects/client-a/TASKS.md" },
    { "name": "Newsletter", "file": "Documents/newsletter/TASKS.md" }
  ]
}
```

`file` is relative to `$HOME`. `owner` and `team` go into every agent's prompt, so the
crew knows whose work it's doing. Show the file to the person before you write it.

## 4. Light it up

Tell them to run `/hq refresh`, then `/crew`. Within a minute the HQ pane shows a
progress bar per project and the Crew pane shows each agent's queue. Point out the
▶ button next to any `@claude` task, and ◆ Huddle for a standup written from their real queue.

Optional companions from the same marketplace: `cockpit` (live cost, context and rate-limit
gauges), `done-ping` (a chime when a long task finishes) and `seatbelt` (blocks
recursive deletes, force pushes and `.env` edits).

## Changing the crew

The roster, roles and routing words live in `hooks/crew.ts` (`BOTS`). To rename an agent,
change its lane or add a sixth, fork the repository, edit `BOTS`, and install the fork.
