# Changelog

## Unreleased

- Bump `vitest` / `@vitest/coverage-v8` to `^5.0.1` (fixes GHSA-82fw-gwwq-j7x9).
- Harden CI supply chain: pin Actions by commit SHA, tighten workflow token permissions, add CodeQL + `SECURITY.md`.
- Publish checkout uses `persist-credentials: false` under `contents: write`; clarify Dependabot `@types/node` major ignore.

## 0.1.0

- Initial release: in-process `fork-lite` subagent provider with `maxCompletedTurns` seed window.
