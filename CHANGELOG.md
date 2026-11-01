# Changelog

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
