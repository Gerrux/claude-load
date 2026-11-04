#!/usr/bin/env python3
"""runq: a run queue for one machine, shared by parallel Claude Code sessions.

    runq --mem <GB> [--tag <name>]... [--disk D:=<GB>]... [--label <text>] [--max-mem <GB>]
         [--max-wait <min>] -- <command> [args...]
    runq status [--json]
    runq log [--since 30m|<ISO time>|<epoch ms>] [-n 30] [--json]
    runq config

A job waits, first come first served, until the machine has room for it: free commit at least
its declared memory plus a guard (12 GB by default), no running job holding one of its exclusive
tags (`cargo-test` by default), and free space on the drives it names. Then it runs the command
as its own child, with the terminal's stdin, stdout and stderr, and exits with the command's exit
code. runq's own lines go to stderr and start with `runq:`.

State lives in ~/.claude/state/queue (RUNQ_HOME overrides it): one file per job in `jobs/`,
`events.jsonl` (queued, started, finished, killed, failed, stale, cancelled, gave-up),
`machine.json` (the last reading) and `config.json` (optional settings).

runq reads other processes only to count memory; the only processes it ever ends are its own
child's tree, and only with --max-mem. On Windows the child runs in a Job Object, so its tree is
exactly the job's members; elsewhere, and where a job cannot be made, the tree is walked by
parent PID with start times checked before anything is ended.
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Raised with every change: the claude-load mod copies this file to the queue folder and never
# replaces a newer copy with an older one.
__version__ = 1

WIN = os.name == 'nt'
MB = 1024 * 1024

DEFAULTS = {
    # Free commit a job must leave untouched: HELIOS++ and the system need slack.
    'guardGB': 12,
    # Tags that one job at a time may hold on the machine.
    'exclusiveTags': ['cargo-test'],
    # A job that has waited this long for memory stops later jobs from passing it.
    'fairAfterMin': 5,
}

EXIT_USAGE = 2
EXIT_NEVER_FITS = 3
EXIT_CANNOT_EXEC = 126
EXIT_NOT_FOUND = 127
EXIT_CANCELLED = 130
EXIT_KILLED = 137
EXIT_GAVE_UP = 75


def now_ms() -> int:
    return int(time.time() * 1000)


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, ''))
    except ValueError:
        return default


def note(text: str) -> None:
    """runq's own line, on stderr so the command's stdout stays the command's."""
    try:
        sys.stderr.write(f'runq: {text}\n')
        sys.stderr.flush()
    except (OSError, ValueError):
        pass


def gb(mb: float) -> str:
    return f'{mb / 1024:.1f} GB'


