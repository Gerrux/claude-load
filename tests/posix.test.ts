import { describe, expect, test as kitTest } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  DEV_NAMES, buildSnapshot, freshMemory, orphanCandidates, parseCpuTime, parseLsofCwd, parseMeminfo, parsePs, parseSessionFile,
  parseVmStat, repoLabel,
} from '../hooks/posix'
import type { PsRow, SessionMeta } from '../hooks/posix'

// Машина под нагрузкой: стандартных 5 с тесту не хватает.
const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 30000 }, body)

const MB = 1024 // KB per MB

describe('parsers', () => {
  test('parseCpuTime reads Linux and macOS formats', async () => {
    expect(Math.round(parseCpuTime('0:01.23') * 100)).toBe(123)
    expect(parseCpuTime('12:34:56')).toBe(45296)
    expect(parseCpuTime('2-03:04:05')).toBe(183845)
    expect(parseCpuTime('00:00:07')).toBe(7)
    expect(parseCpuTime('05:12')).toBe(312)
    expect(parseCpuTime('1:02:03.50')).toBe(3723.5)
    expect(Number.isNaN(parseCpuTime('abc'))).toBe(true)
    expect(Number.isNaN(parseCpuTime(''))).toBe(true)
  })

  test('parsePs: macOS paths with spaces, login shells, malformed lines', async () => {
    const text = [
      '    1     0   0:12.50  12000 /sbin/launchd',
      '  412     1 1:02:03.50 204800 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '  900   412   0:00.10   1024 /Applications/Foo.app/Contents/MacOS/foo helper',
      '  901     1   0:00.00    512 -zsh',
      'this is not a ps line',
      '  902     1   bad-time    512 node',
      '',
    ].join('\n')
    expect(parsePs(text)).toEqual([
      { pid: 1, ppid: 0, cpuSec: 12.5, rssKB: 12000, name: 'launchd' },
      { pid: 412, ppid: 1, cpuSec: 3723.5, rssKB: 204800, name: 'Google Chrome' },
      { pid: 900, ppid: 412, cpuSec: 0.1, rssKB: 1024, name: 'foo helper' },
      { pid: 901, ppid: 1, cpuSec: 0, rssKB: 512, name: 'zsh' },
    ])
  })

  test('parsePs: Linux names, kernel threads, deleted binaries', async () => {
    const text = [
      '    1     0 00:00:04  11216 systemd',
      '  210     2 00:00:00      0 kworker/0:1',
      ' 3000  1000 1-02:03:04  51200 node',
      ' 3001  1000 00:01:00   2048 python3 (deleted)',
    ].join('\r\n')
    const rows = parsePs(text)
    expect(rows.map(r => r.name)).toEqual(['systemd', 'kworker/0:1', 'node', 'python3'])
    expect(rows[2]).toEqual({ pid: 3000, ppid: 1000, cpuSec: 93784, rssKB: 51200, name: 'node' })
  })

  test('parseMeminfo and parseVmStat', async () => {
    const meminfo = ['MemTotal:       16384000 kB', 'MemFree:         1000000 kB', 'MemAvailable:    8192000 kB', 'Buffers:          100 kB'].join('\n')
    expect(parseMeminfo(meminfo)).toEqual({ totalMB: 16000, usedMB: 8000 })

    const vm = [
      'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
      'Pages free:                               10000.',
      'Pages active:                            500000.',
      'Pages inactive:                           20000.',
      'Pages speculative:                         5000.',
      'Pages purgeable:                           1000.',
      'Pages wired down:                        100000.',
    ].join('\n')
    const total = 1024 * 1048576 // 1024 MB
    // available = (10000 + 20000 + 5000 + 1000) pages * 16 KB = 36000 * 16384 B
    // = 562.5 MB, so used = 461.5 MB, rounded to 462
    expect(parseVmStat(vm, total)).toEqual({ totalMB: 1024, usedMB: 462 })
  })

  test('parseLsofCwd and parseSessionFile', async () => {
    const lsof = ['p100', 'n/Users/u/repo/.claude/worktrees/feat-a', 'p200', 'n/Users/u/my project', ''].join('\n')
    expect([...parseLsofCwd(lsof)]).toEqual([[100, '/Users/u/repo/.claude/worktrees/feat-a'], [200, '/Users/u/my project']])
    expect(parseLsofCwd('')).toEqual(new Map())

    const json = JSON.stringify({ pid: 42, sessionId: 'S1', hostSessionId: 'local_x', name: 'Работа', status: 'busy', cwd: '/w' })
    expect(parseSessionFile(json)).toEqual({ pid: 42, sessionId: 'S1', hostSessionId: 'local_x', name: 'Работа', status: 'busy', cwd: '/w' })
    expect(parseSessionFile('{"pid":7,"sessionId":"S2"}')).toEqual({ pid: 7, sessionId: 'S2', hostSessionId: '', name: '', status: '', cwd: '' })
    expect(parseSessionFile('not json')).toBe(null)
    expect(parseSessionFile('{"sessionId":"S3"}')).toBe(null)
  })
})

