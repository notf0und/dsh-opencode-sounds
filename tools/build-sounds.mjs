#!/usr/bin/env node
/**
 * Regenerate the embedded opencode sound pack inside lib/client.js.
 *
 * The client bundle is shipped as a single CJS factory with no relative-module
 * resolver, so the MP3s cannot be required at runtime: they are inlined as
 * `data:audio/mpeg;base64,...` URLs between the @generated markers.
 *
 * Source files live in assets/audio/ (copied from opencode's
 * packages/ui/src/assets/audio at the tag recorded in assets/audio/PROVENANCE.md).
 *
 * Usage: node tools/build-sounds.mjs [--check]
 *   --check  fail if lib/client.js is out of date instead of rewriting it
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientPath = join(root, 'lib', 'client.js')
const audioDir = join(root, 'assets', 'audio')

const START = '// @generated:opencode-sounds start'
const END = '// @generated:opencode-sounds end'

const client = readFileSync(clientPath, 'utf8')

// The client file is the single source of truth for the pack layout.
const groupsMatch = client.match(/var SOUND_GROUPS = (\[[\s\S]*?\n    \])/)
if (!groupsMatch) throw new Error('lib/client.js: SOUND_GROUPS literal not found')
const groups = new Function(`return ${groupsMatch[1]}`)()

const two = (n) => (n < 10 ? `0${n}` : String(n))
const keys = []
for (const group of groups) {
  for (let i = 1; i <= group.count; i++) keys.push(`${group.prefix}-${two(i)}`)
}

const entries = keys.map((key) => {
  const file = join(audioDir, `${key}.mp3`)
  if (!existsSync(file)) throw new Error(`missing audio asset: assets/audio/${key}.mp3`)
  const base64 = readFileSync(file).toString('base64')
  return `      '${key}': 'data:audio/mpeg;base64,${base64}',`
})

const generated = [
  `${START} - rebuilt from assets/audio/*.mp3 by tools/build-sounds.mjs`,
  '    var SOUND_SRC = {',
  ...entries,
  '    }',
  `    ${END}`,
].join('\n')

const start = client.indexOf(START)
const end = client.indexOf(END)
if (start < 0 || end < 0 || end < start) throw new Error('lib/client.js: generated markers not found')

const next = `${client.slice(0, start)}${generated}${client.slice(end + END.length)}`
const checkOnly = process.argv.includes('--check')

if (next === client) {
  console.log(`sound pack up to date (${keys.length} sounds, ${(Buffer.byteLength(generated) / 1024).toFixed(0)} KiB embedded)`)
  process.exit(0)
}
if (checkOnly) {
  console.error('lib/client.js is out of date; run: node tools/build-sounds.mjs')
  process.exit(1)
}
writeFileSync(clientPath, next)
console.log(`embedded ${keys.length} opencode sounds into lib/client.js (${(Buffer.byteLength(generated) / 1024).toFixed(0)} KiB)`)