def dur(ms: float) -> str:
    s = max(0, int(ms // 1000))
    if s < 60:
        return f'{s}s'
    m, s = divmod(s, 60)
    if m < 60:
        return f'{m}m{s:02d}s'
    h, m = divmod(m, 60)
    return f'{h}h{m:02d}m'


# ------------------------------------------------------------------ state files


def state_dir() -> Path:
    d = os.environ.get('RUNQ_HOME')
    return Path(d) if d else Path.home() / '.claude' / 'state' / 'queue'


def load_config(d: Path) -> dict:
    cfg = dict(DEFAULTS)
    try:
        user = json.loads((d / 'config.json').read_text(encoding='utf-8'))
        if isinstance(user, dict):
            cfg.update({k: v for k, v in user.items() if k in DEFAULTS})
    except (OSError, ValueError):
        pass
    return cfg


def read_json(p: Path):
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def write_json(p: Path, obj) -> None:
    """Atomic: a reader sees the old file or the new one. Windows refuses a replace while a
    reader has the file open, so it is tried again for a moment."""
    tmp = p.with_name(f'{p.name}.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')
    for i in range(50):
        try:
            os.replace(tmp, p)
            return
        except PermissionError:
            time.sleep(0.02 * (i + 1))
    with contextlib.suppress(OSError):
        tmp.unlink()


class Store:
    """The queue's folder. Decisions are taken under `lock`, an OS lock on a file: the OS
    releases it when its holder dies, so it can never be left stale."""

    def __init__(self, d: Path):
        self.dir = d
        self.jobs = d / 'jobs'
        self.events = d / 'events.jsonl'
        self.jobs.mkdir(parents=True, exist_ok=True)

    @contextlib.contextmanager
    def locked(self, timeout_s: float = 60.0):
        fd = os.open(str(self.dir / 'lock'), os.O_RDWR | os.O_CREAT, 0o644)
        deadline = time.monotonic() + timeout_s
        try:
            while True:
                try:
                    if WIN:
                        import msvcrt
                        os.lseek(fd, 0, 0)
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.monotonic() > deadline:
                        raise TimeoutError('runq: the queue lock is busy') from None
                    time.sleep(0.05)
            yield
        finally:
            with contextlib.suppress(OSError):
                if WIN:
                    import msvcrt
                    os.lseek(fd, 0, 0)
                    msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            os.close(fd)

    def read_jobs(self) -> list[dict]:
        out = []
        for p in sorted(self.jobs.glob('*.json')):
            j = read_json(p)
            if isinstance(j, dict) and j.get('id'):
                out.append(j)
        return out

    def write_job(self, job: dict) -> None:
        write_json(self.jobs / f"{job['id']}.json", job)

    def remove_job(self, job_id: str) -> None:
        for _ in range(50):
            try:
                (self.jobs / f'{job_id}.json').unlink()
                return
            except FileNotFoundError:
                return
            except PermissionError:
                time.sleep(0.02)

    def event(self, ev: str, job: dict | None = None, **extra) -> None:
        row = {'ts': now_ms(), 'ev': ev}
        if job:
            row.update({k: job.get(k) for k in ('id', 'label', 'session', 'sessionName', 'tags', 'memMB')})
        row.update({k: v for k, v in extra.items() if v is not None})
        line = json.dumps(row, ensure_ascii=False) + '\n'
        with open(self.events, 'a', encoding='utf-8') as f:
            f.write(line)
        self._trim()

    def _trim(self, max_bytes: int = 1 << 20, keep: int = 2000) -> None:
        try:
            if self.events.stat().st_size <= max_bytes:
                return
            lines = self.events.read_text(encoding='utf-8').splitlines(True)[-keep:]
            write_json_text(self.events, ''.join(lines))
        except OSError:
            pass

    def read_events(self) -> list[dict]:
        try:
            text = self.events.read_text(encoding='utf-8')
        except OSError:
            return []
        out = []
        for line in text.splitlines():
            with contextlib.suppress(ValueError):
                row = json.loads(line)
                if isinstance(row, dict):
                    out.append(row)
        return out


def write_json_text(p: Path, text: str) -> None:
    tmp = p.with_name(f'{p.name}.{os.getpid()}.tmp')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, p)


# ------------------------------------------------------------------ the decision (pure)


def owed_mem(job: dict) -> float:
    """What a running job declared and has not taken yet: free commit does not show it."""
    return max(0.0, float(job.get('memMB') or 0) - float(job.get('curMB') or 0))


def owed_disk(job: dict, drive: str, free_now: float) -> float:
    need = float((job.get('disks') or {}).get(drive) or 0)
    at_start = (job.get('diskAtStart') or {}).get(drive)
    used = max(0.0, float(at_start) - free_now) if at_start is not None else 0.0
    return max(0.0, need - used)


def order(jobs: list[dict]) -> list[dict]:
    return sorted(jobs, key=lambda j: (j.get('queuedAt') or 0, j.get('id') or ''))


def plan(jobs: list[dict], machine: dict, cfg: dict, now: int) -> dict:
    """Which waiting jobs may start now, in queue order; for the others, why not.

    Returns {job id: [] to start, or a list of reasons}. Rules, applied in queue order:
    - an exclusive tag held by a running job, or by an earlier job still waiting, blocks;
    - memory: free commit minus what running jobs declared and have not taken yet (and what
      jobs started earlier in this pass declared) must cover the job plus the guard. A smaller
      job may pass one that waits for memory, until that one has waited `fairAfterMin`: from then
      on no later job that needs memory starts before it;
    - disk: free space on each named drive minus what running jobs declared and have not
      written yet must cover the job.
    """
    guard = float(cfg.get('guardGB', DEFAULTS['guardGB'])) * 1024
    exclusive = set(cfg.get('exclusiveTags') or [])
    fair_ms = float(cfg.get('fairAfterMin', DEFAULTS['fairAfterMin'])) * 60000
    running = [j for j in jobs if j.get('state') == 'running']
    waiting = order([j for j in jobs if j.get('state') == 'waiting'])

    held: dict[str, str] = {}
    for r in running:
        for t in r.get('tags') or []:
            if t in exclusive:
                held.setdefault(t, r.get('label') or r['id'])
    free = float(machine.get('commitFreeMB') or 0) - sum(owed_mem(r) for r in running)
    disk_free: dict[str, float] = {}
    for d, f in (machine.get('disks') or {}).items():
        disk_free[d] = float(f) - sum(owed_disk(r, d, float(f)) for r in running)
    fair_block: str | None = None

    out: dict[str, list] = {}
    for j in waiting:
        reasons: list[dict] = []
        tags = [t for t in j.get('tags') or [] if t in exclusive]
        for t in tags:
            if t in held:
                reasons.append({'kind': 'tag', 'tag': t, 'by': held[t]})
        need = float(j.get('memMB') or 0)
        mem_short = need > 0 and need + guard > free
        if need > 0 and fair_block is not None:
            reasons.append({'kind': 'behind', 'by': fair_block})
        elif mem_short:
            reasons.append({'kind': 'mem', 'needMB': need, 'guardMB': guard, 'freeMB': max(0.0, free)})
        for d, n in (j.get('disks') or {}).items():
            have = disk_free.get(d)
            if have is None or float(n) > have:
                reasons.append({'kind': 'disk', 'drive': d, 'needMB': float(n), 'freeMB': max(0.0, have or 0.0)})
        out[j['id']] = reasons
        if not reasons:
            free -= need
            for d, n in (j.get('disks') or {}).items():
                disk_free[d] = disk_free.get(d, 0.0) - float(n)
        if mem_short and fair_block is None and now - float(j.get('queuedAt') or now) >= fair_ms:
            fair_block = j.get('label') or j['id']
        # Later jobs with the same exclusive tag wait behind this one, started or not.
        for t in tags:
            held.setdefault(t, j.get('label') or j['id'])
    return out


def reason_text(r: dict) -> str:
    k = r.get('kind')
    if k == 'tag':
        return f"tag {r['tag']} held by {r['by']}"
    if k == 'mem':
        return f"needs {gb(r['needMB'])} + {gb(r['guardMB'])} guard, free commit {gb(r['freeMB'])}"
    if k == 'behind':
        return f"behind {r['by']}, which waits for memory"
    if k == 'disk':
        return f"needs {gb(r['needMB'])} on {r['drive']}, free {gb(r['freeMB'])}"
    return str(r)


# ------------------------------------------------------------------ platform: Windows

if WIN:
    import ctypes
    from ctypes import wintypes as wt

    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    PROCESS_TERMINATE = 0x0001
    PROCESS_VM_READ = 0x0010
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    STILL_ACTIVE = 259
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
    EPOCH_AS_FILETIME = 116444736000000000

    class FILETIME(ctypes.Structure):
        _fields_ = [('lo', wt.DWORD), ('hi', wt.DWORD)]

    class PMC_EX(ctypes.Structure):
        _fields_ = [('cb', wt.DWORD), ('PageFaultCount', wt.DWORD)] + [
            (n, ctypes.c_size_t) for n in (
                'PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage',
                'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage', 'PrivateUsage')]

    class PERF_INFO(ctypes.Structure):
        _fields_ = [('cb', wt.DWORD)] + [(n, ctypes.c_size_t) for n in (
            'CommitTotal', 'CommitLimit', 'CommitPeak', 'PhysicalTotal', 'PhysicalAvailable', 'SystemCache',
            'KernelTotal', 'KernelPaged', 'KernelNonpaged', 'PageSize')] + [
            ('HandleCount', wt.DWORD), ('ProcessCount', wt.DWORD), ('ThreadCount', wt.DWORD)]

    class BASIC_LIMIT(ctypes.Structure):
        _fields_ = [('PerProcessUserTimeLimit', ctypes.c_longlong), ('PerJobUserTimeLimit', ctypes.c_longlong),
                    ('LimitFlags', wt.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t),
                    ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wt.DWORD),
                    ('Affinity', ctypes.c_size_t), ('PriorityClass', wt.DWORD), ('SchedulingClass', wt.DWORD)]

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [(n, ctypes.c_ulonglong) for n in ('r', 'w', 'o', 'rb', 'wb', 'ob')]

    class EXT_LIMIT(ctypes.Structure):
        _fields_ = [('Basic', BASIC_LIMIT), ('Io', IO_COUNTERS), ('ProcessMemoryLimit', ctypes.c_size_t),
                    ('JobMemoryLimit', ctypes.c_size_t), ('PeakProcessMemoryUsed', ctypes.c_size_t),
                    ('PeakJobMemoryUsed', ctypes.c_size_t)]

    class PID_LIST(ctypes.Structure):
        _fields_ = [('Assigned', wt.DWORD), ('Listed', wt.DWORD), ('Ids', ctypes.c_size_t * 4096)]

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [('dwSize', wt.DWORD), ('cntUsage', wt.DWORD), ('th32ProcessID', wt.DWORD),
                    ('th32DefaultHeapID', ctypes.c_size_t), ('th32ModuleID', wt.DWORD), ('cntThreads', wt.DWORD),
                    ('th32ParentProcessID', wt.DWORD), ('pcPriClassBase', wt.LONG), ('dwFlags', wt.DWORD),
                    ('szExeFile', wt.WCHAR * 260)]

    def _sig(fn, res, *args):
        fn.restype = res
        fn.argtypes = list(args)
        return fn

    OpenProcess = _sig(k32.OpenProcess, wt.HANDLE, wt.DWORD, wt.BOOL, wt.DWORD)
    CloseHandle = _sig(k32.CloseHandle, wt.BOOL, wt.HANDLE)
    GetProcessTimes = _sig(k32.GetProcessTimes, wt.BOOL, wt.HANDLE, *[ctypes.POINTER(FILETIME)] * 4)
    GetExitCodeProcess = _sig(k32.GetExitCodeProcess, wt.BOOL, wt.HANDLE, ctypes.POINTER(wt.DWORD))
    TerminateProcess = _sig(k32.TerminateProcess, wt.BOOL, wt.HANDLE, wt.UINT)
    GetCurrentProcess = _sig(k32.GetCurrentProcess, wt.HANDLE)
    CreateJobObjectW = _sig(k32.CreateJobObjectW, wt.HANDLE, wt.LPVOID, wt.LPCWSTR)
    AssignProcessToJobObject = _sig(k32.AssignProcessToJobObject, wt.BOOL, wt.HANDLE, wt.HANDLE)
    SetInformationJobObject = _sig(k32.SetInformationJobObject, wt.BOOL, wt.HANDLE, ctypes.c_int, wt.LPVOID, wt.DWORD)
    QueryInformationJobObject = _sig(k32.QueryInformationJobObject, wt.BOOL, wt.HANDLE, ctypes.c_int, wt.LPVOID,
                                     wt.DWORD, ctypes.POINTER(wt.DWORD))
    IsProcessInJob = _sig(k32.IsProcessInJob, wt.BOOL, wt.HANDLE, wt.HANDLE, ctypes.POINTER(wt.BOOL))
    GetProcessMemoryInfo = _sig(k32.K32GetProcessMemoryInfo, wt.BOOL, wt.HANDLE, ctypes.POINTER(PMC_EX), wt.DWORD)
    GetPerformanceInfo = _sig(k32.K32GetPerformanceInfo, wt.BOOL, ctypes.POINTER(PERF_INFO), wt.DWORD)
    GetLogicalDrives = _sig(k32.GetLogicalDrives, wt.DWORD)
    GetDriveTypeW = _sig(k32.GetDriveTypeW, wt.UINT, wt.LPCWSTR)
    CreateToolhelp32Snapshot = _sig(k32.CreateToolhelp32Snapshot, wt.HANDLE, wt.DWORD, wt.DWORD)
    Process32FirstW = _sig(k32.Process32FirstW, wt.BOOL, wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W))
    Process32NextW = _sig(k32.Process32NextW, wt.BOOL, wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W))
    INVALID_HANDLE = wt.HANDLE(-1).value

    def _created(h) -> int | None:
        c, e, k, u = FILETIME(), FILETIME(), FILETIME(), FILETIME()
        if not GetProcessTimes(h, ctypes.byref(c), ctypes.byref(e), ctypes.byref(k), ctypes.byref(u)):
            return None
        return (((c.hi << 32) | c.lo) - EPOCH_AS_FILETIME) // 10000

    def _alive(h) -> bool:
        code = wt.DWORD()
        return bool(GetExitCodeProcess(h, ctypes.byref(code))) and code.value == STILL_ACTIVE

    def proc_started(pid: int):
        """Epoch ms of the live process `pid`, None when there is none; 'unknown' when the
        process exists but cannot be queried (another user's): treated as alive."""
        if not pid or pid <= 0:
            return None
        h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h:
            return 'unknown' if ctypes.get_last_error() == 5 else None
        try:
            return _created(h) if _alive(h) else None
        finally:
            CloseHandle(h)

    def private_mb(pid: int) -> float:
        h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, False, pid) or \
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h:
            return 0.0
        try:
            pmc = PMC_EX()
            pmc.cb = ctypes.sizeof(pmc)
            return pmc.PrivateUsage / MB if GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb) else 0.0
        finally:
            CloseHandle(h)

    def process_table() -> list[tuple[int, int]]:
        """(pid, ppid) of every process, from a Toolhelp snapshot."""
        snap = CreateToolhelp32Snapshot(0x2, 0)
        if not snap or snap == INVALID_HANDLE:
            return []
        out = []
        try:
            e = PROCESSENTRY32W()
            e.dwSize = ctypes.sizeof(e)
            ok = Process32FirstW(snap, ctypes.byref(e))
            while ok:
                out.append((e.th32ProcessID, e.th32ParentProcessID))
                ok = Process32NextW(snap, ctypes.byref(e))
        finally:
            CloseHandle(snap)
        return out

    def fixed_drives() -> list[str]:
        mask = GetLogicalDrives()
        return [f'{chr(65 + i)}:' for i in range(26) if mask >> i & 1 and GetDriveTypeW(f'{chr(65 + i)}:\\') == 3]

    def read_machine(drives: list[str] | None = None) -> dict:
        pi = PERF_INFO()
        pi.cb = ctypes.sizeof(pi)
        GetPerformanceInfo(ctypes.byref(pi), pi.cb)
        page = pi.PageSize / MB
        return {
            'commitFreeMB': round((pi.CommitLimit - pi.CommitTotal) * page),
            'commitLimitMB': round(pi.CommitLimit * page),
            'ramFreeMB': round(pi.PhysicalAvailable * page),
            'ramTotalMB': round(pi.PhysicalTotal * page),
            'disks': disk_free(drives if drives is not None else fixed_drives()),
        }

