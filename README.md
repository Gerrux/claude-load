<div align="center">

**English** · [Русский](README.ru.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Português](README.pt.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# claude-load

**See which Claude Code session eats your CPU and memory — and clean it up in one click.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)
![Languages](https://img.shields.io/badge/languages-8-success)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

<img src="docs/screenshots/pane.png" alt="The claude-load pane in the Claude desktop app: CPU and RAM meters with graphs, sessions with their load, an orphaned dev server and other processes" width="560">

<img src="docs/screenshots/band.png" alt="The load line above the prompt in the Claude desktop app: a CPU graph, CPU and RAM, the top consumers and a /load button" width="760">

<img src="docs/screenshots/terminal.png" alt="The /load report and the load line above the prompt in a terminal" width="860">

<sub>Rendered from demo data in the mod's own design.</sub>

</div>

## Install

One command; pick your shell. It adds this repository as a plugin marketplace and installs
the mod for your user, so it loads in every new session, in the terminal and in the Claude
desktop app alike.

**macOS · Linux · Git Bash on Windows**

```bash
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Windows — PowerShell** (5.1 and 7)

```powershell
claude plugin marketplace add Gerrux/claude-load; if ($?) { claude plugin install claude-load@claude-load --config language=auto }
```

**Windows — Command Prompt** (`cmd`)

```bat
claude plugin marketplace add Gerrux/claude-load && claude plugin install claude-load@claude-load --config language=auto
```

**Claude desktop app only** (no `claude` command in your terminal): click **+** next to
the prompt box → **Plugins** → **Add marketplace** → `Gerrux/claude-load` → **Add plugin**
→ **claude-load**.

**Inside a Claude Code terminal session:**

```text
/plugin marketplace add Gerrux/claude-load
/plugin install claude-load@claude-load
```

Then, in a session that was already open, run `/reload-plugins` and `/load`.

| | |
| --- | --- |
| **Requires** | Claude Code with mods support, 2.1.287 or later (`claude --version`); Windows 10/11, macOS or Linux |
| **Language** | `--config language=auto` follows Claude Code's language, then the system locale. Pin one with `en`, `ru`, `de`, `es`, `fr`, `pt`, `zh` or `ja`, or change it later in `/config` |
| **Update** | `claude plugin marketplace update claude-load` then `claude plugin update claude-load@claude-load`, then `/reload-plugins` |
| **Remove** | `claude plugin uninstall claude-load@claude-load` (and `claude plugin marketplace remove claude-load`) |

## Why

Run a few Claude Code sessions in parallel, each with subagents, MCP servers, dev servers
and test runners, and the machine crawls while Task Manager shows a wall of `node` and
`claude`. claude-load splits the load **by session**:

| | |
| --- | --- |
| 📊 **Per session** | CPU, memory, process count, the heaviest processes inside, a 6-minute CPU graph |
| ⚠️ **Orphans** | dev processes whose parent died (a vite server, a language server, a Python run left behind), placed in their repository or worktree by working directory, ended with one click after a confirmation |
| 🧩 **Everything else** | other processes folded by name (`chrome ×31`), so you see whether the problem is Claude at all |
| 🔎 **Filters & groups** | all · active · heavy · orphans · this window; by session, by repository (worktrees folded in), by process name; sort by CPU or memory |
| ✻ **Sort it out with Claude** | one button: the bundled `sessions-triage` skill classifies idle sessions and orphans, asks once, archives or ends only what you approve |
| ⏳ **Run queue** | `runq` makes heavy runs of all sessions take turns on the machine by memory, exclusive tags and disk; an opt-in guard sends them there |
| 🚦 **Load line** | above the prompt under high load (CPU ≥ 50% or memory ≥ 85%), with the top consumers |
| 🌍 **8 languages** | English, Русский, Deutsch, Español, Français, Português, 中文, 日本語 |

## Use

| Command | What it does |
| --- | --- |
| `/load` | Opens the pane and prints a compact report in the transcript |
| `/load all` | The same, with every idle session listed |
| `/load band on` · `off` · `auto` | The load line above the prompt: always, never, or only under high load (default) |

In the pane:

- **processes** expands a session into its processes by name and its heavy PIDs.
- **end** on a process or an orphan ends it with its child processes after
  **Yes, end it**. First the PID is checked again against a fresh sample under the same
  name, then the live process under it must have the start time of the row you clicked:
  a PID reused by a new process of the same name is refused. Sessions' own `claude`
  processes, the shells other sessions run in, and PIDs not in the current sample cannot
  be ended from here.
- **open ↗** switches to that session in the Claude desktop app.
- **✻ Sort it out with Claude** asks Claude in the current session to triage the load.
  Archiving sessions needs the desktop app's session tools; in a terminal Claude tells you
  what to close instead.

Filter, grouping and sorting are remembered across sessions.

**Language:** the plugin's `language` option (`/config`) takes `auto`, `en`, `ru`, `de`,
`es`, `fr`, `pt`, `zh` or `ja`. `auto` follows Claude Code's `language` setting, then the
system locale, then English.

## Run queue (runq)

Several sessions on one machine each start a memory-hungry run (a test suite, a simulation,
a big build), and the machine runs out of memory, or two runs that share temporary paths
break each other. `runq` makes them take turns by themselves: each heavy command waits in
one queue for the whole machine until there is room for it, then runs as usual.

```bash
python "$HOME/.claude/state/queue/runq.py" --mem 20 --tag helios --label "scan 1 ha" -- ./target/release/treegrow-cli scan --plot 1ha
```

The same line works in Git Bash and in PowerShell (`$HOME` expands in both; elsewhere use
`python3`). It needs Python 3.8 or later. The mod copies `runq.py` to
`~/.claude/state/queue/` at every session start, so the path stays the same across plugin
updates.

A job waits, first come first served, until all of these hold:

- **memory:** free commit (what Windows can still promise: RAM plus the page file) covers
  the job's `--mem` plus a guard, 12 GB by default. Running jobs count with what they
  declared and have not taken yet, so two jobs admitted a second apart do not both see the
  same free memory. A smaller job may pass a bigger one that waits for memory; once the
  bigger one has waited 5 minutes nothing that needs memory passes it.
- **exclusive tags:** no running job, and no job queued earlier, holds the same exclusive
  tag. `cargo-test` is exclusive by default: one `cargo test` per machine.
- **disk:** each `--disk D:=<GB>` drive has that much free space, minus what running jobs
  declared for it and have not written yet.

Then runq runs the command as its own child with the terminal's stdin, stdout and stderr,
and exits with the command's exit code. runq's own lines go to stderr and start with
`runq:`: a progress line every 30 s while waiting (why it waits), and the exit, run time and
peak memory at the end.

| Option | |
| --- | --- |
| `--mem <GB>` | the run's expected peak memory (required; `0` for a run that only needs a tag) |
| `--tag <name>` | repeatable; exclusive if listed in `exclusiveTags` |
| `--disk D:=<GB>` | repeatable; free space a drive must have (a path on macOS/Linux) |
| `--label <text>` | what the pane and the log call the job (default: the command) |
| `--max-mem <GB>` | end the command's own process tree if it goes over this |
| `--max-wait <min>` | give up after waiting this long (exit 75) |

| Exit | |
| --- | --- |
| the command's | it ran |
| 2 | usage error |
| 3 | `--mem` plus the guard is more than the machine's commit limit: it could never start |
| 75 | `--max-wait` ran out |
| 126 | the command could not be started (for example a freshly built `.exe` that Microsoft Defender blocks: `Permission denied`); reported once, never retried |
| 127 | command not found |
| 130 | cancelled (Ctrl+C) while waiting |
| 137 | ended by its own `--max-mem` |

`runq.py status` shows what runs and what waits (and why), free commit, RAM and disks;
`runq.py log --since 30m` (or `-n 50`, an ISO time, `--json`) shows the events: queued,
started, finished, killed, failed, stale, cancelled, gave-up. The pane shows the same in a
**Run queue** section while anything runs or waits, and for two hours after.

**What runq touches.** It reads other processes' memory only through the machine's totals.
The only processes it ever ends are its own command's tree, and only with `--max-mem`. On
Windows the command runs in a Job Object: its tree is exactly the job's members, each
checked to be in the job before it is ended, and a runq that is itself killed takes its
command along instead of leaving it running unaccounted. Where no job can be made (and on
macOS/Linux) the tree is walked by parent PID, and each process's start time is checked
before it is ended. A job whose runq and command are both gone (a crash, a reboot) is
dropped by PID and start time; a command still running after its runq died keeps its slot
and its tags. The decisions are taken under an OS file lock, which the OS releases when its
holder dies.

**Settings:** `~/.claude/state/queue/config.json`, all optional:

```json
{
  "guardGB": 12,
  "exclusiveTags": ["cargo-test"],
  "fairAfterMin": 5,
  "guard": {
    "roots": ["C:/Users/me/garage/treegrow", "D:/work/treegrow-*"],
    "rules": [{ "name": "cargo test", "pattern": "^cargo(\\s+\\+\\S+)?\\s+(test|nextest)\\b", "tag": "cargo-test", "memGB": 8 }]
  }
}
```

### The guard: heavy commands only through runq

In a project that opts in, a Bash or PowerShell command that starts a heavy run outside
runq is denied, and the agent gets the exact runq line to run instead (its `cd …&&` and
`| tail` kept). The mod never rewrites or runs a command itself. Turn it on for a project
in its `.claude/settings.json` (shared, so every worktree of it has it) or
`.claude/settings.local.json`:

```json
{ "env": { "CLAUDE_LOAD_RUNQ_GUARD": "1" } }
```

or for folders, worktrees included, with `guard.roots` in `config.json` (`*` stands for
one path part); `"0"` in a project's settings turns it off there. Heavy by default:
`cargo test` / `cargo nextest`, `treegrow*` `grow|scan|stand|forest` (an executable or
`cargo run … -- <verb>`), and `helios*`; `guard.rules` replaces the list.

## How it works

One sampler per machine writes `~/.claude/state/load/snapshot.json`; each session's mod
only reads it every 5 seconds, so the cost does not grow with the number of sessions.

- **Windows:** a hidden PowerShell process (`sampler/load-sampler.ps1`) started by the
  mod. It reads `Get-Process` every 4 seconds and the parent tree from CIM only when new
  processes appear, and exits 3 minutes after the last session closes. Measured on a
  12-thread machine with 15 sessions: about 0.35% CPU and 130 MB of memory.
- **macOS and Linux:** one session's mod holds a lease and samples with `ps`; another
  session takes over within 15 seconds if it goes away.

A session is a PID from `~/.claude/sessions/<pid>.json`, and its load is its whole process
tree. An orphan is a process tree whose parent died (on macOS and Linux: reparented to
`init`, `systemd` or `launchd`) and that contains a dev tool. Its working directory comes
from the process itself (Windows reads it from the process's memory, Linux from
`/proc/<pid>/cwd`, macOS from `lsof`).

**Privacy:** everything stays on your machine. No network calls, no telemetry.

## Troubleshooting

- **"The sampler does not start"** (Windows): PowerShell scripts are blocked by policy
  (`AllSigned` or Constrained Language Mode). The sampler needs to run
  `sampler/load-sampler.ps1` from the plugin folder.
- **"This process cannot be ended from here" for every process after updating to 1.0.1**
  (Windows): a 1.0.1 session replaces a running 1.0.0 sampler within a few seconds; if
  the button still refuses, end the hidden `powershell.exe` running `load-sampler.ps1` in
  Task Manager. A process younger than about 8 seconds cannot be ended yet: its start
  time is not sampled.
- **Nothing shows on macOS/Linux:** check that `ps` is on `PATH`; `lsof` (macOS) is
  needed only for orphans.

## Status

Developed and used daily on Windows 11 with the Claude desktop app. The macOS and Linux
sampler is covered by unit tests on recorded `ps`, `vm_stat`, `/proc/meminfo` and `lsof`
output but has not yet run on a real Mac or Linux box. Reports and fixes are welcome.

## Develop

```bash
claude plugin validate .
claude plugin test .
python -m unittest discover -s runq -v
claude --plugin-dir .
```

Screenshots are rendered from `docs/mock/index.html`; see [docs/mock/README.md](docs/mock/README.md).

## License

[MIT](LICENSE)
