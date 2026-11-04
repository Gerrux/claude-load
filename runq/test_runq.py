"""Tests for runq: the queue decision (pure) and real runs against a temporary queue folder.

    python -m unittest discover -s runq -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import runq

RUNQ = str(Path(__file__).parent / 'runq.py')
GB = 1024
CFG = {'guardGB': 12, 'exclusiveTags': ['cargo-test'], 'fairAfterMin': 5}
NOW = 1_800_000_000_000


def job(id_, state='waiting', mem=0.0, tags=(), queued=0, **kw):
    return {'id': id_, 'label': id_, 'state': state, 'memMB': mem * GB, 'tags': list(tags),
            'queuedAt': NOW - 60000 + queued, **kw}


def starts(decision):
    return [k for k, v in decision.items() if not v]


class PlanTest(unittest.TestCase):
    def test_fifo_when_memory_fits_one(self):
        jobs = [job('b', mem=10, queued=2), job('a', mem=10, queued=1)]
        d = runq.plan(jobs, {'commitFreeMB': 30 * GB}, CFG, NOW)
        self.assertEqual(starts(d), ['a'])
        self.assertEqual(d['b'][0]['kind'], 'mem')

    def test_both_start_when_both_fit(self):
        jobs = [job('a', mem=4, queued=1), job('b', mem=4, queued=2)]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 30 * GB}, CFG, NOW)), ['a', 'b'])

    def test_running_jobs_owe_what_they_have_not_taken_yet(self):
        # Declared 20 GB, has taken 5: free commit does not show the 15 still to come.
        jobs = [job('r', 'running', mem=20, curMB=5 * GB), job('w', mem=10)]
        d = runq.plan(jobs, {'commitFreeMB': 36 * GB}, CFG, NOW)
        self.assertEqual(d['w'][0]['kind'], 'mem')
        self.assertAlmostEqual(d['w'][0]['freeMB'], 21 * GB)
        d = runq.plan(jobs, {'commitFreeMB': 37 * GB}, CFG, NOW)
        self.assertEqual(starts(d), ['w'])

    def test_running_job_past_its_declaration_owes_nothing(self):
        jobs = [job('r', 'running', mem=4, curMB=9 * GB), job('w', mem=4)]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 16 * GB}, CFG, NOW)), ['w'])

    def test_guard_is_kept(self):
        d = runq.plan([job('a', mem=8)], {'commitFreeMB': 19.9 * GB}, CFG, NOW)
        self.assertEqual(d['a'][0]['kind'], 'mem')
        self.assertEqual(starts(runq.plan([job('a', mem=8)], {'commitFreeMB': 20 * GB}, CFG, NOW)), ['a'])

    def test_small_job_passes_a_big_one_until_it_has_waited_long_enough(self):
        big = job('big', mem=30, queued=1)
        small = job('small', mem=2, queued=2)
        machine = {'commitFreeMB': 20 * GB}
        # The big one has waited one minute: the small one may pass it.
        self.assertEqual(starts(runq.plan([big, small], machine, CFG, NOW)), ['small'])
        # Five minutes: from now on memory drains towards the big one.
        d = runq.plan([big, small], machine, CFG, NOW + 5 * 60000)
        self.assertEqual(starts(d), [])
        self.assertEqual(d['small'][0], {'kind': 'behind', 'by': 'big'})

    def test_a_long_wait_held_by_a_tag_does_not_hold_memory_jobs_back(self):
        # The big job waits for memory and for cargo-test: it cannot start when memory frees,
        # so it must not stop a later job that fits.
        cfg = CFG
        r = job('r', 'running', mem=1, tags=['cargo-test'], curMB=GB)
        big = job('big', mem=30, tags=['cargo-test'], queued=1)
        small = job('small', mem=2, queued=2)
        d = runq.plan([r, big, small], {'commitFreeMB': 20 * GB}, cfg, NOW + 10 * 60000)
        self.assertEqual(starts(d), ['small'])

    def test_zero_memory_job_is_not_held_behind_a_memory_wait(self):
        big = job('big', mem=30, queued=1)
        tiny = job('tiny', mem=0, queued=2)
        self.assertEqual(starts(runq.plan([big, tiny], {'commitFreeMB': 20 * GB}, CFG, NOW + 10 * 60000)), ['tiny'])

    def test_exclusive_tag_held_by_running_job_blocks(self):
        jobs = [job('r', 'running', mem=1, tags=['cargo-test'], curMB=GB), job('w', mem=1, tags=['cargo-test'])]
        d = runq.plan(jobs, {'commitFreeMB': 60 * GB}, CFG, NOW)
        self.assertEqual(d['w'], [{'kind': 'tag', 'tag': 'cargo-test', 'by': 'r'}])

    def test_other_tags_do_not_conflict(self):
        jobs = [job('r', 'running', mem=1, tags=['helios'], curMB=GB), job('w', mem=1, tags=['helios'])]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 60 * GB}, CFG, NOW)), ['w'])
        jobs = [job('r', 'running', mem=1, tags=['cargo-test'], curMB=GB), job('w', mem=1, tags=['helios'])]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 60 * GB}, CFG, NOW)), ['w'])

    def test_exclusive_tag_is_fifo_among_waiting_jobs(self):
        # The first cargo test waits for memory; the second one, which would fit, waits behind it.
        first = job('first', mem=40, tags=['cargo-test'], queued=1)
        second = job('second', mem=1, tags=['cargo-test'], queued=2)
        d = runq.plan([second, first], {'commitFreeMB': 30 * GB}, CFG, NOW)
        self.assertEqual(starts(d), [])
        self.assertEqual(d['second'], [{'kind': 'tag', 'tag': 'cargo-test', 'by': 'first'}])

    def test_two_exclusive_jobs_never_start_in_one_pass(self):
        jobs = [job('a', mem=1, tags=['cargo-test'], queued=1), job('b', mem=1, tags=['cargo-test'], queued=2)]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 60 * GB}, CFG, NOW)), ['a'])

    def test_configured_exclusive_tags(self):
        cfg = {**CFG, 'exclusiveTags': ['helios']}
        jobs = [job('r', 'running', mem=1, tags=['helios'], curMB=GB), job('w', mem=1, tags=['helios'])]
        self.assertEqual(starts(runq.plan(jobs, {'commitFreeMB': 60 * GB}, cfg, NOW)), [])

    def test_disk(self):
        w = job('w', mem=1, disks={'D:': 40 * GB})
        d = runq.plan([w], {'commitFreeMB': 60 * GB, 'disks': {'D:': 30 * GB}}, CFG, NOW)
        self.assertEqual(d['w'][0]['kind'], 'disk')
        self.assertEqual(starts(runq.plan([w], {'commitFreeMB': 60 * GB, 'disks': {'D:': 50 * GB}}, CFG, NOW)), ['w'])
        # A running job declared 40 GB on D: and has written 10 of it: 30 more are owed, so of
        # the 60 free only 30 are there for the next job.
        r = job('r', 'running', mem=1, curMB=GB, disks={'D:': 40 * GB}, diskAtStart={'D:': 70 * GB})
        d = runq.plan([r, w], {'commitFreeMB': 60 * GB, 'disks': {'D:': 60 * GB}}, CFG, NOW)
        self.assertEqual(d['w'][0], {'kind': 'disk', 'drive': 'D:', 'needMB': 40 * GB, 'freeMB': 30 * GB})
        r['diskAtStart'] = {'D:': 85 * GB}
        self.assertEqual(starts(runq.plan([r, w], {'commitFreeMB': 60 * GB, 'disks': {'D:': 75 * GB}}, CFG, NOW)), ['w'])

    def test_unknown_drive_waits(self):
        d = runq.plan([job('w', disks={'Q:': GB})], {'commitFreeMB': 60 * GB, 'disks': {}}, CFG, NOW)
        self.assertEqual(d['w'][0]['kind'], 'disk')

    def test_start_errors_name_defender(self):
        e = OSError(13, 'Access is denied')
        e.winerror = 5
        self.assertIn('Defender', runq.describe_start_error(e, 'treegrow-cli.exe'))
        e = OSError(22, 'virus')
        e.winerror = 225
        self.assertIn('Protection history', runq.describe_start_error(e, 'x.exe'))

    def test_since(self):
        self.assertAlmostEqual(runq.parse_since('10m'), runq.now_ms() - 600000, delta=2000)
        self.assertEqual(runq.parse_since('1700000000000'), 1700000000000)
        self.assertEqual(runq.parse_since('2026-11-05T00:00:00Z'), 1793836800000)


# ------------------------------------------------------------------ real runs


def alive(pid: int) -> bool:
    s = runq.proc_started(pid)
    return s is not None


class Queue:
    """A temporary queue folder and a fake machine."""

    def __init__(self, free_gb=60.0, limit_gb=90.0):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.fake = self.dir / 'machine-fake.json'
        self.set_machine(free_gb, limit_gb)
        self.env = {**os.environ, 'RUNQ_HOME': str(self.dir / 'q'), 'RUNQ_POLL': '0.1', 'RUNQ_SAMPLE': '0.2',
                    'RUNQ_FAKE_MACHINE': str(self.fake), 'RUNQ_NOTE_EVERY': '1000'}

    def set_machine(self, free_gb, limit_gb=90.0, disks=None):
        self.fake.write_text(json.dumps({'commitFreeMB': free_gb * GB, 'commitLimitMB': limit_gb * GB, 'disks': disks or {}}))

    def start(self, *args, **kw) -> subprocess.Popen:
        return subprocess.Popen([sys.executable, RUNQ, *args], env={**self.env, **kw.pop('env', {})},
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kw)

    def run(self, *args, timeout=60, **kw) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, RUNQ, *args], env={**self.env, **kw.pop('env', {})},
                              capture_output=True, text=True, timeout=timeout, check=False, **kw)

    def events(self):
        return runq.Store(self.dir / 'q').read_events()

    def jobs(self):
        return runq.Store(self.dir / 'q').read_jobs()

    def close(self):
        self.tmp.cleanup()


def py(code: str) -> list[str]:
    return [sys.executable, '-c', code]


def stamp_code(path: Path, name: str, secs: float) -> str:
    return (f'import time,json; t=time.time(); time.sleep({secs}); '
            f'open(r"{path}","a").write(json.dumps([{name!r}, t, time.time()])+"\\n")')


class RunTest(unittest.TestCase):
    def setUp(self):
        self.q = Queue()
        self.addCleanup(self.q.close)

    def wait_jobs(self, n, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            if len(self.q.jobs()) >= n:
                return
            time.sleep(0.05)
        self.fail(f'{n} jobs never queued')

    def test_output_and_exit_code_pass_through(self):
        r = self.q.run('--mem', '0.1', '--', *py('import sys; print("out-line"); print("err-line", file=sys.stderr); sys.exit(5)'))
        self.assertEqual(r.returncode, 5)
        self.assertEqual(r.stdout, 'out-line\n')
        self.assertIn('err-line', r.stderr)
        self.assertEqual([e['ev'] for e in self.q.events()], ['queued', 'started', 'finished'])
        self.assertEqual(self.q.events()[-1]['exit'], 5)
        self.assertEqual(self.q.jobs(), [])

    def test_exclusive_tag_runs_one_at_a_time_in_queue_order(self):
        out = self.q.dir / 'stamps'
        procs = []
        for name in ('a', 'b', 'c'):
            procs.append(self.q.start('--mem', '0.1', '--tag', 'cargo-test', '--label', name, '--',
                                      *py(stamp_code(out, name, 0.6))))
            self.wait_jobs(len(procs))
        for p in procs:
            p.communicate(timeout=60)
            self.assertEqual(p.returncode, 0)
        rows = [json.loads(x) for x in out.read_text().splitlines()]
        self.assertEqual([r[0] for r in rows], ['a', 'b', 'c'])
        for prev, nxt in zip(rows, rows[1:]):  # noqa: RUF007 (3.8 has no pairwise)
            self.assertGreaterEqual(nxt[1], prev[2])

    def test_exclusive_job_is_seen_while_its_runq_rewrites_its_file(self):
        # Review finding: a running job's runq rewrites its job file on every sample, outside the
        # lock; a waiting runq that reads the folder during that os.replace skips the file
        # (read_json -> None) and starts a second cargo-test job beside the first.
        out = self.q.dir / 'stamps'
        a = self.q.start('--mem', '0.1', '--tag', 'cargo-test', '--label', 'a', '--',
                         *py(stamp_code(out, 'a', 6.0)), env={'RUNQ_SAMPLE': '0'})
        end = time.time() + 20
        while not any(j.get('state') == 'running' for j in self.q.jobs()):
            self.assertLess(time.time(), end)
            time.sleep(0.05)
        b = self.q.start('--mem', '0.1', '--tag', 'cargo-test', '--label', 'b', '--',
                         *py(stamp_code(out, 'b', 0.0)), env={'RUNQ_POLL': '0'})
        a.communicate(timeout=60)
        b.communicate(timeout=60)
        rows = {r[0]: r for r in (json.loads(x) for x in out.read_text().splitlines())}
        self.assertGreaterEqual(rows['b'][1], rows['a'][2], 'b started while a held cargo-test')

    def test_untagged_jobs_run_side_by_side(self):
        out = self.q.dir / 'stamps'
        procs = [self.q.start('--mem', '0.1', '--', *py(stamp_code(out, n, 1.5))) for n in ('a', 'b')]
        for p in procs:
            p.communicate(timeout=60)
        a, b = sorted(json.loads(x) for x in out.read_text().splitlines())
        self.assertLess(max(a[1], b[1]), min(a[2], b[2]))

    def test_memory_gate_holds_a_job_until_room_frees(self):
        # 20 GB free, 12 GB guard: one 6 GB job fits, the second waits until the first ends.
        self.q.set_machine(20)
        out = self.q.dir / 'stamps'
        a = self.q.start('--mem', '6', '--label', 'a', '--', *py(stamp_code(out, 'a', 1.0)))
        self.wait_jobs(1)
        b = self.q.start('--mem', '6', '--label', 'b', '--', *py(stamp_code(out, 'b', 0.1)))
        a.communicate(timeout=60)
        b.communicate(timeout=60)
        rows = {r[0]: r for r in (json.loads(x) for x in out.read_text().splitlines())}
        self.assertGreaterEqual(rows['b'][1], rows['a'][2])

    def test_memory_gate_waits_for_the_machine(self):
        self.q.set_machine(5)
        p = self.q.start('--mem', '1', '--label', 'w', '--', *py('pass'))
        time.sleep(1.0)
        self.assertIsNone(p.poll())
        [j] = self.q.jobs()
        self.assertEqual(j['state'], 'waiting')
        self.assertEqual(j['reasons'][0]['kind'], 'mem')
        st = self.q.run('status')
        self.assertIn('needs 1.0 GB + 12.0 GB guard', st.stdout)
        self.q.set_machine(14)
        p.communicate(timeout=30)
        self.assertEqual(p.returncode, 0)

    def test_the_feed_says_why_a_job_waits_and_carries_notes(self):
        self.q.set_machine(5)
        p = self.q.start('--mem', '1', '--label', 'w', '--note', 'scan of plot  7,\nsecond try', '--', *py('pass'))
        end = time.time() + 20
        while 'waiting' not in [e['ev'] for e in self.q.events()]:
            self.assertLess(time.time(), end)
            time.sleep(0.05)
        time.sleep(0.5)
        self.q.set_machine(60)
        p.communicate(timeout=30)
        r = self.q.run('note', 'D: is nearly full, clearing old scans')
        self.assertEqual(r.returncode, 0)
        evs = self.q.events()
        self.assertEqual([e['ev'] for e in evs], ['queued', 'waiting', 'started', 'finished', 'note'])
        self.assertEqual(evs[0]['note'], 'scan of plot 7, second try')
        self.assertEqual(evs[1]['reasons'][0]['kind'], 'mem')
        self.assertRegex(evs[1]['hm'], r'^\d\d:\d\d$')
        self.assertEqual(evs[-1]['text'], 'D: is nearly full, clearing old scans')
        log = self.q.run('log').stdout
        self.assertIn('needs 1.0 GB + 12.0 GB guard', log)
        self.assertIn('D: is nearly full, clearing old scans', log)
        self.assertEqual(self.q.run('note').returncode, runq.EXIT_USAGE)

    def test_max_wait_gives_up(self):
        self.q.set_machine(5)
        r = self.q.run('--mem', '1', '--max-wait', '0.02', '--', *py('pass'))
        self.assertEqual(r.returncode, runq.EXIT_GAVE_UP)
        self.assertEqual(self.q.events()[-1]['ev'], 'gave-up')
        self.assertEqual(self.q.jobs(), [])

    def test_never_fits_is_refused_at_once(self):
        r = self.q.run('--mem', '85', '--', *py('pass'))
        self.assertEqual(r.returncode, runq.EXIT_NEVER_FITS)
        self.assertEqual(self.q.events(), [])

    def test_stale_job_of_a_dead_runq_is_dropped(self):
        dead = subprocess.Popen(py('pass'))
        dead.wait()
        store = runq.Store(self.q.dir / 'q')
        store.write_job({'id': '1-1', 'label': 'crashed', 'state': 'running', 'memMB': 50 * GB, 'curMB': 0,
                         'tags': ['cargo-test'], 'queuedAt': 1, 'runner': {'pid': dead.pid, 'started': 1},
                         'child': {'pid': dead.pid, 'started': 1}})
        r = self.q.run('--mem', '1', '--tag', 'cargo-test', '--', *py('print("ran")'), timeout=20)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout, 'ran\n')
        evs = self.q.events()
        self.assertEqual(evs[0]['ev'], 'stale')
        self.assertEqual(evs[0]['label'], 'crashed')

    def test_reused_pid_is_not_taken_for_the_old_runq(self):
        # The recorded PID is alive (this test process) but started at another time: a PID reuse.
        store = runq.Store(self.q.dir / 'q')
        store.write_job({'id': '1-1', 'label': 'old', 'state': 'running', 'memMB': GB, 'curMB': 0,
                         'tags': ['cargo-test'], 'queuedAt': 1, 'runner': {'pid': os.getpid(), 'started': 12345},
                         'child': None})
        r = self.q.run('--mem', '1', '--tag', 'cargo-test', '--', *py('pass'), timeout=20)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.q.events()[0]['ev'], 'stale')

    def test_live_runq_is_not_stale(self):
        store = runq.Store(self.q.dir / 'q')
        store.write_job({'id': '1-1', 'label': 'live', 'state': 'running', 'memMB': GB, 'curMB': 0,
                         'tags': ['cargo-test'], 'queuedAt': 1,
                         'runner': {'pid': os.getpid(), 'started': runq.proc_started(os.getpid())}, 'child': None})
        r = self.q.run('--mem', '1', '--tag', 'cargo-test', '--max-wait', '0.02', '--', *py('pass'))
        self.assertEqual(r.returncode, runq.EXIT_GAVE_UP)
        self.assertIn('tag cargo-test held by live', r.stderr)

    def test_unstartable_file_is_reported_not_retried(self):
        bad = self.q.dir / ('fake.exe' if runq.WIN else 'fake.sh')
        bad.write_text('not a program')
        if not runq.WIN:
            bad.chmod(0o644)
        r = self.q.run('--mem', '0.1', '--', str(bad))
        self.assertEqual(r.returncode, runq.EXIT_CANNOT_EXEC)
        self.assertIn('could not start', r.stderr)
        self.assertEqual([e['ev'] for e in self.q.events()], ['queued', 'failed'])
        self.assertEqual(self.q.jobs(), [])

    def test_cancelled_waiting_job_leaves_the_queue(self):
        self.q.set_machine(5)
        p = self.q.start('--mem', '1', '--', *py('pass'))
        self.wait_jobs(1)
        p.kill()
        p.communicate()
        # The next run drops the waiting job of a runq that is gone.
        self.q.set_machine(60)
        r = self.q.run('--mem', '0.1', '--', *py('pass'))
        self.assertEqual(r.returncode, 0)
        self.assertIn('stale', [e['ev'] for e in self.q.events()])


TREE = '''
import subprocess, sys, time
grand = subprocess.Popen([sys.executable, "-c", "import time; x = bytearray(400 * 1024 * 1024); time.sleep(60)"])
open(sys.argv[1], "w").write(str(grand.pid))
time.sleep(60)
'''

FOREIGN = 'import time; x = bytearray(400 * 1024 * 1024); time.sleep(60)'


class OwnTreeKillTest(unittest.TestCase):
    """--max-mem ends the command's own tree, never a foreign process of the same name and size."""

    def setUp(self):
        self.q = Queue()
        self.addCleanup(self.q.close)

    def check(self, env):
        foreign = subprocess.Popen(py(FOREIGN))
        self.addCleanup(lambda: (foreign.kill(), foreign.wait()))
        pidfile = self.q.dir / 'grand.pid'
        r = self.q.run('--mem', '1', '--max-mem', '0.2', '--label', 'hungry', '--',
                       sys.executable, '-c', TREE, str(pidfile), env=env, timeout=90)
        self.assertEqual(r.returncode, runq.EXIT_KILLED if runq.WIN else 128 + 9, r.stderr)
        self.assertIn('over --max-mem', r.stderr)
        grand = int(pidfile.read_text())
        time.sleep(0.5)
        self.assertFalse(alive(grand), 'the grandchild survived')
        self.assertTrue(alive(foreign.pid), 'a foreign process was ended')
        ev = self.q.events()[-1]
        self.assertEqual(ev['ev'], 'killed')
        self.assertGreaterEqual(ev['peakMB'], 300)

    def test_job_object(self):
        self.check({})

    @unittest.skipUnless(runq.WIN, 'the PID walk is the fallback of the Windows job object')
    def test_pid_walk(self):
        self.check({'RUNQ_NO_JOB': '1'})

    @unittest.skipUnless(runq.WIN, 'job objects are Windows')
    def test_killed_runq_takes_its_command_along(self):
        pidfile = self.q.dir / 'grand.pid'
        p = self.q.start('--mem', '0.1', '--', sys.executable, '-c', TREE, str(pidfile))
        end = time.time() + 30
        while not pidfile.exists() or not pidfile.read_text():
            self.assertLess(time.time(), end)
            time.sleep(0.1)
        grand = int(pidfile.read_text())
        p.kill()  # runq itself, by its own handle
        p.communicate()
        time.sleep(0.5)
        self.assertFalse(alive(grand))
        st = self.q.run('status')
        self.assertIn('running: 0', st.stdout)
        self.assertEqual(self.q.events()[-1]['ev'], 'stale')


if __name__ == '__main__':
    unittest.main()