else:
    def proc_started(pid: int):
        if not pid or pid <= 0:
            return None
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return None
        except PermissionError:
            return 'unknown'
        try:
            stat = Path(f'/proc/{pid}/stat').read_text()
            return int(stat[stat.rindex(')') + 2:].split()[19])
        except (OSError, ValueError, IndexError):
            pass
        try:
            r = subprocess.run(['ps', '-o', 'lstart=', '-p', str(pid)], capture_output=True, text=True,
                               env={**os.environ, 'LC_ALL': 'C'}, timeout=10, check=False)
            return r.stdout.strip() or None
        except (OSError, subprocess.SubprocessError):
            return 'unknown'

    def ps_table() -> list[tuple[int, int, float]]:
        """(pid, ppid, rss MB) of every process."""
        try:
            r = subprocess.run(['ps', '-A', '-o', 'pid=,ppid=,rss='], capture_output=True, text=True, timeout=10, check=False)
        except (OSError, subprocess.SubprocessError):
            return []
        out = []
        for line in r.stdout.splitlines():
            p = line.split()
            if len(p) == 3 and all(x.isdigit() for x in p):
                out.append((int(p[0]), int(p[1]), int(p[2]) / 1024))
        return out

    def fixed_drives() -> list[str]:
        return ['/']

    def read_machine(drives: list[str] | None = None) -> dict:
        info: dict[str, float] = {}
        try:
            for line in Path('/proc/meminfo').read_text().splitlines():
                k, v = line.split(':', 1)
                info[k] = float(v.split()[0]) / 1024
            free = info.get('MemAvailable', 0) + info.get('SwapFree', 0)
            limit = info.get('MemTotal', 0) + info.get('SwapTotal', 0)
            ram_free, ram_total = info.get('MemAvailable', 0), info.get('MemTotal', 0)
        except OSError:
            total = float(subprocess.run(['sysctl', '-n', 'hw.memsize'], capture_output=True, text=True, check=False).stdout or 0) / MB
            vm = subprocess.run(['vm_stat'], capture_output=True, text=True, check=False).stdout
            page = 16384 if 'page size of 16384' in vm else 4096
            pages = 0
            for line in vm.splitlines():
                if line.startswith(('Pages free', 'Pages inactive', 'Pages speculative')):
                    pages += int(line.split(':')[1].strip().rstrip('.'))
            free = ram_free = pages * page / MB
            limit = ram_total = total
        return {'commitFreeMB': round(free), 'commitLimitMB': round(limit), 'ramFreeMB': round(ram_free),
                'ramTotalMB': round(ram_total), 'disks': disk_free(drives if drives is not None else fixed_drives())}


