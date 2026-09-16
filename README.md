# dsh-subagent-fork-lite

In-process DeepSeek Harness subagent provider that seeds each child with a **bounded window** of the parent’s completed conversation — the last N finished turns — instead of the entire transcript.

Registered by default as `fork-lite` on `ctx.subagents`.

## Support matrix

| Harness tag | npm package line | Typecheck | Unit tests | Notes |
|---|---|---|---|---|
| `dsh-v0.1.2-rc.1` | `0.1.2-rc.1` | pass | pass | `sourceEventSeqs` remapping uses a version-safe read |
| `dsh-v0.1.5-rc.2` | `0.1.5-rc.2` | pass | pass | Primary dev/CI pin |
| `dsh-v0.1.6-alpha.1` | `0.1.6-alpha.1` | pass | pass | `session.snapshotEvents()` deprecated but still used (same as stock `fork`) |

No native harness seed-window API exists on these lines — this plugin remains the bounded-seed provider.

## Features

- **Turn-window seed** — configure how many completed parent turns the child inherits (`maxCompletedTurns`)
- **Stable mid-session cuts** — the open (in-flight) parent turn is never seeded; only balanced history through the last `turn/end`
- **Valid session seeds** — window events are renumbered so `seq` is contiguous from `0` (including remapped `sourceEventSeqs`)
- **In-process child** — depth limit, tool filter, persona, structured output, and per-start `agentOptions`
- **Context inheritance flag** — advertises `inheritsParentContext: true` when a seed is used
- **Named presets** — mount multiple instances with different `providerName` / `maxCompletedTurns` values

## Quick start

```sh
# git channel (latest main)
dsh plugin --profile web add "github:aleskxyz/dsh-subagent-fork-lite#main"

# or from npm (when published)
dsh plugin --profile web add dsh-subagent-fork-lite

# restart the profile, then verify the row
dsh --profile web --dump-config | grep -A6 'id: subagent-fork-lite'
```

Start a child with provider name `fork-lite` (see [Usage](#usage)).

## Install & uninstall

- **git channel** (latest `main`): `dsh plugin --profile web add "github:aleskxyz/dsh-subagent-fork-lite#main"` — the package `prepare` script builds with production dependencies; approve `esbuild` (and any other keys the CLI prints) if install stops on `ERR_PNPM_IGNORED_BUILDS`.
- **npm channel** (published releases): `dsh plugin --profile web add dsh-subagent-fork-lite`.
- **tarball channel**: `pnpm pack` in this repo, then `dsh plugin --profile web add ./dsh-subagent-fork-lite-<version>.tgz`.
- **uninstall**: `dsh plugin --profile web remove dsh-subagent-fork-lite` (or remove the row from the profile patch).

Or insert the package into your profile patch (see [`cordis.patch.yml`](cordis.patch.yml)).

## Configuration

All tunables are Schemastery `Config` fields (changeable from cordis.yml). An **id-targeted override replaces the whole config row** — restate every key you need.

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

## Tools & surfaces

| Surface | Kind | Notes |
|---|---|---|
| `fork-lite` (configurable) | subagent provider | Registered on `ctx.subagents`; used via `subagents.start(providerName, …)` |
| `cordis.patch.yml` | bundle patch | Default insert row for profile install |

No commands, session projections, or client UI.

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

## Known limitations

- Seed policy is Cordis config only — not a field on each `start()` call. Use multiple mounted provider names for discrete budgets.
- Window size is measured in **completed turns**, not characters or tokens.
- A window that includes surface replaces whose `sourceEventSeqs` point outside the window cannot be renumbered and will fail seed construction.
- On `0.1.6-alpha.1+`, synchronous `session.snapshotEvents()` is deprecated; this provider still uses it (same deferred migration as stock `fork`).
- Fresh AGENTS.md / runtime injects after start are separate from the seed (`agent/pre-step`); callers that need isolation must filter those themselves.

## License

Apache-2.0
