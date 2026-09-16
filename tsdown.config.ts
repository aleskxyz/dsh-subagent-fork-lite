/**
 * Build face for dsh-subagent-fork-lite (host Loader entry only).
 */

import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-subagent-fork-lite'

export default defineConfig([
  {
    name: PLUGIN_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: false,
    deps: {
      neverBundle: [/^node:/, /^@deepseek-ai\//],
    },
  },
])
