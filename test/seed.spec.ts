import { describe, expect, it } from 'vitest'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  buildForkLiteSeed,
  completedTurnPrefix,
  renumberSeed,
  windowLastCompletedTurns,
} from '../src/seed.ts'

/** Minimal event factory — seed helpers only care about type/seq/sourceEventSeqs. */
function ev(
  seq: number,
  type: SessionEvent['type'],
  data: unknown = {},
  extra: Record<string, unknown> = {},
): SessionEvent {
  return {
    type,
    seq: SessionSeq(seq),
    time: 1_000 + seq,
    data,
    ...extra,
  } as SessionEvent
}

/** Three completed turns: each is turn/start, user/message, turn/end. */
function threeCompletedTurns(): SessionEvent[] {
  const out: SessionEvent[] = []
  let seq = 0
  for (let turn = 1; turn <= 3; turn += 1) {
    out.push(ev(seq++, 'turn/start', { turn }))
    out.push(ev(seq++, 'user/message', { message: { role: 'user', content: [{ type: 'text', text: `q${turn}` }] } }, { surfaceOp: 'append' }))
    out.push(ev(seq++, 'turn/end', { turn, reason: { kind: 'completed' } }))
  }
  return out
}

describe('completedTurnPrefix', () => {
  it('returns [] when no turn has completed', () => {
    const events = [
      ev(0, 'turn/start', { turn: 1 }),
      ev(1, 'user/message', { message: { role: 'user', content: [{ type: 'text', text: 'open' }] } }, { surfaceOp: 'append' }),
    ]
    expect(completedTurnPrefix(events)).toEqual([])
  })

  it('excludes the open turn after the last turn/end', () => {
    const completed = threeCompletedTurns()
    const open = [
      ...completed,
      ev(completed.length, 'turn/start', { turn: 4 }),
      ev(completed.length + 1, 'user/message', { message: { role: 'user', content: [{ type: 'text', text: 'open' }] } }, { surfaceOp: 'append' }),
    ]
    const prefix = completedTurnPrefix(open)
    expect(prefix).toHaveLength(completed.length)
    expect(prefix.at(-1)?.type).toBe('turn/end')
    expect(prefix.filter(e => e.type === 'turn/end')).toHaveLength(3)
  })
})

describe('windowLastCompletedTurns', () => {
  it('returns [] for maxCompletedTurns 0', () => {
    expect(windowLastCompletedTurns(threeCompletedTurns(), 0)).toEqual([])
  })

  it('keeps only the last completed turn', () => {
    const prefix = threeCompletedTurns()
    const window = windowLastCompletedTurns(prefix, 1)
    expect(window.filter(e => e.type === 'turn/end')).toHaveLength(1)
    expect(window[0]?.type).toBe('turn/start')
    expect(window.at(-1)?.type).toBe('turn/end')
    const user = window.find(e => e.type === 'user/message')
    expect(user).toBeDefined()
    expect(JSON.stringify(user?.data)).toContain('q3')
  })

  it('keeps the last two completed turns', () => {
    const prefix = threeCompletedTurns()
    const window = windowLastCompletedTurns(prefix, 2)
    expect(window.filter(e => e.type === 'turn/end')).toHaveLength(2)
    const texts = window
      .filter(e => e.type === 'user/message')
      .map(e => JSON.stringify(e.data))
    expect(texts.some(t => t.includes('q2'))).toBe(true)
    expect(texts.some(t => t.includes('q3'))).toBe(true)
    expect(texts.some(t => t.includes('q1'))).toBe(false)
  })

  it('returns the full prefix when the budget exceeds turn count', () => {
    const prefix = threeCompletedTurns()
    expect(windowLastCompletedTurns(prefix, 99)).toEqual(prefix)
  })

  it('rejects a negative budget', () => {
    expect(() => windowLastCompletedTurns(threeCompletedTurns(), -1)).toThrow(TypeError)
  })
})

