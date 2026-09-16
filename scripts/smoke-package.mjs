// Smoke test for the PACKED artifact: install the tarball into a scratch
// project and load the package entry through its exports.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'dsh-subagent-fork-lite'

function fail(message) {
  console.error(`smoke-package: ${message}`)
  process.exit(1)
}

const outDir = process.argv[2] === undefined
  ? path.join(scriptRoot, '..', 'out')
  : path.resolve(process.argv[2])

if (!existsSync(outDir)) fail(`tarball directory ${outDir} does not exist (run pnpm pack --pack-destination out first)`)
const tarballs = readdirSync(outDir).filter(name => name.endsWith('.tgz'))
if (tarballs.length !== 1) fail(`expected exactly one .tgz in ${outDir}, found ${tarballs.length}`)
const tarball = path.resolve(outDir, tarballs[0])

const pkg = JSON.parse(readFileSync(path.join(scriptRoot, '..', 'package.json'), 'utf8'))

const scratch = mkdtempSync(path.join(tmpdir(), 'dsh-subagent-fork-lite-smoke-'))
const checkFile = path.join(scratch, 'check.mjs')
const PEER_PINS = {
  '@deepseek-ai/dsh-scope': '0.1.5-alpha.1',
  '@deepseek-ai/dsh-typert-protocol': '0.1.5-alpha.1',
}
writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({
  name: 'smoke',
  private: true,
  dependencies: { [PACKAGE_NAME]: `file:${tarball.replace(/\\/g, '/')}`, ...PEER_PINS },
}))
writeFileSync(checkFile, `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve(${JSON.stringify(`${PACKAGE_NAME}/package.json`)}))
const pkgFile = (relative) => path.join(packageRoot, relative)
const tarballName = ${JSON.stringify(tarballs[0])}
const pkgVersion = ${JSON.stringify(pkg.version)}
assert.equal(tarballName, \`${PACKAGE_NAME}-\${pkgVersion}.tgz\`, 'tarball filename must carry the package version')
const main = await import(${JSON.stringify(PACKAGE_NAME)})
assert.equal(main.name, 'subagent-fork-lite', 'node face name')
assert.deepEqual(main.inject, ['subagents'], 'node face inject')
assert.equal(typeof main.apply, 'function', 'node face apply')
assert.equal(typeof main.buildForkLiteSeed, 'function', 'seed helper export')
assert.equal(typeof main.Config, 'function', 'Config schema export')
const installed = JSON.parse(readFileSync(pkgFile('package.json'), 'utf8'))
assert.equal(installed.version, pkgVersion, 'installed package version')
assert.ok(existsSync(pkgFile('lib/index.js')), 'lib/index.js shipped')
assert.ok(existsSync(pkgFile('cordis.patch.yml')), 'bundle patch shipped')
console.log('smoke-package: entry loads, exports resolve, artifact contents verified')
`)
try {
  const install = spawnSync('pnpm', ['install', '--ignore-scripts'], {
    cwd: scratch,
    stdio: 'inherit',
    shell: true,
  })
  if (install.error !== undefined) throw install.error
  if (install.status !== 0) fail(`pnpm install of the tarball failed (exit ${install.status ?? 1})`)
  const load = spawnSync(process.execPath, [checkFile], { cwd: scratch, stdio: 'inherit' })
  if (load.error !== undefined) throw load.error
  if (load.status !== 0) fail(`loading the installed package failed (exit ${load.status ?? 1})`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
