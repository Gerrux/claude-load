// The snapshot every sampler writes to <home>/.claude/state/load/snapshot.json and every
// session's mod reads. Windows: sampler/load-sampler.ps1. macOS and Linux: hooks/posix.ts,
// run inside one session's mod (the leader).

export type Top = { name: string; pid: number; cpu: number; memMB: number }
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

/** Processes outside every session, folded by name. */
export type OutsideLoad = { name: string; count: number; cpu: number; memMB: number }

/** Recent points for the graphs, one per sample, oldest first. */
export type History = { cpu: number[]; mem: number[]; sessions: Record<string, number[]>; orphans: Record<string, number[]> }

export type Snapshot = {
  /** Epoch milliseconds of the sample. */
  ts: number
  intervalMs: number
  cores: number
  /** % of the whole machine. */
  cpu: number
  memTotalMB: number
  memUsedMB: number
  /** False on a sampler's first pass, which has no CPU delta yet. */
  warm: boolean
  sessions: SessionLoad[]
  orphans: OrphanLoad[]
  outside: OutsideLoad[]
  hist?: History
}
