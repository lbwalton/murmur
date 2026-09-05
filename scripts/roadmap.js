#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Regenerates ROADMAP.md from prd.json. Never edit ROADMAP.md by hand.
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const prd = JSON.parse(readFileSync(join(root, 'prd.json'), 'utf8'))

const done = prd.stories.filter((s) => s.passes)
const awaiting = prd.stories.filter((s) => !s.passes && s.needs_human && s.notes.includes('automated criteria verified'))
const todo = prd.stories.filter((s) => !s.passes && !awaiting.includes(s))

const line = (s, checked) => `- [${checked ? 'x' : ' '}] **${s.id}** ${s.title}`

const out = [
  `# ${prd.project} Roadmap`,
  '',
  `> Generated from prd.json (${done.length}/${prd.stories.length} stories verified). Do not edit by hand: change prd.json, then run \`npm run roadmap\`.`,
  '',
  '## Done and verified',
  '',
  ...(done.length ? done.map((s) => line(s, true)) : ['(none yet)']),
  '',
  '## Built, awaiting live verification',
  '',
  'Automated criteria pass; the remaining step is a human loop noted in prd.json and HANDOFF.md.',
  '',
  ...(awaiting.length ? awaiting.map((s) => line(s, false)) : ['(none yet)']),
  '',
  '## To do',
  '',
  ...(todo.length ? todo.map((s) => line(s, false)) : ['(none, ship it)']),
  ''
].join('\n')

writeFileSync(join(root, 'ROADMAP.md'), out)
console.log(`ROADMAP.md written: ${done.length} done, ${awaiting.length} awaiting human, ${todo.length} todo`)
