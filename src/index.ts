/**
 * `dsh-subagent-fork-lite` — in-process subagent backend like harness `fork`,
 * but seeds only the last N completed parent turns (configurable).
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`, and a stray default would discard
 * `name`/`inject`/`Config`/`apply`).
 * @module dsh-subagent-fork-lite
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  ContinuableCreateRequest,
  ContinuableCreateSpec,
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import { startInProcessRun } from '@deepseek-ai/dsh-subagent-in-process-driver'
import { buildForkLiteSeed } from './seed.ts'

export { buildForkLiteSeed, completedTurnPrefix, renumberSeed, windowLastCompletedTurns } from './seed.ts'

export const name = 'subagent-fork-lite'
// `tools` is deliberately NOT injected — same rationale as the official
// fork/spawn backends: structured-output capture gates on `tools` itself.
export const inject = ['subagents']

/** Cordis config for the fork-lite provider. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `fork-lite`). */
  providerName: string
  /**
   * Maximum number of completed parent turns to seed. `0` yields an empty seed
   * (spawn-like). Default `2`.
   */
  maxCompletedTurns: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().default('fork-lite'),
  maxCompletedTurns: z.natural().default(2),
})

/**
 * In-process provider: same capabilities as official fork, truncated seed.
 */
class ForkLiteInProcessProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = {
    agentOptions: true,
    outputSchema: true,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  }
  // Descriptive: when the seed is non-empty the child sees parent history.
  readonly inheritsParentContext = true

  constructor(
    readonly name: string,
    readonly maxCompletedTurns: number,
  ) {}

  start(request: ResolvedSubagentStartRequest) {
    const seed = buildForkLiteSeed(request.parent, this.maxCompletedTurns)
    return startInProcessRun(request, seed.length > 0 ? { seed } : {})
  }

  prepareContinuable(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec> {
    const seed = buildForkLiteSeed(request.parent, this.maxCompletedTurns)
    return Promise.resolve(seed.length > 0 ? { seed } : {})
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(
    new ForkLiteInProcessProvider(config.providerName, config.maxCompletedTurns),
  )
}
