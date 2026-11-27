export type Pr = {
  number: number
  url: string
  state: string // OPEN | MERGED | CLOSED
  draft: boolean
  review: string // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''
  approvals: number // reviewers whose latest review is an approval
  changes: number // reviewers (bots included) whose latest review requests changes
  unresolved: number // review threads still open, any author
  merge: 'ready' | 'blocked' | 'behind' | 'conflicts' | 'unstable' | '' // from mergeStateStatus; '' when GitHub has not computed it
  checks: 'pass' | 'fail' | 'pending' | 'none'
  done: number
  total: number
}

export type Stats = {
  startedMs: number
  now: number
  prompts: number
  running: number
  tools: Record<string, number>
  agents: number
  tokens: number
  window: number
  costUsd: number
  busy: boolean
  pr: Pr | null
  hasSys: boolean
  cpu: number
  load: number
  memUsedKb: number
  memTotalKb: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-mod': { stats: Stats }
  }
}