def disk_free(drives: list[str]) -> dict:
    out = {}
    for d in drives:
        with contextlib.suppress(OSError):
            out[d] = round(shutil.disk_usage(d + '\\' if WIN and d.endswith(':') else d).free / MB)
    return out


def disk_total(drives: list[str]) -> dict:
    out = {}
    for d in drives:
        with contextlib.suppress(OSError):
            out[d] = round(shutil.disk_usage(d + '\\' if WIN and d.endswith(':') else d).total / MB)
    return out


def measure(drives: list[str] | None = None) -> dict:
    """The machine now; RUNQ_FAKE_MACHINE names a JSON file that stands for it (tests)."""
    fake = os.environ.get('RUNQ_FAKE_MACHINE')
    if fake:
        m = read_json(Path(fake)) or {}
        m.setdefault('commitFreeMB', 0)
        m.setdefault('commitLimitMB', m['commitFreeMB'])
        m.setdefault('disks', {})
        return m
    return read_machine(drives)


# ------------------------------------------------------------------ liveness


def same_started(recorded, live) -> bool:
    if live is None:
        return False
    if live == 'unknown' or recorded in (None, 'unknown'):
        return True
    return str(recorded) == str(live)


def side_alive(side: dict | None) -> bool:
    return bool(side) and same_started(side.get('started'), proc_started(int(side.get('pid') or 0)))


