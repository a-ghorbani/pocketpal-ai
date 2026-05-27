import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';

import {IncreaseContextSheet} from '../IncreaseContextSheet';

const renderSheet = (
  overrides: Partial<React.ComponentProps<typeof IncreaseContextSheet>> = {},
) => {
  const props: React.ComponentProps<typeof IncreaseContextSheet> = {
    isVisible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    currentNCtx: 2048,
    nextTierTokens: 4096,
    isReloading: false,
    ...overrides,
  };
  const utils = render(
    <L10nContext.Provider value={l10n.en}>
      <IncreaseContextSheet {...props} />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );
  return {...utils, props};
};

describe('IncreaseContextSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the current and next tier values', () => {
    const {getByText} = renderSheet({currentNCtx: 2048, nextTierTokens: 4096});
    expect(getByText('2048')).toBeTruthy();
    expect(getByText('4096')).toBeTruthy();
  });

  it('renders the friendly body and reload hint copy', () => {
    const {getByText} = renderSheet();
    expect(getByText(l10n.en.chat.contextWarning.sheet.body)).toBeTruthy();
    expect(
      getByText(l10n.en.chat.contextWarning.sheet.reloadHint),
    ).toBeTruthy();
  });

  it('calls onConfirm when the confirm button is pressed', () => {
    const {getByTestId, props} = renderSheet();
    fireEvent.press(getByTestId('increase-context-confirm'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the cancel button is pressed', () => {
    const {getByTestId, props} = renderSheet();
    fireEvent.press(getByTestId('increase-context-cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while a reload is in flight', () => {
    const {getByTestId, props} = renderSheet({isReloading: true});

    // Disabled Paper buttons swallow press events, so the handlers must not
    // be invoked even if the touchable surface receives a press.
    fireEvent.press(getByTestId('increase-context-confirm'));
    fireEvent.press(getByTestId('increase-context-cancel'));

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('renders the new tier value when the next tier changes', () => {
    const {getByText, rerender} = renderSheet({nextTierTokens: 4096});
    expect(getByText('4096')).toBeTruthy();

    rerender(
      <L10nContext.Provider value={l10n.en}>
        <IncreaseContextSheet
          isVisible
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          currentNCtx={2048}
          nextTierTokens={8192}
        />
      </L10nContext.Provider>,
    );
    expect(getByText('8192')).toBeTruthy();
  });
});
