import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Pr, Stats } from '../types'
import { countUnresolved, fmt, fmtDur, gb, parsePr, warnState } from './format'

const PANE = 'session-mod'
const INIT: Stats = {
  startedMs: Date.now(),
  now: Date.now(),
  prompts: 0,
  running: 0,
  tools: {},
  agents: 0,
  tokens: 0,
  window: 0,
  costUsd: 0,
  busy: false,
  pr: null,
  hasSys: false,
  cpu: 0,
  load: 0,
  memUsedKb: 0,
  memTotalKb: 0,
}
// saved or computed values may be missing or NaN (old state, failed reads): fall back per field
const clean = (s: Partial<Stats>): Stats => {
  const out = { ...INIT } as Record<string, unknown>
  for (const [k, v] of Object.entries(s)) {
    const d = (INIT as Record<string, unknown>)[k]
    if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v
  }

  return out as Stats
}
const stats = atom({ plugin: 'session-mod', key: 'stats' } as const, INIT)

// the branch's PR (any state) via gh; null when there is none, gh is missing or not signed in
type Dollar = Parameters<Hook<'session.start'>>[0]
const fetchPr = async ($: Dollar) => {
  try {
    const { stdout, exitCode } = await $.process.run(
      ['gh', 'pr', 'view', '--json', 'number,url,state,isDraft,reviewDecision,reviews,mergeStateStatus,mergeable,statusCheckRollup'],
      { timeoutMs: 15000 },
    )

    const pr = exitCode === 0 ? parsePr(stdout) : undefined
    if (!pr) return null
    const q = 'query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}'
    const threads = await $.process.run(
      ['gh', 'api', 'graphql', '-f', `query=${q}`, '-F', 'owner={owner}', '-F', 'repo={repo}', '-F', `n=${pr.number}`],
      { timeoutMs: 15000 },
    )

    return { ...pr, unresolved: threads.exitCode === 0 ? countUnresolved(threads.stdout) : 0 }
  } catch {
    return null
  }
}

const addressPrompt = (pr: Pr) =>
  `Address the open review feedback on PR #${pr.number} (${pr.url}): read the unresolved review threads and any requested changes from every reviewer, including Copilot and Claude (gh api graphql reviewThreads, gh pr view --json reviews). Fix what is valid, tell me what you decline and why, then resolve the threads you handled.`

const fixCiPrompt = (pr: Pr) =>
  `CI is failing on PR #${pr.number} (${pr.url}). Find the failed checks (gh pr checks, gh run view --log-failed), fix the root cause, run the relevant checks locally, and tell me what you changed. Do not push unless I ask.`

const upd = ($: Parameters<typeof update>[0], fn: (s: Stats) => Stats) =>
  update($, stats, s => fn(clean(s)))

const refreshPr = async ($: Dollar) => {
  const pr = await fetchPr($)
  await upd($, s => ({ ...s, pr }))
}