def reap(store: Store, jobs: list[dict]) -> list[dict]:
    """Drop jobs whose runq and command are both gone (a crash, a reboot, a killed shell); a
    command still alive after its runq died keeps its slot and tags. Under the lock."""
    keep = []
    for j in jobs:
        runner, child = side_alive(j.get('runner')), side_alive(j.get('child'))
        if runner or (j.get('state') == 'running' and child):
            j['orphaned'] = not runner
            keep.append(j)
            continue
        store.remove_job(j['id'])
        store.event('stale', j, state=j.get('state'), reason='its runq and command are gone')
    return keep


# ------------------------------------------------------------------ the command's process tree


class Tree:
    """The child and its descendants: measured, and ended only on --max-mem."""

    def __init__(self, popen: subprocess.Popen, started, job_handle=None):
        self.p = popen
        self.pid = popen.pid
        self.started = started
        self.job = job_handle
        self.members: dict[int, object] = {self.pid: started}
        self.peak = 0.0

    def pids(self) -> list[int]:
        if WIN and self.job:
            lst = PID_LIST()
            if QueryInformationJobObject(self.job, 3, ctypes.byref(lst), ctypes.sizeof(lst), None):
                me = os.getpid()
                return [int(lst.Ids[i]) for i in range(lst.Listed) if int(lst.Ids[i]) != me]
            return []
        return self._walk()

    def _walk(self) -> list[int]:
        """Descendants by parent PID. A child must not be older than its parent: Windows keeps a
        dead parent's PID on its children, and a newer process may reuse that PID."""
        table = process_table() if WIN else [(p, pp) for p, pp, _ in ps_table()]
        kids: dict[int, list[int]] = {}
        for p, pp in table:
            if p != pp:
                kids.setdefault(pp, []).append(p)
        born: dict[int, object] = {}
        todo = [self.pid]
        seen = set()
        while todo:
            parent = todo.pop()
            if parent in seen:
                continue
            seen.add(parent)
            for k in kids.get(parent, []):
                s = proc_started(k)
                if s is None or s == 'unknown':
                    continue
                ps = self.members.get(parent) if parent in self.members else born.get(parent)
                if isinstance(s, int) and isinstance(ps, int) and s < ps:
                    continue
                if k in self.members and not same_started(self.members[k], s):
                    continue
                born[k] = s
                todo.append(k)
        for k, s in born.items():
            self.members.setdefault(k, s)
        live = [self.pid] if same_started(self.started, proc_started(self.pid)) else []
        live += [k for k in born if k != self.pid]
        return live

    def mem_mb(self) -> float:
        if WIN:
            cur = sum(private_mb(p) for p in self.pids())
            if self.job:
                e = EXT_LIMIT()
                if QueryInformationJobObject(self.job, 9, ctypes.byref(e), ctypes.sizeof(e), None):
                    own = private_mb(os.getpid())
                    self.peak = max(self.peak, e.PeakJobMemoryUsed / MB - own)
        else:
            rss = {p: m for p, _, m in ps_table()}
            cur = sum(rss.get(p, 0.0) for p in self.pids())
        self.peak = max(self.peak, cur)
        return cur

    def kill_own(self) -> list[int]:
        """End the command's tree and nothing else. Each PID is opened, checked to be ours (in
        our job; else the start time recorded when it joined the tree), then ended."""
        killed = []
        if WIN:
            for pid in self.pids():
                h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
                if not h:
                    continue
                try:
                    if self.job:
                        inside = wt.BOOL()
                        ours = IsProcessInJob(h, self.job, ctypes.byref(inside)) and inside.value
                    else:
                        ours = pid in self.members and same_started(self.members[pid], _created(h))
                    if ours and TerminateProcess(h, EXIT_KILLED):
                        killed.append(pid)
                finally:
                    CloseHandle(h)
        else:
            import signal
            for pid in self.pids():
                if pid in self.members and same_started(self.members[pid], proc_started(pid)):
                    with contextlib.suppress(OSError):
                        os.kill(pid, signal.SIGKILL)
                        killed.append(pid)
        return killed


def make_job_object():
    """A Job Object holding runq itself, so the command and every descendant join it. It ends
    them all if runq is killed (no untracked command left eating memory); cleared at a normal
    exit, so a daemon the command left behind survives runq. None where it cannot be made."""
    if not WIN or os.environ.get('RUNQ_NO_JOB'):
        return None
    job = CreateJobObjectW(None, None)
    if not job:
        return None
    lim = EXT_LIMIT()
    lim.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    SetInformationJobObject(job, 9, ctypes.byref(lim), ctypes.sizeof(lim))
    if not AssignProcessToJobObject(job, GetCurrentProcess()):
        CloseHandle(job)
        return None
    return job


