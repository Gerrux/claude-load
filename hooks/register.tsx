import type { EngineInterface, Register } from 'claude-code'

import { STRINGS, fmtMem as fmtMemIn, lead, pickLang, plural } from './i18n'
import type { Lang } from './i18n'
import { buildSnapshot, freshMemory, orphanCandidates, parseLsofCwd, parseMeminfo, parsePs, parseSessionFile, parseVmStat } from './posix'
import type { SamplerMemory, SessionMeta } from './posix'
import type { ByName, OrphanLoad, OutsideLoad, Snapshot, Top } from './types'

export type { Snapshot } from './types'

// claude-load: CPU and memory per Claude Code session.
//
// One sampler per machine writes <home>/.claude/state/load/snapshot.json; every session's mod
// reads it every 5 s. Windows: a hidden PowerShell process (sampler/load-sampler.ps1) that the
// mod starts when the snapshot goes stale and that exits once no session marks itself `wanted`.
// macOS and Linux: one session's mod is the leader (a lease file) and samples with `ps` itself.

const POLL_MS = 5000
const WANTED_EVERY_MS = 30000
const STALE_MS = 15000
const RESPAWN_MS = 30000
const LEADER_STALE_MS = 15000
const MIN_SAMPLE_MS = POLL_MS - 1000
const PANE = 'claude-load'
const KEY_BAND = 'band'
const KEY_VIEW = 'view'
const TEXT_IDLE_ROWS = 5
const TRIAGE_PROMPT =
  'Sort out the machine load and idle Claude Code sessions with the claude-load:sessions-triage skill: read the claude-load snapshot ' +
  '(~/.claude/state/load/snapshot.json) and the session list, ask me once what to archive and which orphaned processes to end, ' +
  'and do only what I approve. Answer in my language.'

export type BandMode = 'auto' | 'on' | 'off'
export type Filter = 'all' | 'active' | 'heavy' | 'orphans' | 'self'
export type Group = 'sessions' | 'repos' | 'procs'
export type Sort = 'cpu' | 'mem'
type Platform = 'win32' | 'darwin' | 'linux' | 'other'

// The language is set again by session.start on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

export function setLang(next: Lang) {
  lang = next
}

// --- formatting --------------------------------------------------------

export function fmtMem(mb: number): string {
  return fmtMemIn(lang, mb)
}

const pct = (x: number) => `${Math.round(x)}%`

function short(name: string, max = 32): string {
  const n = name || tr().untitled
  return n.length > max ? n.slice(0, Math.max(1, max - 1)) + '…' : n
}

