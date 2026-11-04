import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionStartInput, TestBody } from 'claude-code/testing'

import { LANGS, STRINGS, matchLang, plural } from '../hooks/i18n'
import {
  applyFilter, bandText, bar, buildView, canKill, descendants, fmtMem, groupProcs, groupRepos, isBusy, orphanOwners, parseWinProcs, repoRoot,
  sameProcess, samplerCommand, sessionLink, setLang, sparkSvg, sparkText, textReport, winTree,
} from '../hooks/register'
import type { Snapshot } from '../hooks/register'

// A loaded machine runs these slowly; the language is pinned so a test never depends on the host locale.
const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 30000, options: { language: 'en' } }, body)

const NOW = 1_800_000_000_000
const session: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: 'C:\\work' }
const bandProps: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {},
}
const run = (args: string) => ({ command: 'load', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 4, ts: NOW, intervalMs: 4000, cores: 16, cpu: 72, memTotalMB: 65457, memUsedMB: 42000, warm: true,
    commitUsedMB: 50000, commitLimitMB: 92000, disks: [{ name: 'C:', freeMB: 120000, totalMB: 950000 }, { name: 'D:', freeMB: 4096, totalMB: 1900000 }],
    sessions: [
      {
        pid: 1, name: 'Power line processing', status: 'busy', cwd: 'C:\\repo\\pipeline', hostSessionId: 'local_aaaa-1', sessionId: 'S1',
        cpu: 38.2, memMB: 1500, procs: 28, top: [{ name: 'python', pid: 11, cpu: 35, memMB: 900, started: '1700000000011' }, { name: 'claude', pid: 1, cpu: 1, memMB: 400 }],
        byName: [{ name: 'python', count: 4, cpu: 35, memMB: 900 }, { name: 'claude', count: 1, cpu: 1, memMB: 400 }],
      },
      {
        pid: 2, name: 'Webapp slides', status: 'idle', cwd: 'C:\\repo\\webapp\\.claude\\worktrees\\feat-x', hostSessionId: 'local_bbbb-2', sessionId: 'S2',
        cpu: 0.4, memMB: 264, procs: 2, top: [], byName: [{ name: 'node', count: 2, cpu: 0.4, memMB: 200 }],
      },
    ],
    orphans: [{ label: 'webapp/fix-x', root: 'C:\\repo\\webapp', cpu: 9, memMB: 400, procs: 3, top: [{ name: 'node', pid: 21, cpu: 9, memMB: 400, started: '1700000000021' }] }],
    outside: [{ name: 'zen', count: 48, cpu: 2, memMB: 8863 }, { name: 'claude', count: 13, cpu: 11, memMB: 3064 }],
    hist: { cpu: [10, 40, 72], mem: [60, 62, 64], sessions: { S1: [5, 20, 38] }, orphans: { 'webapp/fix-x': [9, 9, 9] } },
    ...over,
  }
}

// The Windows live listing (`pid ppid workingSetBytes createdMs`) as the click and the kill path read
// it: node #21 as sampled (300 MB), its child #22 (100 MB), and #23, older than #21: a child of a dead
// process that once held PID 21, which Windows still lists under that parent.
const MB = 1048576
const LIVE = [
  `4 0 ${MB} `, `21 4 ${300 * MB} 1700000000021`, `22 21 ${100 * MB} 1700000000500`, `23 21 ${900 * MB} 1600000000000`, `11 1 ${MB} 1700000000011`,
].join('\r\n')

