#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Regenerates each roadmap from its prd: ROADMAP.md from prd.json, and
// ios/ROADMAP.md from ios/prd.json. Never edit a roadmap by hand.
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const ROADMAPS = [
  { prd: 'prd.json', out: 'ROADMAP.md' },
  { prd: 'ios/prd.json', out: 'ios/ROADMAP.md' }
]

const line = (s, checked) => `- [${checked ? 'x' : ' '}] **${s.id}** ${s.title}`

for (const { prd: prdPath, out: outPath } of ROADMAPS) {
  const prd = JSON.parse(readFileSync(join(root, prdPath), 'utf8'))

  const done = prd.stories.filter((s) => s.passes)
  const awaiting = prd.stories.filter((s) => !s.passes && s.needs_human && s.notes.includes('automated criteria verified'))
  const todo = prd.stories.filter((s) => !s.passes && !awaiting.includes(s))

  const out = [
    `# ${prd.project} Roadmap`,
    '',
    `> Generated from ${prdPath} (${done.length}/${prd.stories.length} stories verified). Do not edit by hand: change ${prdPath}, then run \`npm run roadmap\`.`,
    '',
    '## Done and verified',
    '',
    ...(done.length ? done.map((s) => line(s, true)) : ['(none yet)']),
    '',
    '## Built, awaiting live verification',
    '',
    `Automated criteria pass; the remaining step is a human loop noted in ${prdPath} and HANDOFF.md.`,
    '',
    ...(awaiting.length ? awaiting.map((s) => line(s, false)) : ['(none yet)']),
    '',
    '## To do',
    '',
    ...(todo.length ? todo.map((s) => line(s, false)) : ['(none, ship it)']),
    ''
  ].join('\n')

  writeFileSync(join(root, outPath), out)
  console.log(`${outPath} written: ${done.length} done, ${awaiting.length} awaiting human, ${todo.length} todo`)
}