/** The Claude Desktop app's own processes are named `claude`, like the sessions: label them plainly. */
export function outsideName(name: string): string {
  return name.toLowerCase() === 'claude' ? 'Claude Desktop' : name
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A bar of blocks in eighths of a cell: [filled, empty]. */
export function bar(frac: number, width: number): [string, string] {
  const f = Math.max(0, Math.min(1, frac)) * width
  const full = Math.floor(f)
  const part = full < width ? EIGHTHS[Math.floor((f - full) * 8)] : ''
  return ['█'.repeat(full) + part, '░'.repeat(width - full - (part ? 1 : 0))]
}

const SPARKS = '▁▂▃▄▅▆▇█'

/** A text sparkline: the last `width` points, scaled to their maximum (at least `floor`). */
export function sparkText(vals: number[], width: number, floor = 5): string {
  const v = vals.slice(-width)
  if (!v.length) return ' '.repeat(width)
  const m = Math.max(floor, ...v)
  return ' '.repeat(width - v.length) + v.map(x => SPARKS[Math.min(7, Math.floor((x / m) * 7.999))]).join('')
}

type Tone = 'error' | 'warning' | 'success' | 'inactive'
const HEX: Record<Tone, string> = { error: '#f85149', warning: '#d29922', success: '#3fb950', inactive: '#8b949e' }

export function cpuTone(cpu: number): Tone {
  return cpu >= 30 ? 'error' : cpu >= 10 ? 'warning' : cpu >= 1 ? 'success' : 'inactive'
}

function machineTone(frac: number): Tone {
  return frac >= 0.85 ? 'error' : frac >= 0.6 ? 'warning' : 'success'
}

function memTone(mb: number): 'error' | 'warning' | undefined {
  return mb >= 4096 ? 'error' : mb >= 2048 ? 'warning' : undefined
}

/** An SVG sparkline with the area under it filled. */
export function sparkSvg(vals: number[], w: number, h: number, color: string, floor = 5): string {
  const v = vals.length >= 2 ? vals : [vals[0] ?? 0, vals[0] ?? 0]
  const m = Math.max(floor, ...v)
  const step = w / (v.length - 1)
  const pts = v.map((x, i) => `${(i * step).toFixed(1)},${(h - 1 - (x / m) * (h - 3)).toFixed(1)}`).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<polygon points="0,${h} ${pts} ${w},${h}" fill="${color}" fill-opacity="0.18"/>` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`
}

/** An SVG bar: a rounded track and its fill. */
export function barSvg(frac: number, w: number, h: number, color: string): string {
  const f = Math.max(0, Math.min(1, frac))
  const r = h / 2
  const fill = f > 0 ? `<rect x="0" y="0" width="${Math.max(h, f * w).toFixed(1)}" height="${h}" rx="${r}" fill="${color}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="#8b949e" fill-opacity="0.22"/>${fill}</svg>`
}

type IconKind = 'busy' | 'working' | 'idle' | 'orphan' | 'repo' | 'proc' | 'machine'
const ICON_TEXT: Record<IconKind, string> = { busy: '●', working: '◐', idle: '○', orphan: '⚠', repo: '▣', proc: '⚙', machine: '◆' }

export function iconSvg(kind: IconKind): string {
  const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">${body}</svg>`
  switch (kind) {
    case 'busy': return wrap(`<circle cx="7" cy="7" r="6" fill="${HEX.success}" fill-opacity="0.25"/><circle cx="7" cy="7" r="3.5" fill="${HEX.success}"/>`)
    case 'working': return wrap(`<circle cx="7" cy="7" r="6" fill="${HEX.warning}" fill-opacity="0.2"/><path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill="${HEX.warning}"/><circle cx="7" cy="7" r="3.5" fill="none" stroke="${HEX.warning}" stroke-width="1.2"/>`)
    case 'idle': return wrap(`<circle cx="7" cy="7" r="4" fill="none" stroke="${HEX.inactive}" stroke-width="1.5"/>`)
    case 'orphan': return wrap(`<path d="M7 1.5 L13 12.5 H1 Z" fill="${HEX.warning}"/><rect x="6.3" y="5" width="1.4" height="4" fill="#1b1b1b"/><rect x="6.3" y="10" width="1.4" height="1.4" fill="#1b1b1b"/>`)
    case 'repo': return wrap(`<path d="M1.5 3.5 H5.5 L7 5 H12.5 V11.5 H1.5 Z" fill="none" stroke="${HEX.inactive}" stroke-width="1.3"/>`)
    case 'proc': return wrap(`<circle cx="7" cy="7" r="2.2" fill="none" stroke="${HEX.inactive}" stroke-width="1.3"/><path d="M7 1.5 V3.5 M7 10.5 V12.5 M1.5 7 H3.5 M10.5 7 H12.5 M3.1 3.1 L4.5 4.5 M9.5 9.5 L10.9 10.9 M3.1 10.9 L4.5 9.5 M9.5 4.5 L10.9 3.1" stroke="${HEX.inactive}" stroke-width="1.3"/>`)
    case 'machine': return wrap(`<rect x="1.5" y="2.5" width="11" height="7" rx="1" fill="none" stroke="${HEX.inactive}" stroke-width="1.3"/><path d="M4.5 12 H9.5 M7 9.5 V12" stroke="${HEX.inactive}" stroke-width="1.3"/>`)
  }
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** A session's repository root: a worktree `.claude/worktrees/x` folds into its main checkout. */
export function repoRoot(cwd: string): { root: string; label: string } {
  const m = /^(.*?)[\\/]\.claude[\\/]worktrees[\\/]/i.exec(cwd)
  const root = (m ? m[1] : cwd).replace(/[\\/]+$/, '')
  return { root, label: root.split(/[\\/]/).pop() || root }
}

export function sessionLink(hostSessionId: string): string | null {
  return /^local_[0-9a-f-]+$/i.test(hostSessionId) ? `claude://claude.ai/epitaxy/${hostSessionId}` : null
}

// --- view model --------------------------------------------------------

export type Row = {
  id: string; name: string; status: string; isSelf: boolean; cpu: number; memMB: number; procs: number
  detail: string; hist: number[]; link: string | null; procsList: Top[]; byName: ByName[]
}
export type OrphanRow = { label: string; cpu: number; memMB: number; procs: number; detail: string; owners: string[]; hist: number[]; top: Top[] }
export type RepoRow = { label: string; root: string; cpu: number; memMB: number; sessions: Row[]; orphans: OrphanRow[]; hist: number[] }
export type ProcRow = { name: string; count: number; cpu: number; memMB: number; where: string[] }
export type View = {
  cpu: number; memUsedMB: number; memTotalMB: number; memFrac: number; cores: number; ageS: number
  claude: { count: number; cpu: number; memMB: number }
  active: Row[]; idle: Row[]; orphans: OrphanRow[]; outside: OutsideLoad[]
  hist: { cpu: number[]; mem: number[] }
  /** The busiest row: session bars scale to it, so small shares still show. */
  scale: number
}

/** Sessions an orphan may belong to: their cwd is inside its repository root, or the other way round. */
export function orphanOwners(snap: Snapshot, o: OrphanLoad): string[] {
  const root = norm(o.root)
  return snap.sessions
    .filter(s => { const c = norm(s.cwd ?? ''); return !!c && !!root && (c === root || c.startsWith(root + '/') || root.startsWith(c + '/')) })
    .map(s => s.name)
}

function detailOf(top: Top[]): string {
  return top
    .filter(t => t.cpu >= 0.5 || t.memMB >= 300)
    .map(t => `${t.name}${t.cpu >= 0.5 ? ' ' + pct(t.cpu) : ''} ${fmtMem(t.memMB)}`)
    .join(' · ')
}

function sumHist(list: number[][]): number[] {
  const len = Math.max(0, ...list.map(h => h.length))
  const out = new Array<number>(len).fill(0)
  for (const h of list) h.forEach((x, i) => { out[len - h.length + i] += x })
  return out
}

export function buildView(snap: Snapshot, selfId: string | null, now: number, sort: Sort = 'cpu'): View {
  const rows: Row[] = snap.sessions.map(s => ({
    id: s.sessionId, name: s.name || tr().untitled, status: s.status, isSelf: s.sessionId === selfId,
    cpu: s.cpu, memMB: s.memMB, procs: s.procs, detail: detailOf(s.top),
    hist: snap.hist?.sessions[s.sessionId] ?? [s.cpu], link: sessionLink(s.hostSessionId),
    procsList: s.top, byName: s.byName ?? [],
  }))
  const by = sort === 'mem' ? (a: Row, b: Row) => b.memMB - a.memMB || b.cpu - a.cpu : (a: Row, b: Row) => b.cpu - a.cpu || b.memMB - a.memMB
  const isActive = (r: Row) => r.status === 'busy' || r.cpu >= 1
  const active = rows.filter(isActive).sort(by)
  const idle = rows.filter(r => !isActive(r)).sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || (sort === 'cpu' ? b.memMB - a.memMB : by(a, b)))
  const orphans = snap.orphans.map(o => ({
    label: o.label, cpu: o.cpu, memMB: o.memMB, procs: o.procs,
    detail: o.top.map(t => `${t.name}#${t.pid}`).join(', '), owners: orphanOwners(snap, o),
    hist: snap.hist?.orphans[o.label] ?? [o.cpu], top: o.top,
  })).sort((a, b) => sort === 'mem' ? b.memMB - a.memMB : b.cpu - a.cpu)
  return {
    cpu: snap.cpu, memUsedMB: snap.memUsedMB, memTotalMB: snap.memTotalMB, memFrac: snap.memUsedMB / snap.memTotalMB,
    cores: snap.cores, ageS: Math.max(0, Math.round((now - snap.ts) / 1000)),
    claude: { count: rows.length, cpu: rows.reduce((a, r) => a + r.cpu, 0), memMB: rows.reduce((a, r) => a + r.memMB, 0) },
    active, idle, orphans,
    outside: [...snap.outside].sort((a, b) => sort === 'mem' ? b.memMB - a.memMB : b.cpu - a.cpu).slice(0, 6),
    hist: { cpu: snap.hist?.cpu ?? [snap.cpu], mem: snap.hist?.mem ?? [(snap.memUsedMB / snap.memTotalMB) * 100] },
    scale: Math.max(5, ...rows.map(r => r.cpu), ...orphans.map(o => o.cpu)),
  }
}

/** What a filter shows: sessions, orphans and outside processes. */
export function applyFilter(v: View, f: Filter): { sessions: Row[]; idle: Row[]; orphans: OrphanRow[]; outside: OutsideLoad[] } {
  const heavy = (cpu: number, mem: number) => cpu >= 5 || mem >= 1024
  switch (f) {
    case 'active': return { sessions: v.active, idle: [], orphans: v.orphans.filter(o => o.cpu >= 1), outside: [] }
    case 'heavy': return {
      sessions: [...v.active, ...v.idle].filter(r => heavy(r.cpu, r.memMB)), idle: [],
      orphans: v.orphans.filter(o => heavy(o.cpu, o.memMB)), outside: v.outside.filter(x => heavy(x.cpu, x.memMB)),
    }
    case 'orphans': return { sessions: [], idle: [], orphans: v.orphans, outside: [] }
    case 'self': return { sessions: [...v.active, ...v.idle].filter(r => r.isSelf), idle: [], orphans: [], outside: [] }
    default: return { sessions: v.active, idle: v.idle, orphans: v.orphans, outside: v.outside }
  }
}

export function groupRepos(rows: Row[], orphans: OrphanRow[], snap: Snapshot): RepoRow[] {
  const map = new Map<string, RepoRow>()
  const get = (root: string, label: string) => {
    const k = norm(root)
    if (!map.has(k)) map.set(k, { label, root, cpu: 0, memMB: 0, sessions: [], orphans: [], hist: [] })
    return map.get(k)!
  }
  for (const r of rows) {
    const s = snap.sessions.find(x => x.sessionId === r.id)
    const { root, label } = repoRoot(s?.cwd ?? '')
    const g = get(root, label); g.sessions.push(r); g.cpu += r.cpu; g.memMB += r.memMB
  }
  for (const o of orphans) {
    const src = snap.orphans.find(x => x.label === o.label)
    const { root, label } = repoRoot(src?.root ?? o.label)
    const g = get(root, label); g.orphans.push(o); g.cpu += o.cpu; g.memMB += o.memMB
  }
  for (const g of map.values()) g.hist = sumHist([...g.sessions.map(r => r.hist), ...g.orphans.map(o => o.hist)])
  return [...map.values()]
}

export function groupProcs(rows: Row[], orphans: OrphanRow[], outside: OutsideLoad[]): ProcRow[] {
  const map = new Map<string, ProcRow>()
  const add = (name: string, count: number, cpu: number, memMB: number, where: string) => {
    if (!map.has(name)) map.set(name, { name, count: 0, cpu: 0, memMB: 0, where: [] })
    const p = map.get(name)!; p.count += count; p.cpu += cpu; p.memMB += memMB
    if (!p.where.includes(where)) p.where.push(where)
  }
  for (const r of rows) for (const b of r.byName) add(b.name, b.count, b.cpu, b.memMB, short(r.name, 24))
  for (const o of orphans) for (const t of o.top) add(t.name, 1, t.cpu, t.memMB, tr().orphanOf(o.label))
  for (const x of outside) add(outsideName(x.name), x.count, x.cpu, x.memMB, tr().outsideWhere)
  return [...map.values()]
}

/** Noticeable load: the line above the prompt shows in auto mode. */
export function isBusy(snap: Snapshot): boolean {
  return snap.cpu >= 50 || snap.memUsedMB / snap.memTotalMB >= 0.85
}

/** The three biggest CPU consumers: sessions, orphans and outside processes together. */
export function topConsumers(snap: Snapshot, selfId: string | null): string[] {
  const rows = [
    ...snap.sessions.map(s => ({ cpu: s.cpu, text: `${s.sessionId === selfId ? '▸ ' : ''}${short(s.name, 24)} ${pct(s.cpu)}` })),
    ...snap.orphans.map(o => ({ cpu: o.cpu, text: `⚠ ${short(o.label, 22)} ${pct(o.cpu)}` })),
    ...snap.outside.map(x => ({ cpu: x.cpu, text: `${outsideName(x.name)}${x.count > 1 ? '×' + x.count : ''} ${pct(x.cpu)}` })),
  ]
  return rows.filter(r => r.cpu >= 1).sort((a, b) => b.cpu - a.cpu).slice(0, 3).map(r => r.text)
}

export function bandText(snap: Snapshot, selfId: string | null): string {
  const top = topConsumers(snap, selfId)
  const head = `CPU ${pct(snap.cpu)} · RAM ${pct((snap.memUsedMB / snap.memTotalMB) * 100)}`
  return top.length ? `${head} · ${top.join(' · ')}` : head
}

// --- text report (the answer of /load in the transcript) ---------------

export function textReport(v: View): string {
  const t = tr()
  const [cf, ce] = bar(v.cpu / 100, 12)
  const [mf, me] = bar(v.memFrac, 12)
  const lines = [
    `CPU ${cf}${ce} ${pct(v.cpu)} ${sparkText(v.hist.cpu, 16, 100)}   RAM ${mf}${me} ${pct(v.memFrac * 100)} · ${t.memOf(fmtMem(v.memUsedMB), fmtMem(v.memTotalMB))}`,
    t.reportClaude(plural(lang, v.claude.count, t.sessions), pct(v.claude.cpu), fmtMem(v.claude.memMB), v.ageS),
  ]
  const row = (r: Row, dot: string) =>
    `${dot} ${short(r.name, 36).padEnd(36)} ${sparkText(r.hist, 10)} ${pct(r.cpu).padStart(4)} ${fmtMem(r.memMB).padStart(8)}${r.isSelf ? `  ▸ ${t.thisWindow}` : ''}`
  if (v.active.length) {
    lines.push('', t.sectionActive)
    for (const r of v.active) {
      lines.push(row(r, '●'))
      if (r.detail) lines.push(`    ${r.detail}`)
    }
  }
  if (v.idle.length) {
    lines.push('', t.sectionIdle)
    for (const r of v.idle.slice(0, TEXT_IDLE_ROWS)) lines.push(row(r, '○'))
    const rest = v.idle.slice(TEXT_IDLE_ROWS)
    if (rest.length) lines.push(`  ${t.moreIdle(rest.length, fmtMem(rest.reduce((a, r) => a + r.memMB, 0)))}`)
  }
  if (v.orphans.length) {
    lines.push('', t.reportOrphans)
    for (const o of v.orphans) {
      lines.push(`⚠ ${short(o.label, 30).padEnd(30)} ${pct(o.cpu).padStart(4)} ${fmtMem(o.memMB).padStart(8)}  ${o.detail}`)
      if (o.owners.length) lines.push(`    ${lead(t.inThisRepo)}${o.owners.map(n => short(n, 30)).join('; ')}`)
    }
  }
  if (v.outside.length) {
    lines.push('', `${lead(t.reportOutside)}${v.outside.slice(0, 4).map(x => `${outsideName(x.name)}${x.count > 1 ? ' ×' + x.count : ''} ${pct(x.cpu)} ${fmtMem(x.memMB)}`).join(' · ')}`)
  }
  return lines.join('\n')
}

// --- state, polling, actions -------------------------------------------

type Confirm = { pid: number; name: string; where: string }
type State = {
  snap: Snapshot | null
  selfId: string | null
  band: BandMode
  filter: Filter
  group: Group
  sort: Sort
  showAll: boolean
  expanded: Set<string>
  confirm: Confirm | null
  platform: Platform
  home: string
  sep: string
  stateDir: string
  script: string
  lastWanted: number
  lastSpawn: number
  /** Windows: sampler starts since the last fresh snapshot; three without one means it is blocked. */
  spawns: number
  timer: { cancel: () => void } | null
  /** macOS/Linux leader's sampling memory, and facts read once. */
  posix: SamplerMemory
  cores: number
  memBytes: number
  cwdCache: Map<number, string>
  /** A macOS/Linux pass is running. */
  sampling: boolean
}

export function freshState(): State {
  return {
    snap: null, selfId: null, band: 'auto', filter: 'all', group: 'sessions', sort: 'cpu', showAll: false,
    expanded: new Set(), confirm: null, platform: 'other', home: '', sep: '/', stateDir: '', script: '',
    lastWanted: 0, lastSpawn: 0, spawns: 0, timer: null, posix: freshMemory(), cores: 0, memBytes: 0, cwdCache: new Map(), sampling: false,
  }
}

/** The plugin's option, else Claude Code's `language` setting, else the locale (env, then Intl). */
async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  let setting: unknown
  try {
    setting = ((await $.settings.read()) as Record<string, unknown>).language
  } catch {
    // No settings: the locale decides.
  }
  return pickLang(option, [setting, await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), await $.env.get('LANG')])
}

