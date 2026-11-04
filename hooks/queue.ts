// The machine run queue (runq/runq.py) as the mod sees it: the state files runq writes under
// <home>/.claude/state/queue, and the guard that sends heavy commands through runq.
//
// The mod never runs or rewrites a command itself: the guard only denies a heavy command that is
// not wrapped in runq, with the exact runq form to use instead.

/** A job file, `jobs/<id>.json`, as runq writes it. */
export type QueueJob = {
  id: string
  label: string
  state: 'waiting' | 'running'
  tags?: string[]
  memMB?: number
  maxMemMB?: number | null
  curMB?: number
  peakMB?: number
  queuedAt: number
  startedAt?: number
  session?: string
  hostSession?: string
  sessionName?: string
  reasons?: QueueReason[]
  orphaned?: boolean
  child?: { pid: number; started?: unknown } | null
}

export type QueueReason =
  | { kind: 'tag'; tag: string; by: string }
  | { kind: 'mem'; needMB: number; guardMB: number; freeMB: number }
  | { kind: 'behind'; by: string }
  | { kind: 'disk'; drive: string; needMB: number; freeMB: number }

/** One line of `events.jsonl`. */
export type QueueEvent = {
  ts: number
  ev: 'queued' | 'started' | 'finished' | 'killed' | 'failed' | 'stale' | 'cancelled' | 'gave-up' | string
  id?: string
  label?: string
  session?: string
  sessionName?: string
  memMB?: number
  waitS?: number
  runS?: number
  peakMB?: number
  exit?: number
  reason?: string
  error?: string
}

/** `machine.json`: runq's last reading, fresh only while some runq polls. */
export type QueueMachine = {
  ts: number
  commitFreeMB: number
  commitLimitMB: number
  ramFreeMB?: number
  ramTotalMB?: number
  disks?: Record<string, number>
}

export function parseJob(text: string): QueueJob | null {
  let j: unknown
  try { j = JSON.parse(text) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const o = j as QueueJob
  if (typeof o.id !== 'string' || (o.state !== 'waiting' && o.state !== 'running')) return null
  return o
}

/** The last `max` events of a JSONL text, malformed lines skipped. */
export function parseEvents(text: string, max = 50): QueueEvent[] {
  const out: QueueEvent[] = []
  for (const line of text.split(/\r?\n/).slice(-max - 1)) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line) as QueueEvent
      if (e && typeof e.ts === 'number' && typeof e.ev === 'string') out.push(e)
    } catch {
      // A line being written: skip.
    }
  }
  return out.slice(-max)
}

export function sortJobs(jobs: QueueJob[]): { running: QueueJob[]; waiting: QueueJob[] } {
  const by = (a: QueueJob, b: QueueJob) => a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : 1)
  return { running: jobs.filter(j => j.state === 'running').sort(by), waiting: jobs.filter(j => j.state === 'waiting').sort(by) }
}

// --- the guard ----------------------------------------------------------

/**
 * A heavy command: `pattern` is a regular expression matched against the start of each command
 * in a line (after `cd x &&`, env assignments, `time`, `timeout 600`, PowerShell's `&`).
 */
export type GuardRule = { name: string; pattern: string; tag?: string; memGB?: number; hint?: string }

export const DEFAULT_RULES: GuardRule[] = [
  {
    name: 'cargo test', pattern: String.raw`^cargo(\s+\+\S+)?\s+(test|nextest)\b`, tag: 'cargo-test', memGB: 8,
    hint: 'one cargo test per machine: the tests share temporary paths',
  },
  {
    name: 'treegrow run', pattern: String.raw`^(\S*[\\/])?treegrow[\w.-]*(\.exe)?\s+(grow|scan|stand|forest)\b`, tag: 'treegrow', memGB: 16,
  },
  {
    name: 'treegrow run', pattern: String.raw`^cargo(\s+\+\S+)?\s+run\b.*\s--\s+(grow|scan|stand|forest)\b`, tag: 'treegrow', memGB: 16,
  },
  {
    name: 'HELIOS++', pattern: String.raw`^(\S*[\\/])?(py)?helios[\w+.-]*(\.exe)?(\s|$)`, tag: 'helios', memGB: 24,
    hint: 'HELIOS++ takes about 2 KB per triangle of the scene',
  },
]

/** `config.json`'s `guard` block: where the guard is on, and what counts as heavy. */
export type GuardConfig = { roots?: string[]; rules?: GuardRule[] }

/** One command of a line: where it starts in the line, and where its program word starts. */
export type Segment = { start: number; head: number; text: string }

