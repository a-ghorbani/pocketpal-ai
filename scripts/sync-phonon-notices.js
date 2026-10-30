#!/usr/bin/env node
/**
 * Copies the Phonon add-on's third-party notices into the app bundle, split
 * at each `## ` heading so the About screen can render one section per Text.
 * `sections.join('')` is the installed file byte for byte; a unit test fails
 * when they drift. Re-run after bumping the add-on.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(
  ROOT,
  'node_modules',
  '@pocketpalai',
  'react-native-speech-phonon',
  'docs',
  'THIRD_PARTY_NOTICES.md',
);
const TARGET = path.join(
  ROOT,
  'src',
  'assets',
  'licenses',
  'phononThirdPartyNotices.json',
);

const sections = fs.readFileSync(SOURCE, 'utf8').split(/(?=^## )/m);
fs.writeFileSync(TARGET, JSON.stringify(sections, null, 2) + '\n');
console.log(
  `Wrote ${sections.length} sections to ${path.relative(ROOT, TARGET)}`,
);
