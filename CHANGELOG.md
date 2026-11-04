# Changelog

## 1.2.0

A run queue for heavy runs, shared by every session on the machine.

- `runq` (`runq/runq.py`, Python 3.8+): a job declares its peak memory, exclusive tags and
  disk needs, and waits first come first served until free commit covers it plus a 12 GB
  guard, no job holds its exclusive tag (`cargo-test` by default) and its drives have room.
  Then it runs the command with the terminal's handles and exits with its code. On Windows
  the command runs in a Job Object: `--max-mem` ends exactly its own tree, and a killed runq
  takes its command along. `runq status`, `runq log --since 30m`. The mod copies runq to
  `~/.claude/state/queue/runq.py` at session start.
- The guard: in a project that opts in (`env.CLAUDE_LOAD_RUNQ_GUARD` in its settings, or
  `guard.roots` in the queue's `config.json`), a Bash or PowerShell command that starts a
  heavy run outside runq is denied with the runq line to run instead.
- The pane shows the run queue while anything runs or waits: running jobs with their
  memory and time, waiting jobs and why, free commit, RAM and disks, the last events. `/load`
  prints it too.
- The feed (`/load queue`, or **feed ↗** in the pane): the queue's last 24 hours as a pane of
  its own, newest first, one line per event with the session, the job, what happened and why
  ("waiting 6 min: cargo-test is held by …"). Agents add lines of their own with
  `runq note "<text>"` or `--note` on a job; it stays a log, nobody is notified.
- Snapshot format 4 (Windows): commit and fixed drives' free space. A 1.2.0 session
  replaces an older sampler as before.

## 1.1.0

A tidier pane and more of what is behind each number.

- On a wide pane the rows stop at 120 columns, so the CPU and memory stay next to the names;
  the header graphs use the width. Long names are cut to the room left instead of a fixed
  length.
- An idle session is one line, its buttons before the memory.
- The end confirmation shows what goes with the process, from a live listing at the click:
  the number of processes in its tree and their memory. The toast after it says about how
  much memory was freed. A PID already passed to another process closes the confirmation.
- Processes outside sessions expand to their three heaviest PIDs (shown, never endable).
- Sorted by memory, the session and orphan graphs show memory instead of CPU.
- The end button shows only on rows with a start time, the ones it can check.
- "Sort it out with Claude" carries Claude's ✻ mark in its color.
- Snapshot format 3 (outside top rows, memory history); a 1.1.0 session replaces an older
  sampler as 1.0.1 does.

## 1.0.1

Ending a process checks that it is still the process you chose.

- The end button compares the process's start time with a live query right before ending
  it. Before, a PID and a name were checked against a sample up to 15 s old, so a PID
  reused by a new process of the same name could be ended instead. The samplers now
  record each listed process's start time (Windows: CIM `CreationDate`; macOS/Linux:
  `ps` `lstart` in the C locale).
- Windows: the process tree is taken from a live listing and ended by explicit PIDs, not
  `taskkill /T`, which also ended unrelated processes whose dead parent once had the PID.
- macOS/Linux: after SIGTERM and the 3 s grace period, SIGKILL goes only to processes that
  still have the same start time, not to whatever took a freed PID.
- A shell that another (nested) session runs in is no longer offered for ending.
- The `sessions-triage` skill checks the start time the same way before ending anything.
- A `ps` without `lstart` (busybox) still samples; nothing can be ended there.
- Snapshots carry a format version. A 1.0.1 session that reads an older one replaces the
  older sampler: on Windows it starts the new sampler, which takes over the pid file, and
  the old one exits by itself at the end of its next pass; on macOS and Linux it takes
  over the leader lease.
- A process that took a PID between the process list and the start-time query of one
  Windows sampler pass gets no start time (and cannot be ended) instead of the newcomer's.

## 1.0.0

First public release.

- Load per Claude Code session: CPU, memory, processes, 6-minute graphs.
- Orphaned dev processes attributed to their repository or worktree, ended with a confirmation.
- Other processes folded by name.
- Filters, groupings (session, repository, process) and sorting, remembered across sessions.
- "Sort it out with Claude" button and the bundled `sessions-triage` skill.
- Load line above the prompt under high load; `/load band on|off|auto`.
- Windows sampler (PowerShell); macOS and Linux sampler inside the mod with a leader lease.
- Eight languages: en, ru, de, es, fr, pt, zh, ja.
