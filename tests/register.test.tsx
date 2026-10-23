import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionStartInput, TestBody } from 'claude-code/testing'

import { LANGS, STRINGS, matchLang, plural } from '../hooks/i18n'
import {
  applyFilter, bandText, bar, buildView, canKill, descendants, fmtMem, groupProcs, groupRepos, isBusy, orphanOwners, repoRoot,
  samplerCommand, sessionLink, setLang, sparkSvg, sparkText, textReport,
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
    ts: NOW, intervalMs: 4000, cores: 16, cpu: 72, memTotalMB: 65457, memUsedMB: 42000, warm: true,
    sessions: [
      {
        pid: 1, name: 'Power line processing', status: 'busy', cwd: 'C:\\repo\\pipeline', hostSessionId: 'local_aaaa-1', sessionId: 'S1',
        cpu: 38.2, memMB: 1500, procs: 28, top: [{ name: 'python', pid: 11, cpu: 35, memMB: 900 }, { name: 'claude', pid: 1, cpu: 1, memMB: 400 }],
        byName: [{ name: 'python', count: 4, cpu: 35, memMB: 900 }, { name: 'claude', count: 1, cpu: 1, memMB: 400 }],
      },
      {
        pid: 2, name: 'Webapp slides', status: 'idle', cwd: 'C:\\repo\\webapp\\.claude\\worktrees\\feat-x', hostSessionId: 'local_bbbb-2', sessionId: 'S2',
        cpu: 0.4, memMB: 264, procs: 2, top: [], byName: [{ name: 'node', count: 2, cpu: 0.4, memMB: 200 }],
      },
    ],
    orphans: [{ label: 'webapp/fix-x', root: 'C:\\repo\\webapp', cpu: 9, memMB: 400, procs: 3, top: [{ name: 'node', pid: 21, cpu: 9, memMB: 400 }] }],
    outside: [{ name: 'zen', count: 48, cpu: 2, memMB: 8863 }, { name: 'claude', count: 13, cpu: 11, memMB: 3064 }],
    hist: { cpu: [10, 40, 72], mem: [60, 62, 64], sessions: { S1: [5, 20, 38] }, orphans: { 'webapp/fix-x': [9, 9, 9] } },
    ...over,
  }
}

function world(on: On, files: Map<string, string>, runs: string[][]) {
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
  on('process.run', ($, e) => { runs.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '' } } })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { runs.push(['toast', e.text]); return { value: undefined } })
  on('prompt.submit', ($, e) => { runs.push(['prompt', e.text]); return { text: e.text } })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
}

const SNAP = 'C:\\Users\\u\\.claude\\state\\load\\snapshot.json'
const WANTED = 'C:\\Users\\u\\.claude\\state\\load\\wanted'

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
      expect(runs.find(a => a[0] === 'taskkill.exe')).toEqual(['taskkill.exe', '/PID', '21', '/T', '/F'])

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
