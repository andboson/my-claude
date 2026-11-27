import type { Pr } from '../types'

export const gb = (kb: number) => (kb / 1048576).toFixed(1)

export const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

export const fmtDur = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60000)

  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// context warning threshold and the level it must drop below to re-arm
export const WARN_AT = 85
export const REARM_BELOW = 70

export const warnState = (pct: number, warned: boolean) => ({
  shouldWarn: pct >= WARN_AT && !warned,
  warned: pct >= WARN_AT ? true : pct < REARM_BELOW ? false : warned,
})

// each reviewer's latest decisive review counts; comments and pending drafts do not change it
// bots (CodeScene, Copilot) are not org members, so only member/owner/collaborator reviews count
const HUMAN = ['MEMBER', 'OWNER', 'COLLABORATOR']

// each reviewer's latest decisive review (bots included unless `humans`)
const latestReviews = (reviews: unknown, humans: boolean) => {
  const latest = new Map<string, string>()
  for (const r of Array.isArray(reviews) ? (reviews as { author?: { login?: string }; authorAssociation?: string; state?: string }[]) : []) {
    if (!r.author?.login || !r.state || ['COMMENTED', 'PENDING'].includes(r.state)) continue
    if (humans && (r.author.login.endsWith('[bot]') || !HUMAN.includes(r.authorAssociation ?? ''))) continue
    latest.set(r.author.login, r.state)
  }

  return [...latest.values()]
}

const countApprovals = (reviews: unknown) => latestReviews(reviews, true).filter(v => v === 'APPROVED').length

// reviewThreads from the GraphQL answer: how many are still open
export const countUnresolved = (json: string) => {
  try {
    const nodes = JSON.parse(json)?.data?.repository?.pullRequest?.reviewThreads?.nodes

    return Array.isArray(nodes) ? nodes.filter((n: { isResolved?: boolean }) => n.isResolved === false).length : 0
  } catch {
    return 0
  }
}

// mergeStateStatus (conflicts show as DIRTY) to what the person must do
const mergeOf = (status: unknown, mergeable: unknown): Pr['merge'] => {
  if (mergeable === 'CONFLICTING' || status === 'DIRTY') return 'conflicts'

  return ({ CLEAN: 'ready', HAS_HOOKS: 'ready', BEHIND: 'behind', BLOCKED: 'blocked', UNSTABLE: 'unstable' } as Record<string, Pr['merge']>)[String(status)] ?? ''
}

type Check = { status?: string; conclusion?: string; state?: string }

const BAD = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED']
const OK = ['SUCCESS', 'NEUTRAL', 'SKIPPED']

// parses `gh pr view --json number,url,state,isDraft,reviewDecision,reviews,statusCheckRollup`; undefined when it is not a PR
export const parsePr = (json: string): Pr | undefined => {
  try {
    const j = JSON.parse(json) as Record<string, unknown>
    if (typeof j.number !== 'number' || typeof j.url !== 'string') return undefined
    const rollup = (Array.isArray(j.statusCheckRollup) ? j.statusCheckRollup : []) as Check[]
    const verdict = (c: Check) => (c.conclusion || c.state || '').toUpperCase()
    const fail = rollup.filter(c => BAD.includes(verdict(c))).length
    const done = rollup.filter(c => OK.includes(verdict(c))).length + fail
    const checks = rollup.length === 0 ? 'none' : fail > 0 ? 'fail' : done === rollup.length ? 'pass' : 'pending'

    return {
      number: j.number,
      url: j.url,
      state: String(j.state ?? ''),
      draft: j.isDraft === true,
      review: String(j.reviewDecision ?? ''),
      approvals: countApprovals(j.reviews),
      changes: latestReviews(j.reviews, false).filter(v => v === 'CHANGES_REQUESTED').length,
      unresolved: 0,
      merge: mergeOf(j.mergeStateStatus, j.mergeable),
      checks,
      done,
      total: rollup.length,
    }
  } catch {
    return undefined
  }
}
