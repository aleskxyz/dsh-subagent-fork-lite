/**
 * Seed builders for fork-lite: completed-turn prefix, last-N-turn window, and
 * seq renumbering so a mid-log slice remains a valid CreateAgentOptions.seed.
 * @module dsh-subagent-fork-lite/seed
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * The balanced completed-turn prefix of a parent's log: every event up to and
 * including the last `turn/end`. The in-flight turn is excluded; before any
 * completed turn the result is empty.
 * @param events - parent session events (seq === array index).
 * @returns contiguous prefix from seq 0, or `[]`.
 */
export function completedTurnPrefix(events: readonly SessionEvent[]): SessionEvent[] {
  const lastEnd = events.findLast(e => e.type === 'turn/end')
  if (lastEnd === undefined) return []
  return events.slice(0, lastEnd.seq + 1)
}

/**
 * Keep only the last `maxCompletedTurns` completed turns from a completed-turn
 * prefix. `0` yields an empty seed (spawn-like). When the prefix has fewer
 * turns than requested, the whole prefix is kept.
 * @param prefix - output of {@link completedTurnPrefix} (balanced, from seq 0).
 * @param maxCompletedTurns - non-negative turn budget.
 * @returns a contiguous turn-aligned slice (original seqs; may start mid-log).
 */
export function windowLastCompletedTurns(
  prefix: readonly SessionEvent[],
  maxCompletedTurns: number,
): SessionEvent[] {
  if (maxCompletedTurns < 0 || !Number.isSafeInteger(maxCompletedTurns)) {
    throw new TypeError(
      `maxCompletedTurns must be a non-negative safe integer, got ${String(maxCompletedTurns)}`,
    )
  }
  if (maxCompletedTurns === 0 || prefix.length === 0) return []

  const endIndexes: number[] = []
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i]?.type === 'turn/end') endIndexes.push(i)
  }
  if (endIndexes.length === 0) return []

  const keep = Math.min(maxCompletedTurns, endIndexes.length)
  const firstKeptEndPos = endIndexes.length - keep
  const previousEndIndex = firstKeptEndPos === 0 ? -1 : endIndexes[firstKeptEndPos - 1]!
  const startIndex = previousEndIndex + 1
  const lastEndIndex = endIndexes[endIndexes.length - 1]!
  return prefix.slice(startIndex, lastEndIndex + 1)
}

/**
 * Rewrite a turn-aligned slice so `seq` is contiguous from 0 (and remap
 * `sourceEventSeqs` by the same offset). Required when the window does not
 * start at the parent's seq 0.
 * @param events - window from {@link windowLastCompletedTurns}.
 * @returns a seed suitable for `startInProcessRun` / `CreateAgentOptions.seed`.
 */
export function renumberSeed(events: readonly SessionEvent[]): SessionEvent[] {
  if (events.length === 0) return []
  const offset = events[0]!.seq
  return events.map((event, index) => {
    const seq = SessionSeq(index)
    // `sourceEventSeqs` is only on surface-eligible variants; older harness
    // typings omit it from the common SessionEvent face, so read via `in`.
    const sources = 'sourceEventSeqs' in event
      ? (event as { sourceEventSeqs?: readonly SessionSeq[] }).sourceEventSeqs
      : undefined
    if (sources === undefined) {
      return { ...event, seq } as SessionEvent
    }
    const sourceEventSeqs = sources.map((source) => {
      const remapped = source - offset
      if (remapped < 0) {
        throw new Error(
          `fork-lite seed window references sourceEventSeq ${source} outside the window (offset ${offset})`,
        )
      }
      return SessionSeq(remapped)
    })
    return { ...event, seq, sourceEventSeqs } as SessionEvent
  })
}

/**
 * Build the fork-lite seed for one parent agent.
 * @param parent - the delegating agent.
 * @param maxCompletedTurns - non-negative turn budget (`0` = empty).
 * @returns seed events, or `[]` when nothing should be inherited.
 */
export function buildForkLiteSeed(parent: Agent, maxCompletedTurns: number): SessionEvent[] {
  // oxlint-disable-next-line typescript/no-deprecated -- Same deferred migration as official fork; sync history readers remain the only seed source today.
  const prefix = completedTurnPrefix(parent.session.snapshotEvents())
  const window = windowLastCompletedTurns(prefix, maxCompletedTurns)
  return renumberSeed(window)
}
