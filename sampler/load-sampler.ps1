# claude-load sampler for Windows: one per machine. Splits CPU and memory by Claude Code
# session and writes ~/.claude/state/load/snapshot.json. Every session's mod only reads the
# snapshot and touches the `wanted` file every 30 s; with no readers the sampler exits.
#
# A session is a PID from ~/.claude/sessions/<pid>.json; its processes are its whole tree.
# An orphan is a tree whose parent died (vite, gradle, python after a terminal closed): a dev
# process outside every session whose parent is gone, with all its descendants, attributed to a
# repository or worktree by its current directory. A live shell under a live terminal is not one.
param(
  [int]$IntervalMs = 4000,
  [int]$IdleExitSec = 180,
  [switch]$Once
)
$ErrorActionPreference = 'SilentlyContinue'

$userHome = [Environment]::GetFolderPath('UserProfile')
$state = Join-Path $userHome '.claude\state\load'
$sessionsDir = Join-Path $userHome '.claude\sessions'
New-Item -ItemType Directory -Force $state | Out-Null
$snapPath = Join-Path $state 'snapshot.json'
$tmpPath = Join-Path $state 'snapshot.json.tmp'
$wantedPath = Join-Path $state 'wanted'
$pidPath = Join-Path $state 'sampler.pid'

function Test-OtherSampler {
  if (-not (Test-Path $pidPath)) { return $false }
  $old = 0
  [int]::TryParse((Get-Content $pidPath -Raw).Trim(), [ref]$old) | Out-Null
  if ($old -eq 0 -or $old -eq $PID) { return $false }
  # The PID must still be a sampler: after a reboot it may belong to the user's own PowerShell.
  $w = Get-CimInstance Win32_Process -Filter "ProcessId=$old" -Property ProcessId, Name, CommandLine
  if ($null -eq $w -or $w.Name -notmatch '^(powershell|pwsh)\.exe$') { return $false }
  # No command line (another user's process): trust the name, as before.
  return (-not $w.CommandLine -or $w.CommandLine -match 'load-sampler\.ps1')
}

if (-not $Once) {
  if (Test-OtherSampler) { exit 0 }
  Set-Content -Path $pidPath -Value $PID -Encoding ascii
  Start-Sleep -Milliseconds 300
  if ((Get-Content $pidPath -Raw).Trim() -ne "$PID") { exit 0 }  # lost the race to another start
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LoadCwd {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, ref PBI pbi, int len, out int ret);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct PBI { public IntPtr r1; public IntPtr Peb; public IntPtr r2a; public IntPtr r2b; public IntPtr Pid; public IntPtr r3; }
  static IntPtr ReadPtr(IntPtr h, IntPtr a) { var b = new byte[8]; IntPtr n; return ReadProcessMemory(h, a, b, 8, out n) ? (IntPtr)BitConverter.ToInt64(b, 0) : IntPtr.Zero; }
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var pbi = new PBI(); int ret;
      if (NtQueryInformationProcess(h, 0, ref pbi, Marshal.SizeOf(pbi), out ret) != 0) return null;
      IntPtr pp = ReadPtr(h, pbi.Peb + 0x20);
      if (pp == IntPtr.Zero) return null;
      var us = new byte[16]; IntPtr n;
      if (!ReadProcessMemory(h, pp + 0x38, us, 16, out n)) return null;
      int len = BitConverter.ToUInt16(us, 0);
      IntPtr buf = (IntPtr)BitConverter.ToInt64(us, 8);
      if (len == 0 || len > 4096) return null;
      var s = new byte[len];
      if (!ReadProcessMemory(h, buf, s, len, out n)) return null;
      return System.Text.Encoding.Unicode.GetString(s);
    } finally { CloseHandle(h); }
  }
}
'@
Add-Type -AssemblyName Microsoft.VisualBasic
$computer = New-Object Microsoft.VisualBasic.Devices.ComputerInfo