export const register: Register = on => {
  // turns in flight; polling only runs while there is one
  const active = new Set<string>()
  let warned = false
  let isOpened = false
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-mod',
      description: 'Show live session stats in a docked pane',
    })
    void $.ui.open({ id: PANE, title: 'Session stats' })
    const { startedAt } = await $.session.usage()
    const now = await $.clock.now()
    await upd($, st => ({ ...st, startedMs: Number.isFinite(startedAt) ? startedAt : st.startedMs, now }))
    let prev: [number, number] | undefined
    const sample = async () => {
      try {
        const { stdout, exitCode } = await $.process.run(['cat', '/proc/stat', '/proc/loadavg', '/proc/meminfo'])
        if (exitCode !== 0) return
        const cpu = stdout.split('\n')[0]!.split(/\s+/).slice(1).map(Number)
        const idle = (cpu[3] ?? 0) + (cpu[4] ?? 0)
        const total = cpu.reduce((a, b) => a + b, 0)
        const pct = prev && total > prev[1] ? (1 - (idle - prev[0]) / (total - prev[1])) * 100 : 0
        prev = [idle, total]
        const kb = (name: string) => Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(stdout)?.[1] ?? 0)
        const load = Number(/^(\d+\.\d+) \d+\.\d+ \d+\.\d+ \d+\/\d+ \d+$/m.exec(stdout)?.[1] ?? 0)
        await upd($, s => ({
          ...s,
          hasSys: true,
          cpu: pct,
          load,
          memTotalKb: kb('MemTotal'),
          memUsedKb: kb('MemTotal') - kb('MemAvailable'),
        }))
      } catch {
        // no /proc (macOS, Windows) or the read failed: the System section stays hidden
      }
    }
    // one reading now so System shows from the start, then idle readings ride the 30 s tick
    void sample()
    void refreshPr($)
    $.clock.every(30000, async () => {
      const t = await $.clock.now()
      await upd($, st => ({ ...st, now: t }))
      await refreshPr($)
      if (active.size === 0) await sample()
    })
    // while Claude works the readings come every 2 s
    $.clock.every(2000, async () => {
      if (active.size > 0) await sample()
    })

    return next(e)
  })

  on('command.run', { command: 'session-mod' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Session stats' })

    return { text: 'Session stats pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    // a prompt counts as the person asking, so the pane seats at any width; once only, so closing it sticks
    if (!isOpened) {
      isOpened = true
      void $.ui.open({ id: PANE, title: 'Session stats' })
    }
    await upd($, s => ({ ...s, prompts: s.prompts + 1 }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await upd($, s => ({
      ...s,
      running: s.running + 1,
      tools: { ...s.tools, [e.tool]: (s.tools[e.tool] ?? 0) + 1 },
    }))
    const ran = await next(e)
    await upd($, s => ({ ...s, running: s.running - 1 }))

    return ran
  })

  on('turn.start', async ($, e, next) => {
    active.add(e.turnId)
    await upd($, s => ({ ...s, busy: true }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    active.delete(e.turnId)
    if (active.size === 0) await upd($, s => ({ ...s, busy: false }))
    void refreshPr($)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    await upd($, s => ({ ...s, agents: s.agents + 1 }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const pct = e.context.percent ?? 0
    const w = warnState(pct, warned)
    warned = w.warned
    if (w.shouldWarn) $.ui.toast(`Context ${pct}% full, consider /compact`, { timeoutMs: 8000 })
    await upd($, s => ({
      ...s,
      tokens: e.context.tokens ?? s.tokens,
      window: e.context.window,
      costUsd: e.cost?.usd ?? s.costUsd,
    }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = clean(await read($, stats))
    const total = Object.values(s.tools).reduce((a, b) => a + b, 0)
    const pct = s.window ? Math.min(100, Math.round((s.tokens / s.window) * 100)) : 0
    const width = Math.max(0, (e.props.bodyColumns ?? 28) - 8)
    const filled = Math.round((pct / 100) * width)
    const barColor = pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green'
    const cpuFilled = Math.round((Math.min(100, s.cpu) / 100) * width)
    const cpuColor = s.cpu >= 85 ? 'red' : s.cpu >= 60 ? 'yellow' : 'green'
    const memPct = s.memTotalKb ? (s.memUsedKb / s.memTotalKb) * 100 : 0
    const top = Object.entries(s.tools)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, (e.viewport?.rows ?? 30) - 20))
    const { Link, Button } = $.ui.resolve(e)
    const pr = s.pr as Pr | null
    const prState = pr && (pr.state !== 'OPEN' ? [pr.state.toLowerCase(), pr.state === 'MERGED' ? 'magenta' : 'red'] : pr.draft ? ['draft', undefined] : ['open', 'green'])
    const review: [string, string | undefined] | null = !pr
      ? null
      : pr.review === 'CHANGES_REQUESTED'
        ? ['✗ changes requested', 'red']
        : pr.approvals > 0
          ? [`✓ ${pr.approvals} approved`, 'green']
          : ['○ awaiting review', 'yellow']
    const merge = pr && ({ ready: ['✓ ready to merge', 'green'], blocked: ['✗ blocked', 'red'], behind: ['↻ needs rebase', 'yellow'], conflicts: ['✗ conflicts, rebase', 'red'], unstable: [pr.checks === 'fail' ? '! ready, checks failing' : '! ready, checks running', 'yellow'] } as Record<string, [string, string]>)[pr.merge]
    const ci = pr && ({ pass: ['passing', 'green'], fail: ['failing', 'red'], pending: ['running', 'yellow'], none: ['none', undefined] } as Record<string, [string, string | undefined]>)[pr.checks]
    const row = (label: string, value: string, color?: string) => (
      <Box justifyContent="space-between">
        <Text dimColor>{label}</Text>
        <Text bold color={color}>{value}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          {row('Session', `${fmtDur(s.now - s.startedMs)} · ${s.busy ? 'live' : 'idle'}`)}
          {row('Prompts', `${s.prompts}`)}
          {row('Agents', `${s.agents}`, 'magenta')}
        </Box>
        <Box flexDirection="column">
          <Text bold color="cyan">Context</Text>
          <Text>
            <Text color={barColor}>{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(width - filled)}</Text> {pct}%
          </Text>
          {row('Tokens', `${fmt(s.tokens)} / ${fmt(s.window)}`)}
          {row('Cost', `$${s.costUsd.toFixed(2)}`, 'green')}
        </Box>
        <Box flexDirection="column">
          <Text bold color="cyan">
            Tools {total}
            {s.running > 0 ? ` · ${s.running} running` : ''}
          </Text>
          {top.length === 0 && <Text dimColor>none yet</Text>}
          {top.map(([tool, n]) => row(tool, `${n}`))}
        </Box>
        {pr && prState && (
          <Box flexDirection="column">
            <Text bold color="cyan">Pull request</Text>
            <Box justifyContent="space-between">
              <Text>
                <Link href={pr.url}>#{pr.number}</Link>
                <Text color={prState[1]}> {prState[0]}</Text>
              </Text>
              {review && <Text bold color={review[1]}>{review[0]}</Text>}
            </Box>
            {pr.changes + pr.unresolved > 0 && (
              <Box justifyContent="space-between">
                <Text color="red">{[pr.changes > 0 && `✗ ${pr.changes} changes requested`, pr.unresolved > 0 && `${pr.unresolved} unresolved`].filter(Boolean).join(' · ')}</Text>
                <Button key="address" onPress={() => $.prompt.submit({ text: addressPrompt(pr), asUser: true })}>[Address]</Button>
              </Box>
            )}
            {merge && row('Merge', merge[0], merge[1])}
            {ci && pr.checks === 'fail' ? (
              <Box justifyContent="space-between">
                <Text color="red">CI {ci[0]} {pr.done}/{pr.total}</Text>
                <Button key="fixci" onPress={() => $.prompt.submit({ text: fixCiPrompt(pr), asUser: true })}>[Fix CI]</Button>
              </Box>
            ) : ci && row('CI', pr.total ? `${ci[0]} ${pr.done}/${pr.total}` : ci[0], ci[1])}
          </Box>
        )}
        {s.hasSys && (
        <Box flexDirection="column">
          <Text>
            <Text bold color="cyan">System</Text>
          </Text>
          <Text>
            <Text color={cpuColor}>{'█'.repeat(cpuFilled)}</Text>
            <Text dimColor>{'░'.repeat(width - cpuFilled)}</Text> {Math.round(s.cpu)}%
          </Text>
          {row('CPU load', s.load.toFixed(2))}
          {row('Memory', `${gb(s.memUsedKb)} / ${gb(s.memTotalKb)} GB`, memPct >= 85 ? 'red' : undefined)}
        </Box>
        )}
      </Box>
    )
  })
}
