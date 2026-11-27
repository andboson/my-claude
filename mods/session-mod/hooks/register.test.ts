import { expect, test } from 'claude-code/testing'

import { countUnresolved, fmt, fmtDur, gb, parsePr, warnState } from './format'


test('formats durations, tokens and memory', () => {
  expect(fmtDur(0)).toBe('0m')
  expect(fmtDur(59 * 60000)).toBe('59m')
  expect(fmtDur(72 * 60000)).toBe('1h 12m')
  expect(fmtDur(-5)).toBe('0m')
  expect(fmt(999)).toBe('999')
  expect(fmt(42100)).toBe('42.1k')
  expect(gb(1048576)).toBe('1.0')
})

test('context warning fires once, re-arms below 70%', () => {
  let w = warnState(80, false)
  expect(w.shouldWarn).toBe(false)
  w = warnState(86, w.warned)
  expect(w.shouldWarn).toBe(true)
  w = warnState(90, w.warned)
  expect(w.shouldWarn).toBe(false)
  w = warnState(75, w.warned)
  expect(w.warned).toBe(true)
  w = warnState(60, w.warned)
  expect(w.warned).toBe(false)
  expect(warnState(88, w.warned).shouldWarn).toBe(true)
})

const mount = async ($: any) =>
  $.ui.mount({
    plugin: 'session-mod',
    surface: 'terminal',
    component: 'Pane',
    props: {},
    requestId: 'session-mod',
  })

test('pane shows zeroed stats and the session row', async $ => {
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Prompts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Tools 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /idle/ })).toBeDefined()
  // no /proc reading yet: the System section stays hidden
  expect(await ui.find({ type: 'Text', text: /System/ })).toBeUndefined()
  await ui.unmount()
})

test('a tool call is counted and shows in the pane', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.md' } as never)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Tools 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Read$/ })).toBeDefined()
  await ui.unmount()
})

test('parses gh pr json into review and CI state', () => {
  const j = (o: object) => JSON.stringify({ number: 7, url: 'https://github.com/o/r/pull/7', state: 'OPEN', ...o })
  expect(parsePr('not json')).toBeUndefined()
  expect(parsePr('{}')).toBeUndefined()
  expect(parsePr(j({}))!.checks).toBe('none')
  const ok = { status: 'COMPLETED', conclusion: 'SUCCESS' }
  const run = { status: 'IN_PROGRESS', conclusion: '' }
  expect(parsePr(j({ statusCheckRollup: [ok, ok] }))!.checks).toBe('pass')
  expect(parsePr(j({ statusCheckRollup: [ok, run] }))).toMatchObject({ checks: 'pending', done: 1, total: 2 })
  expect(parsePr(j({ statusCheckRollup: [ok, run, { conclusion: 'FAILURE' }] }))!.checks).toBe('fail')
  expect(parsePr(j({ statusCheckRollup: [{ state: 'SUCCESS' }], reviewDecision: 'APPROVED', isDraft: true }))).toMatchObject({ checks: 'pass', review: 'APPROVED', draft: true })
})

test('counts each reviewer\'s latest approval', () => {
  const j = (reviews: object[]) => JSON.stringify({ number: 1, url: 'u', state: 'OPEN', reviews })
  const r = (login: string, state: string, authorAssociation = 'MEMBER') => ({ author: { login }, authorAssociation, state })
  expect(parsePr(j([]))!.approvals).toBe(0)
  expect(parsePr(j([r('a', 'APPROVED'), r('b', 'APPROVED')]))!.approvals).toBe(2)
  expect(parsePr(j([r('a', 'APPROVED'), r('a', 'CHANGES_REQUESTED')]))!.approvals).toBe(0)
  expect(parsePr(j([r('a', 'APPROVED'), r('a', 'COMMENTED')]))!.approvals).toBe(1)
  expect(parsePr(j([r('codescene-access', 'APPROVED', 'NONE'), r('x[bot]', 'APPROVED', 'MEMBER')]))!.approvals).toBe(0)
})

test('maps GitHub merge state to what to do next', () => {
  const m = (mergeStateStatus: string, mergeable = 'UNKNOWN') =>
    parsePr(JSON.stringify({ number: 1, url: 'u', state: 'OPEN', mergeStateStatus, mergeable }))!.merge
  expect(m('CLEAN', 'MERGEABLE')).toBe('ready')
  expect(m('BLOCKED')).toBe('blocked')
  expect(m('BEHIND')).toBe('behind')
  expect(m('DIRTY', 'CONFLICTING')).toBe('conflicts')
  expect(m('UNSTABLE')).toBe('unstable')
  expect(m('UNKNOWN')).toBe('')
})

test('counts changes requested by anyone and unresolved threads', () => {
  const r = (login: string, state: string) => ({ author: { login }, authorAssociation: 'NONE', state })
  const pr = parsePr(JSON.stringify({ number: 1, url: 'u', state: 'OPEN', reviews: [r('copilot', 'CHANGES_REQUESTED'), r('claude', 'CHANGES_REQUESTED'), r('claude', 'APPROVED'), r('h', 'COMMENTED')] }))!
  expect(pr.changes).toBe(1)
  const t = (...flags: boolean[]) => JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: flags.map(isResolved => ({ isResolved })) } } } } })
  expect(countUnresolved(t(false, true, false))).toBe(2)
  expect(countUnresolved(t())).toBe(0)
  expect(countUnresolved('oops')).toBe(0)
})