def release_job_object(job) -> None:
    if WIN and job:
        lim = EXT_LIMIT()
        SetInformationJobObject(job, 9, ctypes.byref(lim), ctypes.sizeof(lim))


# ------------------------------------------------------------------ running a job


def parse_gb(v: str, what: str) -> float:
    try:
        x = float(v)
    except ValueError:
        raise SystemExit(usage(f'{what} takes a number of GB, not {v!r}')) from None
    if x < 0:
        raise SystemExit(usage(f'{what} must not be negative'))
    return x * 1024


def norm_drive(d: str) -> str:
    d = d.strip()
    if WIN or len(d) <= 3 and d[:1].isalpha() and d[1:2] == ':':
        d = d.rstrip('\\/')
        if len(d) == 1 and d.isalpha():
            d += ':'
        return d.upper()
    return d


def usage(msg: str = '') -> int:
    if msg:
        note(msg)
    note('usage: runq --mem <GB> [--tag <name>] [--disk D:=<GB>] [--label <text>] [--max-mem <GB>] '
         '[--max-wait <min>] -- <command> [args...]   |   runq status   |   runq log [--since 30m]')
    return EXIT_USAGE


def session_info() -> dict:
    """The Claude Code session that runs runq, from its session file, else the environment."""
    out = {'session': os.environ.get('CLAUDE_CODE_SESSION_ID') or '',
           'hostSession': os.environ.get('CLAUDE_CODE_HOST_SESSION_ID') or '', 'sessionName': ''}
    pid = os.environ.get('CLAUDE_PID')
    if pid and pid.isdigit():
        meta = read_json(Path.home() / '.claude' / 'sessions' / f'{pid}.json')
        if isinstance(meta, dict):
            out['session'] = str(meta.get('sessionId') or out['session'])
            out['hostSession'] = str(meta.get('hostSessionId') or out['hostSession'])
            out['sessionName'] = str(meta.get('name') or '')
    return out


def std_fd(fd: int):
    try:
        os.fstat(fd)
        return fd
    except OSError:
        return subprocess.DEVNULL if fd == 0 else None


def resolve(cmd: list[str]) -> str | None:
    exe = cmd[0]
    found = shutil.which(exe)
    if found:
        return found
    if os.path.isfile(exe):
        return exe
    return None


def signed(code: int) -> int:
    """A Windows exit code (an unsigned 32-bit NTSTATUS such as 0xC0000005) as sys.exit takes it."""
    return code - (1 << 32) if WIN and code >= 1 << 31 else code


