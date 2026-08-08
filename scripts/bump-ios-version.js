// One place to bump the iOS version: rewrites MARKETING_VERSION and
// CURRENT_PROJECT_VERSION across every configuration in the pbxproj in
// lockstep, so the app, keyboard, and tests can never drift apart
// (App Store Connect rejects mismatched extension versions).
//
//   node scripts/bump-ios-version.js 0.2.0        (build auto-increments)
//   node scripts/bump-ios-version.js 0.2.0 7      (build set explicitly)
'use strict';

const fs = require('fs');
const path = require('path');

const PBXPROJ = path.join(__dirname, '..', 'ios', 'Murmur.xcodeproj', 'project.pbxproj');

const version = process.argv[2];
if (!version || !/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error('usage: node scripts/bump-ios-version.js <marketing-version> [build-number]');
  process.exit(1);
}

let text = fs.readFileSync(PBXPROJ, 'utf8');

const current = text.match(/CURRENT_PROJECT_VERSION = (\d+);/);
const build = process.argv[3]
  ? parseInt(process.argv[3], 10)
  : (current ? parseInt(current[1], 10) + 1 : 1);

const before = {
  marketing: (text.match(/MARKETING_VERSION = ([^;]+);/) || [])[1],
  build: current ? current[1] : '?',
};

text = text.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
text = text.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
fs.writeFileSync(PBXPROJ, text);

console.log(`iOS version: ${before.marketing} (${before.build}) -> ${version} (${build})`);