function world(on: On, files: Map<string, string>, runs: string[][], live: { text: string; hold?: (argv: string[]) => Promise<string> | null } = { text: LIVE }) {
  mock.store(on, {})
  on('env.get', ($, e) => ({ value: e.name === 'OS' ? 'Windows_NT' : e.name === 'USERPROFILE' ? 'C:\\Users\\u' : undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({}))
  on('session.id', () => ({ value: 'S1' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', ($, e) => { files.set(e.path, e.text); return { value: undefined } })
  on('fs.list', ($, e) => {
    const dir = String(e.path ?? '').replace(/[\\/]+$/, '')
    const out = []
    for (const [p, text] of files) {
      const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
      if (p.slice(0, i) === dir) out.push({ name: p.slice(i + 1), kind: 'file', size: text.length, mtimeMs: NOW, isLink: false })
    }
    if (!out.length && ![...files.keys()].some(p => p.startsWith(dir + '\\'))) throw new Error('ENOENT')
    return { value: out } as never
  })
  on('process.run', async ($, e) => {
    runs.push([...e.argv])
    const held = live.hold?.([...e.argv])
    if (held) return { value: { exitCode: 0, stdout: await held, stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv.some(a => a.includes('Win32_Process')) ? live.text : '', stderr: '' } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { runs.push(['toast', e.text]); return { value: undefined } })
  on('prompt.submit', ($, e) => { runs.push(['prompt', e.text]); return { text: e.text } })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
}

const SNAP = 'C:\\Users\\u\\.claude\\state\\load\\snapshot.json'
const WANTED = 'C:\\Users\\u\\.claude\\state\\load\\wanted'
const QDIR = 'C:\\Users\\u\\.claude\\state\\queue'

describe('languages', () => {
  test('every language has every key', async () => {
    const keys = Object.keys(STRINGS.en).sort()
    for (const l of LANGS) expect(Object.keys(STRINGS[l]).sort()).toEqual(keys)
  })

  test('language names and locales map to a supported language', async () => {
    expect(matchLang('russian')).toBe('ru')
    expect(matchLang('ru-RU')).toBe('ru')
    expect(matchLang('Deutsch')).toBe('de')
    expect(matchLang('zh_CN.UTF-8')).toBe('zh')
    expect(matchLang('日本語')).toBe('ja')
    expect(matchLang('pt-BR')).toBe('pt')
    expect(matchLang('klingon')).toBe(null)
  })

  test('plurals and memory follow the language', async () => {
    expect(plural('ru', 1, STRINGS.ru.sessions)).toBe('1 сессия')
    expect(plural('ru', 3, STRINGS.ru.sessions)).toBe('3 сессии')
    expect(plural('ru', 15, STRINGS.ru.sessions)).toBe('15 сессий')
    expect(plural('en', 1, STRINGS.en.sessions)).toBe('1 session')
    expect(plural('en', 2, STRINGS.en.sessions)).toBe('2 sessions')
    setLang('ru')
    expect(fmtMem(1536)).toBe('1,5 ГБ')
    setLang('fr')
    expect(fmtMem(1536)).toBe('1,5 Go')
    setLang('en')
    expect(fmtMem(1536)).toBe('1.5 GB')
  })
})

describe('formatting and graphs', () => {
  test('memory, bars and sparklines', async () => {
    setLang('en')
    expect(fmtMem(512)).toBe('512 MB')
    expect(bar(0.5, 4)).toEqual(['██', '░░'])
    expect(bar(0.3, 4)[0]).toBe('█▏')
    expect(sparkText([0, 50, 100], 5, 100)).toBe('  ▁▄█')
    expect(sparkSvg([1, 2, 3], 80, 16, '#3fb950')).toMatch(/^<svg .*<polyline points="0\.0,/)
  })

  test('the band line and the busy threshold', async () => {
    setLang('en')
    const line = bandText(snapshot(), 'S1')
    expect(line).toMatch(/^CPU 72% · RAM 64%/)
    expect(line).toMatch(/▸ Power line processing 38%/)
    expect(line).toMatch(/Claude Desktop×13 11%/)
    expect(isBusy(snapshot({ cpu: 49, memUsedMB: 1000 }))).toBe(false)
    expect(isBusy(snapshot({ cpu: 50, memUsedMB: 1000 }))).toBe(true)
    expect(isBusy(snapshot({ cpu: 10, memUsedMB: 56000 }))).toBe(true)
  })

  test('the text report', async () => {
    setLang('en')
    const snap = snapshot()
    expect(orphanOwners(snap, snap.orphans[0])).toEqual(['Webapp slides'])
    const text = textReport(buildView(snap, 'S1', NOW + 3000))
    expect(text).toMatch(/Claude: 2 sessions · 39% CPU · 1\.7 GB · sampled 3 s ago/)
    expect(text).toMatch(/● Power line processing .* 38% {3}1\.5 GB {2}▸ this window/)
    expect(text).toMatch(/python 35% 900 MB/)
    expect(text).toMatch(/⚠ webapp\/fix-x .* node#21/)
    expect(text).toMatch(/zen ×48/)
  })
})

describe('process trees', () => {
  test('descendants walks the whole tree, deepest first, and survives a cycle', async () => {
    const rows = [
      { pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }, { pid: 12, ppid: 11 }, { pid: 13, ppid: 10 },
      { pid: 20, ppid: 1 }, { pid: 30, ppid: 31 }, { pid: 31, ppid: 30 },
    ]
    expect(descendants(rows, 10)).toEqual([12, 11, 13])
    expect(descendants(rows, 20)).toEqual([])
    expect(descendants(rows, 30)).toEqual([31])
  })

  test('sameProcess needs both start times, equal up to runs of spaces', async () => {
    expect(sameProcess('1700000000021', '1700000000021')).toBe(true)
    expect(sameProcess('Mon Nov  2 01:06:12 2026', 'Mon Nov 2 01:06:12 2026')).toBe(true)
    expect(sameProcess('1700000000021', '1700000009999')).toBe(false)
    expect(sameProcess(undefined, '1700000000021')).toBe(false)
    expect(sameProcess('1700000000021', undefined)).toBe(false)
    expect(sameProcess(undefined, undefined)).toBe(false)
    expect(sameProcess(' ', ' ')).toBe(false)
  })

  test('the Windows tree skips children older than their parent and unknown creation dates', async () => {
    const procs = parseWinProcs(LIVE + `\r\n24 22 ${MB} \r\n25 22 ${MB} 1700000000600\r\nnot a line`)
    expect(procs.find(p => p.pid === 4)).toEqual({ pid: 4, ppid: 0, memMB: 1 })
    expect(procs.find(p => p.pid === 21)).toEqual({ pid: 21, ppid: 4, memMB: 300, started: '1700000000021' })
    expect(winTree(procs, 21)).toEqual([25, 22])
  })
})

describe('filters, groups, actions', () => {
  test('filters pick sessions, orphans and outside processes', async () => {
    const v = buildView(snapshot(), 'S1', NOW)
    expect(applyFilter(v, 'all').idle.map(r => r.id)).toEqual(['S2'])
    expect(applyFilter(v, 'active').sessions.map(r => r.id)).toEqual(['S1'])
    expect(applyFilter(v, 'active').outside).toEqual([])
    expect(applyFilter(v, 'heavy').sessions.map(r => r.id)).toEqual(['S1'])
    expect(applyFilter(v, 'heavy').outside.map(x => x.name)).toEqual(['claude', 'zen'])
    expect(applyFilter(v, 'orphans').sessions).toEqual([])
    expect(applyFilter(v, 'self').sessions.map(r => r.id)).toEqual(['S1'])
  })

  test('repos fold worktrees into their checkout; processes aggregate across sessions', async () => {
    setLang('en')
    expect(repoRoot('C:\\repo\\webapp\\.claude\\worktrees\\feat-x')).toEqual({ root: 'C:\\repo\\webapp', label: 'webapp' })
    expect(repoRoot('/home/u/repo/.claude/worktrees/feat-x')).toEqual({ root: '/home/u/repo', label: 'repo' })
    const snap = snapshot()
    const v = buildView(snap, 'S1', NOW)
    const repos = groupRepos([...v.active, ...v.idle], v.orphans, snap)
    const webapp = repos.find(r => r.label === 'webapp')!
    expect(webapp.sessions.map(r => r.id)).toEqual(['S2'])
    expect(webapp.orphans.map(o => o.label)).toEqual(['webapp/fix-x'])
    expect(Math.round(webapp.cpu * 10) / 10).toBe(9.4)
    const node = groupProcs([...v.active, ...v.idle], v.orphans, v.outside).find(p => p.name === 'node')!
    expect(node.count).toBe(3)
    expect(node.where).toEqual(['Webapp slides', 'orphan webapp/fix-x'])
  })

  test('only known non-session, non-claude processes can be killed; sessions link to the app', async () => {
    const snap = snapshot()
    expect(canKill(snap, 11)).toBe(true)
    expect(canKill(snap, 21)).toBe(true)
    expect(canKill(snap, 1)).toBe(false)
    expect(canKill(snap, 4)).toBe(false)
    expect(canKill(snap, 999)).toBe(false)
    expect(sessionLink('local_aaaa-1')).toBe('claude://claude.ai/epitaxy/local_aaaa-1')
    expect(sessionLink('weird id')).toBe(null)
  })

  test('a kill needs the same name under the PID', async () => {
    const snap = snapshot()
    expect(canKill(snap, 21, 'node')).toBe(true)
    expect(canKill(snap, 21, 'explorer')).toBe(false)
  })

  test('a session without a cwd owns no orphan', async () => {
    const snap = snapshot()
    snap.sessions[1].cwd = ''
    expect(orphanOwners(snap, { ...snap.orphans[0], root: '/home/u/repo' })).toEqual([])
    expect(orphanOwners(snap, snap.orphans[0])).toEqual([])
  })

  test('the sampler command survives an apostrophe in the profile path', async () => {
    const cmd = samplerCommand("C:\\Users\\O'Brien\\.claude\\plugins\\claude-load\\sampler\\load-sampler.ps1")
    expect(cmd).toMatch(/-File','"C:\\Users\\O''Brien\\\.claude\\plugins\\claude-load\\sampler\\load-sampler\.ps1"'$/)
    // Every single quote is paired: the argument never closes the PowerShell string early.
    expect((cmd.match(/'/g) ?? []).length % 2).toBe(0)
  })
})

describe('the mod', () => {
  test('starts the sampler when there is no snapshot, and marks itself wanted', async ($, on) => {
    const files = new Map<string, string>()
    const runs: string[][] = []
    const clock = mock.clock(on, { now: NOW })
    world(on, files, runs)
    await $.session.start(session)
    // The first tick runs unawaited, so a slow start never holds the session up.
    await clock.advance(1)
    expect(runs.length).toBe(1)
    expect(runs[0].join(' ')).toMatch(/Start-Process .*load-sampler\.ps1/)
    expect(files.has(WANTED)).toBe(true)
  })

  test('the band shows under load, hides when calm, and follows /load band', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    const ui = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'AbovePrompt', props: bandProps })
    expect(await ui.find({ type: 'Text', text: 'CPU 72%' })).not.toBe(undefined)
    expect(await ui.find({ type: 'Text', text: 'RAM 64%' })).not.toBe(undefined)
    expect(await ui.find({ type: 'Text', text: /Power line processing 38%/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Button', label: '/load' } as never)).not.toBe(undefined)

    files.set(SNAP, JSON.stringify(snapshot({ ts: NOW + 5000, cpu: 12 })))
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: /CPU 12%/ })).toBe(undefined)

    expect((await $.command.run(run('band on'))).text).toMatch(/always/)
    expect((await ui.find({ type: 'Text', text: /CPU 12%/ }))?.text).toMatch(/CPU 12%/)
    await $.command.run(run('band off'))
    expect(await ui.find({ type: 'Text', text: /CPU 12%/ })).toBe(undefined)
  })

  test('a stale snapshot respawns the sampler, at most every 30 s', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    await clock.advance(20000)
    expect(runs.length).toBe(1)
    await clock.advance(10000)
    expect(runs.length).toBe(1)
    await clock.advance(25000)
    expect(runs.length).toBe(2)
  })

  test('a fresh snapshot of an older format starts this sampler over it, at most every 30 s and three times', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const old = snapshot()
    delete old.v
    const files = new Map<string, string>([[SNAP, JSON.stringify(old)]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    await clock.advance(1)
    const replaces = () => runs.filter(a => a.join(' ').includes("'-Replace'")).length
    expect(replaces()).toBe(1)
    expect(runs[0].join(' ')).toMatch(/load-sampler\.ps1"','-Replace'$/)
    // The old sampler keeps the snapshot fresh: no plain respawn, only replacements.
    for (let i = 1; i <= 30; i++) {
      files.set(SNAP, JSON.stringify({ ...old, ts: NOW + i * 5000 }))
      await clock.advance(5000)
    }
    expect(replaces()).toBe(3)
    expect(runs.filter(a => a[0] === 'powershell.exe').length).toBe(3)
  })

  test('a snapshot of the current format starts nothing', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    await clock.advance(1)
    expect(runs.some(a => a[0] === 'powershell.exe')).toBe(false)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: the pane filters, regroups, asks Claude, and kills an orphan only after confirmation`, async ($, on) => {
      mock.clock(on, { now: NOW })
      const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
      const runs: string[][] = []
      world(on, files, runs)
      await $.session.start({ ...session, surface })
      const r = await $.command.run(run(''))
      expect(r.text).toMatch(/^CPU /)
      const pane = await $.ui.mount({ plugin: 'claude-load', surface, component: 'Pane', requestId: 'claude-load', props: { title: 'x', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never })
      expect(await pane.find({ type: 'Text', text: /^IDLE$/ })).not.toBe(undefined)
      if (surface === 'desktop') expect(await pane.find({ type: 'Svg' })).not.toBe(undefined)

      await pane.press({ key: 'triage' })
      expect(runs.find(a => a[0] === 'prompt')?.[1]).toMatch(/claude-load:sessions-triage/)

      await pane.press({ key: 'f-orphans' })
      expect(await pane.find({ type: 'Text', text: /^IDLE$/ })).toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /webapp\/fix-x/ })).not.toBe(undefined)

      const kills = () => runs.filter(a => a[0] === 'taskkill.exe').length
      await pane.press({ key: 'o0-k0' })
      expect(kills()).toBe(0)
      expect((await pane.find({ type: 'Text', text: /End node #21\?/ }))?.text).toMatch(/node #21/)
      await pane.press({ key: 'kill-no' })
      expect(await pane.find({ type: 'Text', text: /End node #21\?/ })).toBe(undefined)
      await pane.press({ key: 'o0-k0' })
      await pane.press({ key: 'kill-yes' })
      // The tree from the live listing, children first; #23 predates #21, so it is not its child.
      expect(runs.find(a => a[0] === 'taskkill.exe')).toEqual(['taskkill.exe', '/F', '/PID', '22', '/PID', '21'])

      await pane.press({ key: 'f-all' })
      await pane.press({ key: 'i0-open' })
      expect(runs.some(a => a.join(' ').includes("Start-Process 'claude://claude.ai/epitaxy/local_bbbb-2'"))).toBe(true)
      await pane.select({ key: 'group', value: 'repos' })
      expect((await pane.find({ type: 'Text', text: /^webapp$/ }))?.text).toBe('webapp')
    })
  }

  const paneProps = { title: 'x', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never

  test('a kill is refused when the sample went stale while the confirmation waited', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    await pane.press({ key: 'o0-k0' })
    await clock.advance(20000)
    await pane.press({ key: 'kill-yes' })
    expect(runs.some(a => a[0] === 'taskkill.exe')).toBe(false)
    expect(runs.find(a => a[0] === 'toast')?.[1]).toMatch(/node #21: this process cannot be ended from here/)
  })

  test('a kill is refused when the PID now belongs to another process', async ($, on) => {
    mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    world(on, files, runs)
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    await pane.press({ key: 'o0-k0' })
    const reused = snapshot({ ts: NOW + 1 })
    reused.orphans[0].top = [{ name: 'explorer', pid: 21, cpu: 9, memMB: 400 }]
    files.set(SNAP, JSON.stringify(reused))
    await pane.press({ key: 'kill-yes' })
    expect(runs.some(a => a[0] === 'taskkill.exe')).toBe(false)
    expect(runs.find(a => a[0] === 'toast')?.[1]).toMatch(/cannot be ended/)
  })

  // The reader's case: the process exits and a new one of the same name gets its PID before the
  // snapshot shows it. PID and name match; only the start time tells them apart.
  const confirmOrphanKill = async ($: Parameters<TestBody>[0], on: On, live: { text: string }, snap = snapshot()) => {
    mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snap)]])
    const runs: string[][] = []
    world(on, files, runs, live)
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    await pane.press({ key: 'o0-k0' })
    return { pane, runs }
  }

  test('a kill is refused when the PID and name match but the process started at another time', async ($, on) => {
    const live = { text: LIVE }
    const { pane, runs } = await confirmOrphanKill($, on, live)
    live.text = LIVE.replace(' 1700000000021', ' 1700000009999')
    await pane.press({ key: 'kill-yes' })
    expect(runs.some(a => a[0] === 'taskkill.exe')).toBe(false)
    expect(runs.find(a => a[0] === 'toast')?.[1]).toMatch(/node #21: this process cannot be ended from here/)
  })

  test('the confirmation closes at once when the PID is already gone from the live listing', async ($, on) => {
    const { pane, runs } = await confirmOrphanKill($, on, { text: LIVE.replace(/^21 4 .*$/m, '') })
    expect(await pane.find({ type: 'Text', text: /End node #21\?/ })).toBe(undefined)
    expect(await pane.find({ type: 'Button', key: 'kill-yes' } as never)).toBe(undefined)
    expect(runs.some(a => a[0] === 'taskkill.exe')).toBe(false)
    expect(runs.find(a => a[0] === 'toast')?.[1]).toMatch(/cannot be ended/)
  })

  test('a row without a start time (a sampler older than 1.0.1, or a process just born) has no end button', async ($, on) => {
    mock.clock(on, { now: NOW })
    const snap = snapshot()
    delete snap.orphans[0].top[0].started
    world(on, new Map([[SNAP, JSON.stringify(snap)]]), [])
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    expect(await pane.find({ type: 'Text', text: /#21 node/ })).not.toBe(undefined)
    expect(await pane.find({ type: 'Button', key: 'o0-k0' } as never)).toBe(undefined)
  })

  test('the confirmation shows the live tree and the toast what was freed', async ($, on) => {
    const { pane, runs } = await confirmOrphanKill($, on, { text: LIVE })
    // #21 and its child #22 (not #23, which predates it): 300 MB + 100 MB.
    expect((await pane.find({ type: 'Text', text: /2 processes · 400 MB/ }))?.text).toMatch(/orphan webapp\/fix-x · 2 processes · 400 MB · together with its child processes/)
    await pane.press({ key: 'kill-yes' })
    expect(runs.find(a => a[0] === 'toast')?.[1]).toBe('Ended node #21 (orphan webapp/fix-x) · about 400 MB freed')
  })

  // The click's live listing may answer after Yes: the kill path decides alone, the late preview is dropped.
  test('a preview that answers after Yes neither refuses nor adds a toast', async ($, on) => {
    mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    const runs: string[][] = []
    let release: (() => void) | null = null
    let calls = 0
    world(on, files, runs, {
      text: LIVE,
      hold: argv => argv.some(a => a.includes('Win32_Process')) && ++calls === 1
        ? new Promise<string>(r => { release = () => r(LIVE.replace(/^21 4 .*$/m, '')) })
        : null,
    })
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    await pane.press({ key: 'f-orphans' })
    const pressing = pane.press({ key: 'o0-k0' })
    await pressing
    expect(release).not.toBe(null)
    await pane.press({ key: 'kill-yes' })
    release!()
    await new Promise(r => setTimeout(r, 50))
    const toasts = runs.filter(a => a[0] === 'toast').map(a => a[1])
    expect(toasts).toEqual(['Ended node #21 (orphan webapp/fix-x) · about 400 MB freed'])
  })

  test('sorted by memory, the graphs show memory, with the CPU history as fallback when a sampler has none', async ($, on) => {
    setLang('en')
    const snap = snapshot()
    snap.hist!.sessionsMem = { S1: [1000, 1200, 1500] }
    const byMem = buildView(snap, 'S1', NOW, 'mem')
    expect(byMem.graph).toBe('mem')
    expect(byMem.active[0].hist).toEqual([1000, 1200, 1500])
    expect(byMem.idle[0].hist).toEqual([264]) // no memory history for S2: its memory now
    expect(byMem.orphans[0].hist).toEqual([400])
    expect(buildView(snap, 'S1', NOW, 'cpu').active[0].hist).toEqual([5, 20, 38])

    mock.clock(on, { now: NOW })
    world(on, new Map([[SNAP, JSON.stringify(snap)]]), [])
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    expect(await pane.find({ type: 'Text', text: /graphs show CPU over/ })).not.toBe(undefined)
    await pane.select({ key: 'sort', value: 'mem' })
    expect(await pane.find({ type: 'Text', text: /graphs show memory over/ })).not.toBe(undefined)
  })

  test('outside processes expand to their heaviest PIDs', async ($, on) => {
    mock.clock(on, { now: NOW })
    const snap = snapshot()
    snap.outside[0].top = [{ name: 'zen', pid: 501, cpu: 1, memMB: 2048, started: '1' }, { name: 'zen', pid: 502, cpu: 0.5, memMB: 900, started: '2' }]
    world(on, new Map([[SNAP, JSON.stringify(snap)]]), [])
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    expect(await pane.find({ type: 'Text', text: /#501 zen/ })).toBe(undefined)
    // By CPU `claude` (Claude Desktop, 11%) comes first and has no top in the fixture: no toggle for it.
    expect(await pane.find({ type: 'Button', key: 'x0-t' } as never)).toBe(undefined)
    await pane.press({ key: 'x1-t' })
    expect((await pane.find({ type: 'Text', text: /#501 zen/ }))?.text).toBe('#501 zen · 1% · 2.0 GB')
    expect(await pane.find({ type: 'Text', text: /#502 zen/ })).not.toBe(undefined)
  })

  test('idle sessions are one line with their buttons; the triage button carries the Claude mark', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, new Map([[SNAP, JSON.stringify(snapshot())]]), [])
    await $.session.start(session)
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load', props: paneProps })
    expect(await pane.find({ type: 'Button', key: 'i0-t' } as never)).not.toBe(undefined)
    expect(await pane.find({ type: 'Button', key: 'i0-open' } as never)).not.toBe(undefined)
    expect(await pane.find({ type: 'Text', text: '✻' })).not.toBe(undefined)
    expect(await pane.find({ type: 'Button', label: 'Sort it out with Claude' } as never)).not.toBe(undefined)
  })

  test('the guard denies a heavy command outside runq in a project under a root, with the line to run', async ($, on) => {
    mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())], [`${QDIR}\\config.json`, JSON.stringify({ guard: { roots: ['C:/work'] } })]])
    world(on, files, [])
    const ran: string[] = []
    on('tool.call', ($, e) => { ran.push(String((e as { command?: string }).command)); return { result: {} } as never })
    await $.session.start(session)
    const r = await $.tool.call({ tool: 'Bash', command: 'cd C:/work/x && cargo test --workspace 2>&1 | tail -5' }) as { deny?: string; text?: string }
    const why = r.deny ?? r.text ?? ''
    expect(why).toMatch(/Nothing was run/)
    expect(why).toContain('cd C:/work/x && python "C:/Users/u/.claude/state/queue/runq.py" --mem 8 --tag cargo-test --label \'cargo test\' -- cargo test --workspace 2>&1 | tail -5')
    expect(ran).toEqual([])
    await $.tool.call({ tool: 'Bash', command: 'python "C:/Users/u/.claude/state/queue/runq.py" --mem 8 --tag cargo-test -- cargo test' })
    await $.tool.call({ tool: 'PowerShell', command: 'cargo build --release' })
    expect(ran.length).toBe(2)
    const ps = await $.tool.call({ tool: 'PowerShell', command: '& "C:\\work\\t\\treegrow.exe" scan' }) as { deny?: string; text?: string }
    expect(ps.deny ?? ps.text ?? '').toContain('runq.py" --mem 16 --tag treegrow --label \'treegrow run\' -- "C:\\work\\t\\treegrow.exe" scan')
  })

  test("the project's settings turn the guard on, or off under a root", async ($, on) => {
    let env = '1'
    world(on, new Map([[SNAP, JSON.stringify(snapshot())], [`${QDIR}\\config.json`, JSON.stringify({ guard: { roots: ['C:/work'] } })]]), [])
    on('settings.read', () => ({ value: { env: { CLAUDE_LOAD_RUNQ_GUARD: env } } }) as never)
    const ran: string[] = []
    on('tool.call', ($, e) => { ran.push(String((e as { command?: string }).command)); return { result: {} } as never })
    const clock = mock.clock(on, { now: NOW })
    await $.session.start({ ...session, cwd: 'D:\\other' })
    const r = await $.tool.call({ tool: 'Bash', command: 'cargo test' }) as { deny?: string; text?: string }
    expect(r.deny ?? r.text ?? '').toMatch(/runq\.py" --mem 8 --tag cargo-test/)
    env = '0'
    await clock.advance(31000)
    await $.session.start(session)
    await $.tool.call({ tool: 'Bash', command: 'cargo test' })
    expect(ran).toEqual(['cargo test'])
  })

  test('the guard stays off in a project that did not opt in', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, new Map([[SNAP, JSON.stringify(snapshot())], [`${QDIR}\\config.json`, JSON.stringify({ guard: { roots: ['D:/elsewhere'] } })]]), [])
    const ran: string[] = []
    on('tool.call', ($, e) => { ran.push(String((e as { command?: string }).command)); return { result: {} } as never })
    await $.session.start(session)
    await $.tool.call({ tool: 'Bash', command: 'cargo test' })
    expect(ran).toEqual(['cargo test'])
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: the pane shows the run queue, why a job waits, and the last events`, async ($, on) => {
      mock.clock(on, { now: NOW })
      const job = (o: Record<string, unknown>) => JSON.stringify({ tags: [], curMB: 0, peakMB: 0, ...o })
      const files = new Map<string, string>([
        [SNAP, JSON.stringify(snapshot())],
        [`${QDIR}\\jobs\\1-1.json`, job({ id: '1-1', label: 'HELIOS 1 ha', state: 'running', memMB: 20480, curMB: 18000, peakMB: 18800, queuedAt: NOW - 900000, startedAt: NOW - 600000, session: 'S1', tags: ['helios'] })],
        [`${QDIR}\\jobs\\2-2.json`, job({ id: '2-2', label: 'cargo test ws', state: 'waiting', memMB: 8192, queuedAt: NOW - 120000, session: 'S2', reasons: [{ kind: 'mem', needMB: 8192, guardMB: 12288, freeMB: 9000 }] })],
        [`${QDIR}\\events.jsonl`, [
          JSON.stringify({ ts: NOW - 700000, ev: 'finished', label: 'grow pine', exit: 0, runS: 300, peakMB: 9000 }),
          JSON.stringify({ ts: NOW - 60000, ev: 'killed', label: 'scan big', exit: 137, peakMB: 25000 }),
        ].join('\n')],
      ])
      world(on, files, [])
      await $.session.start({ ...session, surface })
      await $.command.run(run(''))
      const pane = await $.ui.mount({ plugin: 'claude-load', surface, component: 'Pane', requestId: 'claude-load', props: paneProps })
      expect(await pane.find({ type: 'Text', text: 'RUN QUEUE' })).not.toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /free commit 41\.0 GB of 89\.8 GB · RAM free 22\.9 GB · C: 117\.2 GB free · D: 4\.0 GB free/ })).not.toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /declared 20\.0 GB · now 17\.6 GB · peak 18\.4 GB · 10 min · helios/ })).not.toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /Webapp slides/ })).not.toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /waiting 2 min · needs 8\.0 GB \+ 12\.0 GB guard, 8\.8 GB free/ })).not.toBe(undefined)
      expect(await pane.find({ type: 'Text', text: /1 min ago {2}scan big · ended by its --max-mem · exit 137/ })).not.toBe(undefined)
      const report = await $.command.run(run('')) as { text?: string }
      expect(report.text).toMatch(/Run queue · free commit/)
      expect(report.text).toMatch(/1\. cargo test ws \[Webapp slides\]/)
    })
  }

  const FEED = [
    { ts: NOW - 30 * 3600 * 1000, hm: '17:00', ev: 'finished', label: 'yesterday', exit: 0 },
    { ts: NOW - 600000, hm: '20:50', ev: 'queued', label: 'cargo test', sessionName: 'treegrow-ф8', memMB: 8192, note: 'после правки крон' },
    { ts: NOW - 590000, hm: '20:50', ev: 'waiting', label: 'cargo test', sessionName: 'treegrow-ф8', waitS: 0, reasons: [{ kind: 'tag', tag: 'cargo-test', by: 'phase7 tests' }] },
    { ts: NOW - 240000, hm: '20:56', ev: 'waiting', label: 'cargo test', sessionName: 'treegrow-ф8', waitS: 360, reasons: [{ kind: 'mem', needMB: 8192, guardMB: 12288, freeMB: 9000 }] },
    { ts: NOW - 60000, hm: '20:59', ev: 'note', sessionName: 'scan-lod', text: 'D: почти полон, чищу старые сканы' },
  ].map(e => JSON.stringify(e)).join('\n')

  for (const surface of ['terminal', 'desktop'] as const) {
    kitTest(`${surface}: the feed pane reads as a log, newest first, a day back, in Russian`, { timeoutMs: 30000, options: { language: 'ru' } }, async ($, on) => {
      mock.clock(on, { now: NOW })
      world(on, new Map([[SNAP, JSON.stringify(snapshot())], [`${QDIR}\\events.jsonl`, FEED]]), [])
      await $.session.start({ ...session, surface })
      const r = await $.command.run(run('queue')) as { text?: string }
      expect(r.text).toMatch(/^20:59 {2}scan-lod · «D: почти полон, чищу старые сканы»/m)
      const pane = await $.ui.mount({ plugin: 'claude-load', surface, component: 'Pane', requestId: 'claude-load-queue', props: paneProps })
      const lines = (await pane.findAll({ type: 'Text', text: /^\d\d:\d\d {2}/ } as never)).map((x: { text?: string }) => x.text ?? '')
      expect(lines).toEqual([
        '20:59  scan-lod · «D: почти полон, чищу старые сканы»',
        '20:56  treegrow-ф8 · cargo test · ждёт 6 мин: нужно 8,0 ГБ + 12,0 ГБ запаса, свободно 8,8 ГБ',
        '20:50  treegrow-ф8 · cargo test · ждёт: занят тег cargo-test (phase7 tests)',
        '20:50  treegrow-ф8 · cargo test · в очереди, заявлено 8,0 ГБ · «после правки крон»',
      ])
    })
  }

  test('the feed pages a day back', async ($, on) => {
    mock.clock(on, { now: NOW })
    const many = Array.from({ length: 70 }, (_, i) => JSON.stringify({ ts: NOW - (70 - i) * 1000, ev: 'note', text: `n${i}` })).join('\n')
    world(on, new Map([[SNAP, JSON.stringify(snapshot())], [`${QDIR}\\events.jsonl`, many]]), [])
    await $.session.start(session)
    await $.command.run(run('queue'))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'terminal', component: 'Pane', requestId: 'claude-load-queue', props: paneProps })
    expect(await pane.find({ type: 'Text', text: /«n69»/ })).not.toBe(undefined)
    expect(await pane.find({ type: 'Text', text: /«n5»/ })).toBe(undefined)
    await pane.press({ key: 'feed-more' })
    expect(await pane.find({ type: 'Text', text: /«n0»/ })).not.toBe(undefined)
  })

  kitTest('Russian strings render in the pane when the option says so', { timeoutMs: 30000, options: { language: 'ru' } }, async ($, on) => {
    mock.clock(on, { now: NOW })
    const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
    world(on, files, [])
    await $.session.start({ ...session, surface: 'desktop' })
    await $.command.run(run(''))
    const pane = await $.ui.mount({ plugin: 'claude-load', surface: 'desktop', component: 'Pane', requestId: 'claude-load', props: { title: 'x', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never })
    expect(await pane.find({ type: 'Text', text: /^ПРОСТАИВАЮТ$/ })).not.toBe(undefined)
    expect(await pane.find({ type: 'Text', text: /Claude: 2 сессии/ })).not.toBe(undefined)
  })
})