def cmd_run(argv: list[str]) -> int:
    if '--' not in argv:
        return usage('put the command after --')
    i = argv.index('--')
    opts, cmd = argv[:i], argv[i + 1:]
    if not cmd:
        return usage('no command after --')
    mem = None
    max_mem = None
    max_wait = None
    tags: list[str] = []
    disks: dict[str, float] = {}
    label = ''
    k = 0
    while k < len(opts):
        o = opts[k]
        val = opts[k + 1] if k + 1 < len(opts) else None
        if '=' in o and o.startswith('--') and o.split('=', 1)[0] in ('--mem', '--tag', '--disk', '--label', '--max-mem', '--max-wait'):
            o, val = o.split('=', 1)
            k -= 1
        if o in ('--mem', '--tag', '--disk', '--label', '--max-mem', '--max-wait') and val is None:
            return usage(f'{o} needs a value')
        if o == '--mem':
            mem = parse_gb(val, '--mem')
        elif o == '--max-mem':
            max_mem = parse_gb(val, '--max-mem')
        elif o == '--max-wait':
            try:
                max_wait = float(val) * 60000
            except ValueError:
                return usage(f'--max-wait takes minutes, not {val!r}')
        elif o == '--tag':
            tags += [t.strip() for t in val.split(',') if t.strip()]
        elif o == '--label':
            label = val
        elif o == '--disk':
            if '=' not in val:
                return usage(f'--disk takes D:=<GB>, not {val!r}')
            d, n = val.rsplit('=', 1)
            disks[norm_drive(d)] = parse_gb(n, '--disk')
        else:
            return usage(f'unknown option {o}')
        k += 2
    if mem is None:
        return usage("declare the job's peak memory: --mem <GB>")

    store = Store(state_dir())
    cfg = load_config(store.dir)
    guard = float(cfg['guardGB']) * 1024
    first = measure(list(disks))
    if mem + guard > float(first.get('commitLimitMB') or 0):
        note(f"--mem {gb(mem)} plus the {gb(guard)} guard is more than the machine's whole commit limit "
             f"({gb(float(first.get('commitLimitMB') or 0))}): this job can never start.")
        return EXIT_NEVER_FITS
    exe = resolve(cmd)
    if exe is None:
        note(f'command not found: {cmd[0]}')
        return EXIT_NOT_FOUND

    me = os.getpid()
    t0 = now_ms()
    job = {
        'v': 1, 'id': f'{t0}-{me}', 'label': label or ' '.join(cmd)[:80], 'tags': tags, 'memMB': mem,
        'maxMemMB': max_mem, 'disks': disks, 'cmd': cmd, 'cwd': os.getcwd(), **session_info(),
        'runner': {'pid': me, 'started': proc_started(me)}, 'child': None, 'state': 'waiting',
        'queuedAt': t0, 'curMB': 0, 'peakMB': 0, 'reasons': [],
    }
    with store.locked():
        reap(store, store.read_jobs())
        store.write_job(job)
        store.event('queued', job)

    poll = env_float('RUNQ_POLL', 2.0)
    every = env_float('RUNQ_NOTE_EVERY', 30.0) * 1000
    last_note = 0
    try:
        while True:
            with store.locked():
                jobs = reap(store, store.read_jobs())
                mine = next((j for j in jobs if j['id'] == job['id']), None)
                if mine is None:  # removed under us (a reset of the queue folder): queue again
                    store.write_job(job)
                    jobs.append(job)
                drives = sorted({d for j in jobs for d in (j.get('disks') or {})})
                machine = measure(drives)
                write_json(store.dir / 'machine.json', {'ts': now_ms(), **machine})
                decision = plan(jobs, machine, cfg, now_ms())
                reasons = decision.get(job['id'], [])
                if not reasons:
                    job.update(state='running', startedAt=now_ms(), reasons=[],
                               diskAtStart={d: machine['disks'].get(d) for d in disks})
                    store.write_job(job)
                    break
                job['reasons'] = reasons
                store.write_job(job)
            waited = now_ms() - t0
            if max_wait is not None and waited >= max_wait:
                with store.locked():
                    store.remove_job(job['id'])
                    store.event('gave-up', job, waitS=round(waited / 1000))
                note(f'gave up after {dur(waited)}: ' + '; '.join(reason_text(r) for r in reasons))
                return EXIT_GAVE_UP
            if now_ms() - last_note >= every:
                ahead = [j for j in order(jobs) if j.get('state') == 'waiting' and j['id'] < job['id']]
                note(f"waiting {dur(waited)}: " + '; '.join(reason_text(r) for r in reasons) +
                     (f' · {len(ahead)} ahead' if ahead else ''))
                last_note = now_ms()
            time.sleep(poll)
    except KeyboardInterrupt:
        with store.locked():
            store.remove_job(job['id'])
            store.event('cancelled', job, waitS=round((now_ms() - t0) / 1000))
        note('cancelled while waiting')
        return EXIT_CANCELLED

    wait_ms = job['startedAt'] - t0
    if wait_ms >= 1000:
        note(f'starting after {dur(wait_ms)} in the queue')
    jobh = make_job_object()
    try:
        p = subprocess.Popen([exe, *cmd[1:]], stdin=std_fd(0), stdout=std_fd(1), stderr=std_fd(2))
    except OSError as err:
        release_job_object(jobh)
        msg = describe_start_error(err, exe)
        with store.locked():
            store.remove_job(job['id'])
            store.event('failed', job, waitS=round(wait_ms / 1000), error=msg)
        note(msg)
        return EXIT_CANNOT_EXEC
    tree = Tree(p, proc_started(p.pid), jobh)
    job['child'] = {'pid': p.pid, 'started': tree.started}
    job['tree'] = 'job' if jobh else 'walk'
    store.write_job(job)
    with store.locked():
        store.event('started', job, waitS=round(wait_ms / 1000), pid=p.pid)

    sample = env_float('RUNQ_SAMPLE', 2.0)
    killed_for = None
    code = None
    while code is None:
        try:
            code = p.wait(timeout=sample)
            break
        except subprocess.TimeoutExpired:
            pass
        except KeyboardInterrupt:
            # Ctrl+C reaches the command as well; its exit is what runq reports.
            continue
        cur = tree.mem_mb()
        job['curMB'] = round(cur)
        job['peakMB'] = round(tree.peak)
        store.write_job(job)
        if max_mem is not None and cur > max_mem and killed_for is None:
            killed_for = cur
            pids = tree.kill_own()
            note(f'the command took {gb(cur)}, over --max-mem {gb(max_mem)}: ended its own process tree '
                 f'({len(pids)} processes: {", ".join(map(str, pids))})')
    with contextlib.suppress(Exception):
        tree.mem_mb()
    release_job_object(jobh)
    run_ms = now_ms() - job['startedAt']
    peak = round(max(tree.peak, job.get('peakMB') or 0))
    with store.locked():
        store.remove_job(job['id'])
        if killed_for is not None:
            store.event('killed', job, exit=code, waitS=round(wait_ms / 1000), runS=round(run_ms / 1000), peakMB=peak,
                        reason=f'own --max-mem {gb(max_mem)} exceeded at {gb(killed_for)}')
        else:
            store.event('finished', job, exit=code, waitS=round(wait_ms / 1000), runS=round(run_ms / 1000), peakMB=peak)
    note(f'exit {code} · ran {dur(run_ms)} · peak {gb(peak)}' + (f' · waited {dur(wait_ms)}' if wait_ms >= 1000 else ''))
    if code < 0:  # POSIX: ended by a signal
        return 128 - code
    return signed(code)


def describe_start_error(err: OSError, exe: str) -> str:
    win = getattr(err, 'winerror', None)
    if win in (225, 226):
        return (f'Windows refused to start {exe}: it is flagged as a virus or unwanted software (WinError {win}). '
                'Microsoft Defender quarantines freshly built executables at times: see Windows Security > '
                'Protection history. runq does not retry.')
    if win == 5 or isinstance(err, PermissionError):
        return (f'could not start {exe}: permission denied ({err}). A freshly built .exe is sometimes blocked by '
                'Microsoft Defender (behavioural detection): see Windows Security > Protection history, or '
                'rebuild. runq does not retry.')
    return f'could not start {exe}: {err}'


# ------------------------------------------------------------------ status and log


