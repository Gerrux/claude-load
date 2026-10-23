import { describe, expect, mock, test as kitTest } from 'claude-code/testing'
import type { On, SessionStartInput } from 'claude-code/testing'

import { LANGS, STRINGS, plural } from '../hooks/i18n'
import type { Lang } from '../hooks/i18n'
import { buildView, setLang, textReport } from '../hooks/register'
import type { Snapshot } from '../hooks/register'

// Every language end to end: the pane on both surfaces, the band and the /load report.
const NOW = 1_800_000_000_000
const session: SessionStartInput = { surface: 'desktop', isInteractive: true, cwd: 'C:\\work' }
const SNAP = 'C:\\Users\\u\\.claude\\state\\load\\snapshot.json'
const paneProps = { title: 'x', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never

function snapshot(): Snapshot {
  return {
    ts: NOW, intervalMs: 4000, cores: 12, cpu: 81, memTotalMB: 32768, memUsedMB: 29000, warm: true,
    sessions: [
      { pid: 1, name: 'Refactor auth', status: 'busy', cwd: 'C:\\repo\\api', hostSessionId: 'local_aaaa-1', sessionId: 'S1', cpu: 41, memMB: 2300, procs: 21, top: [{ name: 'pytest', pid: 11, cpu: 35, memMB: 1100 }], byName: [{ name: 'pytest', count: 1, cpu: 35, memMB: 1100 }] },
      { pid: 2, name: 'Docs', status: 'idle', cwd: 'C:\\repo\\api\\.claude\\worktrees\\docs', hostSessionId: 'local_bbbb-2', sessionId: 'S2', cpu: 0, memMB: 600, procs: 12, top: [], byName: [] },
      { pid: 3, name: 'Release', status: 'idle', cwd: 'C:\\repo\\web', hostSessionId: 'local_cccc-3', sessionId: 'S3', cpu: 0, memMB: 580, procs: 1, top: [], byName: [] },
    ],
    orphans: [{ label: 'web/feat-x', root: 'C:\\repo\\web', cpu: 7, memMB: 1300, procs: 2, top: [{ name: 'node', pid: 21, cpu: 7, memMB: 1300 }] }],
    outside: [{ name: 'chrome', count: 22, cpu: 5, memMB: 4100 }],
    hist: { cpu: [20, 50, 81], mem: [80, 85, 88], sessions: { S1: [10, 30, 41] }, orphans: { 'web/feat-x': [7, 7, 7] } },
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
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
}

const ENGLISH_ONLY = /\b(sampled|Outside sessions|this window|processes|orphan|Idle|Active)\b/

describe('every language', () => {
  for (const lang of LANGS) {
    for (const surface of ['terminal', 'desktop'] as const) {
      kitTest(`${lang} · ${surface}: pane, band and report render localized`, { timeoutMs: 30000, options: { language: lang } }, async ($, on) => {
        const t = STRINGS[lang]
        mock.clock(on, { now: NOW })
        const files = new Map<string, string>([[SNAP, JSON.stringify(snapshot())]])
        world(on, files, [])
        await $.session.start({ ...session, surface })
        const r = await $.command.run({ command: 'load', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
        expect(r.text).toMatch(/^CPU /)
        if (lang !== 'en') expect(r.text).not.toMatch(ENGLISH_ONLY)

        const pane = await $.ui.mount({ plugin: 'claude-load', surface, component: 'Pane', requestId: 'claude-load', props: paneProps })
        expect(await pane.find({ type: 'Text', text: t.sectionActive.toUpperCase() })).not.toBe(undefined)
        expect(await pane.find({ type: 'Text', text: t.sectionIdle.toUpperCase() })).not.toBe(undefined)
        expect(await pane.find({ type: 'Text', text: t.sectionOrphans.toUpperCase() })).not.toBe(undefined)
        await pane.press({ key: 'f-heavy' })
        await pane.select({ key: 'group', value: 'repos' })
        expect(await pane.find({ type: 'Text', text: 'api' })).not.toBe(undefined)
        await pane.select({ key: 'group', value: 'procs' })
        expect(await pane.find({ type: 'Text', text: t.sectionProcs.toUpperCase() })).not.toBe(undefined)
        await pane.press({ key: 'f-orphans' })
        await pane.select({ key: 'group', value: 'sessions' })
        await pane.press({ key: 'o0-k0' })
        expect(await pane.find({ type: 'Text', text: t.killTitle('node', 21) })).not.toBe(undefined)
        await pane.press({ key: 'kill-no' })

        const band = await $.ui.mount({ plugin: 'claude-load', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
        expect(await band.find({ type: 'Text', text: 'CPU 81%' })).not.toBe(undefined)
      })
    }
  }

  kitTest('labels stay short enough for a narrow pane', { timeoutMs: 30000 }, async () => {
    const long: string[] = []
    for (const lang of LANGS) {
      const t = STRINGS[lang]
      const labels = { filterAll: t.filterAll, filterActive: t.filterActive, filterHeavy: t.filterHeavy, filterOrphans: t.filterOrphans, filterSelf: t.filterSelf, open: t.open, showProcs: t.showProcs, hideProcs: t.hideProcs, kill: t.kill, killYes: t.killYes, killNo: t.killNo, groupSessions: t.groupSessions, groupRepos: t.groupRepos, groupProcs: t.groupProcs, sortCpu: t.sortCpu, sortMem: t.sortMem }
      for (const [k, v] of Object.entries(labels)) if (v.length > 18) long.push(`${lang}.${k}=${v}`)
      if (t.triage.length > 28) long.push(`${lang}.triage=${t.triage}`)
      const filters = t.filterAll.length + t.filterActive.length + t.filterHeavy.length + t.filterOrphans.length + t.filterSelf.length
      if (filters > 52) long.push(`${lang}.filters total ${filters}`)
    }
    expect(long).toEqual([])
  })

  kitTest('plural forms read right for 1, 2, 5, 21', { timeoutMs: 30000 }, async () => {
    const out: Record<string, string[]> = {}
    for (const lang of LANGS) out[lang] = [1, 2, 5, 21].map(n => plural(lang as Lang, n, STRINGS[lang].sessions))
    expect(out.ru).toEqual(['1 сессия', '2 сессии', '5 сессий', '21 сессия'])
    expect(out.en).toEqual(['1 session', '2 sessions', '5 sessions', '21 sessions'])
    expect(out.de[0]).toMatch(/^1 /)
    for (const lang of LANGS) for (const s of out[lang]) expect(s).not.toMatch(/undefined/)
  })

  kitTest('reports in every language (printed for review)', { timeoutMs: 30000 }, async () => {
    for (const lang of LANGS) {
      setLang(lang)
      const report = textReport(buildView(snapshot(), 'S1', NOW + 2000))
      console.log(`\n===== ${lang} =====\n${report}`)
      expect(report).not.toMatch(/undefined|NaN/)
    }
    setLang('en')
  })
})