describe('repoLabel and DEV_NAMES', () => {
  test('worktrees fold into the checkout; system dirs are rejected', async () => {
    expect(repoLabel('/x/repo/.claude/worktrees/feat-a/sub')).toEqual({ root: '/x/repo', label: 'repo/feat-a' })
    expect(repoLabel('/x/repo/')).toEqual({ root: '/x/repo', label: 'repo' })
    expect(repoLabel('/')).toBe(null)
    expect(repoLabel('/usr/lib/foo')).toBe(null)
    expect(repoLabel('/System/Library/x')).toBe(null)
    expect(repoLabel('/Library/Application Support')).toBe(null)
    expect(repoLabel('/proc/12/cwd')).toBe(null)
    expect(repoLabel('/private/var/folders/ab')).toBe(null)
    expect(repoLabel('')).toBe(null)
  })

  test('DEV_NAMES matches dev tools case-insensitively, with or without .exe', async () => {
    for (const n of ['node', 'Python', 'python3', 'node.exe', 'zsh', 'gopls', 'rust-analyzer', 'make']) expect(DEV_NAMES.test(n)).toBe(true)
    for (const n of ['chrome', 'nodejs-helper', 'launchd', 'docker']) expect(DEV_NAMES.test(n)).toBe(false)
  })
})