$cores = [Environment]::ProcessorCount
$devNames = '^(node|python|pythonw|cargo|rustc|rust-analyzer|java|esbuild|pnpm|npm|bash|sh|powershell|pwsh|cmd|git|adb|gradle|tsc|vite|uv|deno|bun|conhost)$'
# Shells and console hosts alone never make an orphan tree worth reporting.
$shellNames = '^(bash|sh|zsh|fish|powershell|pwsh|cmd|conhost)$'
$prevCpu = @{}
$prevAt = $null
$parent = @{}
$created = @{}
$prevName = @{}
$lastCim = [datetime]::MinValue
$cwdCache = @{}
# Graph history: the last $histLen points (six minutes at 4 s) for the machine, sessions and orphans.
$histLen = 90
$hist = @{}
function Push-Hist([string]$key, [double]$val) {
  if (-not $hist.ContainsKey($key)) { $hist[$key] = New-Object System.Collections.Generic.List[double] }
  $l = $hist[$key]
  $l.Add([math]::Round($val, 1))
  if ($l.Count -gt $histLen) { $l.RemoveAt(0) }
}

$repoCache = @{}
function Get-RepoLabel([string]$dir) {
  if (-not $dir) { return $null }
  $d = $dir.TrimEnd('\')
  if ($repoCache.ContainsKey($d)) { return $repoCache[$d] }
  $m = [regex]::Match($d, '^(.*?)\\\.claude\\worktrees\\([^\\]+)', 'IgnoreCase')
  if ($m.Success) {
    $r = @{ root = $m.Groups[1].Value; label = (Split-Path $m.Groups[1].Value -Leaf) + '/' + $m.Groups[2].Value }
  } else {
    # The git repository root above the directory; without one, the directory itself.
    $root = $d
    $x = $d
    for ($i = 0; $i -lt 8 -and $x; $i++) {
      if (Test-Path (Join-Path $x '.git')) { $root = $x; break }
      $x = Split-Path $x -Parent
    }
    $label = Split-Path $root -Leaf
    if ($root -ne $d) { $label += '/' + $d.Substring($root.Length).TrimStart('\').Replace('\', '/') }
    $r = @{ root = $root; label = $label }
  }
  $repoCache[$d] = $r
  return $r
}

function Round1([double]$x) { [math]::Round($x, 1) }

# The repository of a process by its current directory; system directories give nothing.
function Get-ProcRepo([int]$id) {
  if (-not $cwdCache.ContainsKey($id)) { $cwdCache[$id] = [LoadCwd]::Get($id) }
  $r = Get-RepoLabel $cwdCache[$id]
  if ($r -and $r.root -notmatch '^[A-Za-z]:\\(Windows|Program Files)') { return $r }
  return $null
}

function Format-TopRow($r) {
  [ordered]@{ name = $r.name; pid = $r.pid; cpu = (Round1 $r.cpu); memMB = [int]($r.mem / 1MB) }
}

# Top of an orphan group: each tree's root first (ending it with /T ends the whole tree), then the
# heaviest other members; three rows at most.
function Get-OrphanTop($g) {
  $roots = @($g.trees | Sort-Object { $_.cpu * 1e6 + $_.mem / 1MB } -Descending | ForEach-Object { $_.root })
  $rootIds = @{}
  foreach ($r in $roots) { $rootIds[$r.pid] = 1 }
  $top = New-Object System.Collections.ArrayList
  foreach ($r in @($roots | Select-Object -First 3)) { [void]$top.Add((Format-TopRow $r)) }
  $need = 3 - $top.Count
  if ($need -gt 0) {
    foreach ($m in @($g.members | Where-Object { -not $rootIds.ContainsKey($_.pid) } | Sort-Object { $_.cpu * 1e6 + $_.mem / 1MB } -Descending | Select-Object -First $need)) {
      [void]$top.Add((Format-TopRow $m))
    }
  }
  $top.ToArray()
}

while ($true) {
  $tickStart = Get-Date

  # 1. Processes: cumulative CPU time and working set.
  $cur = @{}
  $hasNew = $false
  foreach ($p in [Diagnostics.Process]::GetProcesses()) {
    if ($p.Id -eq 0) { continue }
    $t = 0.0
    try { $t = $p.TotalProcessorTime.TotalMilliseconds } catch {}
    $cur[$p.Id] = @{ name = $p.ProcessName; cpuMs = $t; ws = [double]$p.WorkingSet64 }
    # A reused PID (another name, or its CPU time went back) must not keep the old process's parent.
    if ($parent.ContainsKey($p.Id) -and (($prevName[$p.Id] -and $prevName[$p.Id] -ne $p.ProcessName) -or ($prevCpu.ContainsKey($p.Id) -and $t -lt $prevCpu[$p.Id]))) {
      $parent.Remove($p.Id)
    }
    if (-not $parent.ContainsKey($p.Id)) { $hasNew = $true }
  }
  $prevName = @{}
  foreach ($id in $cur.Keys) { $prevName[$id] = $cur[$id].name }

  # 2. Parents: a full CIM query only when new PIDs appeared, and at most every 8 s.
  if ($hasNew -and (($tickStart - $lastCim).TotalSeconds -ge 8)) {
    $fresh = @{}
    $freshCreated = @{}
    foreach ($w in Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CreationDate) {
      $fresh[[int]$w.ProcessId] = [int]$w.ParentProcessId
      if ($w.CreationDate) { $freshCreated[[int]$w.ProcessId] = $w.CreationDate }
    }
    $parent = $fresh
    $created = $freshCreated
    $lastCim = $tickStart
  }

  # 3. CPU share over the interval, % of the whole machine.
  $dtMs = if ($prevAt) { ($tickStart - $prevAt).TotalMilliseconds } else { 0 }
  foreach ($id in @($cur.Keys)) {
    $c = $cur[$id]
    $pc = 0.0
    if ($dtMs -gt 0 -and $prevCpu.ContainsKey($id)) { $pc = [math]::Max(0, ($c.cpuMs - $prevCpu[$id]) / ($dtMs * $cores) * 100) }
    $c.cpu = $pc
  }
  $prevCpu = @{}
  foreach ($id in $cur.Keys) { $prevCpu[$id] = $cur[$id].cpuMs }
  $prevAt = $tickStart

  # 4. Claude Code sessions.
  $sessions = @{}
  foreach ($f in Get-ChildItem -Path $sessionsDir -Filter '*.json' -File) {
    try { $j = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
    $spid = [int]$j.pid
    if (-not $cur.ContainsKey($spid)) { continue }
    $sessions[$spid] = @{
      pid = $spid; name = [string]$j.name; status = [string]$j.status; cwd = [string]$j.cwd
      hostSessionId = [string]$j.hostSessionId; sessionId = [string]$j.sessionId
      cpu = 0.0; mem = 0.0; procs = 0; top = New-Object System.Collections.ArrayList; byName = @{}
    }
  }

  # 5. Owner of each process: walk up the parents to a session PID.
  # Windows keeps a dead parent's PID, which a newer process may reuse: such a "parent" is younger
  # than its child and is not followed.
  function Test-LiveParent([int]$child, [int]$px) {
    if ($px -eq 0 -or $px -eq $child -or -not $cur.ContainsKey($px)) { return $false }
    if ($created.ContainsKey($px) -and $created.ContainsKey($child) -and $created[$px] -gt $created[$child]) { return $false }
    return $true
  }
  $owner = @{}
  function Resolve-Owner([int]$id) {
    $chain = New-Object System.Collections.ArrayList
    $x = $id
    for ($i = 0; $i -lt 64; $i++) {
      if ($owner.ContainsKey($x)) { $o = $owner[$x]; foreach ($y in $chain) { $owner[$y] = $o }; return $o }
      if ($sessions.ContainsKey($x)) { foreach ($y in $chain) { $owner[$y] = $x }; $owner[$x] = $x; return $x }
      [void]$chain.Add($x)
      if (-not $parent.ContainsKey($x)) { break }
      $px = $parent[$x]
      if (-not (Test-LiveParent $x $px)) { break }
      $x = $px
    }
    foreach ($y in $chain) { $owner[$y] = 0 }
    return 0
  }

  # The processes above a session (the shell or terminal it runs in) are never orphans: ending
  # one with /T would end the session with it.
  $hosts = @{}
  foreach ($spid in $sessions.Keys) {
    $x = $spid
    for ($i = 0; $i -lt 64 -and $parent.ContainsKey($x); $i++) {
      $px = $parent[$x]
      if (-not (Test-LiveParent $x $px) -or $hosts.ContainsKey($px)) { break }
      $hosts[$px] = 1
      $x = $px
    }
  }

  $orphans = @{}
  $unowned = @{}
  $outside = New-Object System.Collections.ArrayList
  $total = 0.0
  foreach ($id in $cur.Keys) {
    $c = $cur[$id]
    $total += $c.cpu
    $o = Resolve-Owner $id
    $row = @{ pid = $id; name = $c.name; cpu = $c.cpu; mem = $c.ws }
    if ($o -ne 0) {
      $s = $sessions[$o]; $s.cpu += $c.cpu; $s.mem += $c.ws; $s.procs++; [void]$s.top.Add($row)
      if (-not $s.byName.ContainsKey($c.name)) { $s.byName[$c.name] = @{ name = $c.name; cpu = 0.0; mem = 0.0; count = 0 } }
      $n = $s.byName[$c.name]; $n.cpu += $c.cpu; $n.mem += $c.ws; $n.count++
      continue
    }
    $unowned[$id] = $row
  }

  # Orphan trees. A root is a dev-named process outside every session whose parent is dead (gone,
  # or younger than its child: a reused PID), not the sampler and not above a session. The app that
  # merely hosts the work (explorer, a terminal) is not a dev process, so its live shells stay out.
  # A tree is the root and all its descendants; it is reported when it holds a qualifying process
  # (a dev tool, not a shell or console host) and weighs enough.
  $kids = @{}
  foreach ($id in $unowned.Keys) {
    if ($id -eq $PID -or -not $parent.ContainsKey($id)) { continue }
    $px = $parent[$id]
    if ((Test-LiveParent $id $px) -and $unowned.ContainsKey($px)) {
      if (-not $kids.ContainsKey($px)) { $kids[$px] = New-Object System.Collections.ArrayList }
      [void]$kids[$px].Add($id)
    }
  }
  $reported = @{}
  foreach ($id in $unowned.Keys) {
    if ($id -eq $PID -or $hosts.ContainsKey($id) -or -not $parent.ContainsKey($id)) { continue }
    $rootRow = $unowned[$id]
    if ($rootRow.name -notmatch $devNames -or (Test-LiveParent $id $parent[$id])) { continue }
    $members = New-Object System.Collections.ArrayList
    $seen = @{ $id = 1 }
    $stack = New-Object System.Collections.Stack
    $stack.Push($id)
    while ($stack.Count -gt 0) {
      $x = [int]$stack.Pop()
      [void]$members.Add($unowned[$x])
      foreach ($k in @($kids[$x])) { if ($null -ne $k -and -not $seen.ContainsKey($k)) { $seen[$k] = 1; $stack.Push($k) } }
    }
    $tc = 0.0; $tm = 0.0; $heavy = $null; $bad = $false
    foreach ($m in $members) {
      $tc += $m.cpu; $tm += $m.mem
      if ($hosts.ContainsKey($m.pid)) { $bad = $true }
      if ($m.name -match $devNames -and $m.name -notmatch $shellNames -and $m.pid -ne $PID) {
        if ($null -eq $heavy -or ($m.cpu * 1e6 + $m.mem / 1MB) -gt ($heavy.cpu * 1e6 + $heavy.mem / 1MB)) { $heavy = $m }
      }
    }
    if ($bad -or $null -eq $heavy -or -not ($tc -ge 0.3 -or $tm -ge 150MB)) { continue }
    $repo = Get-ProcRepo $id
    if (-not $repo) { $repo = Get-ProcRepo $heavy.pid }
    if (-not $repo) { continue }
    $key = $repo.label
    if (-not $orphans.ContainsKey($key)) { $orphans[$key] = @{ label = $key; root = $repo.root; cpu = 0.0; mem = 0.0; procs = 0; trees = New-Object System.Collections.ArrayList; members = New-Object System.Collections.ArrayList } }
    $g = $orphans[$key]; $g.cpu += $tc; $g.mem += $tm; $g.procs += $members.Count
    [void]$g.trees.Add(@{ root = $rootRow; cpu = $tc; mem = $tm })
    foreach ($m in $members) { [void]$g.members.Add($m); $reported[$m.pid] = 1 }
  }
  foreach ($id in $unowned.Keys) { if (-not $reported.ContainsKey($id)) { [void]$outside.Add($unowned[$id]) } }
  foreach ($k in @($cwdCache.Keys)) { if (-not $cur.ContainsKey($k)) { $cwdCache.Remove($k) } }

  function Format-Top($rows, [int]$n) {
    @($rows | Sort-Object { $_.cpu * 1e6 + $_.mem / 1MB } -Descending | Select-Object -First $n | ForEach-Object {
      [ordered]@{ name = $_.name; pid = $_.pid; cpu = (Round1 $_.cpu); memMB = [int]($_.mem / 1MB) }
    })
  }

  # Other processes fold by name: a dozen msedge processes make one row.
  $byName = @{}
  foreach ($r in $outside) {
    if (-not $byName.ContainsKey($r.name)) { $byName[$r.name] = @{ name = $r.name; cpu = 0.0; mem = 0.0; count = 0 } }
    $b = $byName[$r.name]; $b.cpu += $r.cpu; $b.mem += $r.mem; $b.count++
  }

  $memUsed = $computer.TotalPhysicalMemory - $computer.AvailablePhysicalMemory
  if ($dtMs -gt 0) {
    Push-Hist 'm:cpu' ([math]::Min(100, $total))
    Push-Hist 'm:mem' ($memUsed / $computer.TotalPhysicalMemory * 100)
    $seen = @{ 'm:cpu' = 1; 'm:mem' = 1 }
    foreach ($s in $sessions.Values) { $k = 's:' + $s.sessionId; Push-Hist $k $s.cpu; $seen[$k] = 1 }
    foreach ($g in $orphans.Values) { $k = 'o:' + $g.label; Push-Hist $k $g.cpu; $seen[$k] = 1 }
    foreach ($k in @($hist.Keys)) { if (-not $seen.ContainsKey($k)) { $hist.Remove($k) } }
  }
  $histOut = [ordered]@{ cpu = @(); mem = @(); sessions = @{}; orphans = @{} }
  foreach ($k in $hist.Keys) {
    $vals = @($hist[$k].ToArray())
    if ($k -eq 'm:cpu') { $histOut.cpu = $vals }
    elseif ($k -eq 'm:mem') { $histOut.mem = $vals }
    elseif ($k.StartsWith('s:')) { $histOut.sessions[$k.Substring(2)] = $vals }
    elseif ($k.StartsWith('o:')) { $histOut.orphans[$k.Substring(2)] = $vals }
  }

  $snapshot = [ordered]@{
    ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    intervalMs = $IntervalMs
    cores = $cores
    cpu = (Round1 ([math]::Min(100, $total)))
    memTotalMB = [int]($computer.TotalPhysicalMemory / 1MB)
    memUsedMB = [int]($memUsed / 1MB)
    warm = ($dtMs -gt 0)
    hist = $histOut
    sessions = @($sessions.Values | Sort-Object { $_.cpu } -Descending | ForEach-Object {
      [ordered]@{ pid = $_.pid; name = $_.name; status = $_.status; cwd = $_.cwd; hostSessionId = $_.hostSessionId; sessionId = $_.sessionId
        cpu = (Round1 $_.cpu); memMB = [int]($_.mem / 1MB); procs = $_.procs; top = @(Format-Top $_.top 4)
        byName = @($_.byName.Values | Sort-Object { $_.cpu * 1e6 + $_.mem / 1MB } -Descending | Select-Object -First 8 | ForEach-Object {
          [ordered]@{ name = $_.name; count = $_.count; cpu = (Round1 $_.cpu); memMB = [int]($_.mem / 1MB) } }) }
    })
    orphans = @($orphans.Values | Sort-Object { $_.cpu } -Descending | ForEach-Object {
      [ordered]@{ label = $_.label; root = $_.root; cpu = (Round1 $_.cpu); memMB = [int]($_.mem / 1MB); procs = $_.procs; top = @(Get-OrphanTop $_) }
    })
    outside = @($byName.Values | Sort-Object { $_.cpu * 1e6 + $_.mem / 1MB } -Descending | Select-Object -First 6 | ForEach-Object {
      [ordered]@{ name = $_.name; count = $_.count; cpu = (Round1 $_.cpu); memMB = [int]($_.mem / 1MB) }
    })
  }
  $json = $snapshot | ConvertTo-Json -Depth 6 -Compress
  [IO.File]::WriteAllText($tmpPath, $json, (New-Object System.Text.UTF8Encoding $false))
  Move-Item -Force $tmpPath $snapPath

  if ($Once) {
    if ($dtMs -le 0) { Start-Sleep -Milliseconds 2000; continue }  # the first pass only sets the CPU baseline
    break
  }

  # No reader for longer than IdleExitSec: exit.
  $w = Get-Item $wantedPath -ErrorAction SilentlyContinue
  if (-not $w -or ((Get-Date) - $w.LastWriteTime).TotalSeconds -gt $IdleExitSec) {
    if ((Get-Content $pidPath -Raw).Trim() -eq "$PID") { Remove-Item $pidPath -Force }
    break
  }
  # Two starts that both slipped past the pid-file check: the one the file does not name leaves.
  if (Test-OtherSampler) { break }
  $spent = ((Get-Date) - $tickStart).TotalMilliseconds
  Start-Sleep -Milliseconds ([int][math]::Max(250, $IntervalMs - $spent))
}