def cmd_status(argv: list[str]) -> int:
    store = Store(state_dir())
    cfg = load_config(store.dir)
    with store.locked():
        jobs = reap(store, store.read_jobs())
        drives = sorted(set(fixed_drives()) | {d for j in jobs for d in (j.get('disks') or {})})
        machine = measure(drives)
        decision = plan(jobs, machine, cfg, now_ms())
    totals = disk_total(drives) if not os.environ.get('RUNQ_FAKE_MACHINE') else {}
    now = now_ms()
    running = [j for j in order(jobs) if j.get('state') == 'running']
    waiting = [j for j in order(jobs) if j.get('state') == 'waiting']
    for j in waiting:
        j['reasons'] = decision.get(j['id'], j.get('reasons') or [])
    if '--json' in argv:
        print(json.dumps({'ts': now, 'machine': machine, 'diskTotals': totals, 'config': cfg,
                          'running': running, 'waiting': waiting}, ensure_ascii=False, indent=1))
        return 0
    disks = ' · '.join(f'{d} {gb(f)} free' for d, f in sorted((machine.get('disks') or {}).items()))
    print(f"free commit {gb(machine['commitFreeMB'])} of {gb(machine['commitLimitMB'])} (guard {cfg['guardGB']} GB)"
          + (f" · free RAM {gb(machine['ramFreeMB'])} of {gb(machine['ramTotalMB'])}" if 'ramFreeMB' in machine else '')
          + (f' · {disks}' if disks else ''))
    print(f'running: {len(running)}')
    for j in running:
        who = j.get('sessionName') or j.get('session') or '?'
        print(f"  {j['label']}  [{who}]  mem {gb(j.get('memMB') or 0)} · now {gb(j.get('curMB') or 0)} · "
              f"peak {gb(j.get('peakMB') or 0)} · {dur(now - (j.get('startedAt') or now))}"
              + (f" · tags {','.join(j['tags'])}" if j.get('tags') else '')
              + (f" · pid {j['child']['pid']}" if j.get('child') else '')
              + (' · its runq is gone' if j.get('orphaned') else ''))
    print(f'waiting: {len(waiting)}')
    for n, j in enumerate(waiting, 1):
        who = j.get('sessionName') or j.get('session') or '?'
        why = '; '.join(reason_text(r) for r in j['reasons']) or 'starting'
        print(f"  {n}. {j['label']}  [{who}]  mem {gb(j.get('memMB') or 0)} · waiting {dur(now - j['queuedAt'])} · {why}")
    return 0


def parse_since(v: str) -> int:
    v = v.strip()
    units = {'s': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000}
    if v[-1:] in units and v[:-1].replace('.', '', 1).isdigit():
        return now_ms() - int(float(v[:-1]) * units[v[-1]])
    if v.isdigit():
        return int(v)
    from datetime import datetime
    t = datetime.fromisoformat(v.replace('Z', '+00:00'))
    return int(t.timestamp() * 1000)


def event_text(e: dict) -> str:
    ts = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(e['ts'] / 1000))
    who = e.get('sessionName') or e.get('session') or ''
    bits = [f"{ts}  {e['ev']:<9} {e.get('label') or ''}"]
    if who:
        bits.append(f'[{who}]')
    if e.get('memMB') is not None and e['ev'] in ('queued', 'started'):
        bits.append(f"mem {gb(e['memMB'])}")
    for k, name in (('waitS', 'waited'), ('runS', 'ran')):
        if e.get(k) is not None:
            bits.append(f'{name} {dur(e[k] * 1000)}')
    if e.get('peakMB') is not None:
        bits.append(f"peak {gb(e['peakMB'])}")
    if e.get('exit') is not None:
        bits.append(f"exit {e['exit']}")
    for k in ('reason', 'error'):
        if e.get(k):
            bits.append(f'· {e[k]}')
    return ' '.join(bits)


def cmd_log(argv: list[str]) -> int:
    since = None
    n = 30
    k = 0
    while k < len(argv):
        if argv[k] == '--since' and k + 1 < len(argv):
            try:
                since = parse_since(argv[k + 1])
            except ValueError:
                return usage(f'--since takes 30m, 2h, an ISO time or epoch ms, not {argv[k + 1]!r}')
            k += 2
        elif argv[k] == '-n' and k + 1 < len(argv) and argv[k + 1].isdigit():
            n = int(argv[k + 1])
            k += 2
        elif argv[k] == '--json':
            k += 1
        else:
            return usage(f'unknown option {argv[k]}')
    rows = Store(state_dir()).read_events()
    if since is not None:
        rows = [r for r in rows if (r.get('ts') or 0) >= since]
    else:
        rows = rows[-n:]
    for r in rows:
        print(json.dumps(r, ensure_ascii=False) if '--json' in argv else event_text(r))
    return 0


def cmd_config(_argv: list[str]) -> int:
    d = state_dir()
    print(json.dumps({'stateDir': str(d), 'configFile': str(d / 'config.json'), **load_config(d)}, indent=1))
    return 0


def main(argv: list[str]) -> int:
    # A pipe (Claude Code's Bash and PowerShell tools, mintty) gets UTF-8; a console writes
    # Unicode itself. runq's own lines only: the command writes to the handles directly.
    for s in (sys.stdout, sys.stderr):
        with contextlib.suppress(AttributeError, OSError, ValueError):
            if not s.isatty():
                s.reconfigure(encoding='utf-8', errors='replace')
    if not argv or argv[0] in ('-h', '--help', 'help'):
        print(__doc__)
        return 0 if argv else EXIT_USAGE
    sub = {'status': cmd_status, 'log': cmd_log, 'config': cmd_config}.get(argv[0])
    if sub:
        return sub(argv[1:])
    return cmd_run(argv)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
