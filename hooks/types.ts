// The snapshot every sampler writes to <home>/.claude/state/load/snapshot.json and every
// session's mod reads. Windows: sampler/load-sampler.ps1. macOS and Linux: hooks/posix.ts,
// run inside one session's mod (the leader).

/**
 * `started`: when the process started, as the platform tells it (Windows: epoch ms of the CIM
 * CreationDate; macOS/Linux: ps `lstart` in the C locale). A PID and a name can be reused; the
 * start time tells the process the user chose from a newer one. Absent: unknown, not endable.
 */
export type Top = { name: string; pid: number; cpu: number; memMB: number; started?: string }
export type ByName = { name: string; count: number; cpu: number; memMB: number }

export type SessionLoad = {
  pid: number
  name: string
  status: string
  cwd: string
  hostSessionId: string
  sessionId: string
  /** % of the whole machine (all cores = 100). */
  cpu: number
  memMB: number
  procs: number
  /** The heaviest processes of the session's tree. */
  top: Top[]
  /** The session's processes folded by name. */
  byName?: ByName[]
}

/** A process whose parent died, attributed to a repository or worktree by its working directory. */
export type OrphanLoad = { label: string; root: string; cpu: number; memMB: number; procs: number; top: Top[] }

/** Processes outside every session, folded by name; `top`: the heaviest three (shown, never endable). */
export type OutsideLoad = { name: string; count: number; cpu: number; memMB: number; top?: Top[] }

/**
 * Recent points for the graphs, one per sample, oldest first: `cpu` and `mem` (% of the machine),
 * per session id and per orphan label CPU %, and in `sessionsMem` / `orphansMem` memory in MB.
 */
export type History = {
  cpu: number[]; mem: number[]; sessions: Record<string, number[]>; orphans: Record<string, number[]>
  sessionsMem?: Record<string, number[]>; orphansMem?: Record<string, number[]>
}

export type Snapshot = {
  /**
   * The format: absent (1.0.0), 2 with `Top.started`, 3 with `OutsideLoad.top` and the memory history,
   * 4 with commit and disks (Windows).
   * A mod replaces a sampler that writes an older one.
   */
  v?: number
  /** Epoch milliseconds of the sample. */
  ts: number
  intervalMs: number
  cores: number
  /** % of the whole machine. */
  cpu: number
  memTotalMB: number
  memUsedMB: number
  /** Format 4, Windows: committed memory and the commit limit (RAM plus page file), for the run queue. */
  commitUsedMB?: number | null
  commitLimitMB?: number | null
  /** Format 4, Windows: the fixed drives (`C:`) and their free space. */
  disks?: Array<{ name: string; freeMB: number; totalMB: number }>
  /** False on a sampler's first pass, which has no CPU delta yet. */
  warm: boolean
  sessions: SessionLoad[]
  orphans: OrphanLoad[]
  outside: OutsideLoad[]
  hist?: History
}