describe('buildSnapshot', () => {
  const sessions: SessionMeta[] = [
    { pid: 100, sessionId: 'S1', hostSessionId: 'local_1', name: 'Main', status: 'busy', cwd: '/home/u/repo' },
    { pid: 500, sessionId: 'S2', hostSessionId: 'local_2', name: 'Dead', status: 'idle', cwd: '/home/u/other' }, // not in ps
  ]
  const cwdOf = new Map<number, string>([
    [200, '/home/u/repo/.claude/worktrees/fix-a/src'],
    [202, '/usr/lib/thing'],
  ])
  // cpu seconds per pid: pass 1, then pass 2 four seconds later on 4 cores (1 cpuSec = 6.25 %).
  const rows = (pass: 1 | 2, withOrphan = true): PsRow[] => {
    const d = pass === 2
    const all: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'launchd' },
      { pid: 100, ppid: 1, cpuSec: d ? 10.4 : 10, rssKB: 300 * MB, name: 'claude' },
      { pid: 101, ppid: 100, cpuSec: d ? 104 : 100, rssKB: 200 * MB, name: 'node' },
      { pid: 102, ppid: 101, cpuSec: 5, rssKB: 100 * MB, name: 'node' },
      { pid: 103, ppid: 102, cpuSec: d ? 52 : 50, rssKB: 500 * MB, name: 'python' },
      { pid: 200, ppid: 999, cpuSec: d ? 20.8 : 20, rssKB: 200 * MB, name: 'python' }, // parent gone
      { pid: 201, ppid: 999, cpuSec: 1, rssKB: 10 * MB, name: 'python' }, // too small to be a candidate
      { pid: 202, ppid: 999, cpuSec: 1, rssKB: 160 * MB, name: 'python' }, // big, but cwd is a system dir
      { pid: 300, ppid: 1, cpuSec: d ? 201.6 : 200, rssKB: 800 * MB, name: 'chrome' },
      { pid: 301, ppid: 1, cpuSec: 200, rssKB: 700 * MB, name: 'chrome' },
      { pid: 400, ppid: 1, cpuSec: 3, rssKB: 200 * MB, name: 'node' }, // the sampler itself
    ]
    return withOrphan ? all : all.filter(r => r.pid !== 200)
  }
  const mem = { totalMB: 16000, usedMB: 8000 }
  const T1 = 1_800_000_000_000
  const input = (pass: 1 | 2, withOrphan = true) => ({
    now: pass === 1 ? T1 : T1 + 4000, intervalMs: 4000, cores: 4, mem, rows: rows(pass, withOrphan), sessions, cwdOf, selfPids: [400],
  })

  test('two passes: cold first, deltas second; ownership, orphans, folding, history', async () => {
    const memory = freshMemory()
    const first = buildSnapshot(input(1), memory)
    expect(first.warm).toBe(false)
    expect(first.cpu).toBe(0)
    expect(first.sessions.length).toBe(1)
    expect(first.sessions[0].cpu).toBe(0)
    expect(first.sessions[0].procs).toBe(4)
    expect(first.hist).toEqual({ cpu: [], mem: [], sessions: {}, orphans: {} })
    expect(memory.prevAt).toBe(T1)
    expect(memory.prevCpu.get(101)).toBe(100)

    // Candidates before the second pass: the orphan and the big system-dir python, not the small one or the sampler.
    const before = JSON.stringify({ c: [...memory.prevCpu], a: memory.prevAt, h: [...memory.hist] })
    expect(orphanCandidates(rows(2), sessions, memory, T1 + 4000, 4, [400])).toEqual([200, 202])
    expect(orphanCandidates(rows(2), sessions, memory, T1 + 4000, 4)).toEqual([200, 202, 400])
    expect(JSON.stringify({ c: [...memory.prevCpu], a: memory.prevAt, h: [...memory.hist] })).toBe(before)

    const snap = buildSnapshot(input(2), memory)
    expect(snap.warm).toBe(true)
    expect(snap.ts).toBe(T1 + 4000)
    expect(snap.cores).toBe(4)
    expect(snap.cpu).toBe(55)
    expect(snap.memTotalMB).toBe(16000)
    expect(snap.memUsedMB).toBe(8000)

    expect(snap.sessions.length).toBe(1) // the dead session is dropped
    const s = snap.sessions[0]
    expect(s).toMatchObject({ pid: 100, sessionId: 'S1', hostSessionId: 'local_1', name: 'Main', status: 'busy', cwd: '/home/u/repo', cpu: 40, memMB: 1100, procs: 4 })
    expect(s.top).toEqual([
      { name: 'node', pid: 101, cpu: 25, memMB: 200 },
      { name: 'python', pid: 103, cpu: 12.5, memMB: 500 },
      { name: 'claude', pid: 100, cpu: 2.5, memMB: 300 },
      { name: 'node', pid: 102, cpu: 0, memMB: 100 },
    ])
    expect(s.byName).toEqual([
      { name: 'node', count: 2, cpu: 25, memMB: 300 },
      { name: 'python', count: 1, cpu: 12.5, memMB: 500 },
      { name: 'claude', count: 1, cpu: 2.5, memMB: 300 },
    ])

    expect(snap.orphans).toEqual([
      { label: 'repo/fix-a', root: '/home/u/repo', cpu: 5, memMB: 200, procs: 1, top: [{ name: 'python', pid: 200, cpu: 5, memMB: 200 }] },
    ])

    // Outside: both chromes folded, system-dir python and the sampler (node) stay outside, small python too.
    expect(snap.outside).toEqual([
      { name: 'chrome', count: 2, cpu: 10, memMB: 1500 },
      { name: 'python', count: 2, cpu: 0, memMB: 170 },
      { name: 'node', count: 1, cpu: 0, memMB: 200 },
      { name: 'launchd', count: 1, cpu: 0, memMB: 10 },
    ].sort((a, b) => b.cpu * 1e6 + b.memMB - (a.cpu * 1e6 + a.memMB)))

    expect(snap.hist).toEqual({ cpu: [55], mem: [50], sessions: { S1: [40] }, orphans: { 'repo/fix-a': [5] } })
    expect(memory.prevAt).toBe(T1 + 4000)
    expect(memory.prevCpu.get(101)).toBe(104)
  })

  test('history grows per pass, drops keys that disappear, and is capped at 90 points', async () => {
    const memory = freshMemory()
    buildSnapshot(input(1), memory)
    buildSnapshot(input(2), memory)
    // Third pass: the orphan is gone, so its history key must be dropped.
    const third = buildSnapshot({ ...input(2, false), now: T1 + 8000 }, memory)
    expect(third.orphans).toEqual([])
    expect(third.hist!.cpu.length).toBe(2)
    expect(third.hist!.mem.length).toBe(2)
    expect(third.hist!.sessions.S1.length).toBe(2)
    expect(third.hist!.orphans).toEqual({})

    // The result must not alias the live memory arrays.
    third.hist!.cpu.push(999)
    expect(memory.hist.get('m:cpu')!.length).toBe(2)

    let snap = third
    for (let i = 0; i < 100; i++) snap = buildSnapshot({ ...input(2, false), now: T1 + 12000 + i * 4000 }, memory)
    expect(snap.hist!.cpu.length).toBe(90)
    expect(snap.hist!.sessions.S1.length).toBe(90)
  })

  test('orphan tree reparented to PID 1: one group, the root first in top', async () => {
    const rs: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'launchd' },
      { pid: 700, ppid: 1, cpuSec: 1, rssKB: 5 * MB, name: 'bash' },
      { pid: 701, ppid: 700, cpuSec: 1, rssKB: 1300 * MB, name: 'node' },
      { pid: 702, ppid: 701, cpuSec: 1, rssKB: 20 * MB, name: 'esbuild' },
    ]
    const cwd = new Map([[700, '/home/u/proj']])
    const memory = freshMemory()
    expect(orphanCandidates(rs, sessions, memory, T1, 4)).toEqual([700, 701])
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 4, mem, rows: rs, sessions: [], cwdOf: cwd }, memory)
    expect(snap.orphans.length).toBe(1)
    expect(snap.orphans[0]).toMatchObject({ label: 'proj', root: '/home/u/proj', procs: 3, memMB: 1325 })
    expect(snap.orphans[0].top.map(t => t.pid)).toEqual([700, 701, 702])
    expect(snap.outside.map(o => o.name)).toEqual(['launchd'])
  })

  test('a live user shell under a live terminal is not an orphan, even with a heavy child', async () => {
    const rs: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'launchd' },
      { pid: 50, ppid: 1, cpuSec: 5, rssKB: 100 * MB, name: 'Terminal' },
      { pid: 51, ppid: 50, cpuSec: 1, rssKB: 5 * MB, name: 'zsh' },
      { pid: 52, ppid: 51, cpuSec: 1, rssKB: 1300 * MB, name: 'node' },
    ]
    const cwd = new Map([[51, '/home/u/proj'], [52, '/home/u/proj']])
    const memory = freshMemory()
    expect(orphanCandidates(rs, sessions, memory, T1, 4)).toEqual([])
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 4, mem, rows: rs, sessions: [], cwdOf: cwd }, memory)
    expect(snap.orphans).toEqual([])
    expect(snap.outside.map(o => o.name)).toContain('node')
  })

  test('a tree reparented to systemd --user (parent alive, named systemd) counts', async () => {
    const rs: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'systemd' },
      { pid: 1500, ppid: 1, cpuSec: 5, rssKB: 10 * MB, name: 'systemd' },
      { pid: 1600, ppid: 1500, cpuSec: 1, rssKB: 5 * MB, name: 'bash' },
      { pid: 1601, ppid: 1600, cpuSec: 1, rssKB: 1300 * MB, name: 'node' },
    ]
    const cwd = new Map([[1600, '/home/u/proj']])
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 4, mem, rows: rs, sessions: [], cwdOf: cwd }, freshMemory())
    expect(snap.orphans.length).toBe(1)
    expect(snap.orphans[0].procs).toBe(2) // the systemd subreaper itself is not part of the tree
    expect(snap.orphans[0].top[0]).toMatchObject({ name: 'bash', pid: 1600 })
  })

  test('a lone shell with no qualifying member is not reported', async () => {
    const rs: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'launchd' },
      { pid: 800, ppid: 1, cpuSec: 1, rssKB: 400 * MB, name: 'bash' },
      { pid: 801, ppid: 800, cpuSec: 1, rssKB: 200 * MB, name: 'sh' },
    ]
    const cwd = new Map([[800, '/home/u/proj'], [801, '/home/u/proj']])
    const memory = freshMemory()
    expect(orphanCandidates(rs, sessions, memory, T1, 4)).toEqual([])
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 4, mem, rows: rs, sessions: [], cwdOf: cwd }, memory)
    expect(snap.orphans).toEqual([])
    expect(snap.outside.map(o => o.name).sort()).toEqual(['bash', 'launchd', 'sh'])
  })

  test('two trees of one repository fold into one group; a system-dir root takes the heaviest member cwd', async () => {
    const rs: PsRow[] = [
      { pid: 1, ppid: 0, cpuSec: 5, rssKB: 10 * MB, name: 'launchd' },
      { pid: 900, ppid: 1, cpuSec: 1, rssKB: 5 * MB, name: 'bash' },
      { pid: 901, ppid: 900, cpuSec: 1, rssKB: 300 * MB, name: 'node' },
      { pid: 910, ppid: 999, cpuSec: 1, rssKB: 200 * MB, name: 'python' }, // parent gone
      { pid: 911, ppid: 910, cpuSec: 1, rssKB: 50 * MB, name: 'python' },
      { pid: 912, ppid: 910, cpuSec: 1, rssKB: 40 * MB, name: 'python' },
    ]
    const cwd = new Map([[900, '/usr/bin'], [901, '/home/u/proj'], [910, '/home/u/proj']])
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 4, mem, rows: rs, sessions: [], cwdOf: cwd }, freshMemory())
    expect(snap.orphans.length).toBe(1)
    expect(snap.orphans[0]).toMatchObject({ label: 'proj', procs: 5, memMB: 595 })
    // Both roots first (heavier tree first), then the heaviest other member.
    expect(snap.orphans[0].top.map(t => t.pid)).toEqual([900, 910, 901])
    expect(snap.hist).toEqual({ cpu: [], mem: [], sessions: {}, orphans: {} })
  })

  test('an owner chain is memoized and a ppid cycle does not hang', async () => {
    const cyc: PsRow[] = [
      { pid: 10, ppid: 11, cpuSec: 0, rssKB: 1024, name: 'a' },
      { pid: 11, ppid: 10, cpuSec: 0, rssKB: 1024, name: 'b' },
      { pid: 12, ppid: 12, cpuSec: 0, rssKB: 1024, name: 'c' },
    ]
    const snap = buildSnapshot({ now: T1, intervalMs: 4000, cores: 2, mem, rows: cyc, sessions, cwdOf: new Map() }, freshMemory())
    expect(snap.sessions).toEqual([])
    expect(snap.outside.map(o => o.name).sort()).toEqual(['a', 'b', 'c'])
  })
})
