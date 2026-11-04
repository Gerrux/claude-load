import { describe, expect, test as kitTest } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { DEFAULT_RULES, findHeavy, guardOn, guardRules, isRunq, parseEvents, parseJob, segments, sortJobs, suggestLine, underRoot } from '../hooks/queue'

const test = (name: string, body: TestBody) => kitTest(name, { timeoutMs: 30000 }, body)

const RUNQ = 'python "C:/Users/u/.claude/state/queue/runq.py"'
const heavy = (line: string) => findHeavy(line, DEFAULT_RULES)

describe('the guard finds heavy commands', () => {
  test('cargo test anywhere in a line, at a command position only', async () => {
    expect(heavy('cargo test --workspace')?.rule.tag).toBe('cargo-test')
    expect(heavy('cd D:/work/treegrow-x && cargo test -p tg-core 2>&1 | tail -20')?.rule.tag).toBe('cargo-test')
    expect(heavy('RUST_LOG=debug RUST_BACKTRACE=1 cargo test')?.segment.text).toBe('cargo test')
    expect(heavy('timeout 600 cargo +nightly test')?.rule.tag).toBe('cargo-test')
    expect(heavy('cargo build --release && cargo test')?.rule.tag).toBe('cargo-test')
    expect(heavy('(cargo test)')?.rule.tag).toBe('cargo-test')
    // Words in arguments, quotes and other commands are not runs.
    expect(heavy('git commit -m "make cargo test pass"')).toBe(null)
    expect(heavy('echo "a; cargo test"')).toBe(null)
    expect(heavy("grep -rn 'cargo test' docs")).toBe(null)
    expect(heavy('cargo build --release')).toBe(null)
    expect(heavy('cargo testing-tool')).toBe(null)
  })

  test('treegrow runs and HELIOS++, from Bash and PowerShell', async () => {
    expect(heavy('./target/release/treegrow-cli.exe scan --plot 1ha')?.rule.name).toBe('treegrow run')
    expect(heavy('target/release/treegrow grow --years 80')?.rule.name).toBe('treegrow run')
    expect(heavy('& "D:\\work\\treegrow-x\\target\\release\\treegrow-cli.exe" forest --n 3')?.rule.name).toBe('treegrow run')
    expect(heavy('cargo run --release -p treegrow-cli -- stand --plot a')?.rule.name).toBe('treegrow run')
    expect(heavy('treegrow-cli.exe --help')).toBe(null)
    expect(heavy('C:/tools/helios/helios.exe survey.xml --lasOutput')?.rule.tag).toBe('helios')
    expect(heavy('helios++ survey.xml')?.rule.tag).toBe('helios')
    expect(heavy('Get-Content x.txt | Select-String helios')).toBe(null)
  })

  test('a command already run through runq passes, in any spelling', async () => {
    expect(isRunq('runq --mem 8 -- cargo test')).toBe(true)
    expect(isRunq('python "C:/Users/u/.claude/state/queue/runq.py" --mem 8 -- cargo test')).toBe(true)
    expect(isRunq('python3 ~/.claude/state/queue/runq.py --mem 8 -- cargo test')).toBe(true)
    expect(isRunq('py -3 C:\\x\\runq.py status')).toBe(true)
    expect(heavy(`${RUNQ} --mem 8 --tag cargo-test -- cargo test --workspace`)).toBe(null)
    expect(heavy(`cd D:/work/x && ${RUNQ} --mem 20 -- ./treegrow.exe scan 2>&1 | tail`)).toBe(null)
    // Wrapping one command does not cover the next.
    expect(heavy(`${RUNQ} --mem 8 -- cargo build && cargo test`)?.rule.tag).toBe('cargo-test')
  })

  // Review finding: lines of a heredoc / here-string body are text, not commands; splitting at
  // every newline denies an agent that only writes a script or a PR body that mentions cargo test.
  test('heredoc and here-string bodies are not commands', async () => {
    expect(heavy("cat > ci.sh <<'EOF'\n#!/bin/sh\ncargo test --workspace\nEOF")).toBe(null)
    expect(heavy("gh pr create --title x --body-file - <<'EOF'\n## Test plan\ncargo test --workspace passes\nEOF")).toBe(null)
    expect(heavy("git commit -m @'\nFix: don't drop the plot\n\ncargo test passes now\n'@")).toBe(null)
  })

  test('help is not a run; shell keywords and PowerShell paths do not hide one', async () => {
    expect(heavy('cargo test --help')).toBe(null)
    expect(heavy('helios --help')).toBe(null)
    expect(heavy('cargo nextest list')).toBe(null)
    expect(heavy('cargo nextest run -p a')?.rule.tag).toBe('cargo-test')
    expect(heavy('if cargo test; then echo ok; fi')?.rule.tag).toBe('cargo-test')
    expect(heavy('for c in a b; do cargo test -p $c; done')?.rule.tag).toBe('cargo-test')
    expect(findHeavy('cd C:\\; cargo test', DEFAULT_RULES, true)?.rule.tag).toBe('cargo-test')
    expect(heavy("cat <<-EOF > x\n\tcargo test\n\tEOF\ncargo test")?.segment.text).toBe('cargo test')
  })

  test('redirections are not separators', async () => {
    expect(segments('cargo test 2>&1 | tail -5').map(s => s.text)).toEqual(['cargo test 2>&1', 'tail -5'])
    expect(segments('a &> log & b').map(s => s.text)).toEqual(['a &> log', 'b'])
  })
})

