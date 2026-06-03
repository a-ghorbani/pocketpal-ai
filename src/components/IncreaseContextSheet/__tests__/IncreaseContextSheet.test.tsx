import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {downloadedModel} from '../../../../jest/fixtures/models';
import type {Model} from '../../../utils/types';

import {IncreaseContextSheet} from '../IncreaseContextSheet';

// Inject a generous trained context length so the slider has many stops
// to choose from regardless of the rest of the fixture.
const baseModel: Model = {
  ...(downloadedModel as Model),
  ggufMetadata: {
    architecture: 'llama',
    n_layers: 32,
    n_embd: 4096,
    n_head: 32,
    n_head_kv: 32,
    n_vocab: 128256,
    n_embd_head_k: 128,
    n_embd_head_v: 128,
    sliding_window: undefined,
    context_length: 131072,
  } as any,
};

const renderSheet = (
  overrides: Partial<React.ComponentProps<typeof IncreaseContextSheet>> = {},
) => {
  const props: React.ComponentProps<typeof IncreaseContextSheet> = {
    isVisible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    currentNCtx: 2048,
    model: baseModel,
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

  it('renders the friendly body and the reload hedge', () => {
    const {getByText} = renderSheet();
    expect(getByText(l10n.en.chat.contextWarning.sheet.body)).toBeTruthy();
    expect(getByText(l10n.en.chat.contextWarning.sheet.hedge)).toBeTruthy();
  });

  it('renders the slider', () => {
    const {getByTestId} = renderSheet();
    expect(getByTestId('increase-context-slider')).toBeTruthy();
  });

  it('passes the chosen tokens to onConfirm', () => {
    const onConfirm = jest.fn();
    const {getByTestId} = renderSheet({onConfirm});
    fireEvent.press(getByTestId('increase-context-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // The recommended default is the largest fitting stop above the
    // current 2048 — the exact value depends on memory mocks, but it
    // must be a positive number above the current.
    const [chosen] = onConfirm.mock.calls[0];
    expect(typeof chosen).toBe('number');
    expect(chosen).toBeGreaterThan(2048);
  });

  it('calls onClose when the cancel button is pressed', () => {
    const onClose = jest.fn();
    const {getByTestId} = renderSheet({onClose});
    fireEvent.press(getByTestId('increase-context-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while a reload is in flight', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const {getByTestId} = renderSheet({onConfirm, onClose, isReloading: true});

    fireEvent.press(getByTestId('increase-context-confirm'));
    fireEvent.press(getByTestId('increase-context-cancel'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
