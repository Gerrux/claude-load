// The macOS/Linux sampler's brain: pure functions only (no engine, no I/O). The glue in register.tsx
// runs ps / vm_stat / lsof, reads /proc/meminfo and the session files, and feeds the text in here.
// It mirrors sampler/load-sampler.ps1: ownership by parent chain, orphan rules, folding, history.
// An orphan is a tree whose parent died: a root (not owned by a session, parent gone or reparented
// to init/systemd/launchd) with all its descendants; a live shell under a live terminal is not one.

import type { ByName, OrphanLoad, OutsideLoad, SessionLoad, Snapshot, Top } from './types'

export type PsRow = { pid: number; ppid: number; cpuSec: number; rssKB: number; name: string }
export type SessionMeta = { pid: number; sessionId: string; hostSessionId: string; name: string; status: string; cwd: string }
export type SamplerMemory = { prevCpu: Map<number, number>; prevAt: number; hist: Map<string, number[]> }

/** Same set as the ps1 $devNames plus the usual unix shells and tools; also matches with ".exe" and python3.11. */
export const DEV_NAMES = /^(node|python[0-9.]*|pythonw|cargo|rustc|rust-analyzer|java|esbuild|pnpm|npm|bash|sh|zsh|fish|git|adb|gradle|tsc|vite|uv|deno|bun|make|ruby|go|gopls|cmake)(\.exe)?$/i

const HIST_LEN = 90
const ORPHAN_CPU = 0.3
const ORPHAN_RSS_KB = 150 * 1024
/** Shells and console hosts alone never make a tree worth reporting. */
const SHELLS = /^(bash|sh|zsh|fish|powershell|pwsh|cmd|conhost)(\.exe)?$/i
/** A parent with such a name is a reaper: the child has lost its real parent. */
const INIT_NAMES = /^(init|systemd|launchd)$/

export function freshMemory(): SamplerMemory {
  return { prevCpu: new Map(), prevAt: 0, hist: new Map() }
}

// ---------------------------------------------------------------- parsers

/** Seconds from the ps `time` column: [[dd-]hh:]mm:ss on Linux, [hh:]mm:ss.cc on macOS. NaN when malformed. */
export function parseCpuTime(s: string): number {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim())
  if (!m) return NaN
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4])
}

function commName(comm: string): string {
  let c = comm.trim().replace(/ \(deleted\)$/, '')
  // Only a path is cut to its last segment: Linux kernel threads ("kworker/0:1") are not paths.
  if (c.startsWith('/')) c = c.slice(c.lastIndexOf('/') + 1)
  return c.replace(/^-(?=[A-Za-z])/, '') // login shells show as "-zsh"
}

/** Output of `ps -axo pid=,ppid=,time=,rss=,comm=` (macOS) or `ps -eo ...` (Linux). Malformed lines are skipped. */
export function parsePs(text: string): PsRow[] {
  const rows: PsRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\S.*?)\s*$/.exec(line)
    if (!m) continue
    const cpuSec = parseCpuTime(m[3])
    const name = commName(m[5])
    if (Number.isNaN(cpuSec) || !name) continue
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), cpuSec, rssKB: Number(m[4]), name })
  }
  return rows
}

/** Linux /proc/meminfo: used = MemTotal - MemAvailable. */
export function parseMeminfo(text: string): { totalMB: number; usedMB: number } {
  const kb = (key: string): number | undefined => {
    const m = new RegExp('^' + key + ':\\s+(\\d+)', 'm').exec(text)
    return m ? Number(m[1]) : undefined
  }
  const total = kb('MemTotal') ?? 0
  const avail = kb('MemAvailable') ?? (kb('MemFree') ?? 0) + (kb('Buffers') ?? 0) + (kb('Cached') ?? 0)
  return { totalMB: Math.round(total / 1024), usedMB: Math.round(Math.max(0, total - avail) / 1024) }
}

/** macOS vm_stat: available = free + inactive + speculative + purgeable pages. */
export function parseVmStat(text: string, totalBytes: number): { totalMB: number; usedMB: number } {
  const size = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 16384)
  const pages = new Map<string, number>()
  for (const m of text.matchAll(/^Pages ([a-z ]+?):\s+(\d+)\./gm)) pages.set(m[1], Number(m[2]))
  const availPages = ['free', 'inactive', 'speculative', 'purgeable'].reduce((a, k) => a + (pages.get(k) ?? 0), 0)
  const usedBytes = Math.max(0, totalBytes - availPages * size)
  return { totalMB: Math.round(totalBytes / 1048576), usedMB: Math.round(usedBytes / 1048576) }
}