async function detectPlatform($: EngineInterface): Promise<Platform> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'win32'
  try {
    // The home folder as cwd: the session's own may be a worktree deleted under it.
    const home = await $.env.get('HOME')
    const r = await $.process.run(['uname', '-s'], { timeoutMs: 5000, cwd: home || undefined })
    const os = r.stdout.trim().toLowerCase()
    if (os === 'darwin') return 'darwin'
    if (os === 'linux') return 'linux'
  } catch {
    // No uname: unsupported.
  }
  return 'other'
}

/** The PowerShell line that starts the sampler hidden; `'` in the path (C:\Users\O'Brien) is doubled. */
export function samplerCommand(script: string): string {
  const quoted = `'"${script.replace(/'/g, "''")}"'`
  return `Start-Process -WindowStyle Hidden -FilePath powershell.exe -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',${quoted}`
}

function isBlocked(st: State): boolean {
  return st.platform === 'win32' && st.spawns >= 3
}

async function spawnSampler($: EngineInterface, st: State) {
  st.lastSpawn = await $.clock.now()
  st.spawns++
  try {
    await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', samplerCommand(st.script)], { timeoutMs: 20000, cwd: st.home || undefined })
  } catch (err) {
    $.ui.log(tr().samplerFailed(err instanceof Error ? err.message : String(err)))
  }
}

