// Renders ROADMAP.md from prd.json so the roadmap can never drift from the
// spec. Run with npm run roadmap after changing prd.json.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const prd = JSON.parse(fs.readFileSync(path.join(ROOT, 'prd.json'), 'utf8'));

// A story is "built, awaiting live verification" when its notes record a
// build or partial verification but passes has not flipped yet.
function bucket(story) {
  if (story.passes) return 'done';
  if (/Built|Live-verified|Verified/i.test(story.notes || '')) return 'awaiting';
  return 'planned';
}

const groups = { done: [], awaiting: [], planned: [] };
for (const s of prd.stories) groups[bucket(s)].push(s);

const line = (s, mark) => `- [${mark}] **${s.id}** ${s.title}`;

const out = [];
out.push('# Murmur Roadmap');
out.push('');
out.push(`> Generated from prd.json (${groups.done.length}/${prd.stories.length} stories verified). Do not edit by hand: change prd.json, then run \`npm run roadmap\`.`);
out.push('');
out.push('## Done and verified');
out.push('');
for (const s of groups.done) out.push(line(s, 'x'));
out.push('');
out.push('## Built, awaiting live verification');
out.push('');
out.push('Each of these works in the required smoke checks; the remaining step is a human loop noted in prd.json.');
out.push('');
for (const s of groups.awaiting) out.push(line(s, ' '));
out.push('');
out.push('## Planned');
out.push('');
for (const s of groups.planned) out.push(line(s, ' '));
out.push('');
out.push('## Horizon (not yet stories)');
out.push('');
out.push('- [ ] iOS app + Murmur keyboard: native Swift, keyboard extension with the containing-app mic bounce (the Wispr Flow shape), shared formatter spec extracted to shared/ first. Gets its own prd-ios.json in this repo.');
out.push('- [ ] Paid tier sold outside the Mac App Store: license keys via a merchant of record (Lemon Squeezy or Polar shortlisted, both $0 upfront). Free forever from source.');
out.push('- [ ] Marketing: repo transfer to the public-facing account, README as landing page, SEO pass, launch content.');
out.push('');

fs.writeFileSync(path.join(ROOT, 'ROADMAP.md'), out.join('\n'));
console.log(`ROADMAP.md written: ${groups.done.length} done, ${groups.awaiting.length} awaiting live verification, ${groups.planned.length} planned`);
