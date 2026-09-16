// Self-contained build for `pnpm run build` / git-install `prepare`.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

function binOf(packageName, binKey) {
  const pkgPath = require.resolve(`${packageName}/package.json`)
  const pkg = require(pkgPath)
  const bin = pkg.bin
  const entry = typeof bin === 'string' ? bin : bin?.[binKey]
  if (entry === undefined) throw new Error(`${packageName} declares no "${binKey}" bin`)
  return path.resolve(path.dirname(pkgPath), entry)
}

function run(bin, args) {
  const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

rmSync(new URL('../lib', import.meta.url), { recursive: true, force: true })

run(binOf('typescript', 'tsc'), ['-p', 'tsconfig.build.json'])
run(binOf('tsdown', 'tsdown'), [])
run(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fix-dts.mjs'), [])
console.log('build complete: lib/types + lib/index.js')