/** macOS/Linux: one session samples; it holds a lease it renews every pass. */
async function claimLeader($: EngineInterface, st: State, now: number): Promise<boolean> {
  const file = `${st.stateDir}/posix-leader.json`
  try {
    const lease = JSON.parse(String(await $.fs.read(file))) as { id?: string; ts?: number }
    if (lease.id !== st.selfId && now - (lease.ts ?? 0) < LEADER_STALE_MS) return false
  } catch {
    // No lease yet: take it.
  }
  await $.fs.write(file, JSON.stringify({ id: st.selfId, ts: now }))
  try {
    const check = JSON.parse(String(await $.fs.read(file))) as { id?: string }
    return check.id === st.selfId
  } catch {
    return false
  }
}

async function samplePosix($: EngineInterface, st: State, now: number) {
  // The home folder as cwd: the session's own may be a worktree deleted under it.
  const run = (argv: string[]) => $.process.run(argv, { timeoutMs: 10000, cwd: st.home || undefined })
  const psr = await run(st.platform === 'darwin' ? ['ps', '-axo', 'pid=,ppid=,time=,rss=,comm='] : ['ps', '-eo', 'pid=,ppid=,time=,rss=,comm='])
  if (psr.exitCode !== 0) return
  const rows = parsePs(psr.stdout)
  if (!st.cores) {
    // getconf is missing on some minimal systems (busybox): nproc, then one core.
    for (const argv of [['getconf', '_NPROCESSORS_ONLN'], ['nproc']]) {
      try {
        st.cores = Number.parseInt((await run(argv)).stdout.trim(), 10) || 0
      } catch {
        // Not installed: the next one.
      }
      if (st.cores) break
    }
    st.cores ||= 1
  }
  let mem: { totalMB: number; usedMB: number }
  if (st.platform === 'linux') {
    mem = parseMeminfo(String(await $.fs.read('/proc/meminfo')))
  } else {
    if (!st.memBytes) st.memBytes = Number((await run(['sysctl', '-n', 'hw.memsize'])).stdout.trim()) || 0
    mem = parseVmStat((await run(['vm_stat'])).stdout, st.memBytes)
  }
  const sessions: SessionMeta[] = []
  const dir = `${st.home}/.claude/sessions`
  try {
    for (const f of await $.fs.list(dir)) {
      if (!f.name.endsWith('.json')) continue
      try {
        const meta = parseSessionFile(String(await $.fs.read(`${dir}/${f.name}`)))
        if (meta) sessions.push(meta)
      } catch {
        // A file being rewritten: next pass.
      }
    }
  } catch {
    // No sessions folder yet.
  }
  const alive = new Set(rows.map(r => r.pid))
  for (const pid of [...st.cwdCache.keys()]) if (!alive.has(pid)) st.cwdCache.delete(pid)
  const want = orphanCandidates(rows, sessions, st.posix, now, st.cores).filter(pid => !st.cwdCache.has(pid))
  if (want.length && st.platform === 'linux') {
    for (const pid of want) {
      try {
        const s = await $.fs.stat(`/proc/${pid}/cwd`, { resolve: true })
        if (s.realPath) st.cwdCache.set(pid, s.realPath)
      } catch {
        // Gone, or not ours to read.
      }
    }
  } else if (want.length) {
    try {
      const r = await run(['lsof', '-a', '-d', 'cwd', '-Fpn', '-p', want.join(',')])
      for (const [pid, path] of parseLsofCwd(r.stdout)) st.cwdCache.set(pid, path)
    } catch {
      // No lsof: orphans stay among the other processes.
    }
  }
  const snap = buildSnapshot({ now, intervalMs: POLL_MS, cores: st.cores, mem, rows, sessions, cwdOf: st.cwdCache }, st.posix)
  await $.fs.write(`${st.stateDir}/snapshot.json`, JSON.stringify(snap))
}