describe('renumberSeed', () => {
  it('rewrites seq to 0..k for a mid-log window', () => {
    const prefix = threeCompletedTurns()
    const window = windowLastCompletedTurns(prefix, 1)
    expect(window[0]!.seq).toBeGreaterThan(0)
    const seed = renumberSeed(window)
    expect(seed.map(e => e.seq)).toEqual(seed.map((_, i) => i))
    expect(seed.at(-1)?.type).toBe('turn/end')
  })

  it('is a no-op identity on seq when the window already starts at 0', () => {
    const prefix = threeCompletedTurns()
    const seed = renumberSeed(prefix)
    expect(seed.map(e => e.seq)).toEqual(prefix.map((_, i) => i))
  })

  it('remaps sourceEventSeqs by the window offset', () => {
    const events: SessionEvent[] = [
      ev(10, 'turn/start', { turn: 2 }),
      ev(11, 'assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] } }, { surfaceOp: 'append' }),
      ev(12, 'tool/call', { callId: 'c1', name: 'bash', arguments: {} }, { surfaceOp: 'append', sourceEventSeqs: [SessionSeq(11)] }),
      ev(13, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ]
    const seed = renumberSeed(events)
    expect(seed.map(e => e.seq)).toEqual([0, 1, 2, 3])
    const tool = seed.find(e => e.type === 'tool/call')
    expect(tool?.sourceEventSeqs).toEqual([SessionSeq(1)])
  })

  it('throws when sourceEventSeqs point outside the window', () => {
    const events: SessionEvent[] = [
      ev(5, 'turn/start', { turn: 2 }),
      ev(6, 'tool/call', { callId: 'c1', name: 'bash', arguments: {} }, { surfaceOp: 'append', sourceEventSeqs: [SessionSeq(2)] }),
      ev(7, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ]
    expect(() => renumberSeed(events)).toThrow(/outside the window/)
  })
})

describe('fork-lite seed pipeline (invariant-clean shape)', () => {
  it('produces a balanced contiguous-from-0 seed from a mid-session parent log', () => {
    const openParent = [
      ...threeCompletedTurns(),
      ev(9, 'turn/start', { turn: 4 }),
      ev(10, 'user/message', { message: { role: 'user', content: [{ type: 'text', text: 'in flight' }] } }, { surfaceOp: 'append' }),
    ]
    const prefix = completedTurnPrefix(openParent)
    const window = windowLastCompletedTurns(prefix, 2)
    const seed = renumberSeed(window)

    expect(seed.filter(e => e.type === 'turn/start')).toHaveLength(2)
    expect(seed.filter(e => e.type === 'turn/end')).toHaveLength(2)
    expect(seed[0]?.seq).toBe(0)
    expect(seed.map(e => e.seq)).toEqual(seed.map((_, i) => i))
    expect(seed.at(-1)?.type).toBe('turn/end')
    expect(JSON.stringify(seed)).not.toContain('in flight')
  })
})

describe('buildForkLiteSeed', () => {
  function parentWith(events: SessionEvent[]): Agent {
    return {
      session: {
        snapshotEvents: () => events,
      },
    } as unknown as Agent
  }

  it('returns [] when maxCompletedTurns is 0', () => {
    expect(buildForkLiteSeed(parentWith(threeCompletedTurns()), 0)).toEqual([])
  })

  it('windows and renumbers through the Agent session face', () => {
    const open = [
      ...threeCompletedTurns(),
      ev(9, 'turn/start', { turn: 4 }),
      ev(10, 'user/message', { message: { role: 'user', content: [{ type: 'text', text: 'in flight' }] } }, { surfaceOp: 'append' }),
    ]
    const seed = buildForkLiteSeed(parentWith(open), 1)
    expect(seed.map(e => e.seq)).toEqual(seed.map((_, i) => i))
    expect(seed.filter(e => e.type === 'turn/end')).toHaveLength(1)
    expect(JSON.stringify(seed)).toContain('q3')
    expect(JSON.stringify(seed)).not.toContain('in flight')
  })
})
