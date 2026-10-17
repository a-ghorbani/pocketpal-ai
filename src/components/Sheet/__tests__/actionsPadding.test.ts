import {ANIMATION_CONFIGS, KEYBOARD_STATUS} from '@gorhom/bottom-sheet';

import {
  actionsBottomPadding,
  isLifted,
  keyboardAnimationConfig,
  type PaddingInputs,
  paddingUpdate,
} from '../actionsPadding';

const INSET = 34;
const HIGHEST = 16;

const inputs = (overrides: Partial<PaddingInputs> = {}): PaddingInputs => ({
  lifted: false,
  heightWithinContainer: 0,
  easing: 'keyboard',
  duration: 250,
  inset: INSET,
  ...overrides,
});

describe('isLifted and actionsBottomPadding', () => {
  it.each([
    [
      'undetermined at its detent',
      KEYBOARD_STATUS.UNDETERMINED,
      16,
      0,
      HIGHEST,
      false,
      44,
    ],
    [
      'hidden above its detent',
      KEYBOARD_STATUS.HIDDEN,
      0,
      300,
      HIGHEST,
      false,
      44,
    ],
    [
      'shown, lifted over the whole inset',
      KEYBOARD_STATUS.SHOWN,
      0,
      300,
      HIGHEST,
      true,
      10,
    ],
    [
      'shown, dropped to its detent',
      KEYBOARD_STATUS.SHOWN,
      16,
      300,
      HIGHEST,
      false,
      44,
    ],
    [
      'shown, within the margin of its detent',
      KEYBOARD_STATUS.SHOWN,
      15.5,
      300,
      HIGHEST,
      false,
      44,
    ],
    [
      'shown, lifted over part of the inset',
      KEYBOARD_STATUS.SHOWN,
      0,
      20,
      HIGHEST,
      true,
      24,
    ],
    [
      'shown, detents not yet measured',
      KEYBOARD_STATUS.SHOWN,
      0,
      300,
      undefined,
      false,
      44,
    ],
  ])(
    'pads a sheet %s',
    (_, status, position, heightWithinContainer, highest, lifted, expected) => {
      expect(isLifted(status, position, highest)).toBe(lifted);
      expect(actionsBottomPadding(INSET, {lifted, heightWithinContainer})).toBe(
        expected,
      );
    },
  );
});

describe('keyboardAnimationConfig', () => {
  it.each(['easeIn', 'easeOut', 'easeInEaseOut', 'linear'] as const)(
    'times a %s keyboard with its duration',
    easing => {
      expect(keyboardAnimationConfig(easing, 120)).toEqual({
        easing: expect.any(Function),
        duration: 120,
      });
    },
  );

  it('springs a keyboard-curve keyboard', () => {
    const config = keyboardAnimationConfig('keyboard', 0);

    expect(config).toEqual(
      expect.objectContaining({damping: 500, stiffness: 1000, mass: 3}),
    );
    expect(config).not.toHaveProperty('duration');
    expect(config).not.toHaveProperty('easing');
  });

  it("falls back to gorhom's default config for an unknown easing", () => {
    expect(keyboardAnimationConfig('bounce' as never, 120)).toBe(
      ANIMATION_CONFIGS,
    );
  });
});

describe('paddingUpdate', () => {
  const expectValue = (prev: PaddingInputs | null, next: PaddingInputs) =>
    expect(paddingUpdate(prev, next).value).toBe(
      actionsBottomPadding(next.inset, next),
    );

  it('sets the first value without animating', () => {
    const next = inputs({lifted: true, heightWithinContainer: 300});

    expect(paddingUpdate(null, next)).toEqual({value: 10, method: 'set'});
    expectValue(null, next);
  });

  it('sets an inset-only change without animating', () => {
    const prev = inputs();
    const next = inputs({inset: 0});

    expect(paddingUpdate(prev, next)).toEqual({value: 10, method: 'set'});
    expectValue(prev, next);
  });

  it('times a lift with a timing easing', () => {
    const prev = inputs({heightWithinContainer: 300});
    const next = inputs({
      lifted: true,
      heightWithinContainer: 300,
      easing: 'easeOut',
    });

    expect(paddingUpdate(prev, next)).toEqual({
      value: 10,
      method: 'timing',
      config: {easing: expect.any(Function), duration: 250},
    });
    expectValue(prev, next);
  });

  it('springs a lift with the keyboard curve', () => {
    const prev = inputs();
    const next = inputs({lifted: true, heightWithinContainer: 300});

    expect(paddingUpdate(prev, next)).toEqual(
      expect.objectContaining({value: 10, method: 'spring'}),
    );
    expectValue(prev, next);
  });

  it('animates an overlap change that moves the bar', () => {
    const prev = inputs({lifted: true});
    const next = inputs({lifted: true, heightWithinContainer: 20});

    expect(paddingUpdate(prev, next)).toEqual(
      expect.objectContaining({value: 24, method: 'spring'}),
    );
    expectValue(prev, next);
  });

  it('animates a lift that comes with an inset change', () => {
    const prev = inputs({heightWithinContainer: 300});
    const next = inputs({
      lifted: true,
      heightWithinContainer: 300,
      easing: 'easeOut',
      inset: 0,
    });

    expect(paddingUpdate(prev, next)).toEqual({
      value: 10,
      method: 'timing',
      config: {easing: expect.any(Function), duration: 250},
    });
    expectValue(prev, next);
  });

  it("restores with the hiding keyboard's config", () => {
    const prev = inputs({
      lifted: true,
      heightWithinContainer: 300,
      easing: 'keyboard',
      duration: 250,
    });
    const next = inputs({
      heightWithinContainer: 300,
      easing: 'easeIn',
      duration: 120,
    });

    expect(paddingUpdate(prev, next)).toEqual({
      value: 44,
      method: 'timing',
      config: {easing: expect.any(Function), duration: 120},
    });
    expectValue(prev, next);
  });

  it('animates a pan past the detent with the last keyboard config', () => {
    const prev = inputs({
      lifted: true,
      heightWithinContainer: 300,
      easing: 'easeOut',
      duration: 250,
    });
    const next = {...prev, lifted: false};

    expect(paddingUpdate(prev, next)).toEqual({
      value: 44,
      method: 'timing',
      config: {easing: expect.any(Function), duration: 250},
    });
    expectValue(prev, next);
  });

  it.each([
    ['nothing that feeds the padding changed', inputs(), inputs()],
    [
      'the overlap changed while not lifted',
      inputs({heightWithinContainer: 300}),
      inputs({heightWithinContainer: 0}),
    ],
  ])('does nothing when %s', (_, prev, next) => {
    expect(paddingUpdate(prev, next)).toEqual({value: 44, method: 'none'});
    expectValue(prev, next);
  });

  it('does nothing when the overlap grows under a lifted bar', () => {
    const prev = inputs({lifted: true, heightWithinContainer: 300});
    const next = inputs({lifted: true, heightWithinContainer: 345});

    expect(paddingUpdate(prev, next)).toEqual({value: 10, method: 'none'});
  });
});