async function tick($: EngineInterface, st: State) {
  const now = await $.clock.now()
  if (st.platform === 'darwin' || st.platform === 'linux') {
    // One pass at a time, and not closer than MIN_SAMPLE_MS: the refresh button, /load and a kill
    // also tick, and a pass a moment after the last one turns ps's whole-second CPU times into spikes.
    if (!st.sampling) {
      st.sampling = true
      try {
        if (await claimLeader($, st, now) && now - st.posix.prevAt >= MIN_SAMPLE_MS) await samplePosix($, st, now)
      } catch (err) {
        $.ui.log(tr().samplerFailed(err instanceof Error ? err.message : String(err)))
      } finally {
        st.sampling = false
      }
    }
  } else if (now - st.lastWanted >= WANTED_EVERY_MS) {
    st.lastWanted = now
    try { await $.fs.write(`${st.stateDir}${st.sep}wanted`, String(now)) } catch { /* the next tick tries again */ }
  }
  let fresh: Snapshot | null = null
  try { fresh = JSON.parse(String(await $.fs.read(`${st.stateDir}${st.sep}snapshot.json`))) as Snapshot } catch { fresh = null }
  if (fresh && now - fresh.ts <= STALE_MS) st.spawns = 0
  if (st.platform === 'win32' && (!fresh || now - fresh.ts > STALE_MS) && now - st.lastSpawn > RESPAWN_MS) await spawnSampler($, st)
  if (fresh && fresh.ts !== st.snap?.ts && fresh.warm) {
    st.snap = fresh
    $.ui.invalidate('ui.render')
  }
}

/**
 * A PID that may be ended: present in the snapshot (under `name` when given), not a Claude session's
 * own process, not a system one.
 */
export function canKill(snap: Snapshot | null, pid: number, name?: string): boolean {
  if (!snap || pid <= 4) return false
  if (snap.sessions.some(s => s.pid === pid)) return false
  const known = [...snap.sessions.flatMap(s => s.top), ...snap.orphans.flatMap(o => o.top)]
  const p = known.find(t => t.pid === pid)
  return !!p && p.name.toLowerCase() !== 'claude' && (name === undefined || p.name === name)
}

/** Every descendant of `pid` in a ps listing, children before their parents' siblings. */
export function descendants(rows: Array<{ pid: number; ppid: number }>, pid: number): number[] {
  const kids = new Map<number, number[]>()
  for (const r of rows) if (r.pid !== r.ppid) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r.pid])
  const out: number[] = []
  const seen = new Set<number>([pid])
  const walk = (p: number) => {
    for (const k of kids.get(p) ?? []) {
      if (seen.has(k)) continue
      seen.add(k)
      walk(k)
      out.push(k)
    }
  }
  walk(pid)
  return out
}

async function killProcess($: EngineInterface, st: State, c: Confirm) {
  st.confirm = null
  const t = tr()
  // The confirmation may have waited a while: the PID must still be the same process in a fresh sample.
  await tick($, st)
  const now = await $.clock.now()
  if (!st.snap || now - st.snap.ts > STALE_MS || !canKill(st.snap, c.pid, c.name)) {
    $.ui.toast(t.cannotKill(c.name, c.pid))
    $.ui.invalidate('ui.render')
    return
  }
  const run = (argv: string[], timeoutMs: number) => $.process.run(argv, { timeoutMs, cwd: st.home || undefined })
  let r: { exitCode: number; stdout: string; stderr: string }
  try {
    if (st.platform === 'win32') {
      r = await run(['taskkill.exe', '/PID', String(c.pid), '/T', '/F'], 15000)
    } else {
      // The whole tree, as taskkill /T does: descendants from a fresh ps, then the process itself.
      const ps = await run(st.platform === 'darwin' ? ['ps', '-axo', 'pid=,ppid=,time=,rss=,comm='] : ['ps', '-eo', 'pid=,ppid=,time=,rss=,comm='], 10000)
      const tree = [...descendants(parsePs(ps.stdout), c.pid), c.pid].map(String)
      r = await run(['kill', '-TERM', ...tree], 5000)
      if (r.exitCode === 0) {
        await $.clock.sleep(3000)
        const left: string[] = []
        for (const pid of tree) if ((await run(['kill', '-0', pid], 5000)).exitCode === 0) left.push(pid)
        if (left.length) r = await run(['kill', '-KILL', ...left], 5000)
      }
    }
  } catch (err) {
    r = { exitCode: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
  }
  $.ui.toast(r.exitCode === 0 ? t.killed(c.name, c.pid, c.where) : t.killFailed(c.name, c.pid, (r.stderr || r.stdout).trim().slice(0, 120)))
  await tick($, st)
  $.ui.invalidate('ui.render')
}

/** Go to a session: the app's deep link through the OS (a pane's Link only takes https). */
async function openSession($: EngineInterface, st: State, link: string) {
  if (!/^claude:\/\/claude\.ai\/epitaxy\/local_[0-9a-f-]+$/i.test(link)) return
  const argv = st.platform === 'win32'
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `Start-Process '${link}'`]
    : st.platform === 'darwin' ? ['open', link] : ['xdg-open', link]
  try {
    const r = await $.process.run(argv, { timeoutMs: 15000, cwd: st.home || undefined })
    if (r.exitCode !== 0) $.ui.toast(tr().openFailed((r.stderr || r.stdout).trim().slice(0, 120)))
  } catch (err) {
    $.ui.toast(tr().openFailed(err instanceof Error ? err.message : String(err)))
  }
}

async function openPane($: EngineInterface, st: State) {
  await $.ui.open({ id: PANE, title: tr().paneTitle })
  $.ui.invalidate('ui.render')
}

/** "Sort it out with Claude": a turn of its own in this session, by the sessions-triage skill. */
async function triage($: EngineInterface) {
  $.ui.toast(tr().triageToast)
  await $.prompt.submit({ text: TRIAGE_PROMPT })
}

async function saveView($: EngineInterface, st: State) {
  await $.store.set(KEY_VIEW, { filter: st.filter, group: st.group, sort: st.sort })
  $.ui.invalidate('ui.render')
}

const FILTERS: Filter[] = ['all', 'active', 'heavy', 'orphans', 'self']
const GROUPS: Group[] = ['sessions', 'repos', 'procs']
const SORTS: Sort[] = ['cpu', 'mem']

function filterLabel(f: Filter): string {
  const t = tr()
  return { all: t.filterAll, active: t.filterActive, heavy: t.filterHeavy, orphans: t.filterOrphans, self: t.filterSelf }[f]
}
function groupLabel(g: Group): string {
  const t = tr()
  return { sessions: t.groupSessions, repos: t.groupRepos, procs: t.groupProcs }[g]
}
function sortLabel(s: Sort): string {
  return s === 'cpu' ? tr().sortCpu : tr().sortMem
}