describe('the runq line the agent is told to run', () => {
  test('only the heavy command gets the prefix; what is around it stays', async () => {
    const line = 'cd D:/work/treegrow-x && RUST_LOG=info cargo test -p tg-core 2>&1 | tail -20'
    expect(suggestLine(line, heavy(line)!, RUNQ, false)).toBe(
      `cd D:/work/treegrow-x && RUST_LOG=info ${RUNQ} --mem 8 --tag cargo-test --label 'cargo test' -- cargo test -p tg-core 2>&1 | tail -20`)
  })

  test("PowerShell's call operator goes: runq starts the program", async () => {
    const line = '& "D:\\w\\treegrow.exe" scan --plot a'
    expect(suggestLine(line, heavy(line)!, RUNQ, true)).toBe(
      `${RUNQ} --mem 16 --tag treegrow --label 'treegrow run' -- "D:\\w\\treegrow.exe" scan --plot a`)
  })
})

describe('where the guard is on', () => {
  test('roots, with * for one path part, worktrees inside a root included', async () => {
    const roots = ['C:\\Users\\u\\garage\\treegrow', 'D:/work/treegrow-*']
    expect(underRoot('C:\\Users\\u\\garage\\treegrow', roots)).toBe(true)
    expect(underRoot('C:\\Users\\u\\garage\\treegrow\\.claude\\worktrees\\feat-a', roots)).toBe(true)
    expect(underRoot('d:\\work\\treegrow-pine-pass\\crates', roots)).toBe(true)
    expect(underRoot('C:\\Users\\u\\garage\\treegrow-old', roots)).toBe(false)
    expect(underRoot('D:\\work\\arbogeo', roots)).toBe(false)
  })

  test("the project's setting turns it on or off, roots decide otherwise", async () => {
    expect(guardOn('1', 'C:/elsewhere', undefined)).toBe(true)
    expect(guardOn('on', '', undefined)).toBe(true)
    expect(guardOn('0', 'D:/work/treegrow-a', { roots: ['D:/work/*'] })).toBe(false)
    expect(guardOn(undefined, 'D:/work/treegrow-a', { roots: ['D:/work/*'] })).toBe(true)
    expect(guardOn(undefined, 'D:/work/treegrow-a', undefined)).toBe(false)
  })

  test('configured rules replace the defaults; broken ones are skipped', async () => {
    expect(guardRules(undefined)).toBe(DEFAULT_RULES)
    const rules = guardRules({ rules: [{ name: 'pytest', pattern: '^pytest\\b', memGB: 4 }, { name: 'bad', pattern: '(' }] })
    expect(rules.length).toBe(2)
    expect(findHeavy('pytest -x tests', rules)?.rule.name).toBe('pytest')
    expect(findHeavy('cargo test', rules)).toBe(null)
  })
})

describe('the state runq writes', () => {
  test('jobs and events parse; broken lines are skipped', async () => {
    expect(parseJob('{"id":"1-2","state":"running","label":"x","queuedAt":1}')?.id).toBe('1-2')
    expect(parseJob('{"id":"1-2","state":"done"}')).toBe(null)
    expect(parseJob('{"id":')).toBe(null)
    const text = '{"ts":1,"ev":"queued"}\n{"ts":2,"ev":"start\n{"ts":3,"ev":"finished","exit":0}\r\n'
    expect(parseEvents(text).map(e => e.ts)).toEqual([1, 3])
    expect(parseEvents(text, 1).map(e => e.ts)).toEqual([3])
  })

  test('jobs sort by queue order', async () => {
    const j = (id: string, state: 'running' | 'waiting', queuedAt: number) => ({ id, state, queuedAt, label: id })
    const { running, waiting } = sortJobs([j('c', 'waiting', 3), j('a', 'running', 5), j('b', 'waiting', 1)])
    expect(running.map(x => x.id)).toEqual(['a'])
    expect(waiting.map(x => x.id)).toEqual(['b', 'c'])
  })
})
