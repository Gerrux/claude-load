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

// Start times as `ps -o lstart=` prints them in the C locale; `orphan` changes when its PID is reused.
type Starts = { orphan: string; envs: (Record<string, string> | undefined)[]; reuseOnTerm?: string; hasLstart?: boolean }
const starts = (): Starts => ({ orphan: 'Mon Nov  2 09:00:00 2026', envs: [] })

function linux(
  on: On, files: Map<string, string>, runs: string[][], cpuSec: { session: number; orphan: number }, hasGetconf = true,
  cwds: (string | undefined)[] = [], st: Starts = starts(),
) {
  mock.store(on, {})
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({}))
  on('session.id', () => ({ value: 'S1' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { runs.push(['toast', e.text]); return { value: undefined } })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    cwds.push(e.init?.cwd)
    const cmd = e.argv[0]
    if (cmd === 'getconf' && !hasGetconf) throw new Error('spawn getconf ENOENT')
    if (cmd === 'kill' && e.argv[1] === '-TERM' && st.reuseOnTerm) st.orphan = st.reuseOnTerm
    if (cmd === 'ps') st.envs.push(e.init?.env)
    const lstart = cmd === 'ps' && e.argv.some(a => a.includes('lstart'))
    if (lstart && st.hasLstart === false) return { value: { exitCode: 1, stdout: '', stderr: 'ps: bad -o argument' } }
    const at = (s: string) => (lstart ? ` ${s}` : '')
    const out = cmd === 'uname' ? 'Linux\n'
      : cmd === 'getconf' ? '8\n'
      : cmd === 'nproc' ? '4\n'
      : cmd === 'ps' ? [
        `    1     0 00:00:01  10000${at('Sun Nov  1 08:00:00 2026')} systemd`,
        ` 1000     1 00:00:${String(cpuSec.session).padStart(2, '0')} 400000${at('Mon Nov  2 08:30:00 2026')} claude`,
        ` 1001  1000 00:00:00  80000${at('Mon Nov  2 08:30:01 2026')} node`,
        ` 2000     1 00:00:${String(cpuSec.orphan).padStart(2, '0')} 300000${at(st.orphan)} python3`,
        ` 2001  2000 00:00:00  10000${at('Mon Nov  2 09:00:01 2026')} python3`,
        ` 3000     1 00:00:00 900000${at('Mon Nov  2 07:00:00 2026')} firefox`,
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

  const paneProps = { title: 'x', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never
  const run = { command: 'load', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

  test('ps runs in the C locale; the orphan row carries its start time', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>()
    const st = starts()
    linux(on, files, [], { session: 1, orphan: 1 }, true, [], st)
    await $.session.start(session)
    await clock.advance(1)
    await clock.advance(5000)
    const snap = JSON.parse(files.get(`${STATE}/snapshot.json`)!) as Snapshot
    expect(snap.orphans[0].top[0]).toMatchObject({ name: 'python3', pid: 2000, started: 'Mon Nov 2 09:00:00 2026' })
    expect(st.envs.length).toBe(2)
    expect(st.envs.every(env => env?.LC_TIME === 'C' && env?.LC_ALL === '' && env?.TZ === 'UTC')).toBe(true)
    expect(snap.v).toBe(2)
  })

  test('a leader on an older mod loses the lease to this session', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[`${STATE}/posix-leader.json`, JSON.stringify({ id: 'OTHER', ts: NOW })]])
    const runs: string[][] = []
    linux(on, files, runs, { session: 1, orphan: 1 })
    // OTHER (1.0.0) renews its lease and writes snapshots without a format version.
    const old = { ts: NOW, intervalMs: 5000, cores: 8, cpu: 1, memTotalMB: 1, memUsedMB: 1, warm: true, sessions: [], orphans: [], outside: [] }
    files.set(`${STATE}/snapshot.json`, JSON.stringify(old))
    await $.session.start(session)
    await clock.advance(1)
    expect(runs.some(a => a[0] === 'ps')).toBe(false)
    files.set(`${STATE}/posix-leader.json`, JSON.stringify({ id: 'OTHER', ts: NOW + 5000 }))
    files.set(`${STATE}/snapshot.json`, JSON.stringify({ ...old, ts: NOW + 5000 }))
    await clock.advance(5000)
    expect(runs.some(a => a[0] === 'ps')).toBe(true)
    expect(JSON.parse(files.get(`${STATE}/posix-leader.json`)!).id).toBe('S1')
  })

  test('SIGKILL after the grace period spares a PID that a new process took meanwhile', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>()
    const runs: string[][] = []
    // SIGTERM ends python3 #2000 and a new python3 gets PID 2000; its child #2001 ignores SIGTERM.
    const st = { ...starts(), reuseOnTerm: 'Mon Nov  2 09:00:04 2026' }
    linux(on, files, runs, { session: 1, orphan: 1 }, true, [], st)
    await $.session.start(session)
    await clock.advance(1)
    await clock.advance(5000)
    await $.command.run(run)
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    await pane.press({ key: 'o0-k0' })
    await pane.press({ key: 'kill-yes' })
    await clock.advance(3000)
    expect(runs.find(a => a[0] === 'kill' && a[1] === '-TERM')).toEqual(['kill', '-TERM', '2001', '2000'])
    expect(runs.find(a => a[0] === 'kill' && a[1] === '-KILL')).toEqual(['kill', '-KILL', '2001'])
  })

  test('a ps without lstart still samples, and then nothing can be ended', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>()
    const runs: string[][] = []
    linux(on, files, runs, { session: 1, orphan: 1 }, true, [], { ...starts(), hasLstart: false })
    await $.session.start(session)
    await clock.advance(1)
    await clock.advance(5000)
    const snap = JSON.parse(files.get(`${STATE}/snapshot.json`)!) as Snapshot
    expect(snap.orphans[0].top[0].started).toBe(undefined)
    await $.command.run(run)
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    await pane.press({ key: 'o0-k0' })
    await pane.press({ key: 'kill-yes' })
    expect(runs.some(a => a[0] === 'kill')).toBe(false)
    expect(runs.find(a => a[0] === 'toast')?.[1]).toMatch(/python3 #2000: this process cannot be ended from here/)
  })

  test('the shell a session runs in is never an orphan', async () => {
    const rows = parsePs([
      `    1     0 00:00:01  10000 systemd`,
      ` 900     1 00:00:09 300000 zsh`,
      ` 1000  900 00:00:01 400000 claude`,
      ` 2000     1 00:00:09 300000 python3`,
    ].join('\n'), false)
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
