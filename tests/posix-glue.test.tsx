import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On, SessionStartInput, TestBody } from 'claude-code/testing'

import { buildSnapshot, freshMemory, orphanCandidates, parsePs } from '../hooks/posix'
import type { Snapshot } from '../hooks/types'

// The macOS/Linux path of the mod against a faked host: the leader lease, ps, /proc and the
// session registry. Pure parsing is covered in posix.test.ts; this checks the glue in register.tsx.
const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 30000, options: { language: 'en' } }, body)

const NOW = 1_800_000_000_000
const session: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: '/home/u/repo' }
const STATE = '/home/u/.claude/state/load'

// The kit resolves paths on the host it runs on; on a Windows host `/home/u` arrives as `C:\home\u`.
const posixPath = (p: string) => p.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')

function linux(on: On, files: Map<string, string>, runs: string[][], cpuSec: { session: number; orphan: number }, hasGetconf = true, cwds: (string | undefined)[] = []) {
  mock.store(on, {})
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({}))
  on('session.id', () => ({ value: 'S1' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    cwds.push(e.init?.cwd)
    const cmd = e.argv[0]
    if (cmd === 'getconf' && !hasGetconf) throw new Error('spawn getconf ENOENT')
    const out = cmd === 'uname' ? 'Linux\n'
      : cmd === 'getconf' ? '8\n'
      : cmd === 'nproc' ? '4\n'
      : cmd === 'ps' ? [
        `    1     0 00:00:01  10000 systemd`,
        ` 1000     1 00:00:${String(cpuSec.session).padStart(2, '0')} 400000 claude`,
        ` 1001  1000 00:00:00  80000 node`,
        ` 2000     1 00:00:${String(cpuSec.orphan).padStart(2, '0')} 300000 python3`,
        ` 3000     1 00:00:00 900000 firefox`,
      ].join('\n')
      : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  on('fs.read', ($, e) => {
    const text = files.get(posixPath(e.path))
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', ($, e) => { files.set(posixPath(e.path), e.text); return { value: undefined } })
  on('fs.list', ($, e) => ({
    value: posixPath(e.path ?? '') === '/home/u/.claude/sessions' ? [{ name: '1000.json', kind: 'file', size: 100, mtimeMs: NOW, isLink: false }] : [],
  }) as never)
  on('fs.stat', ($, e) => ({
    value: posixPath(e.path) === '/proc/2000/cwd'
      ? { kind: 'directory', size: 0, mtimeMs: NOW, isLink: true, realPath: '/home/u/repo/.claude/worktrees/feat-a' }
      : { kind: 'directory', size: 0, mtimeMs: NOW, isLink: false },
  }) as never)
  files.set('/proc/meminfo', 'MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    8192000 kB\n')
  files.set('/home/u/.claude/sessions/1000.json', JSON.stringify({ pid: 1000, sessionId: 'S1', hostSessionId: '', name: 'Fix the parser', status: 'busy', cwd: '/home/u/repo' }))
}

describe('macOS/Linux glue', () => {
  test('the leader samples with ps and writes a warm snapshot on its second pass', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>()
    const runs: string[][] = []
    const cpu = { session: 1, orphan: 1 }
    linux(on, files, runs, cpu)
    await $.session.start(session)
    await clock.advance(1)
    expect(runs.some(a => a[0] === 'ps' && a[1] === '-eo')).toBe(true)
    expect(JSON.parse(files.get(`${STATE}/posix-leader.json`)!).id).toBe('S1')
    const first = JSON.parse(files.get(`${STATE}/snapshot.json`)!) as Snapshot
    expect(first.warm).toBe(false)

    cpu.session = 3
    cpu.orphan = 5
    await clock.advance(5000)
    const snap = JSON.parse(files.get(`${STATE}/snapshot.json`)!) as Snapshot
    expect(snap.warm).toBe(true)
    expect(snap.memTotalMB).toBe(16000)
    expect(snap.memUsedMB).toBe(8000)
    expect(snap.sessions.map(s => s.name)).toEqual(['Fix the parser'])
    expect(snap.sessions[0].procs).toBe(2)
    expect(snap.orphans.map(o => o.label)).toEqual(['repo/feat-a'])
    expect(snap.outside.map(x => x.name)).toContain('firefox')
  })

  test('an extra tick right after a pass does not sample again; a missing getconf falls back', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>()
    const runs: string[][] = []
    const cwds: (string | undefined)[] = []
    linux(on, files, runs, { session: 1, orphan: 1 }, false, cwds)
    await $.session.start(session)
    await clock.advance(1)
    const psRuns = () => runs.filter(a => a[0] === 'ps').length
    expect(psRuns()).toBe(1)
    expect(runs.some(a => a[0] === 'nproc')).toBe(true)
    // Every command runs from the home folder, never from a session cwd that may be gone.
    expect(cwds.every(c => posixPath(c ?? '') === '/home/u')).toBe(true)
    // /load ticks at once: no second ps a moment after the first (it would read as a CPU spike).
    await $.command.run({ command: 'load', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })
    expect(psRuns()).toBe(1)
    await clock.advance(5000)
    expect(psRuns()).toBe(2)
    expect(JSON.parse(files.get(`${STATE}/snapshot.json`)!).cores).toBe(4)
  })

  test('the shell a session runs in is never an orphan', async () => {
    const rows = parsePs([
      `    1     0 00:00:01  10000 systemd`,
      ` 900     1 00:00:09 300000 zsh`,
      ` 1000  900 00:00:01 400000 claude`,
      ` 2000     1 00:00:09 300000 python3`,
    ].join('\n'))
    const sessions = [{ pid: 1000, sessionId: 'S1', hostSessionId: '', name: 'Main', status: 'busy', cwd: '/home/u/repo' }]
    const memory = freshMemory()
    buildSnapshot({ now: NOW, intervalMs: 5000, cores: 1, mem: { totalMB: 1, usedMB: 1 }, rows, sessions, cwdOf: new Map() }, memory)
    expect(orphanCandidates(rows, sessions, memory, NOW + 5000, 1)).toEqual([2000])
    const cwdOf = new Map([[900, '/home/u/repo'], [2000, '/home/u/repo']])
    const snap = buildSnapshot({ now: NOW + 5000, intervalMs: 5000, cores: 1, mem: { totalMB: 1, usedMB: 1 }, rows, sessions, cwdOf }, memory)
    expect(snap.orphans.flatMap(o => o.top.map(t => t.name))).toEqual(['python3'])
    expect(snap.outside.map(x => x.name)).toContain('zsh')
  })

  test('a follower with a live lease from another session does not sample', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[`${STATE}/posix-leader.json`, JSON.stringify({ id: 'OTHER', ts: NOW })]])
    const runs: string[][] = []
    linux(on, files, runs, { session: 1, orphan: 1 })
    await $.session.start(session)
    await clock.advance(1)
    expect(runs.some(a => a[0] === 'ps')).toBe(false)
    // The lease goes stale after 15 s without renewal; then this session takes over.
    await clock.advance(20000)
    expect(runs.some(a => a[0] === 'ps')).toBe(true)
  })
})
