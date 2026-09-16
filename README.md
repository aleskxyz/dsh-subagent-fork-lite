# dsh-subagent-fork-lite

In-process DeepSeek Harness subagent provider that seeds each child with a **bounded window** of the parent’s completed conversation — the last N finished turns — instead of the entire transcript.

Registered by default as `fork-lite` on `ctx.subagents`.

## Features

- **Turn-window seed** — configure how many completed parent turns the child inherits (`maxCompletedTurns`)
- **Stable mid-session cuts** — the open (in-flight) parent turn is never seeded; only balanced history through the last `turn/end`
- **Valid session seeds** — window events are renumbered so `seq` is contiguous from `0` (including remapped `sourceEventSeqs`)
- **In-process child** — same run driver as other in-process backends: depth limit, tool filter, persona, structured output, and per-start `agentOptions`
- **Context inheritance flag** — advertises `inheritsParentContext: true` when a seed is used, so tooling can describe the child accurately
- **Named presets** — mount multiple instances with different `providerName` / `maxCompletedTurns` values for discrete budgets

## Install

```sh
dsh plugin --profile web add dsh-subagent-fork-lite
```

Or insert the package into your profile patch (see [`cordis.patch.yml`](cordis.patch.yml)).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `fork-lite` | Name registered on `ctx.subagents` |
| `maxCompletedTurns` | `2` | Number of completed parent turns to seed; `0` seeds nothing |

```yaml
- insert:
    - id: subagent-fork-lite
      name: dsh-subagent-fork-lite
      config:
        providerName: fork-lite
        maxCompletedTurns: 2
```

### Multiple budgets

Seed size is fixed per mounted instance. For different windows, mount more than one row:

```yaml
- insert:
    - id: subagent-fork-lite-2
      name: dsh-subagent-fork-lite
      config:
        providerName: fork-lite-2
        maxCompletedTurns: 2
    - id: subagent-fork-lite-5
      name: dsh-subagent-fork-lite
      config:
        providerName: fork-lite-5
        maxCompletedTurns: 5
```

Then start with the provider name you need.

## Usage

```ts
const run = await ctx.subagents.start('fork-lite', {
  parent,
  prompt: [{ type: 'text', text: 'Your task for the child…' }],
  signal,
  // optional per-start route overrides:
  agentOptions: { provider: 'deepseek-official', model: '…' },
  // optional: toolFilter, persona, outputSchema, maxDepth, label
})

const result = await run.result
await run.dispose()
```

Omit `agentOptions` to inherit the parent’s LLM provider and model.

## How seeding works

1. Read the parent session log through the last `turn/end` (completed-turn prefix).
2. Keep only the last `maxCompletedTurns` of those turns.
3. Renumber event `seq` values to `0…k` so the child session accepts the seed.
4. Hand the seed to the in-process run driver; the child’s first user message is your `prompt`.

The child then runs in its own session. Later parent turns are not shared live — the seed is a one-time snapshot at start.

### What the seed contains

Within the kept turns, the child receives the parent’s logged events (user/assistant messages, tool calls/results, turn markers, and other events in that window). Surface history derived from those events is what the model sees.

### What it does not contain

- Parent turns older than the window
- The parent’s current open turn
- Custom or synthetic messages defined outside the parent log

## Capabilities

| Capability | Supported |
|---|---|
| `agentOptions` | yes |
| `outputSchema` | yes |
| `depthLimit` | yes |
| `toolFilter` | yes |
| `persona` | yes |
| Continuable prep (`prepareContinuable`) | yes (seed captured once at creation) |

## Limits

- Seed policy is Cordis config only — not a field on each `start()` call
- Window size is measured in **completed turns**, not characters or tokens
- A window that includes surface replaces whose `sourceEventSeqs` point outside the window cannot be renumbered and will fail seed construction
