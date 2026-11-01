# Changelog

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
- Upgrading on Windows: a 1.0.0 sampler that is still running writes no start times, and
  the end button refuses until it is replaced (end the hidden `powershell.exe` running
  `load-sampler.ps1`, or close every session for 3 minutes).

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
