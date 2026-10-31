import fs from 'fs';
import path from 'path';

import sections from '../../../assets/licenses/phononThirdPartyNotices.json';

const INSTALLED_NOTICES = path.join(
  __dirname,
  '../../../../node_modules/@pocketpalai/react-native-speech-phonon/docs/THIRD_PARTY_NOTICES.md',
);

describe('bundled Phonon third-party notices', () => {
  it('match the installed add-on notices byte for byte', () => {
    const installed = fs.readFileSync(INSTALLED_NOTICES, 'utf8');
    const bundled = sections.join('');
    if (bundled !== installed) {
      throw new Error(
        'src/assets/licenses/phononThirdPartyNotices.json is out of date; run `node scripts/sync-phonon-notices.js`',
      );
    }
  });

  it('start every section after the first at a heading', () => {
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections.slice(1)) {
      expect(section.startsWith('## ')).toBe(true);
    }
  });
});
