---
name: sessions-triage
description: Use when the user asks to sort out machine load or idle Claude Code sessions ("what is eating my memory", "clean up idle sessions", "too many sessions", "my PC is slow"), or when claude-load's "Sort it out with Claude" button submits a request. Classifies live sessions, orphaned processes and heavy outside processes from the claude-load snapshot, asks once what to archive or end, then does only what was approved.
---

# Sort out load and idle sessions

Answer in the user's language.

The load comes from claude-load's snapshot, `<home>/.claude/state/load/snapshot.json`
(refreshed every few seconds): `cpu`, `memUsedMB`/`memTotalMB`, `sessions[]` (each with
`pid`, `sessionId`, `hostSessionId`, `name`, `status`, `cpu`, `memMB`, `top[]`),
`orphans[]` (processes whose parent died, with `label`, `root`, `top[]` PIDs) and
`outside[]` (other processes folded by name). A snapshot older than 30 s means the
sampler is not running: say so and suggest opening `/load`.

## 1. Gather

- Read the snapshot.
- If the session-management tools of the Claude desktop app are available
  (`list_sessions`, `archive_session`, `get_settings`, `set_setting`), list sessions
  (limit 60) for `prState`, `lastActivityAt`, `isRunning`. The snapshot's
  `hostSessionId` equals the app's `sessionId`.
- Without those tools (a terminal session), sessions cannot be archived from here:
  report them and tell the user to close the ones they no longer need.

## 2. Classify

| Group | Condition | Offer |
| --- | --- | --- |
| A. Done | live, idle, pull request merged or closed | archive |
| B. Forgotten | live, idle, no pull request, no activity for over 2 h | archive |
| C. Orphans | `orphans[]` | end the process tree |
| D. Heavy outside | `outside[]` above 2 GB or 10% CPU | name only |

Never offer: the current session; sessions that are `busy`, running, or active in the
last 30 minutes; processes named `claude`; PIDs absent from the snapshot. Say what an
orphan most likely is when its path tells (an editor's language server, a dev server).

## 3. Ask once

One question (multi-select) covering groups A, B and C, each with its memory total and
the names or PIDs. Before it, one line: machine CPU and memory now, and how much would
be freed if everything is accepted.

## 4. Do only what was approved

- Archive with `archive_session`, one by one. The app also archives finished side
  sessions of an archived session; list them in the report.
- End an orphan only after re-reading the snapshot and checking the PID is still there
  with the same name. Windows: `taskkill /PID <pid> /T /F`. macOS/Linux:
  `kill -TERM <pid>`, then `kill -KILL <pid>` if it is still alive after 3 s.
- After about 10 s re-read the snapshot and report before → after (memory, CPU, number
  of live sessions).

## 5. Offer automation, once

With the app's settings tools: if `auto_archive_on_pr_close` or
`auto_archive_inactive_days` is off, offer to turn it on in one line, and change it only
after a yes.
