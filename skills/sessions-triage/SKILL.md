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
`outside[]` (other processes folded by name). Each `top[]` row has `name`, `pid` and
`started`, the process's start time (Windows: epoch milliseconds; macOS/Linux: `ps`
`lstart` in UTC and the C time locale); a PID with its name can pass to a new process,
the start time cannot. A snapshot older than 30 s means the
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
- End an orphan only when the re-read snapshot still has its row with the same `pid`,
  `name` and `started`, and the live process under that PID has that start time right
  before ending it. A row without `started`, or any mismatch: do not end it; say the PID
  now belongs to another process (or cannot be checked) and leave it.
- Windows: one PowerShell command, with `$id` and `$started` from the row. It checks the
  start time and ends the tree by explicit PIDs. Not `taskkill /T`: Windows keeps a dead
  parent's PID on its children, so `/T` also ends unrelated processes whose dead parent
  once had this PID.

  ```powershell
  $id = <pid>; $started = '<started>'
  $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CreationDate)
  $ms = @{}; foreach ($p in $all) { if ($p.CreationDate) { $ms[[int]$p.ProcessId] = [string]([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() } }
  if (-not $started -or $ms[$id] -ne $started) { "PID $id is no longer that process: not ending it"; exit 1 }
  $tree = New-Object 'Collections.Generic.List[int]'; $tree.Add($id)
  for ($i = 0; $i -lt $tree.Count; $i++) {
    foreach ($p in $all) {
      $c = [int]$p.ProcessId
      if ($p.ParentProcessId -eq $tree[$i] -and $c -ne $tree[$i] -and $ms[$c] -and [int64]$ms[$c] -ge [int64]$ms[$tree[$i]] -and -not $tree.Contains($c)) { $tree.Add($c) }
    }
  }
  $tree.Reverse()
  Stop-Process -Id $tree.ToArray() -Force
  ```

- macOS/Linux: `LC_ALL= LC_TIME=C TZ=UTC ps -o lstart= -p <pid>` must print `started`
  (runs of spaces count as one; the sampler reads `lstart` in UTC and the C time locale).
  Take the tree from one listing, `LC_ALL= LC_TIME=C TZ=UTC ps -axo pid=,ppid=,lstart=`
  (`-eo` on Linux): the PID and its descendants by `ppid`, each with its `lstart`.
  `kill -TERM` them all; after 3 s list again and `kill -KILL` only the PIDs still
  there with the same `lstart`: a PID freed by SIGTERM may already be another process.
- After about 10 s re-read the snapshot and report before → after (memory, CPU, number
  of live sessions).

## 5. Offer automation, once

With the app's settings tools: if `auto_archive_on_pr_close` or
`auto_archive_inactive_days` is off, offer to turn it on in one line, and change it only
after a yes.
