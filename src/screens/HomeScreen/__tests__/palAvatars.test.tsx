import {isValidElement} from 'react';

import {mockLocalPal} from '../../../../jest/fixtures/pals';
import {palAvatarArt} from '../palAvatars';

describe('palAvatarArt', () => {
  it('returns mascot art for the default Pip pal', () => {
    const pip = {...mockLocalPal, name: 'Pip', source: 'local' as const};
    expect(isValidElement(palAvatarArt(pip))).toBe(true);
  });

  it('returns null for a pal without bundled art', () => {
    const lookie = {...mockLocalPal, name: 'Lookie', source: 'local' as const};
    expect(palAvatarArt(lookie)).toBeNull();
  });

  it('returns null for a non-default local pal', () => {
    expect(palAvatarArt(mockLocalPal)).toBeNull();
  });
});