const PREFIX = /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)|(?:(?:time|nohup|exec|command|env|builtin)\s+)|(?:timeout\s+(?:-\S+\s+)*\S+\s+)|(?:[({]\s*)|(?:!\s+))*/

/**
 * The commands of a shell line (Bash or PowerShell), split at `;`, `&&`, `||`, `|`, a lone `&` and
 * newlines outside quotes. `2>&1`, `&>` and `>&` are redirections, not separators.
 */
export function segments(line: string): Segment[] {
  const out: Segment[] = []
  let start = 0
  let quote: string | null = null
  const push = (end: number) => {
    const raw = line.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    let body = raw.slice(lead)
    let head = start + lead
    // PowerShell's call operator: `& "C:\x\tool.exe" args`.
    const amp = /^&\s*/.exec(body)
    if (amp) { body = body.slice(amp[0].length); head += amp[0].length }
    const pre = PREFIX.exec(body)
    const skip = pre ? pre[0].length : 0
    if (body.trim()) out.push({ start: start + lead, head: head + skip, text: body.slice(skip).trimEnd() })
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < line.length) i++
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '\\' && i + 1 < line.length) { i++; continue }
    const two = line.slice(i, i + 2)
    if (two === '&&' || two === '||') { push(i); start = i + 2; i++; continue }
    if (c === ';' || c === '\n' || c === '|') { push(i); start = i + 1; continue }
    if (c === '&') {
      const prev = line[i - 1] ?? ''
      const next = line[i + 1] ?? ''
      if (prev === '>' || prev === '<' || next === '>') continue
      // A leading `&` is PowerShell's call operator, kept with its command.
      if (!line.slice(start, i).trim()) continue
      push(i); start = i + 1
      continue
    }
  }
  push(line.length)
  return out
}

/** The program word of a command, quotes taken off: `"C:\x y\tool.exe" scan` → `C:\x y\tool.exe scan`. */
function unquoteHead(text: string): string {
  const m = /^(["'])(.*?)\1/.exec(text)
  return m ? m[2] + text.slice(m[0].length) : text
}

/** A command that is already runq: `runq …`, `python …/runq.py …`, `py -3 …runq.py …`. */
export function isRunq(text: string): boolean {
  const t = unquoteHead(text)
  if (/^(\S*[\\/])?runq(\.py|\.cmd|\.ps1)?(\s|$)/i.test(t)) return true
  return /^(\S*[\\/])?(python3?|py)(\.exe)?\s+(-\S+\s+)*["']?[^\s"']*runq\.py["']?(\s|$)/i.test(t)
}

export type GuardHit = { rule: GuardRule; segment: Segment }

/** The first heavy command of a line that is not run through runq, if any. */
export function findHeavy(line: string, rules: GuardRule[]): GuardHit | null {
  const compiled = rules.flatMap(rule => {
    try { return [{ rule, re: new RegExp(rule.pattern, 'i') }] } catch { return [] }
  })
  for (const s of segments(line)) {
    if (isRunq(s.text)) continue
    const t = unquoteHead(s.text)
    for (const { rule, re } of compiled) if (re.test(t)) return { rule, segment: s }
  }
  return null
}

const shellQuote = (s: string, ps: boolean) => ps ? `'${s.replace(/'/g, "''")}'` : `'${s.replace(/'/g, `'\\''`)}'`

/**
 * The line again with the heavy command run through runq: what the agent is told to run. Only the
 * matched command gets the prefix; `cd x && …` before it and `| tail` after it stay as written.
 */
export function suggestLine(line: string, hit: GuardHit, runq: string, ps: boolean): string {
  const { rule, segment } = hit
  const opts = [`--mem ${rule.memGB ?? 8}`]
  if (rule.tag) opts.push(`--tag ${rule.tag}`)
  opts.push(`--label ${shellQuote(rule.name, ps)}`)
  // PowerShell's `&` goes: runq starts the program itself.
  const at = ps && /^&\s*/.test(line.slice(segment.start)) ? segment.start : segment.head
  return `${line.slice(0, at)}${runq} ${opts.join(' ')} -- ${line.slice(segment.head)}`
}

export function denyText(line: string, hit: GuardHit, runq: string, ps: boolean): string {
  const r = hit.rule
  const memo = `${r.memGB ?? 8} GB is a default`
  return [
    `claude-load: \`${hit.segment.text.slice(0, 80)}\` is a heavy run (${r.name}) and this project runs those through the machine queue, ` +
      'so parallel sessions take turns instead of running out of memory. Nothing was run. Run it this way instead:',
    '',
    `    ${suggestLine(line, hit, runq, ps)}`,
    '',
    `Set --mem to this run's expected peak in GB (${memo}${r.hint ? `; ${r.hint}` : ''}). runq waits until the machine has room, ` +
      'then runs the command with its own output and exit code; a long run belongs in the background (run_in_background). ' +
      `\`${runq} status\` shows the queue, \`${runq} log --since 30m\` what happened.`,
  ].join('\n')
}

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Whether `cwd` is one of `roots` or inside one; `*` in a root stands for one path part. */
export function underRoot(cwd: string, roots: string[]): boolean {
  const c = normPath(cwd)
  return roots.some(r => {
    const pat = normPath(r).split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
    return new RegExp(`^${pat}(/|$)`).test(c)
  })
}

/**
 * The guard is on where the project's settings say so (`env.CLAUDE_LOAD_RUNQ_GUARD` = 1 or on, in
 * `.claude/settings.json` or `.claude/settings.local.json`), or where the session's folder is under
 * one of `config.json`'s `guard.roots`; `0` or `off` in the settings turns it off there.
 */
export function guardOn(settingValue: unknown, cwd: string, guard: GuardConfig | undefined): boolean {
  const v = String(settingValue ?? '').trim().toLowerCase()
  if (v === '0' || v === 'off' || v === 'false') return false
  if (v === '1' || v === 'on' || v === 'true') return true
  return !!cwd && underRoot(cwd, guard?.roots ?? [])
}

export function guardRules(guard: GuardConfig | undefined): GuardRule[] {
  const rules = guard?.rules?.filter(r => r && typeof r.pattern === 'string' && typeof r.name === 'string')
  return rules?.length ? rules : DEFAULT_RULES
}