/** Output of `lsof -a -d cwd -Fpn -p ...`: `p<pid>` then `n<path>`. */
export function parseLsofCwd(text: string): Map<number, string> {
  const out = new Map<number, string>()
  let pid = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || 0
    else if (line.startsWith('n') && pid > 0 && !out.has(pid)) out.set(pid, line.slice(1))
  }
  return out
}

/** ~/.claude/sessions/<pid>.json; null when it is not a session record. */
export function parseSessionFile(text: string): SessionMeta | null {
  let j: unknown
  try { j = JSON.parse(text) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const pid = Number(o.pid)
  if (!Number.isInteger(pid) || pid <= 0) return null
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
  return { pid, sessionId: str(o.sessionId), hostSessionId: str(o.hostSessionId), name: str(o.name), status: str(o.status), cwd: str(o.cwd) }
}

// ---------------------------------------------------------------- repository labels

const SYSTEM_DIR = /^\/(usr|bin|sbin|lib|lib64|etc|dev|sys|proc|System|Library|Applications|private\/var)(\/|$)/
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** Worktree dirs fold into their checkout ("repo/feat-a"); other dirs label themselves; system dirs give null. */
export function repoLabel(dir: string): { root: string; label: string } | null {
  const d = dir.replace(/\/+$/, '')
  if (!d || SYSTEM_DIR.test(d)) return null
  const m = /^(.*?)\/\.claude\/worktrees\/([^/]+)/.exec(d)
  if (m) return { root: m[1], label: baseName(m[1]) + '/' + m[2] }
  return { root: d, label: baseName(d) }
}

// ---------------------------------------------------------------- analysis

type Proc = { pid: number; name: string; cpu: number; rssKB: number }
type Folded = { name: string; count: number; cpu: number; rssKB: number }

const round1 = (x: number) => Math.round(x * 10) / 10
const toMB = (kb: number) => Math.round(kb / 1024)
const nameCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const weight = (cpu: number, rssKB: number) => cpu * 1e6 + rssKB / 1024

/** Per-process CPU % of the whole machine since the previous pass, and the owning session of every process. */
function analyze(rows: PsRow[], sessions: SessionMeta[], memory: SamplerMemory, now: number, cores: number) {
  const dtSec = memory.prevAt > 0 ? (now - memory.prevAt) / 1000 : 0
  const procs: Proc[] = []
  const byPid = new Map<number, PsRow>()
  for (const r of rows) {
    if (byPid.has(r.pid)) continue
    byPid.set(r.pid, r)
    const prev = memory.prevCpu.get(r.pid)
    const cpu = dtSec > 0 && prev !== undefined ? Math.max(0, (r.cpuSec - prev) / (dtSec * Math.max(1, cores)) * 100) : 0
    procs.push({ pid: r.pid, name: r.name, cpu, rssKB: r.rssKB })
  }
  const live = new Map<number, SessionMeta>()
  for (const s of sessions) if (byPid.has(s.pid) && !live.has(s.pid)) live.set(s.pid, s)

  // Walk ppid up to a session pid (64 steps at most); memoized along the chain. 0 = no session.
  const owner = new Map<number, number>()
  const ownerOf = (id: number): number => {
    const chain: number[] = []
    let x = id
    for (let i = 0; i < 64; i++) {
      const known = owner.get(x)
      if (known !== undefined) { for (const y of chain) owner.set(y, known); return known }
      if (live.has(x)) { for (const y of chain) owner.set(y, x); owner.set(x, x); return x }
      chain.push(x)
      const px = byPid.get(x)?.ppid ?? 0
      if (px === 0 || px === x || !byPid.has(px)) break
      x = px
    }
    for (const y of chain) owner.set(y, 0)
    return 0
  }
  // The processes above a session (the shell or terminal it runs in) are never orphans: ending
  // one would end the session with it.
  const hosts = new Set<number>()
  for (const pid of live.keys()) {
    let x = byPid.get(pid)?.ppid ?? 0
    for (let i = 0; i < 64 && x > 1 && byPid.has(x) && !hosts.has(x); i++) {
      hosts.add(x)
      x = byPid.get(x)?.ppid ?? 0
    }
  }
  return { procs, byPid, live, ownerOf, dtSec, hosts }
}

type Tree = { root: Proc; members: Proc[]; heaviest: Proc; cpu: number; rssKB: number }

const isQualifying = (p: Proc) => DEV_NAMES.test(p.name) && !SHELLS.test(p.name)
const heavier = (a: Proc, b: Proc) => weight(b.cpu, b.rssKB) - weight(a.cpu, a.rssKB) || a.pid - b.pid

/**
 * Orphan trees: a root outside every session (a dev-named process whose parent is dead: absent,
 * pid 1, or named init/systemd/launchd) with all its descendants. A tree is worth reporting when
 * it holds a qualifying process (a dev tool, not a shell) and weighs enough. Trees are disjoint:
 * another root below a root is not descended into. Ordered as the root rows.
 */
function orphanTrees(a: ReturnType<typeof analyze>, selfPids: number[]): Tree[] {
  const { procs, byPid, ownerOf, hosts } = a
  const procOf = new Map(procs.map(p => [p.pid, p]))
  const parentDead = (p: Proc): boolean => {
    const pp = byPid.get(p.pid)!.ppid
    return pp === p.pid || pp === 1 || !byPid.has(pp) || INIT_NAMES.test(byPid.get(pp)!.name)
  }
  const kids = new Map<number, Proc[]>()
  for (const p of procs) {
    if (selfPids.includes(p.pid) || ownerOf(p.pid) !== 0 || parentDead(p)) continue
    const pp = byPid.get(p.pid)!.ppid
    const l = kids.get(pp)
    if (l) l.push(p); else kids.set(pp, [p])
  }
  const trees: Tree[] = []
  for (const root of procs) {
    // Only a dev-named root: the app that merely hosts the work (a terminal, an IDE, sshd) is not
    // an orphan, and ending its tree would end every live shell below it.
    if (root.pid <= 1 || selfPids.includes(root.pid) || ownerOf(root.pid) !== 0 || hosts.has(root.pid)) continue
    if (!DEV_NAMES.test(root.name) || !parentDead(root)) continue
    const members: Proc[] = []
    const seen = new Set([root.pid])
    const stack = [root]
    for (let x = stack.pop(); x; x = stack.pop()) {
      members.push(x)
      for (const c of kids.get(x.pid) ?? []) if (!seen.has(c.pid)) { seen.add(c.pid); stack.push(c) }
    }
    const qual = members.filter(isQualifying).sort(heavier)
    const cpu = members.reduce((s, m) => s + m.cpu, 0)
    const rssKB = members.reduce((s, m) => s + m.rssKB, 0)
    if (!qual.length || !(cpu >= ORPHAN_CPU || rssKB >= ORPHAN_RSS_KB) || members.some(m => hosts.has(m.pid))) continue
    trees.push({ root: procOf.get(root.pid)!, members, heaviest: qual[0], cpu, rssKB })
  }
  return trees
}

/** PIDs whose cwd the caller must resolve: the root of every reportable orphan tree, and its heaviest qualifying member (the root may sit in a system dir). */
export function orphanCandidates(rows: PsRow[], sessions: SessionMeta[], memory: SamplerMemory, now: number, cores: number, selfPids: number[] = []): number[] {
  const out: number[] = []
  for (const t of orphanTrees(analyze(rows, sessions, memory, now, cores), selfPids)) {
    out.push(t.root.pid)
    if (t.heaviest.pid !== t.root.pid) out.push(t.heaviest.pid)
  }
  return out
}

const toTop = (p: Proc): Top => ({ name: p.name, pid: p.pid, cpu: round1(p.cpu), memMB: toMB(p.rssKB) })
const topOf = (procs: Proc[], n: number): Top[] => [...procs].sort(heavier).slice(0, n).map(toTop)

function fold(procs: Proc[]): Folded[] {
  const m = new Map<string, Folded>()
  for (const p of procs) {
    let f = m.get(p.name)
    if (!f) m.set(p.name, f = { name: p.name, count: 0, cpu: 0, rssKB: 0 })
    f.count++; f.cpu += p.cpu; f.rssKB += p.rssKB
  }
  return [...m.values()]
}

const topFolded = (f: Folded[], n: number): ByName[] =>
  f.sort((a, b) => weight(b.cpu, b.rssKB) - weight(a.cpu, a.rssKB) || nameCmp(a.name, b.name)).slice(0, n)
    .map(x => ({ name: x.name, count: x.count, cpu: round1(x.cpu), memMB: toMB(x.rssKB) }))

function pushHist(hist: Map<string, number[]>, key: string, val: number) {
  let l = hist.get(key)
  if (!l) hist.set(key, l = [])
  l.push(round1(val))
  if (l.length > HIST_LEN) l.splice(0, l.length - HIST_LEN)
}

export function buildSnapshot(
  input: {
    now: number; intervalMs: number; cores: number; mem: { totalMB: number; usedMB: number }
    rows: PsRow[]; sessions: SessionMeta[]; cwdOf: Map<number, string>; selfPids?: number[]
  },
  memory: SamplerMemory,
): Snapshot {
  const { now, cores, mem, cwdOf } = input
  const selfPids = input.selfPids ?? []
  const analysis = analyze(input.rows, input.sessions, memory, now, cores)
  const { procs, live, ownerOf, dtSec } = analysis
  const warm = dtSec > 0

  const owned = new Map<number, Proc[]>()
  const orphanGroups = new Map<string, { label: string; root: string; trees: Tree[] }>()
  const reported = new Set<number>()
  const outside: Proc[] = []
  let total = 0

  // The directory of a tree: the root's, else the heaviest qualifying member's; system dirs give nothing.
  const dirRepo = (pid: number) => { const dir = cwdOf.get(pid); return dir ? repoLabel(dir) : null }
  for (const t of orphanTrees(analysis, selfPids)) {
    const repo = dirRepo(t.root.pid) ?? dirRepo(t.heaviest.pid)
    if (!repo) continue
    let g = orphanGroups.get(repo.label)
    if (!g) orphanGroups.set(repo.label, g = { label: repo.label, root: repo.root, trees: [] })
    g.trees.push(t)
    for (const m of t.members) reported.add(m.pid)
  }

  for (const p of procs) {
    total += p.cpu
    const o = ownerOf(p.pid)
    if (o !== 0) {
      const l = owned.get(o)
      if (l) l.push(p); else owned.set(o, [p])
      continue
    }
    if (!reported.has(p.pid)) outside.push(p)
  }

  const sum = (l: Proc[], k: 'cpu' | 'rssKB') => l.reduce((a, p) => a + p[k], 0)

  const sessionRows = [...live.values()].map(s => {
    const l = owned.get(s.pid) ?? []
    return { s, cpu: sum(l, 'cpu'), load: { ...s, cpu: 0, memMB: toMB(sum(l, 'rssKB')), procs: l.length, top: topOf(l, 4), byName: topFolded(fold(l), 8) } as SessionLoad }
  })
  sessionRows.sort((a, b) => b.cpu - a.cpu || a.s.pid - b.s.pid)
  for (const r of sessionRows) r.load.cpu = round1(r.cpu)

  const orphanRows = [...orphanGroups.values()].map(g => {
    const all = g.trees.flatMap(t => t.members)
    // Each tree's root first (ending it with its tree ends the lot), then the heaviest other members.
    const roots = [...g.trees].sort((a, b) => weight(b.cpu, b.rssKB) - weight(a.cpu, a.rssKB) || a.root.pid - b.root.pid).map(t => t.root)
    const rootPids = new Set(roots.map(r => r.pid))
    const top = [...roots.slice(0, 3).map(toTop), ...topOf(all.filter(p => !rootPids.has(p.pid)), Math.max(0, 3 - roots.length))]
    return {
      cpu: sum(all, 'cpu'),
      load: { label: g.label, root: g.root, cpu: 0, memMB: toMB(sum(all, 'rssKB')), procs: all.length, top } as OrphanLoad,
    }
  })
  orphanRows.sort((a, b) => b.cpu - a.cpu || nameCmp(a.load.label, b.load.label))
  for (const r of orphanRows) r.load.cpu = round1(r.cpu)

  const outsideOut: OutsideLoad[] = topFolded(fold(outside), 6)
  const machineCpu = Math.min(100, total)

  if (warm) {
    const seen = new Set(['m:cpu', 'm:mem'])
    pushHist(memory.hist, 'm:cpu', machineCpu)
    pushHist(memory.hist, 'm:mem', mem.totalMB > 0 ? mem.usedMB / mem.totalMB * 100 : 0)
    for (const r of sessionRows) { const k = 's:' + r.s.sessionId; pushHist(memory.hist, k, r.cpu); seen.add(k) }
    for (const r of orphanRows) { const k = 'o:' + r.load.label; pushHist(memory.hist, k, r.cpu); seen.add(k) }
    for (const k of [...memory.hist.keys()]) if (!seen.has(k)) memory.hist.delete(k)
  }
  const hist: NonNullable<Snapshot['hist']> = { cpu: [], mem: [], sessions: {}, orphans: {} }
  for (const [k, v] of memory.hist) {
    if (k === 'm:cpu') hist.cpu = [...v]
    else if (k === 'm:mem') hist.mem = [...v]
    else if (k.startsWith('s:')) hist.sessions[k.slice(2)] = [...v]
    else if (k.startsWith('o:')) hist.orphans[k.slice(2)] = [...v]
  }

  memory.prevCpu = new Map(input.rows.map(r => [r.pid, r.cpuSec]))
  memory.prevAt = now

  return {
    ts: now,
    intervalMs: input.intervalMs,
    cores,
    cpu: round1(machineCpu),
    memTotalMB: Math.round(mem.totalMB),
    memUsedMB: Math.round(mem.usedMB),
    warm,
    sessions: sessionRows.map(r => r.load),
    orphans: orphanRows.map(r => r.load),
    outside: outsideOut,
    hist,
  }
}
