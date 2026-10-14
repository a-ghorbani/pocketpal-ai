import type {SharedValue} from 'react-native-reanimated';

import {resolveSnapPoints} from '../snapPoints';

describe('resolveSnapPoints', () => {
  it.each([0, 50])(
    'resolves a percentage against the container height (inset %i)',
    insetsTop => {
      expect(resolveSnapPoints(['50%'], 2424, insetsTop)).toEqual([1212]);
    },
  );

  it('caps a percentage at the full-height snap point', () => {
    expect(resolveSnapPoints(['92%'], 1000, 100)).toEqual([884]);
  });

  it('passes numeric snap points through', () => {
    expect(resolveSnapPoints([300, '50%'], 2424, 0)).toEqual([300, 1212]);
  });

  it('returns undefined unchanged', () => {
    expect(resolveSnapPoints(undefined, 2424, 0)).toBeUndefined();
  });

  it('returns a shared value unchanged', () => {
    const shared = {value: ['50%']} as unknown as SharedValue<
      Array<string | number>
    >;

    expect(resolveSnapPoints(shared, 2424, 0)).toBe(shared);
  });
});