export const register: Register = (on, options) => {
  const st = freshState()

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    lang = await detectLang($, options?.language)
    st.platform = await detectPlatform($)
    if (st.platform === 'other') return r
    st.sep = st.platform === 'win32' ? '\\' : '/'
    st.home = (st.platform === 'win32' ? await $.env.get('USERPROFILE') : await $.env.get('HOME')) ?? ''
    st.stateDir = [st.home, '.claude', 'state', 'load'].join(st.sep)
    st.script = `${$.plugin.root}\\sampler\\load-sampler.ps1`.replace(/\//g, '\\')
    st.selfId = await $.session.id()
    const saved = await $.store.get(KEY_BAND)
    st.band = saved === 'on' || saved === 'off' ? saved : 'auto'
    const view = (await $.store.get(KEY_VIEW)) as { filter?: Filter; group?: Group; sort?: Sort } | undefined
    if (view && FILTERS.includes(view.filter as Filter)) st.filter = view.filter as Filter
    if (view && GROUPS.includes(view.group as Group)) st.group = view.group as Group
    if (view && SORTS.includes(view.sort as Sort)) st.sort = view.sort as Sort
    await $.command.register({
      name: 'load',
      description: tr().commandDescription,
      argumentHint: '[all | band on|off|auto]',
      immediate: true,
    })
    st.timer?.cancel()
    st.timer = $.clock.every(POLL_MS, () => { void tick($, st) })
    void tick($, st)
    return r
  })

  on('session.end', async ($, e, next) => {
    st.timer?.cancel()
    st.timer = null
    return next(e)
  })

  on('command.run', { command: 'load' }, async ($, e) => {
    const t = tr()
    if (st.platform === 'other') return { text: t.unsupported }
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    if (words[0] === 'band') {
      const mode = words[1]
      if (mode !== 'on' && mode !== 'off' && mode !== 'auto') return { text: t.bandUsage }
      st.band = mode
      await $.store.set(KEY_BAND, mode)
      $.ui.invalidate('ui.render')
      return { text: t.bandSet(mode) }
    }
    st.showAll = words[0] === 'all'
    await tick($, st)
    await $.ui.open({ id: PANE, title: t.paneTitle })
    $.ui.invalidate('ui.render')
    if (!st.snap) return { text: isBlocked(st) ? t.samplerBlocked : t.samplerStarting }
    return { text: textReport(buildView(st.snap, st.selfId, await $.clock.now(), st.sort)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const t = tr()
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Select = (els as { Select?: typeof els.Button }).Select
    const Svg = e.surface === 'terminal' ? null : (els as { Svg?: typeof els.Button }).Svg ?? null
    const snap = st.snap
    if (!snap) return isBlocked(st)
      ? <Box><Text color="warning">{t.samplerBlocked}</Text></Box>
      : <Box><Text dimColor>{t.waiting}</Text></Box>

    const v = buildView(snap, st.selfId, await $.clock.now(), st.sort)
    const shown = applyFilter(v, st.filter)
    const columns = Math.max(56, e.props.bodyColumns ?? 90)
    const nameMax = Math.max(18, columns - 24)
    const minutes = Math.max(1, Math.round(((snap.hist?.cpu.length ?? 1) * snap.intervalMs) / 60000))

    // --- primitives: SVG on the desktop, text in a terminal ---
    const icon = (kind: IconKind) => Svg
      ? <Box width={3}><Svg source={iconSvg(kind)} width={14} height={14} alt={kind} /></Box>
      : <Box width={2}><Text color={kind === 'busy' ? 'success' : kind === 'orphan' || kind === 'working' ? 'warning' : 'inactive'}>{ICON_TEXT[kind]}</Text></Box>

    const spark = (vals: number[], tone: Tone, w: number, floor = 5) => Svg
      ? <Svg source={sparkSvg(vals, w * 7, 14, HEX[tone], floor)} width={w * 7} height={14} alt={t.graphAlt(minutes)} />
      : <Text color={tone === 'inactive' ? undefined : tone} dimColor={tone === 'inactive'}>{sparkText(vals, w, floor)}</Text>

    const meterBar = (frac: number, tone: Tone, w: number) => {
      if (Svg) return <Svg source={barSvg(frac, w * 7, 8, HEX[tone])} width={w * 7} height={8} alt={pct(frac * 100)} />
      const [f, rest] = bar(frac, w)
      return <Text><Text color={tone}>{f}</Text><Text dimColor>{rest}</Text></Text>
    }

    const cpuCell = (cpu: number) => (
      <Box width={14} gap={1} alignItems="center">
        {meterBar(cpu / v.scale, cpuTone(cpu), 6)}
        <Text color={cpu >= 1 ? cpuTone(cpu) : undefined} dimColor={cpu < 1} bold={cpu >= 10}>{pct(cpu).padStart(4)}</Text>
      </Box>
    )
    const memCell = (mb: number, dim: boolean) => (
      <Box width={9} justifyContent="flex-end"><Text color={memTone(mb)} dimColor={dim && !memTone(mb)} bold={!!memTone(mb)}>{fmtMem(mb)}</Text></Box>
    )
    const chip = (text: string) => <Text dimColor>  {text}</Text>

    const killButton = (p: Top, where: string, key: string) => canKill(snap, p.pid) && (
      <Button key={key} label={t.kill} plain dimColor onPress={() => { st.confirm = { pid: p.pid, name: p.name, where }; $.ui.invalidate('ui.render') }} />
    )

    // --- rows ---
    const sessionRow = (r: Row, dim: boolean, key: string) => {
      const isOpen = st.expanded.has(r.id) || st.filter === 'self'
      const toggle = () => { if (st.expanded.has(r.id)) st.expanded.delete(r.id); else st.expanded.add(r.id); $.ui.invalidate('ui.render') }
      const kind: IconKind = r.status === 'busy' ? 'busy' : r.cpu >= 1 ? 'working' : 'idle'
      const meta = [r.isSelf ? t.thisWindow : '', plural(lang, r.procs, t.procs), r.detail].filter(Boolean).join(' · ')
      const openButton = r.link && !r.isSelf && (
        <Button key={`${key}-open`} label={t.open} plain dimColor onPress={() => { const l = r.link; if (l) void openSession($, st, l) }} />
      )
      return (
        <Box key={key} flexDirection="column" marginTop={dim ? 0 : 1}>
          <Box alignItems="center">
            {icon(kind)}
            <Box flexGrow={1}>
              <Text bold={!dim || r.isSelf} dimColor={dim && !r.isSelf} color={r.isSelf ? 'claude' : undefined}>{short(r.name, nameMax)}</Text>
            </Box>
            {!dim && cpuCell(r.cpu)}
            {memCell(r.memMB, dim)}
          </Box>
          {(!dim || isOpen) && (
            <Box paddingLeft={Svg ? 3 : 2} gap={1} alignItems="center">
              {spark(r.hist, cpuTone(Math.max(r.cpu, ...r.hist.slice(-5))), 12)}
              <Box flexGrow={1}><Text dimColor color={r.isSelf ? 'claude' : undefined}>{short(meta, Math.max(16, columns - 40))}</Text></Box>
              <Button key={`${key}-t`} label={isOpen ? t.hideProcs : t.showProcs} plain dimColor onPress={toggle} />
              {openButton}
            </Box>
          )}
          {dim && !isOpen && (
            <Box paddingLeft={Svg ? 3 : 2} gap={1}>
              <Button key={`${key}-t`} label={t.showProcs} plain dimColor onPress={toggle} />
              {openButton}
            </Box>
          )}
          {isOpen && (
            <Box flexDirection="column" paddingLeft={Svg ? 5 : 4} marginBottom={1}>
              {r.byName.map((b, i) => (
                <Box key={`${key}-n${i}`}>
                  <Box flexGrow={1}><Text dimColor>⚙ {b.name}{b.count > 1 ? ` ×${b.count}` : ''}</Text></Box>
                  <Box width={7} justifyContent="flex-end"><Text color={b.cpu >= 1 ? cpuTone(b.cpu) : undefined} dimColor={b.cpu < 1}>{pct(b.cpu)}</Text></Box>
                  {memCell(b.memMB, true)}
                </Box>
              ))}
              {r.procsList.filter(p => canKill(snap, p.pid) && (p.cpu >= 0.5 || p.memMB >= 200)).map((p, i) => (
                <Box key={`${key}-p${i}`} gap={1}>
                  <Text dimColor>#{p.pid} {p.name} · {pct(p.cpu)} · {fmtMem(p.memMB)}</Text>
                  {killButton(p, short(r.name, 24), `${key}-k${i}`)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const orphanRow = (o: OrphanRow, key: string) => (
      <Box key={key} flexDirection="column" marginTop={1}>
        <Box alignItems="center">
          {icon('orphan')}
          <Box flexGrow={1}><Text bold>{short(o.label, nameMax)}</Text></Box>
          {cpuCell(o.cpu)}
          {memCell(o.memMB, false)}
        </Box>
        <Box paddingLeft={Svg ? 3 : 2} gap={1} flexWrap="wrap" alignItems="center">
          {spark(o.hist, cpuTone(Math.max(o.cpu, ...o.hist.slice(-5))), 12)}
          {o.top.map((p, i) => (
            <Box key={`${key}-t${i}`} gap={1}>
              <Text dimColor>#{p.pid} {p.name}</Text>
              {killButton(p, t.orphanOf(o.label), `${key}-k${i}`)}
            </Box>
          ))}
          {o.owners.length > 0 && <Text dimColor>· {lead(t.inThisRepo)}{o.owners.map(n => short(n, 22)).join('; ')}</Text>}
        </Box>
      </Box>
    )

    const section = (title: string, note?: string) => (
      <Box marginTop={1}>
        <Text bold>{title.toUpperCase()}</Text>
        {note && chip(note)}
      </Box>
    )

    // --- header ---
    const meter = (label: string, frac: number, value: string, vals: number[]) => {
      const tone = machineTone(frac)
      return (
        <Box alignItems="center" gap={1}>
          <Box width={4}><Text bold>{label}</Text></Box>
          {meterBar(frac, tone, 14)}
          <Box width={16}><Text bold color={tone}>{value}</Text></Box>
          <Box flexGrow={1}>{spark(vals, tone, Math.max(10, Math.min(30, columns - 42)), 100)}</Box>
        </Box>
      )
    }

    const head = (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        {meter('CPU', v.cpu / 100, pct(v.cpu), v.hist.cpu)}
        {meter('RAM', v.memFrac, `${fmtMem(v.memUsedMB)} / ${fmtMem(v.memTotalMB)}`, v.hist.mem)}
        <Box gap={1} marginTop={1} alignItems="center">
          {icon('machine')}
          <Text dimColor>{t.headLine(`Claude: ${plural(lang, v.claude.count, t.sessions)}`, pct(v.claude.cpu), fmtMem(v.claude.memMB), plural(lang, v.cores, t.threads), v.ageS)}</Text>
        </Box>
      </Box>
    )

    const controls = (
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1} flexWrap="wrap">
          {FILTERS.map(f => (
            <Button key={`f-${f}`} label={filterLabel(f)} variant={st.filter === f ? 'primary' : 'secondary'}
              onPress={() => { st.filter = f; void saveView($, st) }} />
          ))}
        </Box>
        <Box gap={2} marginTop={1} flexWrap="wrap" alignItems="center">
          {Select
            ? <Select key="group" label={t.groupLabel} value={st.group} options={GROUPS.map(g => ({ value: g, label: groupLabel(g) }))} onSelect={(value: string) => { st.group = value as Group; void saveView($, st) }} />
            : <Box gap={1}>{GROUPS.map(g => <Button key={`g-${g}`} label={groupLabel(g)} variant={st.group === g ? 'primary' : 'secondary'} onPress={() => { st.group = g; void saveView($, st) }} />)}</Box>}
          {Select
            ? <Select key="sort" label={t.sortLabel} value={st.sort} options={SORTS.map(s => ({ value: s, label: sortLabel(s) }))} onSelect={(value: string) => { st.sort = value as Sort; void saveView($, st) }} />
            : <Box gap={1}>{SORTS.map(s => <Button key={`s-${s}`} label={sortLabel(s)} variant={st.sort === s ? 'primary' : 'secondary'} onPress={() => { st.sort = s; void saveView($, st) }} />)}</Box>}
          <Box flexGrow={1} />
          <Button key="refresh" label="↻" plain dimColor onPress={() => { void tick($, st) }} />
          <Button key="triage" label={t.triage} variant="primary" onPress={() => { void triage($) }} />
        </Box>
      </Box>
    )

    const confirmBar = st.confirm && (
      <Box marginTop={1} borderStyle="round" borderColor="warning" paddingX={1} flexDirection="column">
        <Text color="warning" bold>{t.killTitle(st.confirm.name, st.confirm.pid)}</Text>
        {/* Only taskkill /T ends the child processes too; kill on macOS/Linux ends the one PID. */}
        <Text dimColor>{st.confirm.where} · {t.killNote}</Text>
        <Box gap={2} marginTop={1}>
          <Button key="kill-yes" label={t.killYes} variant="primary" onPress={() => { const c = st.confirm; if (c) void killProcess($, st, c) }} />
          <Button key="kill-no" label={t.killNo} variant="secondary" onPress={() => { st.confirm = null; $.ui.invalidate('ui.render') }} />
        </Box>
      </Box>
    )

    // --- body by grouping ---
    let body: unknown[] = []
    if (st.group === 'sessions') {
      const idleRoom = st.showAll ? shown.idle.length : 8
      const idleShown = shown.idle.slice(0, idleRoom)
      const idleRest = shown.idle.slice(idleRoom)
      body = [
        shown.sessions.length > 0 && section(st.filter === 'all' || st.filter === 'active' ? t.sectionActive : t.sectionSessions,
          `${shown.sessions.length} · ${pct(shown.sessions.reduce((a, r) => a + r.cpu, 0))} CPU · ${fmtMem(shown.sessions.reduce((a, r) => a + r.memMB, 0))}`),
        ...shown.sessions.map((r, i) => sessionRow(r, false, `a${i}`)),
        shown.idle.length > 0 && section(t.sectionIdle, `${shown.idle.length} · ${fmtMem(shown.idle.reduce((a, r) => a + r.memMB, 0))}`),
        ...idleShown.map((r, i) => sessionRow(r, true, `i${i}`)),
        idleRest.length > 0 && (
          <Box key="idle-more" paddingLeft={2} marginTop={1}>
            <Button key="idle-all" label={t.moreIdle(idleRest.length, fmtMem(idleRest.reduce((a, r) => a + r.memMB, 0)))} plain dimColor onPress={() => { st.showAll = true; $.ui.invalidate('ui.render') }} />
          </Box>
        ),
        shown.orphans.length > 0 && section(t.sectionOrphans, t.orphansNote),
        ...shown.orphans.map((o, i) => orphanRow(o, `o${i}`)),
      ]
    } else if (st.group === 'repos') {
      const repos = groupRepos([...shown.sessions, ...shown.idle], shown.orphans, snap)
        .sort((a, b) => st.sort === 'mem' ? b.memMB - a.memMB : b.cpu - a.cpu || b.memMB - a.memMB)
      body = repos.map((g, gi) => (
        <Box key={`r${gi}`} flexDirection="column">
          <Box marginTop={1} alignItems="center">
            {icon('repo')}
            <Box flexGrow={1}>
              <Text bold>{g.label}</Text>
              {chip([plural(lang, g.sessions.length, t.sessions), g.orphans.length ? plural(lang, g.orphans.length, t.orphans) : ''].filter(Boolean).join(' · '))}
            </Box>
            {cpuCell(g.cpu)}
            {memCell(g.memMB, false)}
          </Box>
          {g.sessions.map((r, i) => sessionRow(r, r.status !== 'busy' && r.cpu < 1, `r${gi}s${i}`))}
          {g.orphans.map((o, i) => orphanRow(o, `r${gi}o${i}`))}
        </Box>
      ))
    } else {
      const procs = groupProcs([...shown.sessions, ...shown.idle], shown.orphans, shown.outside)
        .sort((a, b) => st.sort === 'mem' ? b.memMB - a.memMB : b.cpu - a.cpu || b.memMB - a.memMB)
        .slice(0, 25)
      body = [
        section(t.sectionProcs, plural(lang, procs.length, t.names)),
        ...procs.map((p, i) => (
          <Box key={`p${i}`} flexDirection="column" marginTop={1}>
            <Box alignItems="center">
              {icon('proc')}
              <Box flexGrow={1}><Text bold>{p.name}</Text>{chip(p.count > 1 ? `×${p.count}` : '')}</Box>
              {cpuCell(p.cpu)}
              {memCell(p.memMB, false)}
            </Box>
            <Box paddingLeft={Svg ? 3 : 2}><Text dimColor>{short(p.where.join(' · '), columns - 6)}</Text></Box>
          </Box>
        )),
      ]
    }

    const outsideBlock = st.group !== 'procs' && shown.outside.length > 0 && [
      section(t.sectionOutside),
      ...shown.outside.map((x, i) => (
        <Box key={`x${i}`} alignItems="center">
          {icon('proc')}
          <Box flexGrow={1}><Text dimColor>{outsideName(x.name)}</Text>{chip(x.count > 1 ? `×${x.count}` : '')}</Box>
          {cpuCell(x.cpu)}
          {memCell(x.memMB, true)}
        </Box>
      )),
    ]

    const empty = st.group === 'sessions' && !shown.sessions.length && !shown.idle.length && !shown.orphans.length

    return (
      <Box flexDirection="column">
        {head}
        {controls}
        {confirmBar}
        {body}
        {empty && <Box marginTop={1}><Text dimColor>{t.empty}</Text></Box>}
        {outsideBlock}
        <Box marginTop={1}>
          <Text dimColor>{t.footer(minutes)}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const snap = st.snap
    if (!snap || e.props.hasSurvey || st.band === 'off') return rest
    if (st.band === 'auto' && !isBusy(snap)) return rest
    if ((await $.clock.now()) - snap.ts > 3 * STALE_MS) return rest
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = e.surface === 'terminal' ? null : (els as { Svg?: typeof els.Button }).Svg ?? null
    const cpuFrac = snap.cpu / 100
    const memFrac = snap.memUsedMB / snap.memTotalMB
    const cpuTn = machineTone(cpuFrac)
    // One line that never wraps: as many top consumers as the width leaves room for.
    const room = Math.max(0, (e.props.bodyColumns ?? 100) - 34)
    const fitted: string[] = []
    let used = 0
    for (const s of topConsumers(snap, st.selfId)) {
      if (used + s.length + 3 > room) break
      fitted.push(s)
      used += s.length + 3
    }
    return (
      <Box flexDirection="column">
        {rest}
        <Box alignItems="center" gap={1}>
          {Svg
            ? <Svg source={sparkSvg(snap.hist?.cpu ?? [snap.cpu], 64, 14, HEX[cpuTn], 100)} width={64} height={14} alt={tr().bandLabel} />
            : <Text color={cpuTn}>{sparkText(snap.hist?.cpu ?? [snap.cpu], 8, 100)}</Text>}
          <Text bold color={cpuTn}>CPU {pct(snap.cpu)}</Text>
          <Text bold color={machineTone(memFrac)}>RAM {pct(memFrac * 100)}</Text>
          {fitted.map((s, i) => <Text key={`b${i}`} dimColor>· {s}</Text>)}
          <Box flexGrow={1} />
          <Button key="band-open" label="/load" plain dimColor onPress={() => { void openPane($, st) }} />
        </Box>
      </Box>
    )
  })
}
